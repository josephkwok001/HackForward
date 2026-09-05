import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { extractIncident, validateIntakeRequest } from "./src/intake.ts";
import type { IncidentRecord, IntakeRequest } from "./src/types.ts";

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

export default defineConfig({
  plugins: [react(), intakeApi()],
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
    },
  },
  optimizeDeps: {
    exclude: ["tesseract.js"],
  },
});
