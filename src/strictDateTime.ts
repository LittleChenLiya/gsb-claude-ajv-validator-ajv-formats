/**
 * Strict date-time profile.
 *
 * A deliberately narrow entry point next to the default "date-time" format
 * (which stays untouched). Rules of this profile:
 * - only the fixed Gregorian calendar form `YYYY-MM-DDTHH:MM:SS(.fraction)` is
 *   accepted - no input normalization or repair of any kind
 * - a time zone is mandatory: "Z" or a numeric offset "+HH:MM" / "-HH:MM";
 *   a missing zone is rejected with its own diagnostic
 * - leap seconds ("23:59:60") are rejected
 *
 * Diagnostics distinguish a malformed string ("syntax") from a syntactically
 * well-formed string that is not a real calendar date ("invalid-date") and
 * from a missing time zone ("missing-zone").
 */

export type StrictDateTimeError =
  | "syntax" // does not match the strict date-time grammar at all
  | "invalid-date" // well-formed but not a real Gregorian calendar date (e.g. Feb 30)
  | "invalid-time" // time of day out of range (hour > 23, minute/second > 59)
  | "leap-second" // leap seconds are not allowed in this profile
  | "missing-zone" // no "Z" and no numeric offset
  | "invalid-zone" // numeric offset out of range

export interface StrictDateTimeResult {
  valid: boolean
  error?: StrictDateTimeError
}

const STRICT_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))?$/

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isLeapYear(year: number): boolean {
  // https://tools.ietf.org/html/rfc3339#appendix-C
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month]
}

export function validateStrictDateTime(str: string): StrictDateTimeResult {
  if (typeof str !== "string") return {valid: false, error: "syntax"}
  const matches: (string | undefined)[] | null = STRICT_DATE_TIME.exec(str)
  if (!matches) return {valid: false, error: "syntax"}
  const zone: string | undefined = matches[7]
  if (zone === undefined) return {valid: false, error: "missing-zone"}
  const year = +(matches[1] || 0)
  const month = +(matches[2] || 0)
  const day = +(matches[3] || 0)
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return {valid: false, error: "invalid-date"}
  }
  const hour = +(matches[4] || 0)
  const minute = +(matches[5] || 0)
  const second = +(matches[6] || 0)
  if (hour > 23 || minute > 59 || second > 60) return {valid: false, error: "invalid-time"}
  if (second === 60) return {valid: false, error: "leap-second"}
  if (matches[8] !== undefined) {
    const offsetHour = +(matches[9] || 0)
    const offsetMinute = +(matches[10] || 0)
    if (offsetHour > 23 || offsetMinute > 59) return {valid: false, error: "invalid-zone"}
  }
  return {valid: true}
}

export function isStrictDateTime(str: string): boolean {
  return validateStrictDateTime(str).valid
}
