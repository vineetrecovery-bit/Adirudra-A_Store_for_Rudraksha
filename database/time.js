// All stored times are Indian Standard Time (UTC+05:30), e.g. "2026-11-23T15:42:10.123+05:30".
// IST has no daylight saving, so a fixed offset is exact. MySQL columns hold the same IST
// wall-clock time (the connection's time zone is set to +05:30).
export const IST_OFFSET = '+05:30';
const OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Any date (Date, timestamp, or ISO string in any zone) as an IST ISO string. */
export function toIst(value) {
  if (value === null || value === undefined || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + OFFSET_MS).toISOString().replace('Z', IST_OFFSET);
}

export const nowIst = () => toIst(Date.now());
