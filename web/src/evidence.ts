import type { EvidencePacket, IntakeMode } from "./types";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_OCR_CHARS = 12;
const MIN_OCR_CONFIDENCE = 40;

/**
 * Person 2 — evidence and safety.
 * Turns a description, transcript, or screenshot into cleaned text + file refs.
 * Person 3 should only see `packet.text` and `packet.evidence_refs`.
 */

export function redactSensitive(text: string): { text: string; notice: string | null } {
  let next = text;
  const notices: string[] = [];

  if (/\b(?:\d[ \-]*?){13,19}\b/.test(next)) {
    next = next.replace(/\b(?:\d[ \-]*?){13,19}\b/g, "[redacted card number]");
    notices.push("A long number that looked like a card was removed. We never store card numbers.");
  }

  if (/\b(otp|one[ -]?time|sms code|verification code|code)\b/i.test(next) && /\b\d{6}\b/.test(next)) {
    next = next.replace(/\b\d{6}\b/g, "[redacted code]");
    notices.push("A 6-digit code was removed. We never store OTPs.");
  }

  if (/\bpassword\s*[:=]\s*\S+/i.test(next)) {
    next = next.replace(/\bpassword\s*[:=]\s*\S+/gi, "password: [redacted]");
    notices.push("A password was removed. We never store passwords.");
  }

  if (/\bpin\s*[:=]\s*\d+/i.test(next)) {
    next = next.replace(/\bpin\s*[:=]\s*\d+/gi, "PIN: [redacted]");
    notices.push("A PIN was removed. We never store PINs.");
  }

  return { text: next, notice: notices.length ? notices.join(" ") : null };
}

export function neutralizeUntrusted(text: string): string {
  return text
    .replace(/ignore (all )?(previous|prior|above) instructions/gi, "[untrusted instruction removed]")
    .replace(/\bsystem prompt\b/gi, "[untrusted phrase removed]")
    .replace(/\byou are now\b/gi, "[untrusted phrase removed]");
}

/** Fix common OCR swaps so keyword extract can still see bank / PayNow / 1799. */
export function normalizeOcrText(text: string): string {
  return text
    .replace(/\bpay\s*n[o0]w\b/gi, "PayNow")
    .replace(/\b0cbc\b/gi, "OCBC")
    .replace(/\boc8c\b/gi, "OCBC")
    .replace(/\bd8s\b/gi, "DBS")
    .replace(/\bu0b\b/gi, "UOB")
    .replace(/\b17[89]9\b/g, "1799")
    .replace(/\bfraud\s*departmen[t1]\b/gi, "Fraud Department")
    .replace(/\s+/g, " ")
    .trim();
}

export function assertSafeImage(file: File): void {
  if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.name)) {
    throw new Error("That file is not an image. Attach a screenshot photo instead.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("That screenshot is too large. Use a file under 8 MB.");
  }
}

function localTessUrl(name: string): string {
  return new URL(`tesseract/${name}`, window.location.origin + "/").href;
}

type TessWorker = Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>;
let workerTask: Promise<TessWorker> | null = null;

async function startWorker(): Promise<TessWorker> {
  const { createWorker } = await import("tesseract.js");
  try {
    return await createWorker("eng");
  } catch (cdnError) {
    console.warn("OCR CDN worker failed, using local files", cdnError);
    return await createWorker("eng", 1, {
      workerPath: localTessUrl("worker.min.js"),
      corePath: localTessUrl("tesseract-core-simd-lstm.wasm.js"),
      langPath: localTessUrl("").replace(/\/$/, ""),
      workerBlobURL: true,
    });
  }
}

async function ocrWorker(): Promise<TessWorker> {
  if (!workerTask) {
    workerTask = startWorker().catch((error) => {
      workerTask = null;
      throw error;
    });
  }
  return workerTask;
}

export async function readScreenshotText(file: File): Promise<{ text: string; confidence: number }> {
  const worker = await ocrWorker();
  const result = await worker.recognize(file);
  return {
    text: normalizeOcrText(result.data.text),
    confidence: result.data.confidence ?? 0,
  };
}

export async function prepareEvidence(input: {
  text: string;
  file?: File;
  mode: IntakeMode;
}): Promise<EvidencePacket> {
  const evidence_refs: string[] = [];
  let raw = input.text.trim();
  let ocr_status: EvidencePacket["ocr_status"] = "none";
  let ocr_excerpt: string | null = null;

  if (input.file) {
    assertSafeImage(input.file);
    evidence_refs.push(`screenshot:${input.file.name}`);
    try {
      const ocr = await readScreenshotText(input.file);
      if (ocr.text.length >= MIN_OCR_CHARS) {
        ocr_status = ocr.confidence >= MIN_OCR_CONFIDENCE ? "ok" : "weak";
        raw = [ocr.text, raw].filter(Boolean).join("\n");
      } else {
        ocr_status = "failed";
      }
    } catch (error) {
      console.error("Screenshot OCR failed", error);
      ocr_status = "failed";
      if (!input.text.trim()) {
        const detail = error instanceof Error ? error.message : "OCR worker failed";
        throw new Error(`Could not read that screenshot (${detail}). Type what it says, then try again.`);
      }
    }
  }

  const { text, notice } = redactSensitive(neutralizeUntrusted(raw));
  if (!input.file && text) {
    evidence_refs.push(`${input.mode}:${text.slice(0, 80)}`);
  }
  if (ocr_status === "ok" || ocr_status === "weak") {
    ocr_excerpt = text.slice(0, 280);
  }

  const needs_caption =
    Boolean(input.file) &&
    !input.text.trim() &&
    (ocr_status === "failed" || text.trim().length < MIN_OCR_CHARS);

  return {
    text,
    evidence_refs,
    redaction_notice: notice,
    ocr_status,
    ocr_excerpt,
    needs_caption,
  };
}
