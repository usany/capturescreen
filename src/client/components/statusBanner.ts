/// <reference lib="dom" />
// src/client/components/statusBanner.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// `status-banner`, `status-text`, `capture-btn` (planner 4.2).
//
// `capture-btn` lives here rather than with the URL field because its disabled
// rule spans two components (URL validity + capture status) and the store is
// where those meet.
//
// `capture-btn[data-state]` mirrors the store status and is the single most
// useful hook in the page for e2e: `waitFor("[data-testid=capture-btn][data-state=success]")`
// is an exact wait on "the capture finished", with no polling and no arbitrary
// timeout.
//
// Server readiness is shown but never gates the button. `/api/status` can report
// "starting" while chromium boots, and a capture issued then simply waits for the
// lazy launch — blocking the button would turn a 700 ms warmup into a dead UI.

import { $, on, setData, setHidden, setText } from "../dom.ts";
import { fetchStatus } from "../api.ts";
import { translate } from "../i18n.ts";
import type { AppState, Store } from "../store.ts";
import type { Actions } from "../actions.ts";
import { validateUrlShape } from "./urlInput.ts";

const LABEL_KEYS: Record<string, string> = {
  ready: "status.ready",
  starting: "status.starting",
  degraded: "status.degraded",
  unreachable: "status.unreachable",
  checking: "status.checking",
};

export function mountStatusBanner(root: ParentNode, store: Store, actions: Actions): void {
  const banner = $("status-banner", root);
  const text = $("status-text", root);
  const captureBtn = $<HTMLButtonElement>("capture-btn", root);

  const setBannerState = (key: string) => {
    setData(banner, "status", key);
    const i18nKey = LABEL_KEYS[key];
    const label = i18nKey
      ? translate(store.getState().lang, i18nKey as Parameters<typeof translate>[1])
      : key;
    setText(text, label);
    setHidden(banner, false);
  };

  const render = (state: AppState) => {
    // `data-state` before `disabled`: an e2e wait keyed on the attribute should
    // never observe "success" on a button that is still disabled.
    setData(captureBtn, "state", state.status);

    const urlOk = validateUrlShape(state.url).valid;
    const busy = state.status === "loading";
    captureBtn.disabled = busy || !urlOk;
    captureBtn.setAttribute("aria-busy", busy ? "true" : "false");
    setText(
      captureBtn,
      busy ? translate(state.lang, "capture.busy") : translate(state.lang, "capture.action"),
    );
  };

  on(captureBtn, "click", () => void actions.capture());

  store.subscribe(render);
  render(store.getState());

  setBannerState("checking");
  // One poll on load (planner 4.2). Readiness is informational here, so there is
  // no retry loop to leak across a test run.
  void fetchStatus()
    .then((status) => setBannerState(status.status))
    .catch(() => setBannerState("unreachable"));
}
