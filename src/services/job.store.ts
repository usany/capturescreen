// src/services/job.store.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// In-memory cache of captured buffers, keyed by job id. This is what lets
// POST return an inline data URL for the preview while
// GET /api/screenshot/:id/download still serves real binary with a
// Content-Disposition header (planner A3).
//
// The download must be byte-identical to the preview, so the buffer is stored
// once and served as-is — never re-encoded.

import { JOB } from "../config.ts";
import type { JobRecord } from "../types/server.ts";

/**
 * Insertion order is the LRU order. `getJob` deletes and re-inserts on a hit,
 * which moves the entry to the end, so eviction can just take the first key.
 */
const jobs = new Map<string, JobRecord>();

/** 12 lowercase hex chars, as the client and the suite both expect. */
function randomId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Ids must be unique across concurrent captures, so collisions are re-rolled. */
export function createJobId(): string {
  let id = randomId();
  while (jobs.has(id)) id = randomId();
  return id;
}

export function isValidJobId(id: string): boolean {
  return /^[0-9a-f]{12}$/.test(id);
}

function isExpired(record: JobRecord, now: number): boolean {
  return now - record.createdAt > JOB.ttlMs;
}

/** Drop expired entries, then evict oldest-first until we are under capacity. */
export function pruneJobs(): void {
  const now = Date.now();

  for (const [id, record] of jobs) {
    if (isExpired(record, now)) jobs.delete(id);
  }

  while (jobs.size > JOB.capacity) {
    const oldest = jobs.keys().next();
    if (oldest.done) break;
    jobs.delete(oldest.value);
  }
}

export function putJob(record: JobRecord): string {
  jobs.set(record.id, record);
  pruneJobs();
  return record.id;
}

/** Null when unknown or expired. A hit refreshes the entry's LRU position. */
export function getJob(id: string): JobRecord | null {
  const record = jobs.get(id);
  if (!record) return null;

  if (isExpired(record, Date.now())) {
    jobs.delete(id);
    return null;
  }

  jobs.delete(id);
  jobs.set(id, record);
  return record;
}

export function jobStats(): { cached: number; capacity: number } {
  return { cached: jobs.size, capacity: JOB.capacity };
}

/** Test/shutdown helper — drops every cached buffer. */
export function clearJobs(): void {
  jobs.clear();
}
