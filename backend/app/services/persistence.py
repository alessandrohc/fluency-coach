import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4


REVIEW_GAP_DAYS = 3
REVIEW_GAP_DAYS_2 = 7


class SessionStore:
    def __init__(self, data_dir: Path) -> None:
        self.sessions_dir = data_dir / "sessions"
        self.sessions_dir.mkdir(parents=True, exist_ok=True)

    def create_session(self, initial_question: str) -> dict[str, Any]:
        now = self._now()
        return {
            "id": str(uuid4()),
            "created_at": now,
            "updated_at": now,
            "initial_question": initial_question,
            "rounds": [],
        }

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        path = self._path(session_id)
        if not path.exists():
            return None

        return json.loads(path.read_text())

    def append_round(self, session: dict[str, Any], round_data: dict[str, Any]) -> dict[str, Any]:
        session["rounds"].append(round_data)
        session["updated_at"] = self._now()
        self.save(session)
        return session

    def save(self, session: dict[str, Any]) -> None:
        self._path(session["id"]).write_text(json.dumps(session, indent=2, ensure_ascii=False))

    def list_sessions(self) -> list[dict[str, Any]]:
        sessions = []
        for path in sorted(self.sessions_dir.glob("*.json"), reverse=True):
            data = json.loads(path.read_text())
            sessions.append(
                {
                    "id": data["id"],
                    "created_at": data["created_at"],
                    "updated_at": data["updated_at"],
                    "initial_question": data.get("initial_question", ""),
                    "round_count": len(data.get("rounds", [])),
                }
            )
        return sessions

    def _path(self, session_id: str) -> Path:
        return self.sessions_dir / f"{session_id}.json"

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()


