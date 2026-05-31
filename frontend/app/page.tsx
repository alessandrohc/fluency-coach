"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AMRProgress, AMRQuestion, AMRStateName, AMRStateResponse, RetentionAttempt } from "../lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001";

const PHASES: Record<AMRStateName, { label: string; short: string }> = {
  NEW: { label: "Pending activation", short: "NEW" },
  MUSCLE: { label: "Muscle reps", short: "REPS" },
  RETENTION: { label: "Retention", short: "RET" },
  RETAINED: { label: "Retained", short: "OK" },
};

const STEP_COPY: Record<string, { title: string; body: string }> = {
  AQUECIMENTO: {
    title: "Warm-up",
    body: "A retained answer is back for review. Answer from memory and confirm it still comes out fluently.",
  },
  ATIVACAO: {
    title: "Written activation",
    body: "New question. Write the answer using only what's already in your head — no AI, no lookups.",
  },
  MUSCULACAO: {
    title: "Muscle reps",
    body: "Read your answer out loud. The goal is mouth, rhythm, and automatic recall.",
  },
  RETENCAO: {
    title: "Retention",
    body: "Answer without looking at v1. Record or paste a transcript to compare your real speech against the written answer.",
  },
};

export default function Home() {
  const [data, setData] = useState<AMRStateResponse | null>(null);
  const [view, setView] = useState<"today" | "bank" | "progress">("today");
  const [track, setTrack] = useState<"ic" | "leadership" | "all">("ic");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [stateFilter, setStateFilter] = useState<AMRStateName | "all">("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void loadState();
  }, []);

  async function loadState() {
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/amr/state`);
      if (!response.ok) throw new Error("Could not load AMR state");
      setData((await response.json()) as AMRStateResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load AMR state");
    }
  }

  async function mutate(path: string, body?: unknown) {
    setBusy(path);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.detail || "Request failed");
      if (payload?.progress) {
        setData((current) =>
          current
            ? {
                ...current,
                progress: { ...current.progress, [payload.progress.question_id]: payload.progress },
              }
            : current,
        );
        await loadState();
      }
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
      return null;
    } finally {
      setBusy("");
    }
  }

  const questions = data?.questions ?? [];
  const progress = data?.progress ?? {};
  const filteredQuestions = useMemo(() => {
    return questions.filter((question) => {
      const p = getProgress(question, progress);
      if (track !== "all" && question.track !== track) return false;
      if (category !== "all" && question.category !== category) return false;
      if (stateFilter !== "all" && p.state !== stateFilter) return false;
      if (query && !question.text.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [questions, progress, track, category, stateFilter, query]);

  const activeQuestion = activeId ? questions.find((question) => question.id === activeId) : null;
  const categories = Array.from(new Set(questions.filter((q) => track === "all" || q.track === track).map((q) => q.category)));

  function openQuestion(questionId: string) {
    setActiveId(questionId);
    setView("bank");
  }

  if (!data) {
    return (
      <main className="shell">
        <section className="empty">
          <h1>AMR Trainer</h1>
          <p>{error || "Loading AMR state from the backend..."}</p>
          {error && <button onClick={loadState}>Try again</button>}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <p className="eyebrow">AMR Trainer</p>
          <h1>Activation, Muscle Reps & Retention</h1>
        </div>
        <div className="headerActions">
          <Segmented
            value={track}
            options={[
              ["ic", "IC"],
              ["leadership", "Lead"],
              ["all", "All"],
            ]}
            onChange={(value) => setTrack(value as "ic" | "leadership" | "all")}
          />
          <button className="secondary" onClick={loadState}>
            Reload
          </button>
        </div>
      </header>

      <nav className="topTabs" aria-label="AMR views">
        <button className={view === "today" ? "tab selected" : "tab"} onClick={() => setView("today")}>
          Session
        </button>
        <button className={view === "bank" ? "tab selected" : "tab"} onClick={() => setView("bank")}>
          Bank
        </button>
        <button className={view === "progress" ? "tab selected" : "tab"} onClick={() => setView("progress")}>
          Progress
        </button>
      </nav>

      {error && <p className="error">{error}</p>}

      {view === "today" && <Today data={data} track={track} openQuestion={openQuestion} />}

      {view === "bank" && (
        <section className="practice">
          <div className="panel">
            <div className="fieldHeader">
              <span>Question bank</span>
              <span>
                {filteredQuestions.length} of {questions.length}
              </span>
            </div>
            <div className="filters">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter questions..." />
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as AMRStateName | "all")}>
                <option value="all">All states</option>
                {Object.entries(PHASES).map(([key, phase]) => (
                  <option key={key} value={key}>
                    {phase.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="questionList tall">
              {filteredQuestions.map((question) => {
                const p = getProgress(question, progress);
                return (
                  <button
                    key={question.id}
                    className={activeId === question.id ? "promptOption selected" : "promptOption"}
                    onClick={() => setActiveId(question.id)}
                  >
                    <span>
                      {question.category} · {question.track === "ic" ? "IC" : "Leadership"}
                    </span>
                    {question.text}
                    <small>{PHASES[p.state].short}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="panel">
            {activeQuestion ? (
              <QuestionWorkspace
                question={activeQuestion}
                progress={getProgress(activeQuestion, progress)}
                busy={busy}
                mutate={mutate}
              />
            ) : (
              <div className="empty inline">
                <h2>Pick a question</h2>
                <p>The panel separates the written answer, reading out loud, and real retention.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {view === "progress" && <Progress data={data} />}
    </main>
  );
}

function Today({
  data,
  track,
  openQuestion,
}: {
  data: AMRStateResponse;
  track: "ic" | "leadership" | "all";
  openQuestion: (questionId: string) => void;
}) {
  const scopedQuestions = data.questions.filter((question) => track === "all" || question.track === track);
  const today = new Date().toISOString().slice(0, 10);
  const dueReview = scopedQuestions
    .filter((question) => {
      const p = getProgress(question, data.progress);
      return p.state === "RETAINED" && (p.next_review_at || "9999") <= today;
    })
    .sort((a, b) => (getProgress(a, data.progress).next_review_at || "").localeCompare(getProgress(b, data.progress).next_review_at || ""))[0];
  const newQuestion = scopedQuestions.find((question) => getProgress(question, data.progress).state === "NEW");
  const muscleQuestion = scopedQuestions
    .filter((question) => getProgress(question, data.progress).state === "MUSCLE")
    .sort((a, b) => (getProgress(a, data.progress).touched_at || "").localeCompare(getProgress(b, data.progress).touched_at || ""))[0];
  const retentionQuestion = scopedQuestions
    .filter((question) => getProgress(question, data.progress).state === "RETENTION")
    .sort((a, b) => (getProgress(a, data.progress).touched_at || "").localeCompare(getProgress(b, data.progress).touched_at || ""))[0];
  const items = [
    dueReview && { kind: "AQUECIMENTO", question_id: dueReview.id },
    newQuestion && { kind: "ATIVACAO", question_id: newQuestion.id },
    muscleQuestion && { kind: "MUSCULACAO", question_id: muscleQuestion.id },
    retentionQuestion && { kind: "RETENCAO", question_id: retentionQuestion.id },
  ].filter(Boolean) as Array<{ kind: keyof typeof STEP_COPY; question_id: string }>;
  const stats = scopedQuestions.reduce(
    (acc, question) => {
      const p = getProgress(question, data.progress);
      acc[p.state] += 1;
      return acc;
    },
    { NEW: 0, MUSCLE: 0, RETENTION: 0, RETAINED: 0 } as Record<AMRStateName, number>,
  );

  return (
    <section className="stack">
      <div className="sectionHeader">
        <h2>Today's session</h2>
        <span>{new Date().toLocaleDateString("en-US")}</span>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <h2>Nothing urgent in this track</h2>
          <p>Open the bank and start a new question, or switch the track at the top.</p>
        </div>
      ) : (
        <ol className="sessionList">
          {items.map((item, index) => {
            const question = data.questions.find((candidate) => candidate.id === item.question_id);
            if (!question) return null;
            const copy = STEP_COPY[item.kind];
            return (
              <li key={`${item.kind}-${item.question_id}`}>
                <button onClick={() => openQuestion(question.id)} className="sessionStep">
                  <strong>{index + 1}</strong>
                  <span>
                    <b>{copy.title}</b>
                    {question.text}
                    <small>{copy.body}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="statGrid">
        {Object.entries(PHASES).map(([state, phase]) => (
          <div key={state} className="statCard">
            <strong>{stats[state as AMRStateName]}</strong>
            <span>{phase.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuestionWorkspace({
  question,
  progress,
  busy,
  mutate,
}: {
  question: AMRQuestion;
  progress: AMRProgress;
  busy: string;
  mutate: (path: string, body?: unknown) => Promise<unknown>;
}) {
  return (
    <div className="workspace">
      <div className="questionHeader">
        <span>
          {question.category} · {question.track === "ic" ? "IC" : "Leadership"}
        </span>
        <h2>{question.text}</h2>
        <b>{PHASES[progress.state].label}</b>
      </div>

      {progress.state === "NEW" && <Activation question={question} mutate={mutate} busy={busy} />}
      {progress.state === "MUSCLE" && <Muscle question={question} progress={progress} mutate={mutate} busy={busy} />}
      {progress.state === "RETENTION" && <Retention question={question} progress={progress} mutate={mutate} busy={busy} />}
      {progress.state === "RETAINED" && <Retained question={question} progress={progress} mutate={mutate} />}

      {progress.state !== "NEW" && (
        <div className="workspaceFooter">
          <button
            className="secondary"
            disabled={Boolean(busy)}
            onClick={() => {
              if (window.confirm("Reset this question to its original state? This clears the written answer, reps, recordings, and evaluations.")) {
                void mutate(`/amr/questions/${encodeURIComponent(question.id)}/reset`);
              }
            }}
          >
            Reset to original state
          </button>
        </div>
      )}
    </div>
  );
}

function Activation({
  question,
  mutate,
  busy,
}: {
  question: AMRQuestion;
  mutate: (path: string, body?: unknown) => Promise<unknown>;
  busy: string;
}) {
  const [answer, setAnswer] = useState("");
  return (
    <section className="phase">
      <h3>Written activation</h3>
      <p className="muted">No AI in this phase. Write your answer with the vocabulary you can recall right now.</p>
      <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type your answer in English..." />
      <div className="phaseActions">
        <span className="muted">{wordCount(answer)} words</span>
        <button
          disabled={answer.trim().length < 10 || Boolean(busy)}
          onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/activation`, { written_answer: answer.trim() })}
        >
          Save written v1
        </button>
      </div>
    </section>
  );
}

