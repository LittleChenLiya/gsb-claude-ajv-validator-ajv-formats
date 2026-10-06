import Ajv from "ajv"
import addFormats from "../dist"
import {validateStrictDateTime, isStrictDateTime, StrictDateTimeError} from "../dist/strictDateTime"

describe("strict date-time profile", () => {
  // four fixed time vectors
  const FIXED_VECTORS: {input: string; valid: boolean; error?: StrictDateTimeError}[] = [
    {input: "2020-02-29T23:59:59Z", valid: true}, // leap day, UTC
    {input: "2019-02-29T23:59:59Z", valid: false, error: "invalid-date"}, // not a leap year
    {input: "2021-06-30T12:00:00+05:30", valid: true}, // valid numeric offset
    {input: "2021-06-30T12:00:00", valid: false, error: "missing-zone"}, // no zone at all
  ]

  test.each(FIXED_VECTORS)("fixed vector $input", ({input, valid, error}) => {
    expect(validateStrictDateTime(input)).toEqual({valid, ...(error ? {error} : {})})
    expect(isStrictDateTime(input)).toBe(valid)
  })

  test("rejects February 30 but accepts leap-year February 29", () => {
    expect(validateStrictDateTime("2021-02-30T00:00:00Z")).toEqual({
      valid: false,
      error: "invalid-date",
    })
    expect(validateStrictDateTime("2020-02-30T00:00:00Z")).toEqual({
      valid: false,
      error: "invalid-date",
    })
    expect(validateStrictDateTime("2020-02-29T00:00:00Z")).toEqual({valid: true})
    expect(validateStrictDateTime("1900-02-29T00:00:00Z")).toEqual({
      valid: false,
      error: "invalid-date",
    })
    expect(validateStrictDateTime("2000-02-29T00:00:00Z")).toEqual({valid: true})
  })

  test("classifies missing zone differently from invalid date", () => {
    const noZone = validateStrictDateTime("2021-06-30T12:00:00")
    const badDate = validateStrictDateTime("2021-02-30T12:00:00Z")
    expect(noZone).toEqual({valid: false, error: "missing-zone"})
    expect(badDate).toEqual({valid: false, error: "invalid-date"})
    expect(noZone.error).not.toEqual(badDate.error)
  })

  test("accepts valid offsets", () => {
    for (const input of [
      "2021-06-30T12:00:00Z",
      "2021-06-30T12:00:00+05:30",
      "2021-06-30T12:00:00-08:00",
      "2021-06-30T12:00:00+14:00",
      "2021-06-30T12:00:00.123+00:00",
    ]) {
      expect(validateStrictDateTime(input)).toEqual({valid: true})
      expect(isStrictDateTime(input)).toBe(true)
    }
  })

  test("rejects leap seconds", () => {
    expect(validateStrictDateTime("2016-12-31T23:59:60Z")).toEqual({
      valid: false,
      error: "leap-second",
    })
    expect(validateStrictDateTime("2016-12-31T23:59:61Z")).toEqual({
      valid: false,
      error: "invalid-time",
    })
  })

  test("rejects malformed syntax without repair", () => {
    for (const input of [
      "not a date",
      "2021-6-30T12:00:00Z", // unpadded month/day
      "2021-06-30 12:00:00Z", // space separator
      "2021-06-30T12:00:00+0530", // offset without colon
      "2021-06-30T12:00:00Zjunk",
      "2021-06-30T12:00", // missing seconds
    ]) {
      expect(validateStrictDateTime(input)).toEqual({valid: false, error: "syntax"})
    }
  })

  test("rejects out-of-range time and zone offset", () => {
    expect(validateStrictDateTime("2021-06-30T24:00:00Z")).toEqual({
      valid: false,
      error: "invalid-time",
    })
    expect(validateStrictDateTime("2021-06-30T12:00:00+24:00")).toEqual({
      valid: false,
      error: "invalid-zone",
    })
    expect(validateStrictDateTime("2021-06-30T12:00:00+10:60")).toEqual({
      valid: false,
      error: "invalid-zone",
    })
  })

  test("default date-time format interface is unchanged", () => {
    const ajv = new Ajv({strictTypes: false})
    addFormats(ajv)
    const validate = ajv.compile({format: "date-time"})
    // default full format still accepts leap seconds and lower-case z
    expect(validate("2016-12-31T23:59:60Z")).toBe(true)
    expect(validate("2020-02-29T23:59:59Z")).toBe(true)
    expect(validate("2021-02-30T00:00:00Z")).toBe(false)
    // strict profile is exposed on the plugin as well
    expect(typeof addFormats.validateStrictDateTime).toBe("function")
    expect(typeof addFormats.isStrictDateTime).toBe("function")
    expect(addFormats.isStrictDateTime("2016-12-31T23:59:60Z")).toBe(false)
    expect(addFormats.isStrictDateTime("2020-02-29T23:59:59Z")).toBe(true)
  })
})
