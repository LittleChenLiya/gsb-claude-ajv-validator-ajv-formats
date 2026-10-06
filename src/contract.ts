import type Ajv from "ajv"
import type {Format} from "ajv"
import type {FormatValidator, FormatCompare, AsyncFormatValidator} from "ajv/dist/types"

/**
 * Data types the Ajv `format` keyword can be applied to.
 * Any other type is rejected as unknown.
 */
export type FormatDataType = "string" | "number"

interface ExplicitFormatBase {
  /** format name used in schemas */
  name: string
  /** explicit authorization to replace an already registered format with the same name */
  override?: boolean
}

/** Sync string format: `validate` is a function returning `boolean` or a `RegExp`. */
export interface SyncStringFormatDefinition extends ExplicitFormatBase {
  type: "string"
  async: false
  validate: FormatValidator<string> | RegExp
  compare?: FormatCompare<string>
}

/** Sync number format: `validate` is a function returning `boolean`. */
export interface SyncNumberFormatDefinition extends ExplicitFormatBase {
  type: "number"
  async: false
  validate: FormatValidator<number>
  compare?: FormatCompare<number>
}

/** Async string format: `validate` returns `Promise<boolean>`; failures keep the standard Ajv error structure. */
export interface AsyncStringFormatDefinition extends ExplicitFormatBase {
  type: "string"
  async: true
  validate: AsyncFormatValidator<string>
  compare?: never
}

/** Async number format: `validate` returns `Promise<boolean>`; failures keep the standard Ajv error structure. */
export interface AsyncNumberFormatDefinition extends ExplicitFormatBase {
  type: "number"
  async: true
  validate: AsyncFormatValidator<number>
  compare?: never
}

/**
 * Explicit execution contract for a user-defined format.
 *
 * The contract is fully declared up front - it is never inferred by running
 * the user-supplied `validate` function:
 *
 * - `type` declares the data type the format applies to ("string" or "number").
 * - `async` declares the execution mode:
 *   - `false` - `validate` is a synchronous function returning `boolean`
 *     (or a `RegExp` for string formats). Returning a Promise is a
 *     configuration error: a Promise is always truthy and must never be
 *     used as a sync validation result.
 *   - `true` - `validate` is an async function returning `Promise<boolean>`;
 *     failures are reported via the standard Ajv error structure
 *     (rejected `ValidationError` with `errors` items using keyword "format").
 * - `override` explicitly authorizes replacing an already registered
 *   format with the same name (including the built-in formats).
 */
export type ExplicitFormatDefinition =
  | SyncStringFormatDefinition
  | SyncNumberFormatDefinition
  | AsyncStringFormatDefinition
  | AsyncNumberFormatDefinition

/** Error thrown when a format definition violates the explicit execution contract. */
export class FormatContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FormatContractError"
    Object.setPrototypeOf(this, FormatContractError.prototype)
  }
}

const DATA_TYPES: FormatDataType[] = ["string", "number"]

function isAsyncFunction(fn: unknown): boolean {
  return typeof fn === "function" && fn.constructor.name === "AsyncFunction"
}

function isThenable(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as {then?: unknown}).then === "function"
  )
}

function contractError(message: string): FormatContractError {
  return new FormatContractError(`registerFormats: ${message}`)
}

// Phase 1: check one definition without touching the ajv instance.
// The user-supplied validate function is never called here - the contract
// is verified statically (declared flags + function kind), not by running it.
function checkDefinition(ajv: Ajv, def: ExplicitFormatDefinition, seen: Set<string>): void {
  const {name, type, validate} = def
  if (typeof name !== "string" || name.length === 0) {
    throw contractError("format name must be a non-empty string")
  }
  if (seen.has(name)) {
    throw contractError(`duplicate format "${name}" in the same registration batch`)
  }
  seen.add(name)
  if (!DATA_TYPES.includes(type)) {
    const unknownType: unknown = type
    throw contractError(
      `format "${name}": unknown type "${String(unknownType)}", must be ${DATA_TYPES.map(
        (t) => `"${t}"`
      ).join(" or ")}`
    )
  }
  if (typeof def.async !== "boolean") {
    throw contractError(`format "${name}": "async" must be explicitly declared as true or false`)
  }
  if (!(validate instanceof RegExp) && typeof validate !== "function") {
    throw contractError(`format "${name}": "validate" must be a function or a RegExp`)
  }
  if (validate instanceof RegExp && (type !== "string" || def.async)) {
    throw contractError(
      `format "${name}": RegExp "validate" is only allowed for sync string formats`
    )
  }
  if (def.async === false && isAsyncFunction(validate)) {
    throw contractError(
      `format "${name}" is declared sync (async: false) but its validate function returns a Promise; ` +
        `a Promise is always truthy and cannot be a sync validation result - declare it with async: true`
    )
  }
  if (ajv.formats[name] !== undefined && def.override !== true) {
    throw contractError(
      `format "${name}" is already registered; pass "override: true" to explicitly replace it`
    )
  }
}

// Phase 2: convert a checked definition to an Ajv format.
function toAjvFormat(def: ExplicitFormatDefinition): Format {
  const {name, type, async: isAsync, validate, compare} = def
  if (isAsync) {
    // async failures keep the original Ajv error structure (keyword "format")
    return {type, async: true, validate: validate as AsyncFormatValidator<string>} as Format
  }
  if (validate instanceof RegExp) return {type, validate} as Format
  const syncValidate = validate as FormatValidator<string | number>
  const guarded = (data: string | number): boolean => {
    const result: unknown = syncValidate(data)
    if (isThenable(result)) {
      throw contractError(
        `format "${name}" is declared sync (async: false) but its validate function returned a Promise; ` +
          `a Promise is always truthy and cannot be a sync validation result - declare it with async: true`
      )
    }
    return !!result
  }
  return (
    compare === undefined
      ? {type, validate: guarded}
      : {type, validate: guarded, compare: compare as FormatCompare<string>}
  ) as Format
}

/**
 * Register user-defined formats under an explicit execution contract.
 *
 * Registration is atomic: ALL definitions are checked first and only then
 * published to the ajv instance - if any definition is invalid, nothing is
 * registered. The user-supplied validate functions are never called during
 * registration or schema compilation.
 *
 * Accepts a single explicit format definition or a non-empty list of them.
 *
 * @param {Ajv} ajv Ajv instance the formats are registered on
 * @param {ExplicitFormatDefinition | ExplicitFormatDefinition[]} defs format definition(s) to check and publish
 * @returns {Ajv} the same Ajv instance
 */
export function registerFormats(
  ajv: Ajv,
  defs: ExplicitFormatDefinition | ExplicitFormatDefinition[]
): Ajv {
  const list: unknown[] = Array.isArray(defs) ? defs : [defs]
  if (list.length === 0) {
    throw contractError("at least one format definition is required")
  }
  // check everything before publishing anything
  const seen = new Set<string>()
  for (const def of list) {
    if (!def || typeof def !== "object") {
      throw contractError("format definition must be an object")
    }
    checkDefinition(ajv, def as ExplicitFormatDefinition, seen)
  }
  for (const def of list) {
    const checked = def as ExplicitFormatDefinition
    ajv.addFormat(checked.name, toAjvFormat(checked))
  }
  return ajv
}
