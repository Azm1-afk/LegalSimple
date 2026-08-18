# LegalSimple
A legal AI based web application with features to help people beat legal technicalities in absence of legal assistance.

## Run the AI features locally

1. Create and activate a Python virtual environment.
2. Install the backend dependencies with `pip install -r backend/requirements.txt`.
3. Copy `backend/.env.example` to `backend/.env` and replace the placeholder with your Google Gemini API key.
4. From the project root, run `uvicorn backend.main:app --reload`.
5. Open `http://127.0.0.1:8000` in a browser.

The Legal AI Companion, Document Simplifier, Risk Analyzer, and Document
Comparison use the same Gemini, document parsing, chunking, embedding, and FAISS
retrieval service. Companion indexes remain in backend memory until removed or
the process restarts. The Document Simplifier, Risk Analyzer, and Document
Comparison remove their temporary indexes after each request.
