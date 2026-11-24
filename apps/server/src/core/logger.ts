import { createWriteStream, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { finished } from "node:stream/promises";
import pino from "pino";

export function createLogger(level: string, baseDir = process.cwd(), logDir = "./logs") {
  const logDirectory = resolve(baseDir, logDir);
  mkdirSync(logDirectory, { recursive: true });
  const combined = createWriteStream(`${logDirectory}/combined.log`, {
    flags: "a",
  });
  const errors = createWriteStream(`${logDirectory}/errors.log`, {
    flags: "a",
  });
  const destinations = [
    { level: "trace", stream: process.stdout },
    { level: "trace", stream: combined },
    { level: "error", stream: errors },
  ];
  const logger = pino(
    {
      level,
      base: { service: "mordus-platform-server" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(destinations),
  );
  return {
    logger,
    async close() {
      await new Promise<void>((resolveFlush, rejectFlush) =>
        logger.flush((error) => (error ? rejectFlush(error) : resolveFlush())),
      );
      combined.end();
      errors.end();
      await Promise.all([finished(combined), finished(errors)]);
    },
  };
}
