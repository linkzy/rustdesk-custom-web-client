// Structured one-line logger for the gateway. No framework, no JSON:
//   INFO session=7f3a target=123456789 msg="[session] login successful"
// Keep the [component] prefix in `msg`; put identifiers in `fields`.

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export type LogFields = Record<string, string | number | boolean | undefined | null>;

// Bare value when it is a plain token, otherwise quoted, so one line stays one record.
function formatValue(v: string | number | boolean): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return /^[A-Za-z0-9_.:@/-]+$/.test(v) ? v : JSON.stringify(v);
}

export function formatLog(level: LogLevel, msg: string, fields: LogFields = {}): string {
  const pairs = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${formatValue(v as string | number | boolean)}`);
  return [level, ...pairs, `msg=${JSON.stringify(msg)}`].join(' ');
}

export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const line = formatLog(level, msg, fields);
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}
