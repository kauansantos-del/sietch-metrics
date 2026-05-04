import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';

const port = env.PORT;

const server = app.listen(port, () => {
  logger.info(`🚀 Sietch Metrics API rodando em http://localhost:${port} (${env.NODE_ENV})`);
});

// Graceful shutdown — útil para o tsx watch e para containers
function shutdown(signal: string) {
  logger.info(`${signal} recebido — encerrando servidor...`);
  server.close(() => {
    logger.info('Servidor encerrado.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