class AMRStore:
    def __init__(self, data_dir: Path) -> None:
        data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = data_dir / "amr.sqlite3"
        self._init_db()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS question_progress (
                    question_id TEXT PRIMARY KEY,
                    state TEXT NOT NULL DEFAULT 'NEW',
                    written_answer TEXT,
                    touched_at TEXT NOT NULL,
                    retained_at TEXT,
                    next_review_at TEXT,
                    last_reviewed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS muscle_reps (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question_id TEXT NOT NULL,
                    practiced_at TEXT NOT NULL,
                    result TEXT NOT NULL CHECK (result IN ('travei', 'fluiu')),
                    FOREIGN KEY (question_id) REFERENCES question_progress(question_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS retention_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question_id TEXT NOT NULL,
                    attempted_at TEXT NOT NULL,
                    transcript TEXT NOT NULL,
                    evaluation_json TEXT NOT NULL,
                    FOREIGN KEY (question_id) REFERENCES question_progress(question_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_reps_question ON muscle_reps(question_id);
                CREATE INDEX IF NOT EXISTS idx_retention_question ON retention_attempts(question_id);
                CREATE INDEX IF NOT EXISTS idx_progress_state_review ON question_progress(state, next_review_at);
                """
            )

    def list_progress(self) -> dict[str, dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM question_progress").fetchall()
            progress = {row["question_id"]: self._progress_from_row(row) for row in rows}

            for question_id in progress:
                progress[question_id]["reps"] = self._list_reps(conn, question_id)
                progress[question_id]["retention"] = self._list_retention(conn, question_id)

            return progress

    def get_progress(self, question_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            self._ensure_progress(conn, question_id)
            row = conn.execute(
                "SELECT * FROM question_progress WHERE question_id = ?",
                (question_id,),
            ).fetchone()
            progress = self._progress_from_row(row)
            progress["reps"] = self._list_reps(conn, question_id)
            progress["retention"] = self._list_retention(conn, question_id)
            return progress

    def save_activation(self, question_id: str, written_answer: str) -> dict[str, Any]:
        with self._connect() as conn:
            self._ensure_progress(conn, question_id)
            conn.execute(
                """
                UPDATE question_progress
                   SET state = 'MUSCLE',
                       written_answer = ?,
                       touched_at = ?,
                       retained_at = NULL,
                       next_review_at = NULL,
                       last_reviewed_at = NULL
                 WHERE question_id = ?
                """,
                (written_answer, self._today(), question_id),
            )
            conn.execute("DELETE FROM muscle_reps WHERE question_id = ?", (question_id,))
            conn.execute("DELETE FROM retention_attempts WHERE question_id = ?", (question_id,))
        return self.get_progress(question_id)

    def add_rep(self, question_id: str, result: str) -> dict[str, Any]:
        with self._connect() as conn:
            self._ensure_progress(conn, question_id)
            conn.execute(
                "INSERT INTO muscle_reps (question_id, practiced_at, result) VALUES (?, ?, ?)",
                (question_id, self._today(), result),
            )
            conn.execute(
                "UPDATE question_progress SET state = 'MUSCLE', touched_at = ? WHERE question_id = ?",
                (self._today(), question_id),
            )
        return self.get_progress(question_id)

    def advance_to_retention(self, question_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            self._ensure_progress(conn, question_id)
            conn.execute(
                "UPDATE question_progress SET state = 'RETENTION', touched_at = ? WHERE question_id = ?",
                (self._today(), question_id),
            )
        return self.get_progress(question_id)

    def add_retention_attempt(
        self,
        question_id: str,
        transcript: str,
        evaluation: dict[str, Any],
    ) -> dict[str, Any]:
        with self._connect() as conn:
            self._ensure_progress(conn, question_id)
            conn.execute(
                """
                INSERT INTO retention_attempts (question_id, attempted_at, transcript, evaluation_json)
                VALUES (?, ?, ?, ?)
                """,
                (question_id, self._today(), transcript, json.dumps(evaluation, ensure_ascii=False)),
            )
            conn.execute(
                "UPDATE question_progress SET state = 'RETENTION', touched_at = ? WHERE question_id = ?",
                (self._today(), question_id),
            )
        return self.get_progress(question_id)

    def mark_retained(self, question_id: str) -> dict[str, Any]:
        today = self._today()
        with self._connect() as conn:
            self._ensure_progress(conn, question_id)
            conn.execute(
                """
                UPDATE question_progress
                   SET state = 'RETAINED',
                       retained_at = ?,
                       next_review_at = ?,
                       touched_at = ?
                 WHERE question_id = ?
                """,
                (today, self._days_from_now(REVIEW_GAP_DAYS), today, question_id),
            )
        return self.get_progress(question_id)

    def review(self, question_id: str, result: str) -> dict[str, Any]:
        today = self._today()
        with self._connect() as conn:
            self._ensure_progress(conn, question_id)
            if result == "fluiu":
                conn.execute(
                    """
                    UPDATE question_progress
                       SET state = 'RETAINED',
                           next_review_at = ?,
                           last_reviewed_at = ?,
                           touched_at = ?
                     WHERE question_id = ?
                    """,
                    (self._days_from_now(REVIEW_GAP_DAYS_2), today, today, question_id),
                )
            else:
                conn.execute(
                    "UPDATE question_progress SET state = 'RETENTION', touched_at = ? WHERE question_id = ?",
                    (today, question_id),
                )
        return self.get_progress(question_id)

    def reset(self) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM retention_attempts")
            conn.execute("DELETE FROM muscle_reps")
            conn.execute("DELETE FROM question_progress")

    def _ensure_progress(self, conn: sqlite3.Connection, question_id: str) -> None:
        conn.execute(
            """
            INSERT OR IGNORE INTO question_progress (question_id, state, touched_at)
            VALUES (?, 'NEW', ?)
            """,
            (question_id, self._today()),
        )

    def _progress_from_row(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "question_id": row["question_id"],
            "state": row["state"],
            "written_answer": row["written_answer"] or "",
            "touched_at": row["touched_at"],
            "retained_at": row["retained_at"],
            "next_review_at": row["next_review_at"],
            "last_reviewed_at": row["last_reviewed_at"],
            "reps": [],
            "retention": [],
        }

    def _list_reps(self, conn: sqlite3.Connection, question_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT id, practiced_at, result
              FROM muscle_reps
             WHERE question_id = ?
             ORDER BY id ASC
            """,
            (question_id,),
        ).fetchall()
        return [{"id": row["id"], "d": row["practiced_at"], "r": row["result"]} for row in rows]

    def _list_retention(self, conn: sqlite3.Connection, question_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT id, attempted_at, transcript, evaluation_json
              FROM retention_attempts
             WHERE question_id = ?
             ORDER BY id ASC
            """,
            (question_id,),
        ).fetchall()
        return [
            {
                "id": row["id"],
                "d": row["attempted_at"],
                "transcript": row["transcript"],
                "ev": json.loads(row["evaluation_json"] or "{}"),
            }
            for row in rows
        ]

    def _today(self) -> str:
        return date.today().isoformat()

    def _days_from_now(self, days: int) -> str:
        return (date.today() + timedelta(days=days)).isoformat()
