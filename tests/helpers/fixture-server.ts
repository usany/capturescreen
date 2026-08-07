// tests/helpers/fixture-server.ts
// Author: integration-tester
// Created: 2026-07-26
//
// A tiny Deno HTTP server that serves deterministic target pages for the
// screenshot API to capture. Integration tests must never point at the public
// internet: real sites change, rate-limit, and go down, which turns a
// screenshot assertion into a flaky network test. Every page here renders
// instantly and identically on every run.

export interface FixtureServer {
  /** Origin the screenshot service should target, e.g. http://127.0.0.1:8391 */
  readonly origin: string;
  /** Build an absolute URL for a fixture path. */
  url(path: string): string;
  /** Shut the server down and wait for connections to drain. */
  close(): Promise<void>;
}

/** Solid-colour page with a known heading — the default capture target. */
const PAGE_BASIC = `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture Basic</title>
<style>
  html,body{margin:0;padding:0}
  body{background:#0f172a;color:#f8fafc;font:600 48px/1.2 system-ui,sans-serif;
       display:flex;align-items:center;justify-content:center;height:100vh}
</style></head>
<body><h1 id="marker">FIXTURE_BASIC</h1></body></html>`;

/** Page taller than any viewport, used to distinguish fullPage from viewport captures. */
const PAGE_TALL = `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture Tall</title>
<style>
  html,body{margin:0;padding:0}
  body{background:#fff}
  .block{height:1000px;font:700 40px/1000px system-ui,sans-serif;text-align:center}
  .b1{background:#ef4444}.b2{background:#22c55e}.b3{background:#3b82f6}
</style></head>
<body>
  <div class="block b1">BLOCK_ONE</div>
  <div class="block b2">BLOCK_TWO</div>
  <div class="block b3">BLOCK_THREE</div>
</body></html>`;

function html(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Start the fixture server on an ephemeral port.
 *
 * Routes:
 *   GET /basic            instant, fixed-colour page
 *   GET /tall             3000px tall page for fullPage assertions
 *   GET /slow?ms=N        response headers withheld for N ms (timeout tests)
 *   GET /status/:code     responds with the given HTTP status
 */
export function startFixtureServer(): FixtureServer {
  const abort = new AbortController();

  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1", signal: abort.signal, onListen: () => {} },
    async (req) => {
      const { pathname, searchParams } = new URL(req.url);

      if (pathname === "/basic") return html(PAGE_BASIC);
      if (pathname === "/tall") return html(PAGE_TALL);

      if (pathname === "/slow") {
        const ms = Number(searchParams.get("ms") ?? 3000);
        await new Promise((r) => setTimeout(r, ms));
        return html(PAGE_BASIC);
      }

      const statusMatch = pathname.match(/^\/status\/(\d{3})$/);
      if (statusMatch) {
        const code = Number(statusMatch[1]);
        return new Response(`fixture status ${code}`, {
          status: code,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      return new Response("fixture not found", { status: 404 });
    },
  );

  const { port } = server.addr as Deno.NetAddr;
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    url: (path: string) => new URL(path, origin).toString(),
    close: async () => {
      abort.abort();
      // finished rejects with the abort reason; the shutdown itself is what we want.
      await server.finished.catch(() => {});
    },
  };
}
