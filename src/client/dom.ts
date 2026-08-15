/// <reference lib="dom" />
// src/client/dom.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// The whole DOM vocabulary the components are allowed to use. Two rules make
// the E2E contract hard to break:
//
//   1. `$()` looks elements up by `data-testid`, never by CSS class or tag. The
//      testid table in planner 4.2 is therefore the only coupling between the
//      markup and the behaviour — a restyle cannot silently break a spec.
//   2. `$()` throws on a miss instead of returning null. A renamed testid fails
//      loudly at boot rather than producing a page where one control quietly
//      does nothing.

/** Browser globals, narrowed by hand so the file type-checks under Deno's default libs. */
interface BrowserGlobals {
  screen?: { width?: number; height?: number };
  innerWidth?: number;
  innerHeight?: number;
  localStorage?: Storage;
  matchMedia?: (query: string) => { matches: boolean };
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

/** In a browser `globalThis === window`; using it avoids Deno's removed `window` global. */
export const win = globalThis as unknown as BrowserGlobals;

/** Find the single element carrying `data-testid="<testid>"`. Throws when absent. */
export function $<T extends Element = HTMLElement>(testid: string, root: ParentNode = document): T {
  const el = root.querySelector(`[data-testid="${testid}"]`);
  if (!el) throw new Error(`[dom] no element with data-testid="${testid}"`);
  return el as T;
}

/** Find every element matching a raw CSS selector. */
export function $$<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] {
  return Array.from(root.querySelectorAll(selector)) as T[];
}

/** Attach a listener. Kept as a helper so components never touch `addEventListener` directly. */
export function on(
  target: EventTarget,
  type: string,
  handler: (event: Event) => void,
): () => void {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}

/** Write text content only when it actually changed, to avoid pointless reflows. */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/**
 * Toggle the `hidden` attribute.
 *
 * `hidden` rather than a Tailwind `hidden` class because Playwright's
 * `toBeVisible()` honours it, it needs no compiled CSS to work, and it survives
 * a restyle. `src/styles/tailwind.input.css` forces `[hidden] { display: none }`
 * so a `display:flex` utility cannot out-specify it.
 */
export function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

/** Toggle `disabled` on a form control. */
export function setDisabled(el: HTMLButtonElement | HTMLInputElement, disabled: boolean): void {
  if (el.disabled !== disabled) el.disabled = disabled;
}

/** Set a `data-*` attribute, skipping no-op writes. */
export function setData(el: HTMLElement, key: string, value: string): void {
  if (el.dataset[key] !== value) el.dataset[key] = value;
}

/** Trailing-edge debounce with a `cancel()`, used for URL validation and auto-capture. */
export function debounce(fn: () => void, ms: number): { run: () => void; cancel: () => void } {
  let timer: number | undefined;
  return {
    run() {
      if (timer !== undefined) win.clearTimeout(timer);
      timer = win.setTimeout(() => {
        timer = undefined;
        fn();
      }, ms);
    },
    cancel() {
      if (timer !== undefined) win.clearTimeout(timer);
      timer = undefined;
    },
  };
}

/** Render a byte count the way `preview-meta` shows it: whole kilobytes. */
export function formatKb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Render a duration in seconds with one decimal, e.g. `2.4s`. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Resolve once an image source has been decoded.
 *
 * The capture flow awaits this *before* flipping status to `"success"`, so by
 * the time `capture-btn[data-state=success]` appears the `<img>` already has a
 * real `naturalWidth`. Without it the e2e dimension assertion races the decoder.
 * Failure to decode is deliberately swallowed — the preview still renders and
 * the browser will show its own broken-image state.
 */
export function preloadImage(src: string | undefined): Promise<void> {
  if (!src) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}
