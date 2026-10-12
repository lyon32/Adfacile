// Journal structuré (JSON). Masque les champs sensibles par leur nom (CONVENTIONS §6.10) :
// jeton, clé, mot de passe, téléphone, preuve de paiement… La valeur n'est jamais écrite.
// Le lien avec Sentry arrive avec le module qui l'installe (apps/web, jobs) via un `sink`.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;
export interface LogRecord {
  level: LogLevel;
  msg: string;
  time: string;
  fields: LogFields;
}
export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug: (msg: string, fields?: LogFields) => void;
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
  child: (fields: LogFields) => Logger;
}

export const REDACTED = '[masqué]';

const SENSITIVE_KEY =
  /(token|secret|password|passwd|api[-_]?key|authorization|cookie|phone|msisdn|signature|proof|private[-_]?key|^key$|[-_]key$|email)/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

const MAX_DEPTH = 8;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[trop profond]';
  if (Array.isArray(value)) return value.map((v: unknown) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object') return redactFields(value, depth);
  return value;
}

function redactFields(value: object, depth: number): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const stdoutSink: LogSink = (record) => {
  const { fields, ...head } = record;
  process.stdout.write(`${JSON.stringify({ ...fields, ...head })}\n`);
};

export interface LoggerOptions {
  sink?: LogSink;
  minLevel?: LogLevel;
  now?: () => Date;
  base?: LogFields;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? stdoutSink;
  const minLevel = options.minLevel ?? 'info';
  const now = options.now ?? ((): Date => new Date());
  const base = options.base ?? {};

  const write = (level: LogLevel, msg: string, fields: LogFields = {}): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    sink({ level, msg, time: now().toISOString(), fields: redactFields({ ...base, ...fields }, 0) });
  };

  return {
    debug: (msg, fields) => {
      write('debug', msg, fields);
    },
    info: (msg, fields) => {
      write('info', msg, fields);
    },
    warn: (msg, fields) => {
      write('warn', msg, fields);
    },
    error: (msg, fields) => {
      write('error', msg, fields);
    },
    child: (fields) => createLogger({ sink, minLevel, now, base: { ...base, ...fields } }),
  };
}
