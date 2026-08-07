/// <reference lib="dom" />
// src/client/components/formatSelector.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// `format-select`, `quality-row`, `quality-slider`, `quality-value`
// (planner 4.2).
//
// Quality is a JPEG-only concept — PNG is lossless and the server reports
// `quality: null` for it. So `quality-row` is hidden for PNG rather than shown
// and disabled: a control that cannot affect the output should not be on screen
// suggesting that it can. The slider keeps its value while hidden, so toggling
// PNG -> JPEG -> PNG does not lose the user's setting.

import { $, on, setHidden, setText } from "../dom.ts";
import type { Store } from "../store.ts";
import type { ImageFormat } from "../../types/api.ts";

const QUALITY_MIN = 1;
const QUALITY_MAX = 100;

function coerceFormat(value: string): ImageFormat {
  return value === "jpeg" || value === "jpg" ? "jpeg" : "png";
}

export function mountFormatSelector(root: ParentNode, store: Store): void {
  const select = $<HTMLSelectElement>("format-select", root);
  const qualityRow = $("quality-row", root);
  const slider = $<HTMLInputElement>("quality-slider", root);
  const valueLabel = $("quality-value", root);

  on(select, "change", () => {
    store.setState({ format: coerceFormat(select.value) });
  });

  on(slider, "input", () => {
    const parsed = Number.parseInt(slider.value, 10);
    if (!Number.isFinite(parsed)) return;
    store.setState({ quality: Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, parsed)) });
  });

  const render = (state: { format: ImageFormat; quality: number }) => {
    if (select.value !== state.format) select.value = state.format;

    setHidden(qualityRow, state.format !== "jpeg");

    const quality = String(state.quality);
    if (slider.value !== quality) slider.value = quality;
    setText(valueLabel, quality);
  };

  store.subscribe(render);
  render(store.getState());
}
