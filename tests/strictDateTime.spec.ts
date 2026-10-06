import {checkStrictDateTime, strictDateTime} from "../src/strictDateTime"
import type {StrictDateTimeError} from "../src/strictDateTime"
import {fullFormats} from "../src/formats"
import type {FormatDefinition} from "ajv"

// four fixed time vectors
const FIXED_VECTORS: {input: string; valid: boolean; error?: StrictDateTimeError}[] = [
  {input: "2020-02-29T23:59:59Z", valid: true}, // leap-year Feb 29, UTC
  {input: "2021-02-29T00:00:00Z", valid: false, error: "date"}, // not a leap year
  {input: "2021-02-30T00:00:00Z", valid: false, error: "date"}, // Feb 30 never exists
  {input: "2021-01-01T00:00:00", valid: false, error: "zone"}, // missing zone
]

describe("strict date-time profile: fixed vectors", () => {
  for (const {input, valid, error} of FIXED_VECTORS) {
    test(JSON.stringify(input), () => {
      const res = checkStrictDateTime(input)
      expect(res.valid).toBe(valid)
      expect(res.error).toBe(error)
      expect(strictDateTime(input)).toBe(valid)
    })
  }
})

describe("strict date-time profile: calendar dates", () => {
  test("Feb 30 is rejected as an invalid calendar date", () => {
    expect(checkStrictDateTime("2021-02-30T12:00:00Z")).toEqual({valid: false, error: "date"})
  })

  test("leap-year Feb 29 passes", () => {
    expect(checkStrictDateTime("2020-02-29T12:00:00Z")).toEqual({valid: true})
    expect(checkStrictDateTime("2000-02-29T12:00:00Z")).toEqual({valid: true})
  })

  test("non-leap-year Feb 29 is rejected", () => {
    expect(checkStrictDateTime("2019-02-29T12:00:00Z")).toEqual({valid: false, error: "date"})
    expect(checkStrictDateTime("1900-02-29T12:00:00Z")).toEqual({valid: false, error: "date"})
  })

  test("month 13 / day 32 are invalid dates, not syntax errors", () => {
    expect(checkStrictDateTime("2021-13-01T00:00:00Z").error).toBe("date")
    expect(checkStrictDateTime("2021-01-32T00:00:00Z").error).toBe("date")
  })
})

describe("strict date-time profile: zone handling", () => {
  test("legal offsets succeed", () => {
    expect(strictDateTime("2021-01-01T00:00:00+05:30")).toBe(true)
    expect(strictDateTime("2021-01-01T00:00:00-08:00")).toBe(true)
    expect(strictDateTime("2021-01-01T00:00:00+14:00")).toBe(true)
    expect(strictDateTime("2021-01-01T00:00:00z")).toBe(true)
  })

  test("missing zone is rejected and classified differently from an invalid date", () => {
    const noZone = checkStrictDateTime("2021-01-01T00:00:00")
    const badDate = checkStrictDateTime("2021-02-30T00:00:00Z")
    expect(noZone).toEqual({valid: false, error: "zone"})
    expect(badDate).toEqual({valid: false, error: "date"})
    expect(noZone.error).not.toBe(badDate.error)
  })

  test("illegal offset is rejected as a zone error", () => {
    expect(checkStrictDateTime("2021-01-01T00:00:00+25:00")).toEqual({valid: false, error: "zone"})
    expect(checkStrictDateTime("2021-01-01T00:00:00+05:60")).toEqual({valid: false, error: "zone"})
  })
})

describe("strict date-time profile: leap seconds and syntax", () => {
  test("leap seconds are rejected", () => {
    expect(checkStrictDateTime("2016-12-31T23:59:60Z")).toEqual({valid: false, error: "time"})
    expect(strictDateTime("2016-12-31T23:59:60+00:00")).toBe(false)
  })

  test("out-of-range time is a time error", () => {
    expect(checkStrictDateTime("2021-01-01T24:00:00Z").error).toBe("time")
    expect(checkStrictDateTime("2021-01-01T00:60:00Z").error).toBe("time")
  })

  test("malformed shape is a syntax error", () => {
    expect(checkStrictDateTime("not a date-time").error).toBe("syntax")
    expect(checkStrictDateTime("2021-01-01").error).toBe("syntax")
    expect(checkStrictDateTime("2021-01-01 00:00:00Z").error).toBe("syntax")
    expect(checkStrictDateTime("2021-1-1T00:00:00Z").error).toBe("syntax")
  })
})

describe("default format interface is preserved", () => {
  test("default full date-time format is unchanged (still allows leap seconds)", () => {
    const fmt = fullFormats["date-time"] as FormatDefinition<string>
    const validate = fmt.validate as (s: string) => boolean
    expect(validate("2016-12-31T23:59:60Z")).toBe(true)
    expect(validate("2020-02-29T23:59:59Z")).toBe(true)
    expect(validate("2021-02-30T00:00:00Z")).toBe(false)
  })
})
