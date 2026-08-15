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
// `status-banner` is a runtime-created indication of the capture itself: it is
// shown ONLY while a capture is in flight (state "loading") and hidden at every
// other moment. There is deliberately no `/api/status` poll on page load — we
// do not surface server standby on an idle page; the state we care about is "is
// a screenshot being taken right now", and that is already in the store. The
// badge's text is static markup (it always reads "Capturing…" when visible), so
// the client only toggles its visibility.

import { $, on, setData, setHidden, setText } from "../dom.ts";
import { getLang, t } from "../i18n.ts";
import type { AppState, Store } from "../store.ts";
import type { Actions } from "../actions.ts";
import { validateUrlShape } from "./urlInput.ts";

export function mountStatusBanner(root: ParentNode, store: Store, actions: Actions): void {
  const banner = $("status-banner", root);
  const captureBtn = $<HTMLButtonElement>("capture-btn", root);

  const render = (state: AppState) => {
    // `data-state` before `disabled`: an e2e wait keyed on the attribute should
    // never observe "success" on a button that is still disabled.
    setData(captureBtn, "state", state.status);

    const urlOk = validateUrlShape(state.url).valid;
    const busy = state.status === "loading";
    captureBtn.disabled = busy || !urlOk;
    captureBtn.setAttribute("aria-busy", busy ? "true" : "false");
    setText(captureBtn, t(getLang(), busy ? "capturing" : "capture"));

    // The badge exists to answer "capturing now?" — show it exactly while it is.
    // `status-text` is static per-route markup, so only visibility changes here.
    setData(banner, "status", busy ? "capturing" : "idle");
    setHidden(banner, !busy);
  };

  on(captureBtn, "click", () => void actions.capture());

  store.subscribe(render);
  render(store.getState());
}
