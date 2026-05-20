"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AMRProgress, AMRQuestion, AMRStateName, AMRStateResponse, RetentionAttempt } from "../lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001";

const PHASES: Record<AMRStateName, { label: string; short: string }> = {
  NEW: { label: "Ativação pendente", short: "NOVA" },
  MUSCLE: { label: "Musculação", short: "MUSC" },
  RETENTION: { label: "Retenção", short: "RET" },
  RETAINED: { label: "Retida", short: "OK" },
};

const STEP_COPY: Record<string, { title: string; body: string }> = {
  AQUECIMENTO: {
    title: "Aquecimento",
    body: "Uma resposta retida voltou para revisão. Responda de cabeça e confirme se ainda sai fluido.",
  },
  ATIVACAO: {
    title: "Ativação escrita",
    body: "Pergunta nova. Escreva a resposta só com o que já está na sua cabeça, sem IA e sem consulta.",
  },
  MUSCULACAO: {
    title: "Musculação",
    body: "Leia sua resposta em voz alta. O objetivo é boca, ritmo e recuperação automática.",
  },
  RETENCAO: {
    title: "Retenção",
    body: "Responda sem olhar a v1. Grave ou cole a transcrição para comparar fala real contra resposta escrita.",
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
          <p>{error || "Carregando estado AMR do backend..."}</p>
          {error && <button onClick={loadState}>Tentar de novo</button>}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <p className="eyebrow">AMR Trainer</p>
          <h1>Ativação, Musculação e Retenção</h1>
        </div>
        <div className="headerActions">
          <Segmented
            value={track}
            options={[
              ["ic", "IC"],
              ["leadership", "Lead"],
              ["all", "Tudo"],
            ]}
            onChange={(value) => setTrack(value as "ic" | "leadership" | "all")}
          />
          <button className="secondary" onClick={loadState}>
            Recarregar
          </button>
        </div>
      </header>

      <nav className="topTabs" aria-label="AMR views">
        <button className={view === "today" ? "tab selected" : "tab"} onClick={() => setView("today")}>
          Sessão
        </button>
        <button className={view === "bank" ? "tab selected" : "tab"} onClick={() => setView("bank")}>
          Banco
        </button>
        <button className={view === "progress" ? "tab selected" : "tab"} onClick={() => setView("progress")}>
          Progresso
        </button>
      </nav>

      {error && <p className="error">{error}</p>}

      {view === "today" && <Today data={data} track={track} openQuestion={openQuestion} />}

      {view === "bank" && (
        <section className="practice">
          <div className="panel">
            <div className="fieldHeader">
              <span>Banco de perguntas</span>
              <span>
                {filteredQuestions.length} de {questions.length}
              </span>
            </div>
            <div className="filters">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar pergunta..." />
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">Todas categorias</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as AMRStateName | "all")}>
                <option value="all">Todos estados</option>
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
                <h2>Escolha uma pergunta</h2>
                <p>O painel separa resposta escrita, leitura em voz alta e retenção real.</p>
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
        <h2>Sessão de hoje</h2>
        <span>{new Date().toLocaleDateString("pt-BR")}</span>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <h2>Nada urgente nesse track</h2>
          <p>Abra o banco e comece uma pergunta nova, ou troque o track no topo.</p>
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
      <h3>Ativação escrita</h3>
      <p className="muted">Sem IA nesta fase. Escreva a resposta com o vocabulário que você consegue recuperar agora.</p>
      <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type your answer in English..." />
      <div className="phaseActions">
        <span className="muted">{wordCount(answer)} palavras</span>
        <button
          disabled={answer.trim().length < 10 || Boolean(busy)}
          onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/activation`, { written_answer: answer.trim() })}
        >
          Salvar v1 escrita
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
      <h3>Musculação</h3>
      <div className="writtenCard">
        <span>Sua v1 escrita</span>
        <p>{progress.written_answer}</p>
      </div>
      <p className="muted">Leia em voz alta. Marque cada tentativa para o banco saber quando sugerir a próxima fase.</p>
      <div className="actions">
        <button className="warning" disabled={Boolean(busy)} onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/reps`, { result: "travei" })}>
          +1 rep travei
        </button>
        <button disabled={Boolean(busy)} onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/reps`, { result: "fluiu" })}>
          +1 rep fluiu
        </button>
      </div>
      <div className="repLine">
        {progress.reps.length === 0 ? <span className="muted">Nenhuma rep ainda</span> : null}
        {progress.reps.map((rep) => (
          <span key={rep.id} className={rep.r === "fluiu" ? "pill good" : "pill warn"}>
            {fmt(rep.d)} · {rep.r}
          </span>
        ))}
      </div>
      <button disabled={!canAdvance || Boolean(busy)} onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/advance-retention`)}>
        Avançar para retenção
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
      <h3>Retenção</h3>
      <p className="muted">A v1 fica escondida aqui de propósito. Responda de cabeça, grave ou cole uma transcrição, e o avaliador compara fala contra memória.</p>
      <div className="recorderBox">
        <strong>{isRecording ? "Gravando" : audioBlob ? "Áudio pronto" : "Gravador"}</strong>
        <div className="actions">
          {!isRecording ? (
            <button disabled={Boolean(busy)} onClick={startRecording}>
              Gravar
            </button>
          ) : (
            <button
              className="danger"
              onClick={() => {
                recorderRef.current?.stop();
                setIsRecording(false);
              }}
            >
              Parar
            </button>
          )}
          <button disabled={!audioBlob || Boolean(busy) || isRecording} onClick={submitAudio}>
            {busy ? "Avaliando..." : "Enviar áudio"}
          </button>
        </div>
        {audioUrl && <audio controls src={audioUrl} />}
      </div>
      <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Ou cole aqui a transcrição da sua fala..." />
      <button
        disabled={transcript.trim().length < 15 || Boolean(busy)}
        onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/retention-text`, { transcript: transcript.trim() }).then(() => setTranscript(""))}
      >
        Avaliar transcrição
      </button>

      {progress.retention.slice().reverse().map((attempt) => (
        <EvalCard key={attempt.id} attempt={attempt} />
      ))}

      <button
        disabled={progress.retention.length === 0 || Boolean(busy)}
        onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/retained`)}
      >
        Marcar como retida
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
      <h3>Retida</h3>
      <p className="muted">
        Retida em {fmt(progress.retained_at)}. Próxima revisão: {fmt(progress.next_review_at)}.
      </p>
      {due ? (
        <div className="actions">
          <button className="warning" onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/review`, { result: "travei" })}>
            Travei, voltar para retenção
          </button>
          <button onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/review`, { result: "fluiu" })}>
            Fluiu, reagendar
          </button>
        </div>
      ) : (
        <button className="secondary" onClick={() => mutate(`/amr/questions/${encodeURIComponent(question.id)}/review`, { result: "travei" })}>
          Treinar retenção agora
        </button>
      )}
      <div className="writtenCard">
        <span>Referência escrita</span>
        <p>{progress.written_answer}</p>
      </div>
    </section>
  );
}

