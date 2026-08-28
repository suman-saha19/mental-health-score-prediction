// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Theme preference: use a saved choice when available, otherwise honour the
// visitor's system setting. The data attribute drives the CSS colour tokens.

const themeToggle = document.getElementById('theme-toggle');

function setTheme(theme) {
    document.documentElement.dataset.theme = theme;

    const isDark = theme === 'dark';

    themeToggle.setAttribute('aria-pressed', String(isDark));

    themeToggle.setAttribute(
        'aria-label',
        `Switch to ${isDark ? 'light' : 'dark'} mode`
    );

    try {
        localStorage.setItem('wellbeing-theme', theme);
    } catch {
        // The interface still works if browser storage is unavailable.
    }
}

function preferredTheme() {
    try {
        const savedTheme = localStorage.getItem('wellbeing-theme');

        if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch {
        // Fall through to the operating-system preference.
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}

setTheme(preferredTheme());

themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

// When FastAPI serves the page, requests stay on the same origin. The local
// fallback also keeps the page useful when it is opened directly during design.

const API_BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin;


// Countries the backend keeps as their own group; anything else is bucketed
// into "Other" server-side (see `top_countries` in main.py).

const TOP_COUNTRIES = [
    'Other',
    'India',
    'USA',
    'Canada',
    'Australia',
    'UK',
    'Germany',
    'Mexico',
    'Turkey',
    'France'
];


// ---------------------------------------------------------------------------
// Validation — mirrors the backend's Pydantic Field(ge=, le=) constraints
// ---------------------------------------------------------------------------

const NUMERIC_RULES = {
    age: {
        integer: true,
        min: 10,
        max: 100,
        label: 'Age'
    },

    avg_daily_usage_hours: {
        integer: false,
        min: 0,
        max: 24,
        label: 'Avg. daily usage'
    },

    daily_unlocks: {
        integer: true,
        min: 0,
        max: null,
        label: 'Daily phone unlocks'
    },

    study_hours: {
        integer: false,
        min: 0,
        max: 24,
        label: 'Study hours'
    },

    physical_activity_hours: {
        integer: false,
        min: 0,
        max: 24,
        label: 'Physical activity'
    },

    sleep_hours_per_night: {
        integer: false,
        min: 0,
        max: 24,
        label: 'Sleep'
    },
};


function validateNumericField(name, rawValue) {
    const rule = NUMERIC_RULES[name];

    if (rawValue === '' || rawValue === null || rawValue === undefined) {
        return `${rule.label} is required`;
    }

    const value = Number(rawValue);

    if (Number.isNaN(value)) {
        return `Enter a valid number`;
    }

    if (rule.integer && !Number.isInteger(value)) {
        return `${rule.label} must be a whole number`;
    }

    if (value < rule.min) {
        return `Must be ${rule.min} or more`;
    }

    if (rule.max !== null && value > rule.max) {
        return `Must be ${rule.max} or less`;
    }

    return null;
}


function validateCountry(value) {
    if (!value || !value.trim()) return 'Enter a country';

    return null;
}


// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const form = document.getElementById('predict-form');

const submitBtn = document.getElementById('submit-btn');

const resetBtn = document.getElementById('reset-btn');

const hoursAdvisory = document.getElementById('hours-advisory');


const countrySelect = document.getElementById('country-select');

const countryCustomRow = document.getElementById('country-custom-row');

const countryCustomInput = document.getElementById('country-custom');

const countryBackBtn = document.getElementById('country-back-btn');

const countryHiddenInput = document.getElementById('country');

const countryHint = document.getElementById('country-hint');


const resultStates = {
    idle: document.getElementById('result-idle'),
    loading: document.getElementById('result-loading'),
    error: document.getElementById('result-error'),
    success: document.getElementById('result-success'),
};


const errorTitleEl = document.getElementById('error-title');

const errorMessageEl = document.getElementById('error-message');

const retryBtn = document.getElementById('retry-btn');

const scoreBandEl = document.getElementById('score-band');


let currentAbortController = null;

let lastPayload = null;


// ---------------------------------------------------------------------------
// Country field: quick-pick list + free-text fallback for "Other"
// ---------------------------------------------------------------------------

function updateCountrySelection({ focusInput = false } = {}) {
    const isCustomCountry = countrySelect.value === '__other__';

    countryCustomRow.hidden = !isCustomCountry;

    if (isCustomCountry) {
        countryCustomRow.hidden = false;

        countryHiddenInput.value = '';

        countryCustomInput.value = '';

        countryHint.textContent =
            'Countries outside the model\u2019s top list are grouped as "Other" for prediction.';

        if (focusInput) countryCustomInput.focus();
    } else {
        countryHiddenInput.value = countrySelect.value;

        countryHint.textContent = '';

        clearFieldError('country');
    }
}


countrySelect.addEventListener('change', () => {
    updateCountrySelection({ focusInput: true });
});


countryCustomInput.addEventListener('input', () => {
    countryHiddenInput.value = countryCustomInput.value;

    clearFieldError('country');
});


// Ensure a browser restoring an earlier form state cannot leave the custom
// input visible while a standard country is selected.
updateCountrySelection();


countryBackBtn.addEventListener('click', () => {
    countryCustomRow.hidden = true;

    countrySelect.value = 'India';

    countryHiddenInput.value = 'India';

    countryHint.textContent = '';

    clearFieldError('country');
});


// ---------------------------------------------------------------------------
// Field error helpers
// ---------------------------------------------------------------------------

function fieldMsgEl(name) {
    const input = document.getElementById(
        name === 'country' ? 'country-select' : name
    );

    const field = input
        ? input.closest('.field')
        : document.getElementById('country-field');

    return field ? field.querySelector('.field-msg') : null;
}


function setFieldError(name, message) {
    const input = document.getElementById(name);

    if (input) input.setAttribute('aria-invalid', 'true');

    const msgEl = fieldMsgEl(name);

    if (msgEl) {
        msgEl.textContent = message;

        msgEl.classList.add('error');
    }
}


function clearFieldError(name) {
    const input = document.getElementById(name);

    if (input) input.removeAttribute('aria-invalid');

    const msgEl = fieldMsgEl(name);

    if (msgEl) {
        const hint = msgEl.dataset.hint || '';

        msgEl.textContent = hint;

        msgEl.classList.remove('error');
    }
}


function clearAllFieldErrors() {
    Object.keys(NUMERIC_RULES).forEach(clearFieldError);

    clearFieldError('country');
}


// Clear a field's error as soon as the user edits it.

form.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('input', () => {
        if (el.id && el.id !== 'country-select') {
            clearFieldError(el.id);
        }
    });
});


