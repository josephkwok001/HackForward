import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { extractIncident, validateIntakeRequest } from "./src/intake.ts";
import type { IncidentRecord, IntakeRequest } from "./src/types.ts";

const WEB_ROOT = dirname(fileURLToPath(import.meta.url));
const TESS_PUBLIC = join(WEB_ROOT, "public", "tesseract");
const TRAINED_DATA_URL =
  "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz";

const MAX_BODY_BYTES = 25_000;

function intakeApi(): Plugin {
  const records = new Map<string, IncidentRecord>();

  return {
    name: "scamsafe-intake-api",
    configureServer(server) {
      server.middlewares.use("/intake", (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("Allow", "POST");
          response.end(JSON.stringify({ error: "Method not allowed." }));
          return;
        }

        response.setHeader("Content-Type", "application/json; charset=utf-8");
        let body = "";
        let bodyTooLarge = false;

        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          body += chunk;
          if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
            bodyTooLarge = true;
          }
        });
        request.on("end", () => {
          if (bodyTooLarge) {
            response.statusCode = 413;
            response.end(JSON.stringify({ error: "Request body is too large." }));
            return;
          }

          try {
            const value: unknown = JSON.parse(body);
            const validationError = validateIntakeRequest(value);
            if (validationError) {
              response.statusCode = 400;
              response.end(JSON.stringify({ error: validationError }));
              return;
            }

            const input = value as IntakeRequest;
            const prior = input.thread_id ? records.get(input.thread_id) : undefined;
            const record = extractIncident(input, prior);
            records.set(record.thread_id, record);
            response.statusCode = 200;
            response.end(JSON.stringify(record));
          } catch (error) {
            response.statusCode = error instanceof SyntaxError ? 400 : 422;
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Could not create the incident record.",
              }),
            );
          }
        });
      });
    },
  };
}

function tesseractAssets(): Plugin {
  async function ensureAssets() {
    mkdirSync(TESS_PUBLIC, { recursive: true });
    const copies: Array<[string, string]> = [
      [join(WEB_ROOT, "node_modules/tesseract.js/dist/worker.min.js"), "worker.min.js"],
      [join(WEB_ROOT, "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js"), "tesseract-core-simd-lstm.wasm.js"],
      [join(WEB_ROOT, "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm"), "tesseract-core-simd-lstm.wasm"],
    ];
    for (const [from, name] of copies) {
      if (!existsSync(from)) {
        throw new Error(`Missing Tesseract file: ${from}. Run npm install in web/.`);
      }
      copyFileSync(from, join(TESS_PUBLIC, name));
    }
    const trained = join(TESS_PUBLIC, "eng.traineddata.gz");
    const stale = existsSync(trained) && statSync(trained).size > 6_000_000;
    if (!existsSync(trained) || stale) {
      const response = await fetch(TRAINED_DATA_URL);
      if (!response.ok) {
        throw new Error(`Could not download OCR language data (${response.status}).`);
      }
      await (await import("node:fs/promises")).writeFile(trained, Buffer.from(await response.arrayBuffer()));
    }
  }

  return {
    name: "scamsafe-tesseract-assets",
    async buildStart() {
      await ensureAssets();
    },
    async configureServer() {
      await ensureAssets();
    },
  };
}

export default defineConfig({
  plugins: [react(), intakeApi(), tesseractAssets()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/assess": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/action": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/memory": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ["tesseract.js"],
  },
});
