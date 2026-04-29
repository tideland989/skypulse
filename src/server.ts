import { pathToFileURL } from 'node:url';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger as defaultLogger, type Logger } from './logger.js';
import { openDb, type DbHandle } from './db.js';
import { activityScoreRouter } from './routes/activityScore.js';
import { locationsRouter } from './routes/locations.js';
import { errorHandler } from './middleware/errorHandler.js';

export interface AppDeps {
  db: DbHandle;
  logger: Logger;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    pinoHttp({
      logger: deps.logger,
      serializers: {
        req: (req) => ({
          id: (req as any).id,
          method: req.method,
          url: req.url,
          remoteAddress: req.socket?.remoteAddress,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
    }),
  );

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  app.use('/api/v1', apiLimiter);

  app.use('/api/v1', activityScoreRouter({ db: deps.db, logger: deps.logger }));
  app.use('/api/v1', locationsRouter({ db: deps.db }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use(errorHandler);

  return app;
}

async function main(): Promise<void> {
  const db = openDb(config.DB_PATH);
  const app = createApp({ db, logger: defaultLogger });

  const server = app.listen(config.PORT, config.HOST, () => {
    defaultLogger.info(
      {
        host: config.HOST,
        port: config.PORT,
        analyticsEndpoint: config.ANALYTICS_ENDPOINT,
        analyticsAuth: config.ANALYTICS_API_KEY ? 'bearer' : 'none',
      },
      'server_listening',
    );
  });

  server.timeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.headersTimeout = 10_000;

  const shutdown = (signal: string) => {
    defaultLogger.info({ signal }, 'shutdown_initiated');
    server.close((err) => {
      if (err) {
        defaultLogger.error({ err }, 'server_close_error');
      }
      try {
        db.close();
      } catch (err) {
        defaultLogger.error({ err }, 'db_close_error');
      }
      process.exit(err ? 1 : 0);
    });

    // Hard-kill if drain takes too long.
    setTimeout(() => {
      defaultLogger.error('shutdown_timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entrypoint) {
  main().catch((err) => {
    defaultLogger.fatal({ err }, 'startup_failed');
    process.exit(1);
  });
}