// ---------------------------------------------------------------------------
// Hours advisory (non-blocking — the backend doesn't reject this either)
// ---------------------------------------------------------------------------

function updateHoursAdvisory() {
    const sum =
        Number(document.getElementById('avg_daily_usage_hours').value || 0) +
        Number(document.getElementById('study_hours').value || 0) +
        Number(document.getElementById('physical_activity_hours').value || 0) +
        Number(document.getElementById('sleep_hours_per_night').value || 0);

    if (sum > 24) {
        hoursAdvisory.hidden = false;

        hoursAdvisory.textContent =
            `Heads up: usage, study, activity, and sleep hours add up to ${sum.toFixed(1)} — more than a 24-hour day. The model will still run, but you may want to double-check these numbers.`;
    } else {
        hoursAdvisory.hidden = true;
    }
}


[
    'avg_daily_usage_hours',
    'study_hours',
    'physical_activity_hours',
    'sleep_hours_per_night'
].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateHoursAdvisory);
});


// ---------------------------------------------------------------------------
// Gauge rendering (custom SVG arc, 0–10 scale)
// ---------------------------------------------------------------------------

const GAUGE = {
    size: 220,
    stroke: 14
};

GAUGE.cx = GAUGE.size / 2;

GAUGE.cy = GAUGE.size / 2 + 6;

GAUGE.r = GAUGE.size / 2 - GAUGE.stroke;


function polarPoint(angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;

    return {
        x: GAUGE.cx + GAUGE.r * Math.cos(rad),
        y: GAUGE.cy - GAUGE.r * Math.sin(rad),
    };
}


function arcPathD() {
    const start = polarPoint(180);

    const end = polarPoint(0);

    return `M ${start.x} ${start.y} A ${GAUGE.r} ${GAUGE.r} 0 0 1 ${end.x} ${end.y}`;
}