function Muscle({
  question,
  progress,
  mutate,
  busy,
}: {
  question: AMRQuestion;
  progress: AMRProgress;
  mutate: (path: string, body?: unknown) => Promise<unknown>;
  busy: string;
}) {
  const last = progress.reps.at(-1);
  const canAdvance = progress.reps.length >= 3 && last?.r === "fluiu";
  return (
    <section className="phase">
      <h3>Muscle reps</h3>
      <div className="writtenCard">
        <span>Your written v1</span>
        <p>{progress.written_answer}</p>
      </div>
      <p className="muted">Read it out loud. Log each attempt so the app knows when to suggest the next phase.</p>
      <div className="actions">
        <button className="warning" disabled={Boolean(busy)} onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/reps`, { result: "travei" })}>
          +1 rep · got stuck
        </button>
        <button disabled={Boolean(busy)} onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/reps`, { result: "fluiu" })}>
          +1 rep · flowed
        </button>
      </div>
      <div className="repLine">
        {progress.reps.length === 0 ? <span className="muted">No reps yet</span> : null}
        {progress.reps.map((rep) => (
          <span key={rep.id} className={rep.r === "fluiu" ? "pill good" : "pill warn"}>
            {fmt(rep.d)} · {repLabel(rep.r)}
          </span>
        ))}
      </div>
      <button disabled={!canAdvance || Boolean(busy)} onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/advance-retention`)}>
        Advance to retention
      </button>
    </section>
  );
}

function Retention({
  question,
  progress,
  mutate,
  busy,
}: {
  question: AMRQuestion;
  progress: AMRProgress;
  mutate: (path: string, body?: unknown) => Promise<unknown>;
  busy: string;
}) {
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((track) => track.stop());
    };
    recorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  async function submitAudio() {
    if (!audioBlob) return;
    const formData = new FormData();
    formData.append("audio", audioBlob, "retention.webm");
    await mutate(`/amr/questions/${encodeURIComponent(question.id)}/retention-audio`, formData);
    setAudioBlob(null);
    setAudioUrl(null);
  }

  return (
    <section className="phase">
      <h3>Retention</h3>
      <p className="muted">The v1 is hidden here on purpose. Answer from memory, record or paste a transcript, and the evaluator compares your speech against memory. Each recording gets its own evaluation.</p>
      <div className="recorderBox">
        <strong>{isRecording ? "Recording" : audioBlob ? "Audio ready" : "Recorder"}</strong>
        <div className="actions">
          {!isRecording ? (
            <button disabled={Boolean(busy)} onClick={startRecording}>
              Record
            </button>
          ) : (
            <button
              className="danger"
              onClick={() => {
                recorderRef.current?.stop();
                setIsRecording(false);
              }}
            >
              Stop
            </button>
          )}
          <button disabled={!audioBlob || Boolean(busy) || isRecording} onClick={submitAudio}>
            {busy ? "Evaluating..." : "Send audio"}
          </button>
        </div>
        {audioUrl && <audio controls src={audioUrl} />}
      </div>
      <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Or paste the transcript of your answer here..." />
      <button
        disabled={transcript.trim().length < 15 || Boolean(busy)}
        onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/retention-text`, { transcript: transcript.trim() }).then(() => setTranscript(""))}
      >
        Evaluate transcript
      </button>

      {progress.retention.slice().reverse().map((attempt) => (
        <EvalCard key={attempt.id} attempt={attempt} questionId={question.id} />
      ))}

      <button
        disabled={progress.retention.length === 0 || Boolean(busy)}
        onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/retained`)}
      >
        Mark as retained
      </button>
    </section>
  );
}

function Retained({
  question,
  progress,
  mutate,
}: {
  question: AMRQuestion;
  progress: AMRProgress;
  mutate: (path: string, body?: unknown) => Promise<unknown>;
}) {
  const due = (progress.next_review_at || "9999") <= new Date().toISOString().slice(0, 10);
  return (
    <section className="phase">
      <h3>Retained</h3>
      <p className="muted">
        Retained on {fmt(progress.retained_at)}. Next review: {fmt(progress.next_review_at)}.
      </p>
      {due ? (
        <div className="actions">
          <button className="warning" onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/review`, { result: "travei" })}>
            Got stuck, back to retention
          </button>
          <button onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/review`, { result: "fluiu" })}>
            Flowed, reschedule
          </button>
        </div>
      ) : (
        <button className="secondary" onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/review`, { result: "travei" })}>
          Practice retention now
        </button>
      )}
      <div className="writtenCard">
        <span>Written reference</span>
        <p>{progress.written_answer}</p>
      </div>
    </section>
  );
}