function EvalCard({ attempt }: { attempt: RetentionAttempt }) {
  const ev = attempt.ev;
  return (
    <article className="evalCard">
      <strong>Avaliação · {fmt(attempt.d)}</strong>
      <p>
        <b>Substância:</b> {ev.substancia?.nota ?? "- "}/5 · {ev.substancia?.comentario}
      </p>
      <p>
        <b>Vocabulário:</b> {ev.vocabulario?.comentario}
      </p>
      {Boolean(ev.vocabulario?.alcancado?.length) && <p className="muted">Alcançou: {ev.vocabulario?.alcancado?.join(", ")}</p>}
      {Boolean(ev.vocabulario?.evitado_ou_simplificado?.length) && <p className="muted">Evitou: {ev.vocabulario?.evitado_ou_simplificado?.join(", ")}</p>}
      <p>
        <b>Hesitação:</b> {ev.hesitacao?.densidade ?? "-"} · {ev.hesitacao?.comentario}
      </p>
      <p className="focus">Próxima rep: {ev.foco_proxima_rep}</p>
    </article>
  );
}

function Progress({ data }: { data: AMRStateResponse }) {
  return (
    <section className="stack">
      <div className="sectionHeader">
        <h2>Progresso persistido</h2>
        <span>SQLite em data/amr.sqlite3</span>
      </div>
      <div className="statGrid">
        <div className="statCard">
          <strong>{data.stats.written}</strong>
          <span>respostas escritas</span>
        </div>
        <div className="statCard">
          <strong>{data.stats.reps}</strong>
          <span>reps de leitura</span>
        </div>
        <div className="statCard">
          <strong>{data.stats.retention_attempts}</strong>
          <span>tentativas de retenção</span>
        </div>
        <div className="statCard">
          <strong>{data.stats.counts.RETAINED}</strong>
          <span>retidas</span>
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
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}
