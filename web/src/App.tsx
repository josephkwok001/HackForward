import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { fetchAction, seedAction, toActionRequest } from "./actionApi";
import { fetchAssess, seedFromRules, toAssessRequest } from "./assessApi";
import { assess, promptForQuestion } from "./engine";
import { prepareEvidence } from "./evidence";
import { inspectIndicators, type IndicatorReport, type LinkStatus } from "./indicators";
import { FLAG_BLURB, FLAG_LABEL, INCIDENT_LABEL, SAMPLE_MESSAGE, STAGE_BLURB, STAGE_LABEL } from "./sources";
import type { ActionPlanResult, EvidencePacket, IncidentState, IntakeMode, StageAssessResult } from "./types";

type View = "intake" | "preparing" | "working" | "clarify" | "record" | "planning" | "plan";
const PLAN_STEPS = ["Match official playbook", "Build next-action card"];
type IntakeRecord = Pick<
  IncidentState,
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

function shouldAsk(assessed: IncidentState): boolean {
  return Boolean(assessed.needs_clarification && assessed.unanswered_questions[0]);
}

function toRecord(state: IncidentState): IntakeRecord {
  return {
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
    if (view === "planning") {
      setWorkTick(0);
      const timers = [0, 1].map((i) => window.setTimeout(() => setWorkTick(i + 1), 400 + i * 450));
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
      setActionPlan(null);
      resetIntakeFields();
      setView("working");
      const started = Date.now();
      let nextAssessment = seedFromRules(assessed);
      try {
        nextAssessment = await fetchAssess(toAssessRequest(assessed));
      } catch {
        /* Keep the keyword seed so the record page never goes blank. */
      }
      setAssessment(nextAssessment);
      const wait = Math.max(0, 1800 - (Date.now() - started));
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
      setAdding(false);
      setView(shouldAsk(assessed) ? "clarify" : "record");
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

  function addMoreEvidence() {
    setAdding(true);
    setError(null);
    resetIntakeFields();
    setView("intake");
  }

  function cancelAdding() {
    setAdding(false);
    setError(null);
    resetIntakeFields();
    setView(actionPlan ? "plan" : "record");
  }

  async function answerQuestion(question: string, value: string) {
    if (!state) return;
    setPlanning(true);
    try {
      const assessed = assess({
        text: "",
        mode: "describe",
        prior: state,
        answer: { question, value },
      });
      setState(assessed);
      setAssessment(seedFromRules(assessed));
      setActionPlan(null);
      setView(shouldAsk(assessed) ? "clarify" : "record");
      try {
        setAssessment(await fetchAssess(toAssessRequest(assessed)));
      } catch {
        /* Keep the keyword seed so the record page never goes blank. */
      }
    } finally {
      setPlanning(false);
    }
  }

  async function openPlan(current: StageAssessResult) {
    if (actionPlan) {
      setView("plan");
      return;
    }
    setPlanning(true);
    setView("planning");
    const started = Date.now();
    try {
      setActionPlan(await fetchAction(toActionRequest(current)));
    } catch {
      setActionPlan(seedAction(current));
    }
    const wait = Math.max(0, 900 - (Date.now() - started));
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
    setPlanning(false);
    setView("plan");
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
  const clarifyQuestion =
    state?.unanswered_questions[0] || assessment?.unanswered_questions[0] || "";

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <p className="wordmark">ScamSafe</p>
            <p className="tag">
              {view === "plan" || view === "planning"
                ? "Official next steps. You take them."
                : view === "clarify"
                  ? "One detail before we show the record."
                  : "Capture the facts. Decide what comes next later."}
            </p>
          </div>
        </div>
        <p className="disclaimer">
          {view === "plan"
            ? "These are steps for you. ScamSafe will not contact a bank, 1799, or the police."
            : "This creates an incident record only. Do not share passwords, OTPs, PINs, or full card numbers."}
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
            fileName={file?.name}
            fileRef={fileRef}
            onMode={setMode}
            onText={setText}
            onFile={onFile}
            onSubmit={onSubmit}
            onBack={adding ? cancelAdding : undefined}
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

        {view === "clarify" && clarifyQuestion && (
          <ClarifyView
            question={clarifyQuestion}
            busy={planning}
            onAnswer={answerQuestion}
            onSkip={() => setView("record")}
          />
        )}

        {view === "planning" && (
          <Working
            tick={workTick}
            title="Planning what you should do next"
            steps={PLAN_STEPS}
            eyebrow="Next-action plan"
            copy="Matching this incident to an official playbook. The app will not call anyone."
          />
        )}

        {view === "record" && record && assessment && (
          <RecordView
            record={record}
            assessment={assessment}
            hasPlan={Boolean(actionPlan)}
            planning={planning}
            packet={packet}
            onShowPlan={() => setView("plan")}
            onPlan={() => void openPlan(assessment)}
            onAdd={addMoreEvidence}
            onStartOver={startOver}
          />
        )}

        {view === "plan" && record && assessment && actionPlan && (
          <PlanView
            record={record}
            assessment={assessment}
            actionPlan={actionPlan}
            onShowRecord={() => setView("record")}
            onAdd={addMoreEvidence}
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
  fileName?: string;
  fileRef: RefObject<HTMLInputElement | null>;
  onMode: (mode: IntakeMode) => void;
  onText: (value: string) => void;
  onFile: (file?: File) => void;
  onSubmit: (event: FormEvent) => void;
  onBack?: () => void;
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
              id="screenshot-file"
              ref={props.fileRef}
              className="upload-input"
              type="file"
              accept="image/*"
              onChange={(event) => props.onFile(event.target.files?.[0])}
            />
            <button
              type="button"
              className="secondary upload-pick"
              onClick={() => {
                if (props.fileRef.current) props.fileRef.current.value = "";
                props.fileRef.current?.click();
              }}
            >
              {props.fileName ? "Replace screenshot" : "Upload screenshot"}
            </button>
            {props.fileName && <p className="file-name">{props.fileName}</p>}
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
            {props.adding ? "Add to this case" : "Create incident record"}
          </button>
          {props.adding && props.onBack && (
            <button type="button" className="secondary" onClick={props.onBack}>
              Go back
            </button>
          )}
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

function Working({
  tick,
  title,
  steps,
  eyebrow = "Processing intake",
  copy = "Extracting what was observed, then classifying stage and risk on Amazon Bedrock.",
}: {
  tick: number;
  title: string;
  steps: string[];
  eyebrow?: string;
  copy?: string;
}) {
  return (
    <section className="panel working" aria-live="polite">
      <div className="loader" aria-hidden="true"><span /></div>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="working-copy">{copy}</p>
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

function RecordTabs({
  current,
  planning,
  onRecord,
  onPlan,
}: {
  current: "record" | "plan";
  planning?: boolean;
  onRecord: () => void;
  onPlan: () => void;
}) {
  return (
    <div className="tabs tabs-2" role="tablist" aria-label="Incident views">
      <button
        type="button"
        role="tab"
        aria-selected={current === "record"}
        className={current === "record" ? "tab on" : "tab"}
        onClick={onRecord}
      >
        Record
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={current === "plan"}
        className={current === "plan" ? "tab on" : "tab"}
        onClick={onPlan}
        disabled={planning}
      >
        {planning ? "Planning…" : "Next steps"}
      </button>
    </div>
  );
}

function RecordView({
  record,
  assessment,
  hasPlan,
  planning,
  packet,
  onShowPlan,
  onPlan,
  onAdd,
  onStartOver,
}: {
  record: IntakeRecord;
  assessment: StageAssessResult;
  hasPlan: boolean;
  planning: boolean;
  packet: EvidencePacket | null;
  onShowPlan: () => void;
  onPlan: () => void;
  onAdd: () => void;
  onStartOver: () => void;
}) {
  const [showQuote, setShowQuote] = useState(false);
  const quote = fullObservation(record);
  const quoteLong = Boolean(quote && quote.length > 160);
  const quoteText = quote && quoteLong && !showQuote ? `${quote.slice(0, 157)}…` : quote;
  const flags = assessment.risk_flags.filter((flag) => flag !== "insufficient_evidence");
  const notes = [...new Set([...record.uncertainty_notes, ...assessment.uncertainty_notes])].filter(
    (note) => assessment.source !== "bedrock" || !/model skipped/i.test(note),
  );
  const indicators = inspectIndicators(
    record.events_and_timeline.map((event) => event.observation).join("\n"),
  );
  const remembered = assessment.memory_turn_count || record.events_and_timeline.length;
  return (
    <section className="panel">
      <RecordTabs
        current="record"
        planning={planning}
        onRecord={() => undefined}
        onPlan={hasPlan ? onShowPlan : onPlan}
      />
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
      </article>
      {(indicators.links.length > 0 || indicators.masked_phone_numbers.length > 0) && (
        <IndicatorSection report={indicators} />
      )}
      <section className="observed">
        <h2>What you shared</h2>
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
      </section>
      <HistoryLog events={record.events_and_timeline} remembered={remembered} />
      {notes.length > 0 && (
        <details className="fold">
          <summary>Uncertainty</summary>
          <ListOrEmpty items={notes} />
        </details>
      )}
      <div className="row">
        <button type="button" className="primary" onClick={hasPlan ? onShowPlan : onPlan} disabled={planning}>
          {planning ? "Planning next steps…" : hasPlan ? "View next steps" : "Plan next steps"}
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

const INDICATOR_STATUS: Record<LinkStatus, string> = {
  official_match: "Looks official",
  claimed_org_mismatch: "Does not match",
  unverified: "Unknown site",
};

function IndicatorSection({ report }: { report: IndicatorReport }) {
  return (
    <section className="indicator-section" aria-labelledby="indicator-heading">
      <h2 id="indicator-heading">
        {report.links.length && report.masked_phone_numbers.length
          ? "Links and numbers"
          : report.links.length
            ? "Links in the message"
            : "Numbers in the message"}
      </h2>
      {report.claimed_organisations.length > 0 && (
        <p className="claim-line">
          The sender said they were <strong>{report.claimed_organisations.join(", ")}</strong>.
        </p>
      )}
      {report.links.length > 0 && (
        <ul className="indicator-list">
          {report.links.map((link, index) => (
            <li key={`${link.hostname}-${index}`} className={`indicator-${link.status}`}>
              <div className="indicator-head">
                <code>{link.hostname}</code>
                <span>{INDICATOR_STATUS[link.status]}</span>
              </div>
              <p>{link.reason}</p>
            </li>
          ))}
        </ul>
      )}
      {report.masked_phone_numbers.length > 0 && (
        <div className="phone-indicators">
          <p className="assess-kicker">Phone numbers</p>
          {report.masked_phone_numbers.map((number) => (
            <span key={number}>{number} · not called</span>
          ))}
        </div>
      )}
      <p className="indicator-footnote">We did not open these links or call these numbers.</p>
    </section>
  );
}

function ClarifyView({
  question,
  busy,
  onAnswer,
  onSkip,
}: {
  question: string;
  busy: boolean;
  onAnswer: (question: string, value: string) => void;
  onSkip: () => void;
}) {
  const prompt = promptForQuestion(question);
  return (
    <section className="panel">
      <p className="eyebrow">Before the record</p>
      <h1>{question}</h1>
      <p className="lede">
        One answer changes the next step. We will then show the record. ScamSafe still will not call
        anyone.
      </p>
      <div className="row">
        {(prompt?.choices ?? [{ id: "not_sure", label: "I'm not sure" }]).map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={choice.id === "sent" || choice.id === "otp_yes" ? "danger-choice" : "secondary"}
            disabled={busy}
            onClick={() => onAnswer(question, choice.id)}
          >
            {busy ? "Updating…" : choice.label}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="textish" onClick={onSkip} disabled={busy}>
          Skip and see the record
        </button>
      </div>
    </section>
  );
}

function HistoryLog({
  events,
  remembered,
}: {
  events: IntakeRecord["events_and_timeline"];
  remembered: number;
}) {
  const entries = events.filter(
    (event) => event.observation && !event.observation.startsWith("Provided a screenshot"),
  );
  if (!entries.length) return null;
  return (
    <section className="history" aria-labelledby="history-heading">
      <p className="eyebrow">Case memory</p>
      <h2 id="history-heading">History</h2>
      <p className="memory-count">
        {remembered === 1 ? "1 message in this case" : `${remembered} messages in this case`}
      </p>
      <p className="history-lede">
        {entries.length === 1
          ? "New evidence will appear here as another step."
          : "The latest update is at the bottom."}
      </p>
      <ol className="history-list">
        {entries.map((event, index) => {
          const latest = index === entries.length - 1;
          return (
            <li key={`${event.observation}-${index}`} className={latest ? "latest" : undefined}>
              <span className="history-index" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <strong>
                  {index === 0 ? "First report" : `Update ${index + 1}`}
                  {latest && entries.length > 1 ? " · Latest" : ""}
                </strong>
                <span>{event.observation}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PlanView({
  record,
  assessment,
  actionPlan,
  onShowRecord,
  onAdd,
  onStartOver,
}: {
  record: IntakeRecord;
  assessment: StageAssessResult;
  actionPlan: ActionPlanResult;
  onShowRecord: () => void;
  onAdd: () => void;
  onStartOver: () => void;
}) {
  const [understood, setUnderstood] = useState(false);
  const action = actionPlan.selected_next_action;
  return (
    <section className="panel">
      <RecordTabs current="plan" onRecord={onShowRecord} onPlan={() => undefined} />
      <p className="eyebrow">Next steps</p>
      <h1>{action.title}</h1>
      <p className="lede">
        Based on {INCIDENT_LABEL[record.incident_type] ?? record.incident_type} at the{" "}
        {STAGE_LABEL[assessment.current_stage].toLowerCase()} stage. This app does not call anyone.
      </p>
      <article className="action-card">
        <div className="assess-head">
          <p className="eyebrow">Official playbook</p>
          <span className="badge on">For you to do</span>
        </div>
        <ol className="plan-steps">
          {action.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="source-line">
          Source:{" "}
          <a href={action.source_url} target="_blank" rel="noreferrer">
            {action.source_title}
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
      <div className="row">
        <button type="button" className="secondary" onClick={onShowRecord}>
          Back to record
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