function EvalCard({ attempt, questionId }: { attempt: RetentionAttempt; questionId: string }) {
  const ev = attempt.ev;
  return (
    <article className="evalCard">
      <strong>Evaluation · {fmt(attempt.d)}</strong>
      {attempt.has_audio && (
        <audio
          controls
          src={`${API_BASE_URL}/amr/questions/${encodeURIComponent(questionId)}/retention/${attempt.id}/audio`}
        />
      )}
      {Boolean(attempt.transcript) && <p className="muted">“{attempt.transcript}”</p>}
      <p>
        <b>Substance:</b> {ev.substancia?.nota ?? "- "}/5 · {ev.substancia?.comentario}
      </p>
      <p>
        <b>Vocabulary:</b> {ev.vocabulario?.comentario}
      </p>
      {Boolean(ev.vocabulario?.alcancado?.length) && <p className="muted">Reached: {ev.vocabulario?.alcancado?.join(", ")}</p>}
      {Boolean(ev.vocabulario?.evitado_ou_simplificado?.length) && <p className="muted">Avoided: {ev.vocabulario?.evitado_ou_simplificado?.join(", ")}</p>}
      <p>
        <b>Hesitation:</b> {ev.hesitacao?.densidade ?? "-"} · {ev.hesitacao?.comentario}
      </p>
      <p className="focus">Next rep: {ev.foco_proxima_rep}</p>
    </article>
  );
}

