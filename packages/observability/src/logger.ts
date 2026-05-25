export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export type Logger = {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  child(ctx: LogContext): Logger;
};

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function write(level: LogLevel, minLevel: LogLevel, msg: string, ctx: LogContext): void {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const line = JSON.stringify({ level, msg, ...ctx, time: new Date().toISOString() });
  if (level === "error" || level === "warn") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export function createLogger(opts: { level?: LogLevel; base?: LogContext } = {}): Logger {
  const minLevel = opts.level ?? "info";
  const base = opts.base ?? {};

  const logger: Logger = {
    debug: (msg, ctx) => write("debug", minLevel, msg, { ...base, ...ctx }),
    info: (msg, ctx) => write("info", minLevel, msg, { ...base, ...ctx }),
    warn: (msg, ctx) => write("warn", minLevel, msg, { ...base, ...ctx }),
    error: (msg, ctx) => write("error", minLevel, msg, { ...base, ...ctx }),
    child: (ctx) => createLogger({ level: minLevel, base: { ...base, ...ctx } }),
  };

  return logger;
}
