import Ajv from "ajv"
import addFormats from "../dist"

const {registerFormats, FormatContractError} = addFormats

describe("registerFormats: explicit execution contract", () => {
  let ajv: Ajv

  beforeEach(() => {
    ajv = new Ajv({strictTypes: false})
  })

  describe("three formats example (sync function, sync RegExp, async function)", () => {
    beforeEach(() => {
      registerFormats(ajv, [
        {name: "even", type: "number", async: false, validate: (n) => n % 2 === 0},
        {name: "lower", type: "string", async: false, validate: /^[a-z]+$/},
        {name: "available", type: "string", async: true, validate: async (s) => s !== "taken"},
      ])
    })

    it("should validate sync function format", () => {
      const validate = ajv.compile({format: "even"})
      expect(validate(2)).toEqual(true)
      expect(validate(3)).toEqual(false)
      expect(validate.errors).toEqual([
        expect.objectContaining({keyword: "format", params: {format: "even"}}),
      ])
    })

    it("should validate sync RegExp format", () => {
      const validate = ajv.compile({format: "lower"})
      expect(validate("abc")).toEqual(true)
      expect(validate("ABC")).toEqual(false)
    })

    it("should validate async format and keep the original Ajv error structure on failure", async () => {
      const validate = ajv.compile<Promise<unknown>>({$async: true, format: "available"})
      await expect(validate("free")).resolves.toEqual("free")
      const err = await validate("taken").then(
        () => {
          throw new Error("should have rejected")
        },
        (e) => e
      )
      expect(err).toBeInstanceOf(Ajv.ValidationError)
      expect(err.errors).toHaveLength(1)
      expect(err.errors[0].keyword).toEqual("format")
      expect(err.errors[0].params).toEqual({format: "available"})
      expect(err.errors[0].message).toEqual('must match format "available"')
    })
  })

  describe("sync/async contract enforcement", () => {
    it("should reject an async function declared with async: false at registration time", () => {
      expect(() =>
        registerFormats(ajv, {
          name: "bad",
          type: "string",
          async: false,
          validate: (async () => true) as never,
        })
      ).toThrow(FormatContractError)
      expect(() =>
        registerFormats(ajv, {
          name: "bad",
          type: "string",
          async: false,
          validate: (async () => true) as never,
        })
      ).toThrow(/declared sync.*returns a Promise/s)
      // nothing was published
      expect(ajv.formats.bad).toBeUndefined()
    })

    it("should throw a configuration error at validation time if a sync function returns a Promise (never truthy-passed)", () => {
      const lyingSync = (() => Promise.resolve(true)) as never
      registerFormats(ajv, {name: "lying", type: "string", async: false, validate: lyingSync})
      const validate = ajv.compile({format: "lying"})
      expect(() => validate("x")).toThrow(FormatContractError)
      expect(() => validate("x")).toThrow(/declared sync.*returned a Promise/s)
    })

    it("should never call the user validate function during registration or compilation", () => {
      let calls = 0
      registerFormats(ajv, {
        name: "counted",
        type: "string",
        async: false,
        validate: () => {
          calls++
          return true
        },
      })
      expect(calls).toEqual(0)
      ajv.compile({format: "counted"})
      expect(calls).toEqual(0)
    })

    it("should require async to be declared as a boolean", () => {
      expect(() =>
        registerFormats(ajv, {
          name: "x",
          type: "string",
          async: undefined as never,
          validate: () => true,
        })
      ).toThrow(FormatContractError)
    })
  })

  describe("type contract", () => {
    it("should reject unknown data types", () => {
      for (const type of ["boolean", "object", "integer", "nope"]) {
        expect(() =>
          registerFormats(ajv, {name: "t", type: type as never, async: false, validate: () => true})
        ).toThrow(
          new FormatContractError(
            `registerFormats: format "t": unknown type "${type}", must be "string" or "number"`
          )
        )
      }
      expect(ajv.formats.t).toBeUndefined()
    })

    it("should reject RegExp validate for non-string or async formats", () => {
      expect(() =>
        registerFormats(ajv, {name: "r", type: "number", async: false, validate: /x/ as never})
      ).toThrow(FormatContractError)
      expect(() =>
        registerFormats(ajv, {name: "r", type: "string", async: true, validate: /x/ as never})
      ).toThrow(FormatContractError)
    })
  })

  describe("same-name override requires explicit authorization", () => {
    it("should reject re-registration without override and allow it with override: true", () => {
      registerFormats(ajv, {name: "dup", type: "string", async: false, validate: () => true})
      expect(() =>
        registerFormats(ajv, {name: "dup", type: "string", async: false, validate: () => false})
      ).toThrow(/already registered.*override: true/s)
      registerFormats(ajv, {
        name: "dup",
        type: "string",
        async: false,
        validate: () => false,
        override: true,
      })
      expect(ajv.compile({format: "dup"})("x")).toEqual(false)
    })

    it("should reject overriding built-in formats without explicit authorization", () => {
      addFormats(ajv)
      expect(() =>
        registerFormats(ajv, {name: "date", type: "string", async: false, validate: () => true})
      ).toThrow(FormatContractError)
      registerFormats(ajv, {
        name: "date",
        type: "string",
        async: false,
        validate: () => true,
        override: true,
      })
      expect(ajv.compile({format: "date"})("not a date")).toEqual(true)
    })
  })

  describe("atomic registration: check everything, then publish", () => {
    it("should publish nothing if any definition in the batch is invalid", () => {
      expect(() =>
        registerFormats(ajv, [
          {name: "good1", type: "string", async: false, validate: () => true},
          {name: "bad", type: "unknown" as never, async: false, validate: () => true},
          {name: "good2", type: "number", async: false, validate: () => true},
        ])
      ).toThrow(FormatContractError)
      expect(ajv.formats.good1).toBeUndefined()
      expect(ajv.formats.good2).toBeUndefined()
      expect(() => ajv.compile({format: "good1"})).toThrow()
    })

    it("should reject duplicate names within the same batch", () => {
      expect(() =>
        registerFormats(ajv, [
          {name: "same", type: "string", async: false, validate: () => true},
          {name: "same", type: "string", async: false, validate: () => true},
        ])
      ).toThrow(/duplicate format "same"/)
      expect(ajv.formats.same).toBeUndefined()
    })

    it("should reject an empty batch", () => {
      expect(() => registerFormats(ajv, [])).toThrow(FormatContractError)
    })
  })

  describe("built-in formats stay default", () => {
    it("should not change the built-in formats added by the plugin", () => {
      addFormats(ajv)
      registerFormats(ajv, {name: "custom", type: "string", async: false, validate: () => true})
      const validateDate = ajv.compile({format: "date"})
      expect(validateDate("2020-09-17")).toEqual(true)
      expect(validateDate("2020-09-35")).toEqual(false)
      expect(ajv.compile({format: "custom"})("anything")).toEqual(true)
    })
  })
})
