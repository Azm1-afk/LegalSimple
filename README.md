# LegalSimple
A legal AI based web application with features to help people beat legal technicalities in absence of legal assistance.

## Run the AI features locally

1. Create and activate a Python virtual environment.
2. Install the backend dependencies with `pip install -r backend/requirements.txt`.
3. Copy `backend/.env.example` to `backend/.env`. Set `GOOGLE_API_KEY` for the
   AI features and replace `SECRET_KEY` with a unique random value for JWT
   authentication. `GOOGLE_OAUTH_CLIENT_ID` is only needed for Google sign-in;
   the default local database is SQLite.
4. From the project root, run `uvicorn backend.main:app --reload`.
5. Open `http://127.0.0.1:8000` in a browser.

The Legal AI Companion, Document Simplifier, Risk Analyzer, and Document
Comparison use the same Gemini, document parsing, chunking, embedding, and FAISS
retrieval service. Companion indexes remain in backend memory until removed or
the process restarts. The Document Simplifier, Risk Analyzer, and Document
Comparison remove their temporary indexes after each request.
