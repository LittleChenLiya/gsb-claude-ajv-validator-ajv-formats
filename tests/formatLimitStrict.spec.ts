import Ajv from "ajv"
import formatLimit from "../dist/limit"
import ajvFormats from "../dist"

// in-memory fixture: a fake comparable format that records every compare() call
const compareCalls: [unknown, unknown][] = []
const fakeFormat = {
  validate: (s: unknown): boolean => typeof s == "string" && /^\d{4}-\d{2}-\d{2}$/.test(s),
  compare(a: string, b: string): number {
    compareCalls.push([a, b])
    return a < b ? -1 : a > b ? 1 : 0
  },
}

const schema = {
  format: "fake-date",
  formatMinimum: "2020-01-01",
  formatMaximum: "2020-12-31",
}

function getAjv(strict?: boolean): Ajv {
  const ajv = new Ajv({allErrors: true})
  ajv.addFormat("fake-date", fakeFormat)
  formatLimit(ajv, strict === undefined ? undefined : {strict})
  return ajv
}

const keywords = (ajv: Ajv): string[] => (ajv.errors || []).map((e) => e.keyword)

beforeEach(() => {
  compareCalls.length = 0
})

describe('strict option of "formatMinimum"/"formatMaximum" keywords', () => {
  const ajv = getAjv(true)

  it("invalid format value: format error, no range error, zero comparisons", () => {
    expect(ajv.validate(schema, "not-a-date")).toEqual(false)
    expect(compareCalls).toEqual([]) // compare never called for invalid values
    expect(keywords(ajv)).toContain("format")
    expect(keywords(ajv)).not.toContain("formatMinimum")
    expect(keywords(ajv)).not.toContain("formatMaximum")
  })

  it("valid value within bounds: valid, compared against both limits", () => {
    expect(ajv.validate(schema, "2020-06-15")).toEqual(true)
    expect(compareCalls).toEqual([
      ["2020-06-15", "2020-12-31"],
      ["2020-06-15", "2020-01-01"],
    ])
  })

  it("valid value below minimum: formatMinimum error, not a format error", () => {
    expect(ajv.validate(schema, "2019-12-31")).toEqual(false)
    expect(keywords(ajv)).toContain("formatMinimum")
    expect(keywords(ajv)).not.toContain("format")
  })

  it("valid value above maximum: formatMaximum error, not a format error", () => {
    expect(ajv.validate(schema, "2021-01-01")).toEqual(false)
    expect(keywords(ajv)).toContain("formatMaximum")
    expect(keywords(ajv)).not.toContain("format")
  })

  it("exclusive keywords also run in strict mode", () => {
    const ajvX = getAjv(true)
    const sch = {format: "fake-date", formatExclusiveMinimum: "2020-01-01"}
    expect(ajvX.validate(sch, "2020-01-01")).toEqual(false)
    expect(keywords(ajvX)).toEqual(["formatExclusiveMinimum"])
    expect(ajvX.validate(sch, "bad")).toEqual(false)
    expect(keywords(ajvX)).toContain("format")
    expect(keywords(ajvX)).not.toContain("formatExclusiveMinimum")
  })

  it("null and non-strings keep Ajv type semantics: skipped, never compared", () => {
    expect(ajv.validate(schema, null)).toEqual(true)
    expect(ajv.validate(schema, 20200615)).toEqual(true)
    expect(ajv.validate(schema, undefined)).toEqual(true)
    expect(compareCalls).toEqual([])
  })

  it("strict mode works with $data limits", () => {
    const ajvD = new Ajv({allErrors: true, $data: true})
    ajvD.addFormat("fake-date", fakeFormat)
    formatLimit(ajvD, {strict: true})
    const validate = ajvD.compile({
      type: "object",
      properties: {
        min: {type: "string"},
        val: {format: "fake-date", formatMinimum: {$data: "1/min"}},
      },
    })
    expect(validate({min: "2020-01-01", val: "bad"})).toEqual(false)
    expect(compareCalls).toEqual([]) // invalid value: zero comparisons
    expect((validate.errors || []).some((e) => e.keyword === "format")).toEqual(true)
    expect(validate({min: "2020-01-01", val: "2019-06-01"})).toEqual(false)
    expect((validate.errors || []).some((e) => e.keyword === "formatMinimum")).toEqual(true)
    expect(validate({min: "2020-01-01", val: "2020-06-01"})).toEqual(true)
  })
})

describe("default mode (regression: original interface unchanged)", () => {
  const ajv = getAjv() // formatLimit(ajv) without options

  it("invalid format value: compared anyway, range error reported as before", () => {
    expect(ajv.validate(schema, "not-a-date")).toEqual(false)
    expect(compareCalls.length).toBeGreaterThan(0) // original behaviour: compare is called
    expect(keywords(ajv)).toContain("format")
    expect(keywords(ajv)).toContain("formatMaximum") // "not-a-date" > "2020-12-31"
  })

  it("bounds behave as before", () => {
    expect(ajv.validate(schema, "2020-06-15")).toEqual(true)
    expect(ajv.validate(schema, "2021-01-01")).toEqual(false)
    expect(keywords(ajv)).toContain("formatMaximum")
    expect(ajv.validate(schema, "2019-12-31")).toEqual(false)
    expect(keywords(ajv)).toContain("formatMinimum")
  })

  it("null and non-strings are ignored as before", () => {
    expect(ajv.validate(schema, null)).toEqual(true)
    expect(ajv.validate(schema, 20200615)).toEqual(true)
    expect(compareCalls).toEqual([])
  })
})

describe('main ajv-formats plugin "keywords" option', () => {
  const sch = {format: "date", formatMinimum: "2020-01-01"}

  it("accepts {keywords: {strict: true}}", () => {
    const ajv = ajvFormats(new Ajv({allErrors: true}), {keywords: {strict: true}})
    expect(ajv.validate(sch, "not-a-date")).toEqual(false)
    expect(keywords(ajv)).toContain("format")
    expect(keywords(ajv)).not.toContain("formatMinimum")
    expect(ajv.validate(sch, "2020-06-15")).toEqual(true)
    expect(ajv.validate(sch, "2019-06-15")).toEqual(false)
    expect(keywords(ajv)).toContain("formatMinimum")
  })

  it("default {keywords: true} is unchanged (regression)", () => {
    const ajv = ajvFormats(new Ajv({allErrors: true}), {keywords: true})
    expect(ajv.validate(sch, "not-a-date")).toEqual(false)
    expect(keywords(ajv)).toContain("format")
    expect(ajv.validate(sch, "2019-06-15")).toEqual(false)
    expect(keywords(ajv)).toContain("formatMinimum")
    expect(ajv.validate(sch, "2020-06-15")).toEqual(true)
  })
})
