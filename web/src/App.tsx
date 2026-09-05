import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { fetchAction, seedAction, toActionRequest } from "./actionApi";
import { fetchAssess, seedFromRules, toAssessRequest } from "./assessApi";
import { assess } from "./engine";
import { prepareEvidence } from "./evidence";
import { FLAG_BLURB, FLAG_LABEL, INCIDENT_LABEL, SAMPLE_MESSAGE, STAGE_BLURB, STAGE_LABEL } from "./sources";
import type { ActionPlanResult, EvidencePacket, IncidentState, IntakeMode, StageAssessResult } from "./types";

type View = "intake" | "preparing" | "working" | "record";
type IntakeRecord = Pick<
  IncidentState,
  | "thread_id"
  | "raw_evidence_refs"
  | "events_and_timeline"
  | "facts_shared"
  | "incident_type"
  | "uncertainty_notes"
  | "redaction_notice"
>;

const PREPARE_STEPS = ["Read screenshot", "Remove secrets"];
const WORK_STEPS = [
  "Secure the evidence",
  "Extract observed facts",
  "Assess stage on Amazon Bedrock",
  "Create incident record",
];

function toRecord(state: IncidentState): IntakeRecord {
  return {
    thread_id: state.thread_id,
    raw_evidence_refs: state.raw_evidence_refs,
    events_and_timeline: state.events_and_timeline,
    facts_shared: state.facts_shared,
    incident_type: state.incident_type,
    uncertainty_notes: state.uncertainty_notes,
    redaction_notice: state.redaction_notice,
  };
}

export default function App() {
  const [view, setView] = useState<View>("intake");
  const [mode, setMode] = useState<IntakeMode>("message");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [packet, setPacket] = useState<EvidencePacket | null>(null);
  const [state, setState] = useState<IncidentState | null>(null);
  const [assessment, setAssessment] = useState<StageAssessResult | null>(null);
  const [actionPlan, setActionPlan] = useState<ActionPlanResult | null>(null);
  const [planning, setPlanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [workTick, setWorkTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (view === "preparing") {
      setWorkTick(0);
      const timers = [0, 1].map((i) => window.setTimeout(() => setWorkTick(i + 1), 500 + i * 500));
      return () => timers.forEach(clearTimeout);
    }
    if (view !== "working") return;
    setWorkTick(0);
    const timers = [0, 1, 2, 3].map((i) => window.setTimeout(() => setWorkTick(i + 1), 500 + i * 450));
    return () => timers.forEach(clearTimeout);
  }, [view]);

  function resetIntakeFields() {
    setText("");
    setFile(undefined);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(undefined);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() && !file) {
      setError("Add a message, description, or screenshot before creating a record.");
      return;
    }
    setError(null);
    setView("preparing");
    try {
      const nextPacket = await prepareEvidence({ text, file, mode: file ? "screenshot" : mode });
      setPacket(nextPacket);
      if (nextPacket.needs_caption) {
        setView("intake");
        setError("We could not read enough text from that screenshot. Type what it says, then try again.");
        return;
      }
      const assessed = assess({
        text: nextPacket.text,
        mode: file ? "screenshot" : mode,
        fileName: file?.name,
        evidenceRefs: nextPacket.evidence_refs,
        prior: adding ? state ?? undefined : undefined,
      });
      setState(assessed);
      setAssessment(seedFromRules(assessed));
      resetIntakeFields();
      setView("working");
      const started = Date.now();
      try {
        setAssessment(await fetchAssess(toAssessRequest(assessed)));
      } catch {
        /* Keep the keyword seed so the record page never goes blank. */
      }
      const wait = Math.max(0, 1800 - (Date.now() - started));
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
      setAdding(false);
      setView("record");
    } catch (cause) {
      setView("intake");
      setError(cause instanceof Error ? cause.message : "Could not read that screenshot. Type what it says instead.");
    }
  }

  function onFile(next: File | undefined) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!next) {
      setFile(undefined);
      setPreviewUrl(undefined);
      return;
    }
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    setMode("screenshot");
  }

  function startOver() {
    resetIntakeFields();
    setState(null);
    setAssessment(null);
    setActionPlan(null);
    setPlanning(false);
    setPacket(null);
    setAdding(false);
    setError(null);
    setView("intake");
  }

  const record = state ? toRecord(state) : null;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <p className="wordmark">ScamSafe</p>
            <p className="tag">Capture the facts. Decide what comes next later.</p>
          </div>
        </div>
        <p className="disclaimer">
          This creates an incident record only. Do not share passwords, OTPs, PINs, or full card numbers.
        </p>
      </header>

      <main>
        {view === "intake" && (
          <Intake
            mode={mode}
            text={text}
            error={error}
            adding={adding}
            previewUrl={previewUrl}
            fileRef={fileRef}
            onMode={setMode}
            onText={setText}
            onFile={onFile}
            onSubmit={onSubmit}
            onSample={() => {
              setMode("message");
              setText(SAMPLE_MESSAGE);
              setError(null);
            }}
          />
        )}

        {view === "preparing" && (
          <Working
            tick={workTick}
            title="Checking what you shared"
            steps={file ? PREPARE_STEPS : ["Remove secrets"]}
          />
        )}

        {view === "working" && (
          <Working tick={workTick} title="Building your incident record" steps={WORK_STEPS} />
        )}

        {view === "record" && record && assessment && (
          <RecordView
            record={record}
            assessment={assessment}
            actionPlan={actionPlan}
            planning={planning}
            packet={packet}
            onPlan={async () => {
              setPlanning(true);
              try {
                setActionPlan(await fetchAction(toActionRequest(assessment)));
              } catch {
                setActionPlan(seedAction(assessment));
              } finally {
                setPlanning(false);
              }
            }}
            onAdd={() => {
              setAdding(true);
              setError(null);
              setView("intake");
            }}
            onStartOver={startOver}
          />
        )}
      </main>

      <footer className="foot">
        {record && (
          <button className="textish" type="button" onClick={startOver}>
            Start over
          </button>
        )}
      </footer>
    </div>
  );
}

