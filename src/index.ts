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
  undoable?: boolean
}

export interface UndoableFormatOptions extends FormatOptions {
  undoable: true
}

export type FormatsPluginOptions = FormatName[] | FormatOptions

// Undo handle returned when the plugin is called with {undoable: true}.
// Calling it restores, per Ajv instance, only the formats that this
// registration actually replaced (or removes formats it added).
// Formats (re-)registered later by other callers are never touched.
// Calling the same handle more than once is safe (a no-op after the 1st call).
export type FormatUndo = () => void

export interface FormatsPlugin extends Plugin<FormatsPluginOptions> {
  (ajv: Ajv, opts: UndoableFormatOptions): FormatUndo
  get: (format: FormatName, mode?: FormatMode) => Format
}

const fullName = new Name("fullFormats")
const fastName = new Name("fastFormats")

const formatsPlugin = ((
  ajv: Ajv,
  opts: FormatsPluginOptions = {keywords: true}
): Ajv | FormatUndo => {
  if (Array.isArray(opts)) {
    addFormats(ajv, opts, fullFormats, fullName)
    return ajv
  }
  const [formats, exportName] =
    opts.mode === "fast" ? [fastFormats, fastName] : [fullFormats, fullName]
  const list = opts.formats || formatNames
  const undo = opts.undoable ? addFormatsUndoable(ajv, list, formats, exportName) : undefined
  if (!undo) addFormats(ajv, list, formats, exportName)
  if (opts.keywords) formatLimit(ajv)
  return undo || ajv
}) as FormatsPlugin

formatsPlugin.get = (name: FormatName, mode: FormatMode = "full"): Format => {
  const formats = mode === "fast" ? fastFormats : fullFormats
  const f = formats[name]
  if (!f) throw new Error(`Unknown format "${name}"`)
  return f
}

function addFormats(ajv: Ajv, list: FormatName[], fs: DefinedFormats, exportName: Name): void {
  ajv.opts.code.formats ??= _`require("ajv-formats/dist/formats").${exportName}`
  for (const f of list) ajv.addFormat(f, fs[f])
}

// Registers formats and returns an undo handle bound to this Ajv instance.
// The handle restores only the registrations made by this call:
// - a format that existed before is restored to its previous definition,
// - a format added by this call is removed,
// - a format that was re-registered afterwards by another caller is kept as is.
// The handle is idempotent: calling it again after a successful undo is a no-op.
function addFormatsUndoable(
  ajv: Ajv,
  list: FormatName[],
  fs: DefinedFormats,
  exportName: Name
): FormatUndo {
  ajv.opts.code.formats ??= _`require("ajv-formats/dist/formats").${exportName}`
  const previous: [FormatName, AddedFormat | undefined][] = list.map((f) => [f, ajv.formats[f]])
  for (const f of list) {
    ajv.addFormat(f, fs[f])
    evictCompiledFormat(ajv, f)
  }
  return () => {
    for (const [name, prev] of previous) {
      // restore only if the current definition is still the one set by this call;
      // a format re-registered later by another caller is left in the registry
      if (ajv.formats[name] === fs[name]) {
        if (prev === undefined) delete ajv.formats[name]
        else ajv.formats[name] = prev
      }
      // drop the stale compile-time cache entry either way, so schemas compiled
      // after the undo use the definition currently in the registry
      evictCompiledFormat(ajv, name)
    }
  }
}

// Ajv caches the format definition in its value scope (keyed by format name)
// when a schema using it is compiled for the first time, and reuses that
// definition for all later compilations in the same instance. Evict the
// cached entry so schemas compiled after a registration/undo pick up the
// current definition. Already compiled validators are not affected.
function evictCompiledFormat(ajv: Ajv, name: FormatName): void {
  const {_values} = ajv.scope as unknown as {
    _values?: {[prefix: string]: Map<unknown, unknown> | undefined}
  }
  const formats = _values && _values.formats
  if (formats) formats.delete(name)
}

module.exports = exports = formatsPlugin
Object.defineProperty(exports, "__esModule", {value: true})

export default formatsPlugin