function renderGauge(score, maxScore = 10) {
    const clamped = Math.min(Math.max(score, 0), maxScore);

    const fraction = clamped / maxScore;

    const arcLength = Math.PI * GAUGE.r;

    const needle = polarPoint(180 - fraction * 180);


    const track = document.getElementById('gauge-track');

    const value = document.getElementById('gauge-value');

    track.setAttribute('d', arcPathD());

    value.setAttribute('d', arcPathD());

    value.setAttribute('stroke-dasharray', String(arcLength));

    value.style.transition = 'none';

    value.setAttribute('stroke-dashoffset', String(arcLength));

    // Force reflow so the transition below actually animates from full to target.
    // eslint-disable-next-line no-unused-expressions

    value.getBoundingClientRect();

    value.style.transition = '';

    value.setAttribute(
        'stroke-dashoffset',
        String(arcLength * (1 - fraction))
    );


    const t0 = polarPoint(180);

    const tMid = polarPoint(90);

    const tMax = polarPoint(0);

    positionTick('tick-0', t0, 4);

    positionTick('tick-mid', tMid, -10);

    positionTick('tick-max', tMax, 4);

    document.getElementById('tick-0').textContent = '0';

    document.getElementById('tick-mid').textContent = String(maxScore / 2);

    document.getElementById('tick-max').textContent = String(maxScore);


    const needleEl = document.getElementById('gauge-needle');

    needleEl.setAttribute('cx', needle.x);

    needleEl.setAttribute('cy', needle.y);


    const readout = document.getElementById('gauge-readout');

    readout.setAttribute('x', GAUGE.cx);

    readout.setAttribute('y', GAUGE.cy - 6);

    readout.textContent = clamped.toFixed(2);


    const outof = document.getElementById('gauge-outof');

    outof.setAttribute('x', GAUGE.cx);

    outof.setAttribute('y', GAUGE.cy + 16);

    outof.textContent = `out of ${maxScore}`;


    document.getElementById('gauge-svg').setAttribute(
        'aria-label',
        `Predicted score ${clamped.toFixed(2)} out of ${maxScore}`
    );
}


function positionTick(id, point, dy) {
    const el = document.getElementById(id);

    el.setAttribute('x', point.x);

    el.setAttribute('y', point.y + dy);
}


function renderIdleGauge() {
    const track = document.getElementById('gauge-track-idle');

    track.setAttribute('d', arcPathD());
}


function scoreBand(score) {
    if (score < 3.34) {
        return {
            label: 'Lower range',
            cls: 'low'
        };
    }

    if (score < 6.67) {
        return {
            label: 'Moderate range',
            cls: 'mid'
        };
    }

    return {
        label: 'Higher range',
        cls: 'high'
    };
}


// ---------------------------------------------------------------------------
// Result state machine
// ---------------------------------------------------------------------------

function showResultState(name) {
    Object.entries(resultStates).forEach(([key, el]) => {
        el.hidden = key !== name;
    });
}


function showError(kind, message) {
    const titles = {
        network: "Can't reach the prediction server",
        validation: 'Some values were rejected',
        server: 'Prediction failed',
        unknown: 'Prediction failed',
    };

    errorTitleEl.textContent = titles[kind] || titles.unknown;

    errorMessageEl.textContent = message;

    showResultState('error');
}


function showSuccess(score) {
    renderGauge(score);

    const band = scoreBand(score);

    scoreBandEl.textContent = band.label;

    scoreBandEl.className = `band ${band.cls}`;

    resultStates.success.classList.remove('fade-up');

    // eslint-disable-next-line no-unused-expressions

    resultStates.success.offsetWidth;

    resultStates.success.classList.add('fade-up');

    showResultState('success');
}


// ---------------------------------------------------------------------------
// API integration
// ---------------------------------------------------------------------------

async function checkApiHealth() {
    const dot = document.getElementById('api-status-dot');

    const text = document.getElementById('api-status-text');

    try {
        const res = await fetch(`${API_BASE_URL}/api/health`);

        if (res.ok) {
            dot.classList.remove('down');

            dot.classList.add('up');

            text.textContent = 'API connected';
        } else {
            throw new Error('not ok');
        }
    } catch {
        dot.classList.remove('up');

        dot.classList.add('down');

        text.textContent = 'API offline';
    }
}


