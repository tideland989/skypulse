import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { UpstreamError } from '../services/weather.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = req.log;

  if (err instanceof ZodError) {
    const fields = err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    log?.warn({ fields }, 'validation_failed');
    res.status(400).json({ error: 'validation_failed', fields });
    return;
  }

  if (err instanceof UpstreamError) {
    // 500 (not 502) matches the Python: uncaught upstream errors bubble as
    // Flask's default 500. Typed log line keeps the dependency name in ops.
    log?.error(
      { dependency: err.dependency, cause: err.cause ? String(err.cause) : undefined },
      'upstream_unavailable',
    );
    res.status(500).json({ error: 'internal_error' });
    return;
  }

  log?.error({ err }, 'internal_error');
  res.status(500).json({ error: 'internal_error' });
};
