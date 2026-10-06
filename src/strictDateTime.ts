/**
 * Strict RFC 3339 date-time profile (separate entry point).
 *
 * Unlike the default "date-time" format (which is left unchanged), this
 * profile:
 *  - diagnoses syntax shape, real Gregorian calendar dates and time-zone
 *    presence as distinct failure classes
 *  - requires an explicit zone designator ("Z"/"z" or a numeric offset)
 *  - accepts any legal numeric offset (+/-hh:mm with hh <= 23, mm <= 59)
 *  - only handles fixed Gregorian calendar dates and rejects leap seconds
 *  - performs no input repair/normalization and offers no arbitrary
 *    profile combinations
 */

export type StrictDateTimeError =
  | "syntax" // does not match the date-time shape at all
  | "date" // well-formed shape, but not a real Gregorian calendar date
  | "time" // time of day out of range (including rejected leap seconds)
  | "zone" // missing or illegal time-zone offset

export interface StrictDateTimeResult {
  valid: boolean
  error?: StrictDateTimeError
}

const STRICT_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:([Zz])|([+-])(\d{2}):(\d{2}))?$/

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isLeapYear(year: number): boolean {
  // https://tools.ietf.org/html/rfc3339#appendix-C
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function checkStrictDateTime(str: string): StrictDateTimeResult {
  const m = STRICT_DATE_TIME.exec(str)
  if (!m) return {valid: false, error: "syntax"}

  const year = +m[1]
  const month = +m[2]
  const day = +m[3]
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month])
  ) {
    return {valid: false, error: "date"}
  }

  const hour = +m[4]
  const minute = +m[5]
  const second = +m[6]
  // fixed wall clock only: leap seconds (ss = 60) are rejected
  if (hour > 23 || minute > 59 || second > 59) return {valid: false, error: "time"}

  const offsetSign = m[8]
  const offsetHour = m[9]
  const offsetMinute = m[10]
  if (m[7] === undefined && offsetSign === undefined) {
    // explicit zone designator is required
    return {valid: false, error: "zone"}
  }
  if (offsetHour !== undefined && (+offsetHour > 23 || +offsetMinute > 59)) {
    return {valid: false, error: "zone"}
  }

  return {valid: true}
}

/** Boolean validator, usable as an Ajv string format `validate` function. */
export function strictDateTime(str: string): boolean {
  return checkStrictDateTime(str).valid
}

export default strictDateTime
