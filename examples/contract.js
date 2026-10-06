"use strict"
// Example: explicit format execution contracts (sync/async + applicable type).
// Run locally with: npm run example:contract
const assert = require("assert")
const Ajv = require("ajv").default
const addFormats = require("../dist")
const {FormatContractError} = require("../dist/contract")

async function main() {
  const ajv = new Ajv({strictTypes: false})
  addFormats(ajv) // built-in formats keep working by default

  const takenNames = new Set(["root", "admin"])

  // Three contracted formats, checked first and published atomically:
  addFormats.registerFormats(ajv, {
    // 1. sync string format
    slug: {
      type: "string",
      async: false,
      validate: (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s),
    },
    // 2. sync number format
    even: {
      type: "number",
      async: false,
      validate: (n) => n % 2 === 0,
    },
    // 3. async string format
    "free-name": {
      type: "string",
      async: true,
      validate: async (s) => !takenNames.has(s),
    },
  })

  // sync formats
  const validateSlug = ajv.compile({type: "string", format: "slug"})
  assert.strictEqual(validateSlug("hello-world"), true)
  assert.strictEqual(validateSlug("Hello World"), false)
  assert.strictEqual(validateSlug.errors[0].keyword, "format")
  assert.deepStrictEqual(validateSlug.errors[0].params, {format: "slug"})

  const validateEven = ajv.compile({type: "number", format: "even"})
  assert.strictEqual(validateEven(2), true)
  assert.strictEqual(validateEven(3), false)

  // async format: failures keep the original Ajv error structure
  const validateName = ajv.compile({$async: true, type: "string", format: "free-name"})
  assert.strictEqual(await validateName("alice"), "alice")
  const err = await validateName("root").then(
    () => {
      throw new Error("expected rejection")
    },
    (e) => e
  )
  assert.strictEqual(err.errors[0].keyword, "format")
  assert.deepStrictEqual(err.errors[0].params, {format: "free-name"})
  assert.strictEqual(err.errors[0].message, 'must match format "free-name"')

  // declared sync but returns a Promise -> explicit configuration error
  addFormats.registerFormat(ajv, "lying", {
    type: "string",
    async: false,
    validate: (s) => Promise.resolve(s.length > 0), // not an async fn: slips past registration
  })
  const validateLying = ajv.compile({type: "string", format: "lying"})
  assert.throws(() => validateLying("x"), FormatContractError)

  // same-name override needs explicit authorization
  assert.throws(
    () =>
      addFormats.registerFormat(ajv, "slug", {
        type: "string",
        async: false,
        validate: () => true,
      }),
    /already registered/
  )
  addFormats.registerFormat(
    ajv,
    "slug",
    {type: "string", async: false, validate: (s) => s.length > 0},
    {override: true}
  )

  // built-in formats are untouched
  const validateDate = ajv.compile({format: "date"})
  assert.strictEqual(validateDate("2020-09-17"), true)
  assert.strictEqual(validateDate("2020-09-35"), false)

  console.log("contract example OK: 3 formats (sync string, sync number, async string)")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
