import { Router, type Request, type Response } from 'express';
import type { DbHandle } from '../db.js';

export function locationsRouter(deps: { db: DbHandle }): Router {
  const router = Router();

  router.get('/locations', (_req: Request, res: Response) => {
    const rows = deps.db.stmts.distinctLocations.all() as Array<{ location_id: string }>;
    res.json({ locations: rows.map((r) => r.location_id) });
  });

  return router;
}
