import { createDb } from './db';
import { UrlStore } from './store/urlStore';
import { createApp } from './app';
import { config } from './config';

/** Compose the object graph and start listening. */
function main(): void {
  const db = createDb(config.dbPath);
  const store = new UrlStore(db);
  const app = createApp(store, config);

  const server = app.listen(config.port, () => {
    console.log(`url-shortener listening on http://localhost:${config.port}`);
    console.log(`  database: ${config.dbPath}`);
  });

  // Graceful shutdown: stop accepting connections, then close the DB so WAL is
  // checkpointed cleanly. Important for clean container stop/restart.
  const shutdown = (signal: string): void => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
