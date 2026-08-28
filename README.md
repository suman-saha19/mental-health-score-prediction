# Mental Health Score Prediction

A machine learning project that predicts mental health scores using student social media and behavioral data.

## Tech Stack

- Python
- FastAPI
- Pydantic
- Machine Learning
- HTML / CSS / JavaScript

## Project Files

- `main.py` — FastAPI backend and API endpoints
- `Mental_Health_Model.pkl` — trained machine learning model
- `Mental_Health_Score.ipynb` — model training and analysis
- `Student Social Media And Mental H....csv` — dataset
- `index.html` — frontend page
- `script.js` — frontend JavaScript
- `style.css` — frontend styling
- `requirements.txt` — Python dependencies

## Running the application

Create a Python virtual environment, install the required packages, then start
the FastAPI app:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install fastapi uvicorn joblib pandas scikit-learn
uvicorn main:app --reload
```

Open [http://localhost:8000](http://localhost:8000). The server delivers the
HTML, CSS, and JavaScript page and exposes the prediction endpoint at
`POST /predict`.

The form validates the model inputs in the browser, reports API availability,
shows useful error states, and renders the returned score on an animated gauge.

