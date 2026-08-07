// src/lib/logger.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// JSON-lines logging. Structured output means the Playwright webServer's piped
// stdout stays greppable when a capture fails in CI, and it keeps stack traces
// on this side of the wire — `errors.ts` never puts them in a response.

type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", message: string, fields?: Fields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Flatten an unknown throwable into loggable fields, stack included. */
export function errorFields(err: unknown): Fields {
  if (err instanceof Error) {
    return { err: err.name, errMessage: err.message, stack: err.stack };
  }
  return { err: String(err) };
}

export const log = {
  info: (message: string, fields?: Fields) => emit("info", message, fields),
  warn: (message: string, fields?: Fields) => emit("warn", message, fields),
  error: (message: string, fields?: Fields) => emit("error", message, fields),
};
