# LegalSimple
A legal AI based web application with features to help people beat legal technicalities in absence of legal assistance.

## Run the Legal AI Companion locally

1. Create and activate a Python virtual environment.
2. Install the backend dependencies with `pip install -r backend/requirements.txt`.
3. Copy `backend/.env.example` to `backend/.env` and replace the placeholder with your Google Gemini API key.
4. From the project root, run `uvicorn backend.main:app --reload`.
5. Open `http://127.0.0.1:8000` in a browser.

FAISS indexes and uploaded-document associations are held only in backend memory and are cleared whenever the FastAPI process restarts.
