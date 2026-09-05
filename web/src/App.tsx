import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { fetchAssess, seedFromRules, toAssessRequest } from "./assessApi";
import { assess } from "./engine";
import { prepareEvidence } from "./evidence";
import { FLAG_BLURB, FLAG_LABEL, INCIDENT_LABEL, SAMPLE_MESSAGE, STAGE_BLURB, STAGE_LABEL } from "./sources";
import type { EvidencePacket, IncidentState, IntakeMode, StageAssessResult } from "./types";

type View = "intake" | "working" | "record";
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

const URGENT_FLAGS = new Set([
  "payment_in_progress",
  "funds_already_moved",
  "requested_otp",
  "requested_remote_access",
]);

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
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
    setView("working");
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
      try {
        setAssessment(await fetchAssess(toAssessRequest(assessed)));
      } catch {
        /* Keep the keyword seed so the record page never goes blank. */
      }
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
          <p className="wordmark">ScamSafe</p>
        </div>
        <p className="privacy-label"><span aria-hidden="true">●</span> Private by default</p>
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

        {view === "working" && <Working />}

        {view === "record" && record && assessment && (
          <RecordView
            record={record}
            assessment={assessment}
            packet={packet}
            onAdd={() => {
              setAdding(true);
              setError(null);
              setView("intake");
            }}
            onStartOver={startOver}
          />
        )}
      </main>

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
      <h1>{props.adding ? "What else should we record?" : "What happened?"}</h1>
      <p className="lede">
        Paste the message, describe it, or upload a screenshot.
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
              The image stays on this device. If we cannot read it, we will ask for a short note.
            </p>
          </div>
        )}
        <p className="privacy-note">
          <span aria-hidden="true">✓</span> Sensitive numbers are removed automatically.
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

function Working() {
  return (
    <section className="panel working" aria-live="polite">
      <div className="loader" aria-hidden="true"><span /></div>
      <h1>Creating your record</h1>
      <p className="working-copy">
        Removing sensitive details and organising what you shared.
      </p>
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
  packet,
  onAdd,
  onStartOver,
}: {
  record: IntakeRecord;
  assessment: StageAssessResult;
  packet: EvidencePacket | null;
  onAdd: () => void;
  onStartOver: () => void;
}) {
  const quote = fullObservation(record);
  const flags = assessment.risk_flags.filter((flag) => flag !== "insufficient_evidence");
  const notes = [...new Set([...record.uncertainty_notes, ...assessment.uncertainty_notes])].filter(
    (note) => assessment.source !== "bedrock" || !/model skipped/i.test(note),
  );
  const incidentLabel = INCIDENT_LABEL[record.incident_type] ?? record.incident_type;
  return (
    <section className="panel record-panel">
      <div className="record-heading">
        <div>
          <p className="record-status"><span aria-hidden="true">✓</span> Record created</p>
          <h1>{incidentLabel}</h1>
        </div>
      </div>

      {(record.redaction_notice || packet?.redaction_notice) && (
        <p className="privacy-result"><span aria-hidden="true">✓</span> Sensitive values were removed.</p>
      )}
      {packet?.ocr_status === "weak" && (
        <p className="notice">
          We could only partly read the screenshot. Review the captured facts below.
        </p>
      )}

      <article className="stage-summary">
        <div>
          <p className="section-label">Likely stage</p>
          <p className="stage-name">{STAGE_LABEL[assessment.current_stage]}</p>
        </div>
        <p>{STAGE_BLURB[assessment.current_stage]}</p>
      </article>

      <section className="record-section">
        <h2>Important signals</h2>
        {flags.length ? (
          <ul className="risk-list">
            {flags.map((flag) => (
              <li key={flag} className={URGENT_FLAGS.has(flag) ? "urgent" : "watch"}>
                <span className="risk-dot" aria-hidden="true" />
                <strong>{FLAG_LABEL[flag]}</strong>
                <span>{FLAG_BLURB[flag]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No urgent signals were identified from the current evidence.</p>
        )}
      </section>

      {assessment.needs_clarification && assessment.unanswered_questions[0] && (
        <p className="notice"><strong>One detail would help:</strong> {assessment.unanswered_questions[0]}</p>
      )}

      <section className="record-section">
        <h2>What we captured</h2>
        <ListOrEmpty items={record.facts_shared} empty="No clear facts extracted yet." />
      </section>

      {quote && (
        <details className="fold">
          <summary>Original evidence</summary>
          <blockquote>{quote}</blockquote>
        </details>
      )}
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
        <p className="case-id">
          <span>Case ID</span>
          <code>{record.thread_id}</code>
        </p>
        <ListOrEmpty items={record.raw_evidence_refs} empty="No file references." />
      </details>
      <details className="fold">
        <summary>Technical details</summary>
        <p className="source-line">
          Assessment source: {assessment.source === "bedrock" ? "Amazon Bedrock" : "Keyword fallback"}
        </p>
        <ListOrEmpty items={assessment.decision_factors} />
      </details>
      <div className="row record-actions">
        <button type="button" className="primary" onClick={onAdd}>
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
