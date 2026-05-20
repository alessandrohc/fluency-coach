import json
import os
import tempfile
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

from app.services.feedback import FeedbackService
from app.services.persistence import AMRStore, SessionStore
from app.services.transcription import TranscriptionService


DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
QUESTIONS_FILE = Path(os.getenv("QUESTIONS_FILE", "/app/app/data/amr_questions.json"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
OPENAI_CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")

app = FastAPI(title="Fluency Coach API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
store = SessionStore(DATA_DIR)
amr_store = AMRStore(DATA_DIR)


class ActivationPayload(BaseModel):
    written_answer: str = Field(min_length=10)


class RepPayload(BaseModel):
    result: str


class RetentionPayload(BaseModel):
    transcript: str = Field(min_length=15)


class ReviewPayload(BaseModel):
    result: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/questions")
def questions() -> list[dict[str, Any]]:
    return json.loads(QUESTIONS_FILE.read_text())


@app.get("/amr/state")
def amr_state() -> dict[str, Any]:
    questions = _flatten_questions()
    progress = amr_store.list_progress()
    return {
        "questions": questions,
        "progress": progress,
        "stats": _build_stats(questions, progress),
        "today": _build_today(questions, progress),
    }


@app.post("/amr/questions/{question_id}/activation")
def save_activation(question_id: str, payload: ActivationPayload) -> dict[str, Any]:
    _get_question_or_404(question_id)
    return {"progress": amr_store.save_activation(question_id, payload.written_answer.strip())}


@app.post("/amr/questions/{question_id}/reps")
def add_rep(question_id: str, payload: RepPayload) -> dict[str, Any]:
    _get_question_or_404(question_id)
    if payload.result not in {"travei", "fluiu"}:
        raise HTTPException(status_code=422, detail="result must be 'travei' or 'fluiu'")
    return {"progress": amr_store.add_rep(question_id, payload.result)}


@app.post("/amr/questions/{question_id}/advance-retention")
def advance_retention(question_id: str) -> dict[str, Any]:
    _get_question_or_404(question_id)
    return {"progress": amr_store.advance_to_retention(question_id)}


@app.post("/amr/questions/{question_id}/retention-text")
def retention_text(question_id: str, payload: RetentionPayload) -> dict[str, Any]:
    question = _get_question_or_404(question_id)
    progress = amr_store.get_progress(question_id)
    if not progress.get("written_answer"):
        raise HTTPException(status_code=409, detail="Write and save activation before retention")
    if client is None:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    evaluation = FeedbackService(client, OPENAI_CHAT_MODEL).evaluate_retention(
        question=question["text"],
        written_answer=progress["written_answer"],
        transcript=payload.transcript.strip(),
    )
    return {"progress": amr_store.add_retention_attempt(question_id, payload.transcript.strip(), evaluation)}


@app.post("/amr/questions/{question_id}/retention-audio")
async def retention_audio(question_id: str, audio: UploadFile = File(...)) -> dict[str, Any]:
    question = _get_question_or_404(question_id)
    progress = amr_store.get_progress(question_id)
    if not progress.get("written_answer"):
        raise HTTPException(status_code=409, detail="Write and save activation before retention")
    if client is None:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(await audio.read())

    try:
        transcript = TranscriptionService(client, OPENAI_TRANSCRIPTION_MODEL).transcribe(temp_path)
        if not transcript:
            raise HTTPException(status_code=400, detail="No speech could be transcribed")

        evaluation = FeedbackService(client, OPENAI_CHAT_MODEL).evaluate_retention(
            question=question["text"],
            written_answer=progress["written_answer"],
            transcript=transcript,
        )
        return {
            "transcript": transcript,
            "progress": amr_store.add_retention_attempt(question_id, transcript, evaluation),
        }
    finally:
        temp_path.unlink(missing_ok=True)


@app.post("/amr/questions/{question_id}/retained")
def mark_retained(question_id: str) -> dict[str, Any]:
    _get_question_or_404(question_id)
    progress = amr_store.get_progress(question_id)
    if not progress.get("retention"):
        raise HTTPException(status_code=409, detail="Add at least one retention attempt before marking retained")
    return {"progress": amr_store.mark_retained(question_id)}


@app.post("/amr/questions/{question_id}/review")
def review(question_id: str, payload: ReviewPayload) -> dict[str, Any]:
    _get_question_or_404(question_id)
    if payload.result not in {"travei", "fluiu"}:
        raise HTTPException(status_code=422, detail="result must be 'travei' or 'fluiu'")
    return {"progress": amr_store.review(question_id, payload.result)}


@app.delete("/amr/progress")
def reset_amr_progress() -> dict[str, str]:
    amr_store.reset()
    return {"status": "reset"}


@app.get("/sessions")
def sessions() -> list[dict[str, Any]]:
    return store.list_sessions()


@app.get("/sessions/{session_id}")
def session(session_id: str) -> dict[str, Any]:
    data = store.get_session(session_id)
    if not data:
        raise HTTPException(status_code=404, detail="Session not found")
    return data


@app.post("/practice-round")
async def practice_round(
    audio: UploadFile = File(...),
    question: str = Form(...),
    session_id: str | None = Form(default=None),
) -> dict[str, Any]:
    if client is None:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    session_data = store.get_session(session_id) if session_id else None
    if session_id and not session_data:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session_data:
        session_data = store.create_session(question)

    suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(await audio.read())

    try:
        transcript = TranscriptionService(client, OPENAI_TRANSCRIPTION_MODEL).transcribe(temp_path)
        if not transcript:
            raise HTTPException(status_code=400, detail="No speech could be transcribed")

        feedback = FeedbackService(client, OPENAI_CHAT_MODEL).analyze(
            question=question,
            transcript=transcript,
            previous_rounds=session_data.get("rounds", []),
        )

        round_data = {
            "round": len(session_data.get("rounds", [])) + 1,
            "question": question,
            "transcript": transcript,
            "feedback": feedback,
            "follow_up_questions": feedback.get("follow_up_questions", []),
        }
        updated_session = store.append_round(session_data, round_data)

        return {
            "session_id": updated_session["id"],
            "round": round_data["round"],
            "question": question,
            "transcript": transcript,
            "feedback": feedback,
            "follow_up_questions": round_data["follow_up_questions"],
            "session": updated_session,
        }
    finally:
        temp_path.unlink(missing_ok=True)


def _flatten_questions() -> list[dict[str, Any]]:
    categories = json.loads(QUESTIONS_FILE.read_text())
    questions: list[dict[str, Any]] = []
    for category in categories:
        group = category.get("group", "")
        track = "leadership" if group.lower().startswith("leadership") else "ic"
        block = "leadership" if track == "leadership" else category.get("id", "").split("-", 1)[0]
        for index, text in enumerate(category.get("questions", []), start=1):
            questions.append(
                {
                    "id": f"{category['id']}:{index}",
                    "text": text,
                    "category_id": category["id"],
                    "category": category.get("title", ""),
                    "group": group,
                    "track": track,
                    "block": block,
                }
            )
    return questions


def _get_question_or_404(question_id: str) -> dict[str, Any]:
    question = next((item for item in _flatten_questions() if item["id"] == question_id), None)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


def _empty_progress(question_id: str) -> dict[str, Any]:
    return {
        "question_id": question_id,
        "state": "NEW",
        "written_answer": "",
        "touched_at": "",
        "retained_at": None,
        "next_review_at": None,
        "last_reviewed_at": None,
        "reps": [],
        "retention": [],
    }


def _build_today(questions: list[dict[str, Any]], progress: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    today = date.today().isoformat()

    def p(question: dict[str, Any]) -> dict[str, Any]:
        return progress.get(question["id"], _empty_progress(question["id"]))

    due = sorted(
        [
            question
            for question in questions
            if p(question)["state"] == "RETAINED" and (p(question).get("next_review_at") or "9999") <= today
        ],
        key=lambda question: p(question).get("next_review_at") or "",
    )
    new = next((question for question in questions if p(question)["state"] == "NEW"), None)
    muscle = sorted(
        [question for question in questions if p(question)["state"] == "MUSCLE"],
        key=lambda question: p(question).get("touched_at") or "",
    )
    retention = sorted(
        [question for question in questions if p(question)["state"] == "RETENTION"],
        key=lambda question: p(question).get("touched_at") or "",
    )

    items: list[dict[str, Any]] = []
    if due:
        items.append({"kind": "AQUECIMENTO", "question_id": due[0]["id"]})
    if new:
        items.append({"kind": "ATIVACAO", "question_id": new["id"]})
    if muscle:
        items.append({"kind": "MUSCULACAO", "question_id": muscle[0]["id"]})
    if retention:
        items.append({"kind": "RETENCAO", "question_id": retention[0]["id"]})
    return items


def _build_stats(questions: list[dict[str, Any]], progress: dict[str, dict[str, Any]]) -> dict[str, Any]:
    states = ["NEW", "MUSCLE", "RETENTION", "RETAINED"]
    counts = {state: 0 for state in states}
    reps = 0
    retention_attempts = 0
    written = 0
    for question in questions:
        item = progress.get(question["id"], _empty_progress(question["id"]))
        counts[item.get("state", "NEW")] = counts.get(item.get("state", "NEW"), 0) + 1
        reps += len(item.get("reps", []))
        retention_attempts += len(item.get("retention", []))
        if item.get("written_answer"):
            written += 1
    return {
        "counts": counts,
        "written": written,
        "reps": reps,
        "retention_attempts": retention_attempts,
        "total": len(questions),
    }
