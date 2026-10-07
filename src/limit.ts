import type Ajv from "ajv"
import type {
  Plugin,
  CodeKeywordDefinition,
  KeywordErrorDefinition,
  Code,
  Name,
  ErrorObject,
} from "ajv"
import type {AddedFormat} from "ajv/dist/types"
import type {Rule} from "ajv/dist/compile/rules"
import {KeywordCxt} from "ajv"
import {_, str, or, and, getProperty, operators} from "ajv/dist/compile/codegen"

type Kwd = "formatMaximum" | "formatMinimum" | "formatExclusiveMaximum" | "formatExclusiveMinimum"

type Comparison = "<=" | ">=" | "<" | ">"

const ops = operators

const KWDs: {[K in Kwd]: {okStr: Comparison; ok: Code; fail: Code}} = {
  formatMaximum: {okStr: "<=", ok: ops.LTE, fail: ops.GT},
  formatMinimum: {okStr: ">=", ok: ops.GTE, fail: ops.LT},
  formatExclusiveMaximum: {okStr: "<", ok: ops.LT, fail: ops.GTE},
  formatExclusiveMinimum: {okStr: ">", ok: ops.GT, fail: ops.LTE},
}

export type LimitFormatError = ErrorObject<Kwd, {limit: string; comparison: Comparison}>

export interface FormatLimitOptions {
  // when true, the format "compare" function is called only after the value
  // passes the format validation; an invalid value reports a "format" error
  // (emitted by the "format" keyword) instead of a range error.
  // false (default) preserves the previous, lenient behavior.
  strict?: boolean
}

const error: KeywordErrorDefinition = {
  message: ({keyword, schemaCode}) => str`should be ${KWDs[keyword as Kwd].okStr} ${schemaCode}`,
  params: ({keyword, schemaCode}) =>
    _`{comparison: ${KWDs[keyword as Kwd].okStr}, limit: ${schemaCode}}`,
}

export function formatLimitDefinition(strict = false): CodeKeywordDefinition {
  return {
    keyword: Object.keys(KWDs),
    type: "string",
    schemaType: "string",
    $data: true,
    error,
    code(cxt) {
      const {gen, data, schemaCode, keyword, it} = cxt
      const {opts, self} = it
      if (!opts.validateFormats) return

      const fCxt = new KeywordCxt(it, (self.RULES.all.format as Rule).definition, "format")
      if (fCxt.$data) validate$DataFormat()
      else validateFormat()

      function validate$DataFormat(): void {
        const fmts = gen.scopeValue("formats", {
          ref: self.formats,
          code: opts.code.formats,
        })
        const fmt = gen.const("fmt", _`${fmts}[${fCxt.schemaCode}]`)
        // strict: the range error is reported only when the value passes the
        // format validation; short-circuit evaluation also guarantees zero
        // "compare" calls for invalid values (which get a "format" error instead)
        const failCompare = strict
          ? and(hasValidate(fmt), validFormat(fmt), compareCode(fmt))
          : compareCode(fmt)
        cxt.fail$data(
          or(
            _`typeof ${fmt} != "object"`,
            _`${fmt} instanceof RegExp`,
            _`typeof ${fmt}.compare != "function"`,
            failCompare
          )
        )
      }

      function validateFormat(): void {
        const format = fCxt.schema as string
        const fmtDef: AddedFormat | undefined = self.formats[format]
        if (!fmtDef || fmtDef === true) return
        if (
          typeof fmtDef != "object" ||
          fmtDef instanceof RegExp ||
          typeof fmtDef.compare != "function"
        ) {
          throw new Error(`"${keyword}": format "${format}" does not define "compare" function`)
        }
        const fmt = gen.scopeValue("formats", {
          key: format,
          ref: fmtDef,
          code: opts.code.formats ? _`${opts.code.formats}${getProperty(format)}` : undefined,
        })

        if (strict && validateCode(fmtDef)) {
          // the range error is reported only for values passing the format
          // validation; invalid values skip "compare" and get a "format" error
          cxt.fail$data(and(validFormat(fmt, fmtDef), compareCode(fmt)))
        } else {
          cxt.fail$data(compareCode(fmt))
        }
      }

      // the resolved $data format provides a usable "validate"
      function hasValidate(fmt: Name): Code {
        return and(
          _`!!${fmt}.validate`,
          or(_`typeof ${fmt}.validate == "function"`, _`${fmt}.validate instanceof RegExp`)
        )
      }

      // whether the value passes format validation
      function validFormat(fmt: Name): Code
      function validFormat(fmt: Name, fmtDef: AddedFormat): Code
      function validFormat(fmt: Name, fmtDef?: AddedFormat): Code {
        const useTest =
          fmtDef !== undefined &&
          typeof fmtDef == "object" &&
          !(fmtDef instanceof RegExp) &&
          fmtDef.validate instanceof RegExp
        if (useTest) return _`${fmt}.validate.test(${data})`
        return _`typeof ${fmt}.validate == "function" ? ${fmt}.validate(${data}) : ${fmt}.validate.test(${data})`
      }

      function compareCode(fmt: Name): Code {
        return _`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword as Kwd].fail} 0`
      }
    },
    dependencies: ["format"],
  }
}

function validateCode(fmtDef: AddedFormat): boolean {
  return (
    typeof fmtDef == "object" &&
    !(fmtDef instanceof RegExp) &&
    (typeof fmtDef.validate == "function" || fmtDef.validate instanceof RegExp)
  )
}

const formatLimitPlugin: Plugin<FormatLimitOptions> = (
  ajv: Ajv,
  opts: FormatLimitOptions = {}
): Ajv => {
  ajv.addKeyword(formatLimitDefinition(opts.strict))
  return ajv
}

export default formatLimitPlugin