function parseValidationDetail(body) {
    const fieldErrors = {};

    (body.detail || []).forEach((err) => {
        const field = err.loc[err.loc.length - 1];

        if (typeof field === 'string') {
            fieldErrors[field] = err.msg;
        }
    });

    return fieldErrors;
}


async function predict(payload) {
    currentAbortController?.abort();

    const controller = new AbortController();

    currentAbortController = controller;


    showResultState('loading');

    submitBtn.disabled = true;

    submitBtn.textContent = 'Predicting\u2026';


    try {
        const response = await fetch(`${API_BASE_URL}/predict`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });


        if (response.status === 422) {
            let body = null;

            try {
                body = await response.json();
            } catch {
                /* ignore */
            }

            const fieldErrors = body
                ? parseValidationDetail(body)
                : {};

            Object.entries(fieldErrors).forEach(
                ([field, message]) => setFieldError(field, message)
            );

            showError(
                'validation',
                'The server rejected some of the submitted values.'
            );

            return;
        }


        if (!response.ok) {
            let detail = '';

            try {
                const body = await response.json();

                detail = body?.detail || '';
            } catch {
                /* ignore */
            }

            showError(
                'server',
                detail ||
                `The server responded with an error (${response.status}).`
            );

            return;
        }


        const data = await response.json();

        showSuccess(data.predicted_mental_health_score);

        resetBtn.hidden = false;
    } catch (err) {
        if (err.name === 'AbortError') return;

        showError(
            'network',
            `Couldn't reach the prediction server at ${API_BASE_URL}. Make sure the FastAPI backend is running and reachable.`
        );
    } finally {
        submitBtn.disabled = false;

        submitBtn.textContent = 'Get my score';
    }
}


// ---------------------------------------------------------------------------
// Form submit
// ---------------------------------------------------------------------------

function collectPayload() {
    return {
        age: Number(document.getElementById('age').value),

        gender: document.getElementById('gender').value,

        country: countryHiddenInput.value,

        academic_level:
            document.getElementById('academic_level').value,

        most_used_platform:
            document.getElementById('most_used_platform').value,

        purpose_of_use:
            document.getElementById('purpose_of_use').value,

        avg_daily_usage_hours:
            Number(
                document.getElementById('avg_daily_usage_hours').value
            ),

        daily_unlocks:
            Number(document.getElementById('daily_unlocks').value),

        study_hours:
            Number(document.getElementById('study_hours').value),

        physical_activity_hours:
            Number(
                document.getElementById('physical_activity_hours').value
            ),

        sleep_hours_per_night:
            Number(
                document.getElementById('sleep_hours_per_night').value
            ),

        stress_level:
            document.getElementById('stress_level').value,
    };
}


function runValidation() {
    clearAllFieldErrors();

    let firstInvalid = null;


    Object.keys(NUMERIC_RULES).forEach((name) => {
        const input = document.getElementById(name);

        const error = validateNumericField(name, input.value);

        if (error) {
            setFieldError(name, error);

            if (!firstInvalid) {
                firstInvalid = input;
            }
        }
    });


    const countryError = validateCountry(countryHiddenInput.value);

    if (countryError) {
        setFieldError('country', countryError);

        if (!firstInvalid) {
            firstInvalid =
                countrySelect.value === '__other__' ||
                countryCustomRow.hidden === false
                    ? countryCustomInput
                    : countrySelect;
        }
    }


    return firstInvalid;
}


form.addEventListener('submit', (event) => {
    event.preventDefault();

    const firstInvalid = runValidation();

    if (firstInvalid) {
        firstInvalid.focus();

        return;
    }

    lastPayload = collectPayload();

    predict(lastPayload);
});


retryBtn.addEventListener('click', () => {
    if (lastPayload) {
        predict(lastPayload);
    }
});


resetBtn.addEventListener('click', () => {
    currentAbortController?.abort();

    showResultState('idle');

    resetBtn.hidden = true;
});


// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

renderIdleGauge();

updateHoursAdvisory();

checkApiHealth();
