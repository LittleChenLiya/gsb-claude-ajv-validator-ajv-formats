import type Ajv from "ajv"
import type {AddedFormat, FormatCompare, FormatValidator} from "ajv/dist/types"

/** Data types a contracted format can apply to */
export type FormatDataType = "string" | "number"

type DataOf<T extends FormatDataType> = T extends "string" ? string : number

/**
 * Explicit execution contract for a synchronous format.
 * `validate` must return a boolean - a Promise<boolean> is always truthy and
 * therefore rejected both at compile time (by this type) and at runtime.
 */
export interface SyncFormatContract<T extends FormatDataType = FormatDataType> {
  type: T
  async?: false
  validate: (data: DataOf<T>) => boolean
  compare?: FormatCompare<DataOf<T>>
}

/** Explicit execution contract for an asynchronous format */
export interface AsyncFormatContract<T extends FormatDataType = FormatDataType> {
  type: T
  async: true
  validate: (data: DataOf<T>) => Promise<boolean>
  compare?: FormatCompare<DataOf<T>>
}

export type FormatContract<T extends FormatDataType = FormatDataType> = T extends unknown
  ? SyncFormatContract<T> | AsyncFormatContract<T>
  : never

export interface RegisterFormatOptions {
  /** explicit authorization to replace an already registered (e.g. built-in) format */
  override?: boolean
}

/** Configuration error thrown when a format contract is violated */
export class FormatContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FormatContractError"
    Object.setPrototypeOf(this, FormatContractError.prototype)
  }
}

const DATA_TYPES: readonly string[] = ["string", "number"]

type AnyValidate = (data: never) => unknown

function isThenable(x: unknown): x is PromiseLike<unknown> {
  return (
    x !== null &&
    (typeof x === "object" || typeof x === "function") &&
    typeof (x as {then?: unknown}).then === "function"
  )
}

// detects native async functions without calling them (user formats are never
// executed to infer their type)
function isAsyncFunction(fn: AnyValidate): boolean {
  return (
    (fn as unknown as {[Symbol.toStringTag]?: unknown})[Symbol.toStringTag] === "AsyncFunction" ||
    fn.constructor.name === "AsyncFunction"
  )
}

function checkContract(name: string, contract: FormatContract): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new FormatContractError(
      `format name must be a non-empty string, got ${JSON.stringify(name)}`
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for untyped callers
  if (contract === null || typeof contract !== "object") {
    throw new FormatContractError(
      `format "${name}": contract must be an object declaring type, async and validate`
    )
  }
  const {type, validate} = contract
  const isAsync: unknown = contract.async
  if (!DATA_TYPES.includes(type)) {
    throw new FormatContractError(
      `format "${name}": unknown type ${JSON.stringify(type)}, must be "string" or "number"`
    )
  }
  if (isAsync !== undefined && isAsync !== true && isAsync !== false) {
    throw new FormatContractError(
      `format "${name}": async flag must be true or false, got ${JSON.stringify(isAsync)}`
    )
  }
  if (typeof validate !== "function") {
    throw new FormatContractError(
      `format "${name}": contract requires an explicit validate function`
    )
  }
  if (isAsync !== true && isAsyncFunction(validate as AnyValidate)) {
    throw new FormatContractError(
      `format "${name}": declared sync but validate is an async function; ` +
        `declare async: true or return a boolean`
    )
  }
}

// wraps a sync validate so a Promise result surfaces as an explicit
// configuration error instead of being silently treated as truthy
function guardSync(
  name: string,
  validate: FormatValidator<string> | FormatValidator<number>
): (data: string | number) => boolean {
  return (data: string | number): boolean => {
    const result: unknown = validate(data as never)
    if (isThenable(result)) {
      throw new FormatContractError(
        `format "${name}": declared sync (async: false) but validate returned a Promise; ` +
          `a Promise is always truthy and cannot pass as a sync result - declare async: true`
      )
    }
    return result as boolean
  }
}

function toAjvFormat(name: string, contract: FormatContract): AddedFormat {
  if (contract.async === true) {
    return contract.type === "number"
      ? {type: "number", async: true, validate: contract.validate, compare: contract.compare}
      : {type: "string", async: true, validate: contract.validate, compare: contract.compare}
  }
  const validate = guardSync(name, contract.validate)
  return contract.type === "number"
    ? {type: "number", validate, compare: contract.compare}
    : {type: "string", validate, compare: contract.compare}
}

/**
 * Registers one format under an explicit execution contract.
 * The user validate function is never called during registration or schema
 * compilation - the declared contract is trusted and enforced, not inferred.
 *
 * @param {Ajv} ajv the Ajv instance to register the format on
 * @param {string} name the format name used in schemas
 * @param {FormatContract} contract the explicit execution contract (type, sync/async, validate)
 * @param {RegisterFormatOptions} opts registration options, e.g. explicit override authorization
 */
export function registerFormat(
  ajv: Ajv,
  name: string,
  contract: FormatContract,
  opts: RegisterFormatOptions = {}
): void {
  registerFormats(ajv, {[name]: contract}, opts)
}

/**
 * Registers several formats atomically: every contract and name is checked
 * first, and only then is anything published to the Ajv instance. If any
 * contract is invalid or conflicts, nothing is registered.
 *
 * @param {Ajv} ajv the Ajv instance to register the formats on
 * @param {Record<string, FormatContract>} contracts map of format name to its explicit execution contract
 * @param {RegisterFormatOptions} opts registration options, e.g. explicit override authorization
 */
export function registerFormats(
  ajv: Ajv,
  contracts: Record<string, FormatContract>,
  opts: RegisterFormatOptions = {}
): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for untyped callers
  if (contracts === null || typeof contracts !== "object") {
    throw new FormatContractError("contracts must be a map of format name to contract")
  }
  const entries = Object.entries(contracts)
  // phase 1: check everything, publish nothing
  for (const [name, contract] of entries) {
    checkContract(name, contract)
    if (opts.override !== true && ajv.formats[name] !== undefined) {
      throw new FormatContractError(
        `format "${name}" is already registered; pass {override: true} to replace it explicitly`
      )
    }
  }
  // phase 2: publish
  for (const [name, contract] of entries) {
    ajv.addFormat(name, toAjvFormat(name, contract))
  }
}
