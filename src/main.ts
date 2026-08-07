// src/main.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Process entry point: boot the app, then wire shutdown.
//
// The signal handling is not ceremony. Chromium is a child process, and a test
// run that kills this server without closing the browser leaves an orphaned
// chromium holding memory — repeat that across a few runs and the next
// `deno task test` starts on a loaded machine and trips the timing assertions.

import { createApp } from "./app.ts";
import { getPort } from "./config.ts";
import { errorFields, log } from "./lib/logger.ts";
import { closeBrowser } from "./services/browser.service.ts";

const port = getPort();
const app = createApp();

const server = app.listen(port, () => {
  log.info("server.listening", { port, url: `http://127.0.0.1:${port}` });
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  // A second Ctrl-C during a slow browser close should not start a race.
  if (shuttingDown) return;
  shuttingDown = true;

  log.info("server.shutdown", { signal });

  // Browser first: it is the resource that outlives the process if leaked.
  await closeBrowser().catch((err: unknown) => {
    log.warn("server.shutdown_browser_failed", errorFields(err));
  });

  server.close(() => {
    log.info("server.closed");
    Deno.exit(0);
  });

  // Do not wait forever on keep-alive connections.
  setTimeout(() => Deno.exit(0), 3_000);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, () => {
    void shutdown(signal);
  });
}
