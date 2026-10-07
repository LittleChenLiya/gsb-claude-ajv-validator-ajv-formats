import Ajv, {Format} from "ajv"
import {fullFormats, fastFormats} from "../dist/formats"
import formatLimit, {formatLimitDefinition} from "../dist/limit"
import ajvFormats from "../dist"

describe('keywords "formatMinimum" and "formatMaximum"', () => {
  const ajvs = getAjvs(true)
  const ajvsFF = getAjvs(false)

  ajvs.forEach((ajv, i) => {
    it(`should not validate formatMaximum/Minimum if option format == false #${i}`, () => {
      const ajvFF = ajvsFF[i]

      const schema = {
        type: "string",
        format: "date",
        formatMaximum: "2015-08-01",
      }

      const date = "2015-09-01"
      expect(ajv.validate(schema, date)).toEqual(false)
      expect(ajvFF.validate(schema, date)).toEqual(true)
    })
  })

  ajvs.forEach((ajv, i) => {
    it(`should throw when "format" is absent #${i}`, () => {
      expect(() => ajv.compile({type: "string", formatMaximum: "2015-08-01"})).toThrow()
    })
  })

  ajvs.forEach((ajv, i) => {
    it(`formatExclusiveMaximum should throw if not boolean #${i}`, () => {
      expect(() =>
        ajv.compile({
          type: "string",
          formatMaximum: "2015-08-01",
          formatExclusiveMaximum: 1,
        })
      ).toThrow()
    })
  })

  ajvs.forEach((ajv, i) => {
    it(`formatExclusiveMaximum should throw when "formatMaximum" is absent #${i}`, () => {
      expect(() => ajv.compile({type: "string", formatExclusiveMaximum: true})).toThrow()
    })
  })

  function getAjvs(validateFormats: boolean): Ajv[] {
    return [
      formatLimit(new Ajv({allErrors: true, validateFormats, formats: fullFormats})),
      formatLimit(new Ajv({allErrors: true, validateFormats, formats: fastFormats})),
      ajvFormats(new Ajv({allErrors: true, validateFormats})),
      ajvFormats(new Ajv({validateFormats}), {keywords: true}),
    ]
  }
})

describe('strict mode of keywords "formatMinimum"/"formatMaximum"', () => {
  // fake format: digits-only values, numeric comparison, counting "compare" calls
  function fakeFormat(): Format & {compares: number} {
    // "compare" is invoked as a method (fmt.compare(...)), so "this" is the format
    return {
      compares: 0,
      type: "string",
      validate: (s: string) => /^\d+$/.test(s),
      compare(a: string, b: string): number {
        this.compares++
        return +a - +b
      },
    }
  }

  const schema = {
    type: "string",
    format: "fake",
    formatMinimum: "10",
    formatMaximum: "20",
  }

  it("invalid value reports a format error with zero compare calls", () => {
    const fake = fakeFormat()
    const ajv = formatLimit(new Ajv({allErrors: true}), {strict: true})
    ajv.addFormat("fake", fake)
    const validate = ajv.compile(schema)

    expect(validate("abc")).toEqual(false)
    expect(validate.errors?.map((e) => e.keyword)).toEqual(["format"])
    // invalid values never reach the format "compare" function
    expect(fake.compares).toBe(0)
  })

  it("valid values are range checked as before", () => {
    const fake = fakeFormat()
    const ajv = formatLimit(new Ajv({allErrors: true}), {strict: true})
    ajv.addFormat("fake", fake)
    const validate = ajv.compile(schema)

    expect(fake.compares).toBe(0)
    expect(validate("15")).toEqual(true)
    expect(fake.compares).toBeGreaterThan(0) // lower and upper bounds compared

    const before = fake.compares
    expect(validate("5")).toEqual(false)
    expect(validate.errors?.map((e) => e.keyword)).toEqual(["formatMinimum"])
    expect(validate("25")).toEqual(false)
    expect(validate.errors?.map((e) => e.keyword)).toEqual(["formatMaximum"])
    expect(fake.compares).toBeGreaterThan(before)
  })

  it("non-string values keep Ajv type semantics (type error, zero compare)", () => {
    const fake = fakeFormat()
    const ajv = formatLimit(new Ajv({allErrors: true}), {strict: true})
    ajv.addFormat("fake", fake)
    const validate = ajv.compile(schema)

    for (const value of [null, 42, true, {}, []]) {
      expect(validate(value)).toEqual(false)
      expect(validate.errors?.map((e) => e.keyword)).toContain("type")
    }
    expect(fake.compares).toBe(0)
  })

  it("defaults to the old, lenient behavior", () => {
    const fake = fakeFormat()
    // no plugin options, like the original interface
    const ajv = formatLimit(new Ajv({allErrors: true}))
    ajv.addFormat("fake", fake)
    const validate = ajv.compile(schema)

    expect(validate("abc")).toEqual(false)
    expect(validate.errors?.map((e) => e.keyword)).toEqual(["format"])
    // old behavior: "compare" is still called for invalid strings
    expect(fake.compares).toBeGreaterThan(0)
    // range checks keep working
    expect(validate("5")).toEqual(false)
    expect(validate.errors?.map((e) => e.keyword)).toEqual(["formatMinimum"])
  })

  it("is enabled via ajvFormats options (strictKeywords)", () => {
    const fake = fakeFormat()
    const ajv = ajvFormats(new Ajv({allErrors: true}), {
      keywords: true,
      strictKeywords: true,
    })
    ajv.addFormat("fake", fake)
    const validate = ajv.compile(schema)

    expect(validate("abc")).toEqual(false)
    expect(validate.errors?.map((e) => e.keyword)).toEqual(["format"])
    expect(fake.compares).toBe(0)
  })

  it("can be added with formatLimitDefinition(true)", () => {
    const def = formatLimitDefinition(true)
    expect(def).toHaveProperty("keyword")
    const fake = fakeFormat()
    const ajv = new Ajv({allErrors: true})
    ajv.addFormat("fake", fake)
    ajv.addKeyword(def)
    const validate = ajv.compile(schema)
    expect(validate("abc")).toEqual(false)
    expect(validate.errors?.map((e) => e.keyword)).toEqual(["format"])
    expect(fake.compares).toBe(0)
  })
})
