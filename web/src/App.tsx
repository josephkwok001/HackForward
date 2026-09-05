import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { assess, handoffSummary, promptForQuestion, withConsent } from "./engine";
import { FLAG_LABEL, SAMPLE_MESSAGE, STAGE_LABEL } from "./sources";
import type { IncidentState, IntakeMode } from "./types";

type View = "intake" | "working" | "clarify" | "result" | "handoff";

const WORK_STEPS = ["Extract facts", "Assess stage and risk", "Safety gate"];

export default function App() {
  const [view, setView] = useState<View>("intake");
  const [mode, setMode] = useState<IntakeMode>("message");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<IncidentState | null>(null);
  const [showState, setShowState] = useState(false);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [workTick, setWorkTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (view !== "working") return;
    setWorkTick(0);
    const timers = [0, 1, 2].map((i) =>
      window.setTimeout(() => setWorkTick(i + 1), 280 + i * 320),
    );
    const done = window.setTimeout(() => {
      if (!state) return;
      setView(state.needs_clarification ? "clarify" : "result");
      setAdding(false);
    }, 1180);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [view, state]);

  const urgency = useMemo(() => {
    if (!state) return "calm" as const;
    if (["money_sent", "payment_pending", "otp_shared", "app_installed"].includes(state.current_stage)) {
      return "urgent" as const;
    }
    if (state.current_stage === "active_pressure") return "watch" as const;
    return "calm" as const;
  }, [state]);

  const prompt = state?.unanswered_questions[0]
    ? promptForQuestion(state.unanswered_questions[0])
    : null;

  function resetIntakeFields() {
    setText("");
    setFileName(undefined);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(undefined);
    if (fileRef.current) fileRef.current.value = "";
  }

  function runAssess(next: { text: string; mode: IntakeMode; fileName?: string; answer?: { question: string; value: string } }, prior?: IncidentState | null) {
    const assessed = assess({
      text: next.text,
      mode: next.mode,
      fileName: next.fileName,
      prior: prior ?? undefined,
      answer: next.answer,
    });
    setState(assessed);
    setError(null);
    setView("working");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() && !fileName) {
      setError("Paste a message, describe what happened, or attach a screenshot.");
      return;
    }
    runAssess({ text, mode, fileName }, adding ? state : null);
    resetIntakeFields();
  }

  function onSample() {
    setMode("message");
    setText(SAMPLE_MESSAGE);
    setError(null);
  }

  function onFile(file: File | undefined) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) {
      setFileName(undefined);
      setPreviewUrl(undefined);
      return;
    }
    setFileName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
    setMode("screenshot");
  }

  function onChoice(choiceId: string) {
    if (!state || !prompt) return;
    runAssess(
      {
        text: "",
        mode: "describe",
        answer: { question: prompt.question, value: choiceId },
      },
      state,
    );
  }

  function startOver() {
    setState(null);
    setView("intake");
    setAdding(false);
    setShowState(false);
    setCopied(false);
    resetIntakeFields();
    setError(null);
  }

  async function copySummary() {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(handoffSummary(state));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setError("Could not copy. Select the summary and copy it manually.");
    }
  }

  return (
    <div className={`app risk-${urgency}`}>
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <p className="wordmark">ScamSafe</p>
            <p className="tag">One next step. Official sources only.</p>
          </div>
        </div>
        <p className="disclaimer">
          Not a government agency. We do not call your bank or the police for you.
        </p>
      </header>

      <main>
        {view === "intake" && (
          <Intake
            mode={mode}
            text={text}
            error={error}
            fileName={fileName}
            previewUrl={previewUrl}
            fileRef={fileRef}
            onMode={setMode}
            onText={setText}
            onFile={onFile}
            onSample={onSample}
            onSubmit={onSubmit}
          />
        )}

        {view === "working" && <Working tick={workTick} />}

        {view === "clarify" && state && prompt && (
          <section className="panel">
            <p className="eyebrow">One question</p>
            <h1>This answer changes what you should do next.</h1>
            <p className="lede">{prompt.question}</p>
            <div className="choices">
              {prompt.choices.map((choice) => (
                <button key={choice.id} type="button" className="choice" onClick={() => onChoice(choice.id)}>
                  {choice.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {view === "result" && state && (
          <Result
            state={state}
            adding={adding}
            urgency={urgency}
            text={text}
            error={error}
            fileRef={fileRef}
            onText={setText}
            onFile={onFile}
            onSubmit={onSubmit}
            onAdd={() => {
              setAdding(true);
              setError(null);
            }}
            onConfirm={() => setState(withConsent(state, "next_action"))}
            onHandoff={() => {
              setState(withConsent(state, "prepare_handoff"));
              setView("handoff");
            }}
          />
        )}

        {view === "handoff" && state && (
          <section className="panel">
            <p className="eyebrow">Prepared handoff</p>
            <h1>Copy this. We have not contacted anyone.</h1>
            <pre className="summary">{handoffSummary(state)}</pre>
            <div className="row">
              <button type="button" className="primary" onClick={copySummary}>
                {copied ? "Copied" : "Copy summary"}
              </button>
              <a className="secondary linkish" href="https://www.scamshield.gov.sg/check-for-scams/scamshield-helpline/" target="_blank" rel="noreferrer">
                Open 1799 guidance
              </a>
            </div>
            <button type="button" className="textish" onClick={() => setView("result")}>
              Back to the next step
            </button>
          </section>
        )}
      </main>

      <footer className="foot">
        {state && (
          <button type="button" className="textish" onClick={() => setShowState((v) => !v)}>
            {showState ? "Hide" : "Show"} incident state
          </button>
        )}
        {state && (
          <button type="button" className="textish" onClick={startOver}>
            Start over
          </button>
        )}
        <span className="muted">Baseline UI · rule-based stand-in for the graph</span>
      </footer>

      {showState && state && (
        <aside className="state-drawer" aria-label="Incident state">
          <pre>{JSON.stringify(state, null, 2)}</pre>
        </aside>
      )}
    </div>
  );
}

function Intake(props: {
  mode: IntakeMode;
  text: string;
  error: string | null;
  fileName?: string;
  previewUrl?: string;
  fileRef: RefObject<HTMLInputElement | null>;
  onMode: (mode: IntakeMode) => void;
  onText: (value: string) => void;
  onFile: (file: File | undefined) => void;
  onSample: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <section className="panel">
      <p className="eyebrow">If something feels wrong</p>
      <h1>What is happening right now?</h1>
      <p className="lede">
        Paste the message, describe the call, or add a screenshot. We will give you one next
        action from an official source — never a password or OTP request.
      </p>
      <form onSubmit={props.onSubmit}>
        <div className="tabs" role="tablist">
          {(["message", "describe", "screenshot"] as IntakeMode[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={props.mode === item}
              className={props.mode === item ? "tab on" : "tab"}
              onClick={() => props.onMode(item)}
            >
              {item === "message" ? "Message" : item === "describe" ? "Describe" : "Screenshot"}
            </button>
          ))}
        </div>
        <label className="sr" htmlFor="evidence">
          {props.mode === "message" ? "Message text" : "What happened"}
        </label>
        <textarea
          id="evidence"
          rows={props.mode === "describe" ? 5 : 7}
          value={props.text}
          onChange={(event) => props.onText(event.target.value)}
          placeholder={
            props.mode === "message"
              ? "Paste the SMS, WhatsApp, or email text here."
              : props.mode === "describe"
                ? "Example: A caller said they were from the bank and told me not to hang up."
                : "Optional: add a short note about what the screenshot shows."
          }
        />
        {props.mode === "screenshot" && (
          <div className="upload">
            <input
              ref={props.fileRef}
              type="file"
              accept="image/*"
              onChange={(event) => props.onFile(event.target.files?.[0])}
            />
            {props.previewUrl && (
              <img className="thumb" src={props.previewUrl} alt="Attached screenshot preview" />
            )}
          </div>
        )}
        {props.error && <p className="error">{props.error}</p>}
        <div className="row">
          <button type="submit" className="primary">
            Tell me what to do next
          </button>
          <button type="button" className="secondary" onClick={props.onSample}>
            Use a sample
          </button>
        </div>
      </form>
    </section>
  );
}

function Working({ tick }: { tick: number }) {
  return (
    <section className="panel working" aria-live="polite">
      <p className="eyebrow">Working</p>
      <h1>Reading what you shared</h1>
      <ol className="steps">
        {WORK_STEPS.map((step, index) => (
          <li key={step} className={tick > index ? "done" : tick === index ? "now" : ""}>
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Result(props: {
  state: IncidentState;
  adding: boolean;
  urgency: "calm" | "watch" | "urgent";
  text: string;
  error: string | null;
  fileRef: RefObject<HTMLInputElement | null>;
  onText: (value: string) => void;
  onFile: (file: File | undefined) => void;
  onSubmit: (event: FormEvent) => void;
  onAdd: () => void;
  onConfirm: () => void;
  onHandoff: () => void;
}) {
  const action = props.state.selected_next_action;
  const confirmed = props.state.user_consent.includes("next_action");

  return (
    <section className="panel">
      <p className={`eyebrow ${props.urgency}`}>
        {STAGE_LABEL[props.state.current_stage]}
        {props.state.loop_count > 0 ? ` · updated` : ""}
      </p>
      <h1>{action?.title ?? "We need one more fact before advising."}</h1>
      {props.state.redaction_notice && <p className="notice">{props.state.redaction_notice}</p>}

      {props.state.facts_shared.length > 0 && (
        <ul className="facts">
          {props.state.facts_shared.slice(0, 4).map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}

      <div className="flags">
        {props.state.risk_flags
          .filter((flag) => flag !== "insufficient_evidence")
          .map((flag) => (
            <span key={flag} className="chip">
              {FLAG_LABEL[flag]}
            </span>
          ))}
      </div>

      {action && (
        <article className="ticket">
          <p className="stamp">Next step</p>
          <ol>
            {action.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <a href={action.source_url} target="_blank" rel="noreferrer">
            Official source: {action.source_title}
          </a>
          {confirmed && <p className="notice ok">You confirmed this step. We did not contact anyone.</p>}
        </article>
      )}

      <div className="row">
        {!confirmed && (
          <button type="button" className="primary" onClick={props.onConfirm}>
            I’ll do this
          </button>
        )}
        <button type="button" className="secondary" onClick={props.onHandoff}>
          Prepare a handoff
        </button>
      </div>

      {!props.adding ? (
        <button type="button" className="textish" onClick={props.onAdd}>
          Something changed — add more
        </button>
      ) : (
        <form className="add-more" onSubmit={props.onSubmit}>
          <p className="eyebrow">New evidence</p>
          <textarea
            rows={4}
            value={props.text}
            onChange={(event) => props.onText(event.target.value)}
            placeholder="Add what just changed. This incident stays open."
          />
          <input
            ref={props.fileRef}
            type="file"
            accept="image/*"
            onChange={(event) => props.onFile(event.target.files?.[0])}
          />
          {props.error && <p className="error">{props.error}</p>}
          <button type="submit" className="primary">
            Re-assess this incident
          </button>
        </form>
      )}
    </section>
  );
}