function Intake(props: {
  mode: IntakeMode;
  text: string;
  error: string | null;
  adding: boolean;
  previewUrl?: string;
  fileRef: RefObject<HTMLInputElement | null>;
  onMode: (mode: IntakeMode) => void;
  onText: (value: string) => void;
  onFile: (file?: File) => void;
  onSubmit: (event: FormEvent) => void;
  onSample: () => void;
}) {
  return (
    <section className="panel">
      <p className="eyebrow">{props.adding ? "Add evidence" : "Incident intake"}</p>
      <h1>{props.adding ? "What else should we record?" : "What happened?"}</h1>
      <p className="lede">
        Share a message, your description, or a screenshot. We will extract a factual incident
        record — no advice yet.
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
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <label className="sr" htmlFor="evidence">
          Evidence or description
        </label>
        <textarea
          id="evidence"
          rows={props.mode === "describe" ? 5 : 7}
          value={props.text}
          onChange={(event) => props.onText(event.target.value)}
          placeholder={
            props.mode === "message"
              ? "Paste an SMS, chat, or email here."
              : props.mode === "describe"
                ? "Describe what happened and what the other person asked you to do."
                : "Optional note. We also try to read text from the screenshot on your device."
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
            <p className="muted">
              The image stays on this device as a file reference. If reading fails, type what it says.
            </p>
          </div>
        )}
        <p className="helper">
          You can submit text, a screenshot, or both. Sensitive values are redacted before storage.
        </p>
        {props.error && (
          <p className="error" role="alert">
            {props.error}
          </p>
        )}
        <div className="row">
          <button type="submit" className="primary">
            Create incident record
          </button>
          {!props.adding && (
            <button type="button" className="secondary" onClick={props.onSample}>
              Use sample
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function Working({ tick, title, steps }: { tick: number; title: string; steps: string[] }) {
  return (
    <section className="panel working" aria-live="polite">
      <div className="loader" aria-hidden="true"><span /></div>
      <p className="eyebrow">Processing intake</p>
      <h1>{title}</h1>
      <p className="working-copy">
        Extracting what was observed, then classifying stage and risk on Amazon Bedrock.
      </p>
      <ol className="steps">
        {steps.map((step, index) => (
          <li key={step} className={tick > index ? "done" : tick === index ? "now" : ""}>
            <span className="step-icon" aria-hidden="true">{tick > index ? "✓" : tick === index ? "" : "·"}</span>
            <span>{step}</span>
            {tick === index && <span className="step-status">In progress</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function fullObservation(record: IntakeRecord): string | null {
  return (
    record.events_and_timeline.find(
      (event) => event.observation && !event.observation.startsWith("Provided a screenshot"),
    )?.observation ?? null
  );
}

function RecordView({
  record,
  assessment,
  actionPlan,
  planning,
  packet,
  onPlan,
  onAdd,
  onStartOver,
}: {
  record: IntakeRecord;
  assessment: StageAssessResult;
  actionPlan: ActionPlanResult | null;
  planning: boolean;
  packet: EvidencePacket | null;
  onPlan: () => void;
  onAdd: () => void;
  onStartOver: () => void;
}) {
  const [showQuote, setShowQuote] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const quote = fullObservation(record);
  const quoteLong = Boolean(quote && quote.length > 160);
  const quoteText = quote && quoteLong && !showQuote ? `${quote.slice(0, 157)}…` : quote;
  const flags = assessment.risk_flags.filter((flag) => flag !== "insufficient_evidence");
  const notes = [...new Set([...record.uncertainty_notes, ...assessment.uncertainty_notes])].filter(
    (note) => assessment.source !== "bedrock" || !/model skipped/i.test(note),
  );
  return (
    <section className="panel">
      <p className="eyebrow">Record created</p>
      <h1>Here is what we captured</h1>
      {record.redaction_notice && <p className="notice">{record.redaction_notice}</p>}
      {packet?.ocr_excerpt && (
        <p className="notice ok">
          {packet.ocr_status === "weak"
            ? "We only partly read the screenshot. Secrets were removed: "
            : "Read from the screenshot. Secrets were removed: "}
          {packet.ocr_excerpt}
        </p>
      )}
      <article className="assess-card">
        <div className="assess-head">
          <p className="eyebrow">AI assessment</p>
          <span className={assessment.source === "bedrock" ? "badge on" : "badge"}>
            {assessment.source === "bedrock" ? "Amazon Bedrock" : "Keyword fallback"}
          </span>
        </div>
        <p className="assess-kicker">Stage</p>
        <p className="assess-stage">{STAGE_LABEL[assessment.current_stage]}</p>
        <p className="assess-blurb">{STAGE_BLURB[assessment.current_stage]}</p>
        <p className="assess-kicker">Risk flags</p>
        {flags.length ? (
          <ul className="risk-list">
            {flags.map((flag) => (
              <li key={flag}>
                <strong>{FLAG_LABEL[flag]}</strong>
                <span>{FLAG_BLURB[flag]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No urgent risk flags.</p>
        )}
        {assessment.decision_factors.length > 0 && (
          <details className="fold">
            <summary>Why the model chose this</summary>
            <ListOrEmpty items={assessment.decision_factors} />
          </details>
        )}
      </article>
      {assessment.needs_clarification && assessment.unanswered_questions[0] && (
        <p className="notice">{assessment.unanswered_questions[0]} Use Add more evidence if you can answer this.</p>
      )}
      <details className="fold" open>
        <summary>What we observed</summary>
        <p className="incident-line">{INCIDENT_LABEL[record.incident_type] ?? record.incident_type}</p>
        {quoteText && (
          <div className="fact-summary">
            <p>{quoteText}</p>
            {quoteLong && (
              <button type="button" className="textish" onClick={() => setShowQuote((open) => !open)}>
                {showQuote ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
        <ListOrEmpty items={record.facts_shared} empty="No clear facts extracted yet." />
      </details>
      <details className="fold">
        <summary>Timeline</summary>
        <ul className="timeline">
          {record.events_and_timeline.map((event, index) => (
            <li key={`${event.time_hint}-${index}`}>
              <strong>{event.time_hint}</strong>
              <span>{event.observation}</span>
            </li>
          ))}
        </ul>
      </details>
      {notes.length > 0 && (
        <details className="fold">
          <summary>Uncertainty</summary>
          <ListOrEmpty items={notes} />
        </details>
      )}
      <details className="fold">
        <summary>Case details</summary>
        <p className="muted">
          The case ID keeps this incident together when you add more evidence. It is not sent to anyone.
        </p>
        <p className="case-id">
          <span>Case ID</span>
          <code>{record.thread_id}</code>
        </p>
        <ListOrEmpty items={record.raw_evidence_refs} empty="No file references." />
      </details>
      {actionPlan && (
        <article className="action-card">
          <div className="assess-head">
            <p className="eyebrow">Next steps</p>
            <span className="badge on">Official playbook</span>
          </div>
          <p className="assess-stage">{actionPlan.selected_next_action.title}</p>
          <p className="muted">This app does not call anyone. These are steps for you to take.</p>
          <ol className="plan-steps">
            {actionPlan.selected_next_action.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="source-line">
            Source:{" "}
            <a href={actionPlan.selected_next_action.source_url} target="_blank" rel="noreferrer">
              {actionPlan.selected_next_action.source_title}
            </a>
          </p>
          <label className="consent">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
            />
            I understand these steps. ScamSafe will not contact a bank, 1799, or the police for me.
          </label>
        </article>
      )}
      <div className="row">
        <button type="button" className="primary" onClick={onPlan} disabled={planning}>
          {planning ? "Planning next steps…" : "Plan next steps"}
        </button>
        <button type="button" className="secondary" onClick={onAdd}>
          Add more evidence
        </button>
        <button type="button" className="secondary" onClick={onStartOver}>
          Start a new record
        </button>
      </div>
    </section>
  );
}

function ListOrEmpty({ items, empty }: { items: string[]; empty?: string }) {
  return items.length ? (
    <ul className="facts">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className="muted">{empty ?? "None recorded."}</p>
  );
}
