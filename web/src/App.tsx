import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { assess } from "./engine";
import { prepareEvidence } from "./evidence";
import { SAMPLE_MESSAGE } from "./sources";
import type { EvidencePacket, IncidentState, IntakeMode } from "./types";

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
const WORK_STEPS = ["Secure the evidence", "Extract observed facts", "Create incident record"];

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
      const timers = [0, 1].map((i) => window.setTimeout(() => setWorkTick(i + 1), 240 + i * 280));
      return () => timers.forEach(clearTimeout);
    }
    if (view !== "working") return;
    setWorkTick(0);
    const timers = [0, 1, 2].map((i) => window.setTimeout(() => setWorkTick(i + 1), 280 + i * 320));
    const done = window.setTimeout(() => {
      setView("record");
      setAdding(false);
    }, 1180);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
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
      resetIntakeFields();
      setView("working");
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

        {view === "record" && record && (
          <RecordView
            record={record}
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

      <footer className="foot">
        <span className="muted">Intake · Person 2 cleans evidence, Person 3 fills the record</span>
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
      <p className="eyebrow">Processing intake</p>
      <h1>{title}</h1>
      <ol className="steps">
        {steps.map((step, index) => (
          <li key={step} className={tick > index ? "done" : tick === index ? "now" : ""}>
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}

function RecordView({
  record,
  packet,
  onAdd,
  onStartOver,
}: {
  record: IntakeRecord;
  packet: EvidencePacket | null;
  onAdd: () => void;
  onStartOver: () => void;
}) {
  return (
    <section className="panel">
      <p className="eyebrow">Record created</p>
      <h1>Here is what we captured</h1>
      <div className="record-id">
        <span>Thread ID</span>
        <code>{record.thread_id}</code>
      </div>
      {record.redaction_notice && <p className="notice">{record.redaction_notice}</p>}
      {packet?.ocr_excerpt && (
        <p className="notice ok">
          {packet.ocr_status === "weak"
            ? "We only partly read the screenshot. Secrets were removed: "
            : "Read from the screenshot. Secrets were removed: "}
          {packet.ocr_excerpt}
        </p>
      )}
      <RecordSection title="Incident type">
        <p>{record.incident_type}</p>
      </RecordSection>
      <RecordSection title="Facts">
        <ListOrEmpty items={record.facts_shared} empty="No clear facts extracted yet." />
      </RecordSection>
      <RecordSection title="Timeline">
        <ul className="timeline">
          {record.events_and_timeline.map((event, index) => (
            <li key={`${event.time_hint}-${index}`}>
              <strong>{event.time_hint}</strong>
              <span>{event.observation}</span>
            </li>
          ))}
        </ul>
      </RecordSection>
      {record.uncertainty_notes.length > 0 && (
        <RecordSection title="Uncertainty">
          <ListOrEmpty items={record.uncertainty_notes} />
        </RecordSection>
      )}
      <RecordSection title="Evidence references">
        <ListOrEmpty items={record.raw_evidence_refs} />
      </RecordSection>
      <div className="row">
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

function RecordSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="record-section">
      <h2>{title}</h2>
      {children}
    </article>
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
