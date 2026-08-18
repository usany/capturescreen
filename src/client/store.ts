// src/client/store.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// A ~40-line observable state container (planner 6). Deliberately not a
// framework: six components, one flat state object, and a render pass that is
// cheap because every component only writes attributes it owns.
//
// The contract that keeps this honest is `setState` doing a shallow-equality
// check before notifying. Components re-render on every notification, so
// without it a `setState` inside a subscriber would recurse forever.

import type { ImageFormat, ScreenshotData } from "../types/api.ts";

/** Lifecycle of the current capture. Mirrored onto `capture-btn[data-state]`. */
export type CaptureStatus = "idle" | "loading" | "success" | "error";

/** The page colour scheme. Mirrored onto `<html>` as the `dark` class. */
export type Theme = "light" | "dark";

export interface AppState {
  /** Raw text of `url-input`, updated on the 400 ms debounce (not per keystroke). */
  url: string;
  width: number;
  height: number;
  format: ImageFormat;
  /** 1-100, only sent to the server when `format === "jpeg"`. */
  quality: number;
  fullPage: boolean;
  /** Default OFF. When ON, a valid URL idle for 900 ms fires a capture. */
  autoCapture: boolean;
  /** Remembered choice, else the OS preference; persisted under `urlshot:theme`. */
  theme: Theme;
  status: CaptureStatus;
  result: ScreenshotData | null;
  error: { code: string; message: string } | null;
}

export type Subscriber = (state: AppState) => void;

export interface Store {
  getState(): AppState;
  /** Shallow-merge a patch. No-op (and no notification) when nothing changed. */
  setState(patch: Partial<AppState>): void;
  /** Register a subscriber; returns its unsubscribe. */
  subscribe(fn: Subscriber): () => void;
}

export function createStore(initial: AppState): Store {
  let state: AppState = { ...initial };
  const subscribers = new Set<Subscriber>();

  return {
    getState() {
      return state;
    },

    setState(patch: Partial<AppState>) {
      let changed = false;
      for (const key of Object.keys(patch) as Array<keyof AppState>) {
        if (patch[key] !== undefined && !Object.is(state[key], patch[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;

      state = { ...state, ...patch };
      // Snapshot the set: a subscriber is allowed to unsubscribe during a pass.
      for (const fn of Array.from(subscribers)) fn(state);
    },

    subscribe(fn: Subscriber) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
  };
}
