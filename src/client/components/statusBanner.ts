/// <reference lib="dom" />
// src/client/components/statusBanner.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// Manages the capture button: disabled state and click handler.
//
// `capture-btn` lives here rather than with the URL field because its disabled
// rule spans two components (URL validity + capture status) and the store is
// where those meet.
//
// `capture-btn[data-state]` mirrors the store status and is the single most
// useful hook in the page for e2e: `waitFor("[data-testid=capture-btn][data-state=success]")`
// is an exact wait on "the capture finished", with no polling and no arbitrary
// timeout.

import { $, on, setData, setText } from "../dom.ts";
import { translate } from "../i18n.ts";
import type { AppState, Store } from "../store.ts";
import type { Actions } from "../actions.ts";
import { validateUrlShape } from "./urlInput.ts";

export function mountStatusBanner(root: ParentNode, store: Store, actions: Actions): void {
  const captureBtn = $<HTMLButtonElement>("capture-btn", root);

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
}
