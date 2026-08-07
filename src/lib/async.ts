// src/lib/async.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Express 4 predates promises in its router: a rejected async handler is never
// passed to `next`, so the request just hangs until the client gives up.
// Every async route below is wrapped here instead of growing its own
// try/catch, which keeps `error.middleware.ts` the only place that writes an
// error body.

import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
