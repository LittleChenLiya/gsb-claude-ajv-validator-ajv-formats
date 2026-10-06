import Ajv, {ValidationError} from "ajv"
import addFormats from "../dist"
import type {
  AsyncFormatContract,
  FormatContract,
  RegisterFormatOptions,
  SyncFormatContract,
} from "../dist"
import {FormatContractError, registerFormat, registerFormats} from "../dist/contract"

describe("format execution contract", () => {
  let ajv: Ajv

  beforeEach(() => {
    ajv = new Ajv({strictTypes: false})
  })

  describe("compile-time contract typing", () => {
    test("Promise-typed results cannot be declared sync (truthy trap)", () => {
      const badSync: SyncFormatContract = {
        type: "string",
        async: false,
        // @ts-expect-error a Promise<boolean> is always truthy and cannot be a sync result
        validate: (s: string) => Promise.resolve(s.length > 0),
      }
      const badAsync: AsyncFormatContract = {
        type: "string",
        async: true,
        // @ts-expect-error an async contract requires a Promise<boolean> result
        validate: (s: string) => s.length > 0,
      }
      const badType: SyncFormatContract = {
        // @ts-expect-error unknown data types are rejected
        type: "object",
        validate: () => true,
      }
      const okSync: SyncFormatContract<"string"> = {
        type: "string",
        async: false,
        validate: (s) => s.length > 0,
      }
      const okAsync: AsyncFormatContract<"string"> = {
        type: "string",
        async: true,
        validate: async (s) => s.length > 0,
      }
      const okNumber: SyncFormatContract<"number"> = {
        type: "number",
        validate: (n) => n % 2 === 0,
      }
      const contracts: FormatContract[] = [badSync, badAsync, okSync, okAsync, okNumber]
      expect(contracts).toHaveLength(5)
      expect(badType.type).toBe("object")
    })
  })

  describe("declared sync but returns a Promise", () => {
    test("native async function declared sync is a registration-time config error", () => {
      const asyncFn = async (s: string): Promise<boolean> => s.length > 0
      const contract = {
        type: "string",
        async: false,
        validate: asyncFn,
      } as unknown as FormatContract
      expect(() => registerFormat(ajv, "bad-sync", contract)).toThrow(FormatContractError)
      expect(() => registerFormat(ajv, "bad-sync", contract)).toThrow(/declared sync/)
      expect(ajv.formats["bad-sync"]).toBeUndefined()
    })

    test("Promise returned at validation time is an explicit config error, not truthy pass", () => {
      const lying = (s: string): unknown => Promise.resolve(s.length > 0)
      registerFormat(ajv, "lying", {
        type: "string",
        async: false,
        validate: lying as (s: string) => boolean,
      })
      const validate = ajv.compile({type: "string", format: "lying"})
      expect(() => validate("x")).toThrow(FormatContractError)
      expect(() => validate("x")).toThrow(/declared sync.*returned a Promise/)
    })
  })

  describe("sync formats (async: false)", () => {
    test("fail validation correctly with the standard format error", () => {
      registerFormat(ajv, "even-length", {
        type: "string",
        async: false,
        validate: (s) => s.length % 2 === 0,
      })
      const validate = ajv.compile({type: "string", format: "even-length"})
      expect(validate("ab")).toBe(true)
      expect(validate("abc")).toBe(false)
      expect(validate.errors).toHaveLength(1)
      expect(validate.errors?.[0]).toMatchObject({
        keyword: "format",
        instancePath: "",
        schemaPath: "#/format",
        params: {format: "even-length"},
        message: 'must match format "even-length"',
      })
    })

    test("number type contract applies to numbers only", () => {
      registerFormat(ajv, "even", {
        type: "number",
        async: false,
        validate: (n) => n % 2 === 0,
      })
      const validate = ajv.compile({type: "number", format: "even"})
      expect(validate(2)).toBe(true)
      expect(validate(3)).toBe(false)
    })
  })

  describe("async formats (async: true)", () => {
    test("failures follow the original Ajv error structure", async () => {
      registerFormat(ajv, "async-word", {
        type: "string",
        async: true,
        validate: async (s) => s === "ok",
      })
      const validate = ajv.compile<unknown>({$async: true, type: "string", format: "async-word"})
      await expect(validate("ok")).resolves.toBe("ok")
      try {
        await validate("nope")
        throw new Error("expected validation to reject")
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError)
        const errors = (err as ValidationError).errors
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({
          keyword: "format",
          instancePath: "",
          schemaPath: "#/format",
          params: {format: "async-word"},
          message: 'must match format "async-word"',
        })
      }
    })

    test("async format in a sync schema keeps the native Ajv failure", () => {
      registerFormat(ajv, "async-only", {
        type: "string",
        async: true,
        validate: async () => true,
      })
      expect(() => ajv.compile({type: "string", format: "async-only"})).toThrow(/async format/)
    })
  })

  describe("user validate is never executed to infer the contract", () => {
    test("call count stays 0 through registration and schema compilation", () => {
      let calls = 0
      registerFormat(ajv, "counted", {
        type: "string",
        async: false,
        validate: (s) => {
          calls++
          return s.length > 0
        },
      })
      const validate = ajv.compile({type: "string", format: "counted"})
      expect(calls).toBe(0)
      expect(validate("x")).toBe(true)
      expect(calls).toBe(1)
    })
  })

  describe("contract validation", () => {
    test("unknown type is rejected", () => {
      const contract = {
        type: "object",
        async: false,
        validate: () => true,
      } as unknown as FormatContract
      expect(() => registerFormat(ajv, "weird", contract)).toThrow(FormatContractError)
      expect(() => registerFormat(ajv, "weird", contract)).toThrow(/unknown type "object"/)
      expect(ajv.formats.weird).toBeUndefined()
    })

    test("validate must be an explicit function", () => {
      const contract = {
        type: "string",
        async: false,
        validate: /x/,
      } as unknown as FormatContract
      expect(() => registerFormat(ajv, "rx", contract)).toThrow(/validate function/)
    })

    test("async flag must be boolean", () => {
      const contract = {
        type: "string",
        async: "yes",
        validate: () => true,
      } as unknown as FormatContract
      expect(() => registerFormat(ajv, "flag", contract)).toThrow(
        /async flag must be true or false/
      )
    })
  })

  describe("same-name override requires explicit authorization", () => {
    test("re-registering a custom format without override fails and keeps the original", () => {
      registerFormat(ajv, "word", {type: "string", async: false, validate: (s) => s.length > 0})
      expect(() =>
        registerFormat(ajv, "word", {type: "string", async: false, validate: (s) => s.length > 3})
      ).toThrow(/already registered/)
      const validate = ajv.compile({type: "string", format: "word"})
      expect(validate("ab")).toBe(true)
    })

    test("override: true explicitly authorizes the replacement", () => {
      registerFormat(ajv, "word", {type: "string", async: false, validate: (s) => s.length > 0})
      const opts: RegisterFormatOptions = {override: true}
      registerFormat(
        ajv,
        "word",
        {type: "string", async: false, validate: (s) => s.length > 3},
        opts
      )
      const validate = ajv.compile({type: "string", format: "word"})
      expect(validate("ab")).toBe(false)
      expect(validate("abcd")).toBe(true)
    })

    test("built-in formats are protected by default and stay intact", () => {
      addFormats(ajv)
      expect(() =>
        registerFormat(ajv, "date", {type: "string", async: false, validate: () => true})
      ).toThrow(FormatContractError)
      const validate = ajv.compile({format: "date"})
      expect(validate("2020-09-17")).toBe(true)
      expect(validate("2020-09-35")).toBe(false)
    })
  })

  describe("atomic batch registration", () => {
    test("checks everything before publishing anything", () => {
      const contracts = {
        "atomic-good": {type: "string", async: false, validate: () => true},
        "atomic-bad": {type: "object", async: false, validate: () => true},
      } as unknown as Record<string, FormatContract>
      expect(() => registerFormats(ajv, contracts)).toThrow(FormatContractError)
      expect(ajv.formats["atomic-good"]).toBeUndefined()
      expect(ajv.formats["atomic-bad"]).toBeUndefined()
    })

    test("a name conflict anywhere blocks the whole batch", () => {
      registerFormat(ajv, "taken", {type: "string", async: false, validate: () => true})
      expect(() =>
        registerFormats(ajv, {
          fresh: {type: "string", async: false, validate: () => true},
          taken: {type: "string", async: false, validate: () => false},
        })
      ).toThrow(/already registered/)
      expect(ajv.formats.fresh).toBeUndefined()
    })

    test("a valid batch publishes all formats", () => {
      registerFormats(ajv, {
        "batch-a": {type: "string", async: false, validate: (s) => s.startsWith("a")},
        "batch-b": {type: "number", async: false, validate: (n) => n > 0},
      })
      expect(ajv.formats["batch-a"]).toBeDefined()
      expect(ajv.formats["batch-b"]).toBeDefined()
      const va = ajv.compile({type: "string", format: "batch-a"})
      expect(va("abc")).toBe(true)
      expect(va("xbc")).toBe(false)
    })
  })

  describe("plugin surface", () => {
    test("contract API is exposed on the plugin and built-in defaults are kept", () => {
      expect(addFormats.registerFormat).toBe(registerFormat)
      expect(addFormats.registerFormats).toBe(registerFormats)
      expect(addFormats.FormatContractError).toBe(FormatContractError)
      addFormats(ajv)
      addFormats.registerFormat(ajv, "via-plugin", {
        type: "string",
        async: false,
        validate: (s) => s.length > 0,
      })
      const validate = ajv.compile({type: "string", format: "via-plugin"})
      expect(validate("x")).toBe(true)
      expect(validate("")).toBe(false)
      const validateDate = ajv.compile({format: "date"})
      expect(validateDate("2020-09-17")).toBe(true)
    })
  })
})
