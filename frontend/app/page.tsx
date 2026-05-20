"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticeResponse, QuestionCategory } from "../lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001";

export default function Home() {
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<PracticeResponse[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const activeQuestion = customPrompt.trim() || selectedPrompt;
  const latestRound = rounds[0];
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  const nextQuestions = useMemo(() => {
    return latestRound?.follow_up_questions ?? [];
  }, [latestRound]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/questions`)
      .then((response) => response.json())
      .then((data: QuestionCategory[]) => {
        const firstCategory = data[0];
        setCategories(data);
        setSelectedCategoryId(firstCategory?.id ?? "");
        setSelectedPrompt(firstCategory?.questions[0] ?? "");
      })
      .catch(() => setError("Could not load AMR questions from the backend."));
  }, []);

  useEffect(() => {
    if (!isRecording) return;

    const timer = window.setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function startRecording() {
    setError("");
    setAudioBlob(null);
    setRecordingSeconds(0);

    try {
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
    } catch {
      setError("Microphone access failed. Check browser permissions and try again.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
  }

  async function submitAudio(questionOverride?: string) {
    if (!audioBlob) {
      setError("Record an answer before submitting.");
      return;
    }

    const question = questionOverride || activeQuestion;
    if (!question) {
      setError("Choose or type a question first.");
      return;
    }

    setIsUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("audio", audioBlob, "answer.webm");
    formData.append("question", question);
    if (sessionId) formData.append("session_id", sessionId);

    try {
      const response = await fetch(`${API_BASE_URL}/practice-round`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || "Upload failed");
      }

      const data = (await response.json()) as PracticeResponse;
      setSessionId(data.session_id);
      setRounds((current) => [data, ...current]);
      setAudioBlob(null);
      setAudioUrl(null);
      setCustomPrompt("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  function startNewSession() {
    setSessionId(null);
    setRounds([]);
    setAudioBlob(null);
    setAudioUrl(null);
    setCustomPrompt("");
    setError("");
  }

  function selectCategory(category: QuestionCategory) {
    setSelectedCategoryId(category.id);
    setSelectedPrompt(category.questions[0] ?? "");
    setCustomPrompt("");
  }

  return (
    <main className="shell">
      <section className="header">
        <div>
          <p className="eyebrow">AMR Speaking Practice</p>
          <h1>Technical Interview Fluency Coach</h1>
        </div>
        <button className="secondary" onClick={startNewSession}>
          New session
        </button>
      </section>

      <section className="practice">
        <div className="panel">
          <div className="fieldHeader">
            <span>Category</span>
            <span>{categories.length} categories</span>
          </div>
          <div className="categoryList" role="tablist" aria-label="Question categories">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={selectedCategoryId === category.id ? "categoryOption selected" : "categoryOption"}
                role="tab"
                aria-selected={selectedCategoryId === category.id}
                onClick={() => selectCategory(category)}
              >
                <span>{category.group}</span>
                {category.title}
                <small>{category.questions.length} questions</small>
              </button>
            ))}
          </div>

          <div className="fieldHeader">
            <span>Interview prompt</span>
            {selectedCategory && <span>{selectedCategory.title}</span>}
          </div>
          <div className="questionList" role="radiogroup" aria-label="Interview prompt">
            {selectedCategory?.questions.map((question) => (
              <button
                key={question}
                type="button"
                className={selectedPrompt === question ? "promptOption selected" : "promptOption"}
                role="radio"
                aria-checked={selectedPrompt === question}
                onClick={() => setSelectedPrompt(question)}
              >
                {question}
              </button>
            ))}
          </div>

          <label htmlFor="custom">Custom or follow-up prompt</label>
          <textarea
            id="custom"
            value={customPrompt}
            onChange={(event) => setCustomPrompt(event.target.value)}
            placeholder="Paste a follow-up question here, or leave empty to use the selected AMR prompt."
          />

          {nextQuestions.length > 0 && (
            <div className="followups">
              <p>Follow-up questions</p>
              {nextQuestions.map((question) => (
                <button key={question} className="questionButton" onClick={() => setCustomPrompt(question)}>
                  {question}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel recorder">
          <div className="recordStatus">
            <span className={isRecording ? "dot active" : "dot"} />
            <strong>{isRecording ? "Recording" : audioBlob ? "Ready to submit" : "Idle"}</strong>
            <span>{formatTime(recordingSeconds)}</span>
          </div>

          <div className="actions">
            {!isRecording ? (
              <button onClick={startRecording} disabled={isUploading}>
                Record answer
              </button>
            ) : (
              <button className="danger" onClick={stopRecording}>
                Stop
              </button>
            )}
            <button onClick={() => submitAudio()} disabled={!audioBlob || isUploading || isRecording}>
              {isUploading ? "Analyzing..." : "Submit"}
            </button>
          </div>

          {audioUrl && <audio controls src={audioUrl} />}
          {sessionId && <p className="muted">Session: {sessionId}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      </section>

      <section className="results">
        {rounds.length === 0 ? (
          <div className="empty">
            <h2>Record your first answer</h2>
            <p>Answer out loud for one to three minutes. The coach will return a transcript, feedback, vocabulary recovery, and follow-up questions.</p>
          </div>
        ) : (
          rounds.map((round) => (
            <article className="round" key={`${round.session_id}-${round.round}`}>
              <div className="roundHeader">
                <h2>Round {round.round}</h2>
                <div className="scores">
                  <span>Fluency {round.feedback.fluency_score}/10</span>
                  <span>Clarity {round.feedback.clarity_score}/10</span>
                  <span>Interview {round.feedback.interview_readiness_score}/10</span>
                </div>
              </div>

              <div className="grid">
                <section>
                  <h3>Prompt</h3>
                  <p>{round.question}</p>
                </section>
                <section>
                  <h3>Coach summary</h3>
                  <p>{round.feedback.summary}</p>
                </section>
              </div>

              <div className="grid">
                <section>
                  <h3>Transcript</h3>
                  <p>{round.transcript}</p>
                </section>
                <List title="Strengths" items={round.feedback.strengths} />
              </div>

              <List title="Improvements" items={round.feedback.improvements} />

              <section>
                <h3>Vocabulary recovery</h3>
                {round.feedback.vocabulary_recovery.length === 0 ? (
                  <p className="muted">No vocabulary notes returned.</p>
                ) : (
                  <ul>
                    {round.feedback.vocabulary_recovery.map((item, index) => (
                      <li key={`${item.idea}-${index}`}>
                        <strong>{item.idea}:</strong> {item.better_phrases.join("; ")}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3>More fluent version</h3>
                <p>{round.feedback.suggested_rewrite}</p>
              </section>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">No notes returned.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
