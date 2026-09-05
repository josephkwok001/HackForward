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

export function assertSafeImage(file: File): void {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file is not an image. Attach a screenshot photo instead.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("That screenshot is too large. Use a file under 8 MB.");
  }
}

export async function readScreenshotText(file: File): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(file);
    return {
      text: result.data.text.replace(/\s+/g, " ").trim(),
      confidence: result.data.confidence ?? 0,
    };
  } finally {
    await worker.terminate();
  }
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
      if (ocr.text.length >= MIN_OCR_CHARS && ocr.confidence >= MIN_OCR_CONFIDENCE) {
        ocr_status = "ok";
        raw = [ocr.text, raw].filter(Boolean).join("\n");
      } else if (ocr.text) {
        ocr_status = "weak";
        raw = [ocr.text, raw].filter(Boolean).join("\n");
      } else {
        ocr_status = "failed";
      }
    } catch {
      ocr_status = "failed";
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
