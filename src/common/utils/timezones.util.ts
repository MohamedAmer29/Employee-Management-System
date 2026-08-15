import { ConfigService } from '@nestjs/config';

const DEFAULT_TIMEZONE = 'UTC';

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Single source of truth for the application's attendance timezone. Every
 * date/calendar computation in the system should go through these helpers so
 * the backend consistently honours ATTENDANCE_TIMEZONE instead of the server's
 * local zone or UTC.
 */
export function getTimezone(config?: ConfigService): string {
  const raw = config
    ? config.get<string>('ATTENDANCE_TIMEZONE')
    : process.env.ATTENDANCE_TIMEZONE;
  return raw ?? DEFAULT_TIMEZONE;
}

/**
 * Current business date (YYYY-MM-DD) in the configured timezone. Anchored to
 * the live clock; safe to call with no arguments when no ConfigService is
 * available.
 */
export function getBusinessDate(config?: ConfigService): string {
  const tz = getTimezone(config);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
}

/**
 * First calendar day (YYYY-MM-01) of the current business month in the
 * configured timezone.
 */
export function getBusinessMonthStart(config?: ConfigService): string {
  return `${getBusinessDate(config).slice(0, 7)}-01`;
}

/**
 * Every working day (YYYY-MM-DD) between `startStr` and `endStr` inclusive,
 * resolved in the configured timezone. Weekends use the application's
 * Fri+Sat rule (matching `isWeekend`), so non-working days are never counted.
 */
export function getWorkingDaysInRange(
  startStr: string,
  endStr: string,
  config?: ConfigService,
): string[] {
  const out: string[] = [];
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const [y, m, day] = dateStr.split('-').map(Number);
    const weekday = getWeekdayInTimezone(y, m, day, config);
    if (weekday !== 5 && weekday !== 6) {
      out.push(dateStr);
    }
  }
  return out;
}

/**
 * Weekday (0 = Sunday … 6 = Saturday) for a calendar date, resolved in the
 * configured timezone rather than the server's local zone. The date is
 * anchored at noon UTC before formatting so a timezone offset can never shift
 * it across a day boundary.
 */
export function getWeekdayInTimezone(
  year: number,
  month: number,
  day: number,
  config?: ConfigService,
): number {
  const tz = getTimezone(config);
  const instant = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  try {
    const wd = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
    })
      .formatToParts(instant)
      .find((part) => part.type === 'weekday')?.value;
    return (wd ? WEEKDAY_MAP[wd] : undefined) ?? instant.getUTCDay();
  } catch {
    return instant.getUTCDay();
  }
}

/**
 * UTC boundaries (ISO strings) of the calendar day `dateStr` (YYYY-MM-DD) as it
 * exists in the configured timezone. The returned range is [start, end) where
 * `end` is the exclusive start of the following day, so a filter such as
 * `createdAt >= start AND createdAt < end` is inclusive of the whole day
 * regardless of timezone. Reading this from the timezone helper (rather than
 * treating the date string as UTC midnight) keeps audit/date-range filters
 * aligned with the application's business-day definition.
 */
export function getDateUtcRange(
  dateStr: string,
  config?: ConfigService,
): { start: string; end: string } {
  const tz = getTimezone(config);
  const target = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(target);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  const offsetMs = asUtc - target.getTime();
  const localMidnightAsUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    0,
    0,
    0,
  );
  const start = localMidnightAsUtc - offsetMs;
  const end = start + 24 * 60 * 60 * 1000;
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}

/**
 * Coerces a Date or a date string (including the space-separated format
 * Postgres returns for raw `timestamptz` columns, e.g. `2026-08-15 13:48:25+00`)
 * into a valid Date, or a sentinel Invalid Date if it cannot be parsed.
 */
function normalizeToDate(input: Date | string | null | undefined): Date {
  if (input instanceof Date) {
    return input;
  }
  if (input == null) {
    return new Date(NaN);
  }
  const withT = String(input).trim().replace(' ', 'T');
  const parsed = new Date(withT);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return new Date(input);
}

/**
 * Formats a Date / timestamp (typically a stored UTC `timestamptz`) as a
 * human-readable string in the configured timezone using a 12-hour clock with
 * AM/PM, e.g. `August 15, 2026 at 1:39:46 AM`. This anchors the displayed time
 * to the application's timezone instead of the raw UTC instant, fixing
 * audit-log timestamps that were showing "9 hours off" from the user's zone.
 */
export function formatInTimezone(
  input: Date | string | null | undefined,
  config?: ConfigService,
): string {
  const date = normalizeToDate(input);
  if (Number.isNaN(date.getTime())) {
    return input == null ? '' : String(input);
  }
  const tz = getTimezone(config);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: true,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}
