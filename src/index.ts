import {
  DefinedFormats,
  FormatMode,
  FormatName,
  formatNames,
  fastFormats,
  fullFormats,
} from "./formats"
import formatLimit from "./limit"
import type Ajv from "ajv"
import type {Plugin, Format} from "ajv"
import type {AddedFormat} from "ajv/dist/types"
import {_, Name} from "ajv/dist/compile/codegen"

export {FormatMode, FormatName} from "./formats"
export {LimitFormatError} from "./limit"
export interface FormatOptions {
  mode?: FormatMode
  formats?: FormatName[]
  keywords?: boolean
  /** when `true`, the plugin returns a FormatsUndoHandle instead of the Ajv instance */
  undo?: boolean
}

export type FormatsPluginOptions = FormatName[] | FormatOptions

/**
 * Handle returned when the plugin is called with `{undo: true}`.
 * `undo()` restores only the formats that this registration replaced:
 * a format is reverted (or removed, if it was not defined before) only when
 * it still holds the exact definition installed by this registration, so
 * formats registered later by other callers are never deleted or overwritten.
 * Calling `undo()` multiple times on the same Ajv instance is safe and
 * does not affect any other Ajv instance.
 */
export interface FormatsUndoHandle {
  /** the Ajv instance the formats were registered on */
  ajv: Ajv
  /** restore the formats replaced by this registration; idempotent */
  undo: () => void
}

export interface FormatsPlugin extends Plugin<FormatsPluginOptions> {
  (ajv: Ajv, opts: FormatOptions & {undo: true}): FormatsUndoHandle
  get: (format: FormatName, mode?: FormatMode) => Format
}

interface ReplacedFormat {
  name: string
  prev: AddedFormat | undefined
  curr: Format
}

const fullName = new Name("fullFormats")
const fastName = new Name("fastFormats")

const formatsPlugin: FormatsPlugin = ((
  ajv: Ajv,
  opts: FormatsPluginOptions = {keywords: true}
): Ajv | FormatsUndoHandle => {
  if (Array.isArray(opts)) {
    addFormats(ajv, opts, fullFormats, fullName)
    return ajv
  }
  const [formats, exportName] =
    opts.mode === "fast" ? [fastFormats, fastName] : [fullFormats, fullName]
  const list = opts.formats || formatNames
  const replaced: ReplacedFormat[] | undefined = opts.undo ? [] : undefined
  addFormats(ajv, list, formats, exportName, replaced)
  if (opts.keywords) formatLimit(ajv)
  return replaced ? {ajv, undo: () => restoreFormats(ajv, replaced)} : ajv
}) as FormatsPlugin

formatsPlugin.get = (name: FormatName, mode: FormatMode = "full"): Format => {
  const formats = mode === "fast" ? fastFormats : fullFormats
  const f = formats[name]
  if (!f) throw new Error(`Unknown format "${name}"`)
  return f
}

function addFormats(
  ajv: Ajv,
  list: FormatName[],
  fs: DefinedFormats,
  exportName: Name,
  replaced?: ReplacedFormat[]
): void {
  ajv.opts.code.formats ??= _`require("ajv-formats/dist/formats").${exportName}`
  for (const f of list) {
    if (replaced) {
      replaced.push({name: f, prev: ajv.formats[f], curr: fs[f]})
      // make this registration take effect for schemas compiled from now on,
      // even if a previous definition of this format was already compiled
      evictScopeValue(ajv, f)
    }
    ajv.addFormat(f, fs[f])
  }
}

function restoreFormats(ajv: Ajv, replaced: ReplacedFormat[]): void {
  for (const {name, prev, curr} of replaced) {
    // only revert formats that still hold the definition installed by this
    // registration - later registrations by other callers are left untouched
    if (ajv.formats[name] === curr) {
      if (prev === undefined) delete ajv.formats[name]
      else ajv.formats[name] = prev
      evictScopeValue(ajv, name)
    }
  }
}

// Ajv caches compiled format references in its shared value scope keyed by
// format name; evict the cached reference of a restored format so that schemas
// compiled after `undo()` use the restored definition (validators compiled
// before `undo()` are intentionally unaffected).
function evictScopeValue(ajv: Ajv, name: string): void {
  const values = (
    ajv.scope as unknown as {_values?: {[prefix: string]: Map<unknown, unknown> | undefined}}
  )._values
  const formats = values?.formats
  if (formats) formats.delete(name)
}

module.exports = exports = formatsPlugin
Object.defineProperty(exports, "__esModule", {value: true})

export default formatsPlugin