function Progress({ data }: { data: AMRStateResponse }) {
  return (
    <section className="stack">
      <div className="sectionHeader">
        <h2>Persisted progress</h2>
        <span>SQLite at data/amr.sqlite3</span>
      </div>
      <div className="statGrid">
        <div className="statCard">
          <strong>{data.stats.written}</strong>
          <span>written answers</span>
        </div>
        <div className="statCard">
          <strong>{data.stats.reps}</strong>
          <span>reading reps</span>
        </div>
        <div className="statCard">
          <strong>{data.stats.retention_attempts}</strong>
          <span>retention attempts</span>
        </div>
        <div className="statCard">
          <strong>{data.stats.counts.RETAINED}</strong>
          <span>retained</span>
        </div>
      </div>
      <div className="panel">
        <h3>Pipeline</h3>
        <div className="statGrid compact">
          {Object.entries(PHASES).map(([state, phase]) => (
            <div className="statCard" key={state}>
              <strong>{data.stats.counts[state as AMRStateName]}</strong>
              <span>{phase.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map(([key, label]) => (
        <button key={key} className={value === key ? "selected" : ""} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function getProgress(question: AMRQuestion, progress: Record<string, AMRProgress>): AMRProgress {
  return (
    progress[question.id] ?? {
      question_id: question.id,
      state: "NEW",
      written_answer: "",
      touched_at: "",
      retained_at: null,
      next_review_at: null,
      last_reviewed_at: null,
      reps: [],
      retention: [],
    }
  );
}

function fmt(iso?: string | null) {
  if (!iso) return "-";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { day: "2-digit", month: "short" });
}

function repLabel(result: "travei" | "fluiu") {
  return result === "fluiu" ? "flowed" : "got stuck";
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}
