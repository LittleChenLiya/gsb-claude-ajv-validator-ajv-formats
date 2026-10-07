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
import {_, str, or, not, getProperty, operators} from "ajv/dist/compile/codegen"

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
  // strict mode: check the "format" keyword first and only compare valid values;
  // invalid values report a format error (and are never passed to "compare").
  // Default (false/undefined) keeps the original behaviour.
  strict?: boolean
}

const error: KeywordErrorDefinition = {
  message: ({keyword, schemaCode}) => str`should be ${KWDs[keyword as Kwd].okStr} ${schemaCode}`,
  params: ({keyword, schemaCode}) =>
    _`{comparison: ${KWDs[keyword as Kwd].okStr}, limit: ${schemaCode}}`,
}

function getDefinition(strict: boolean): CodeKeywordDefinition {
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
        const noCompare = or(
          _`typeof ${fmt} != "object"`,
          _`${fmt} instanceof RegExp`,
          _`typeof ${fmt}.compare != "function"`
        )
        if (strict) {
          const fmtValid = gen.let("fmtValid", true)
          gen.if(not(noCompare), () => gen.assign(fmtValid, formatValid$Data(fmt)))
          fCxt.fail$data(_`!${fmtValid}`)
          cxt.fail$data(or(noCompare, _`${fmtValid} && ${compareCode(fmt)}`))
        } else {
          cxt.fail$data(or(noCompare, compareCode(fmt)))
        }
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
        if (strict && fmtDef.validate) {
          const fmtValid = gen.const(
            "fmtValid",
            fmtDef.validate instanceof RegExp
              ? _`${fmt}.validate.test(${data})`
              : _`${fmt}.validate(${data})`
          )
          fCxt.fail$data(_`!${fmtValid}`)
          cxt.fail$data(_`${fmtValid} && ${compareCode(fmt)}`)
        } else {
          cxt.fail$data(compareCode(fmt))
        }
      }

      function formatValid$Data(fmt: Name): Code {
        return _`typeof ${fmt}.validate == "function"
          ? ${fmt}.validate(${data})
          : ${fmt}.validate instanceof RegExp
          ? ${fmt}.validate.test(${data})
          : true`
      }

      function compareCode(fmt: Name): Code {
        return _`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword as Kwd].fail} 0`
      }
    },
    dependencies: ["format"],
  }
}

export const formatLimitDefinition: CodeKeywordDefinition = getDefinition(false)

const formatLimitPlugin: Plugin<FormatLimitOptions> = (
  ajv: Ajv,
  options?: FormatLimitOptions
): Ajv => {
  ajv.addKeyword(options?.strict ? getDefinition(true) : formatLimitDefinition)
  return ajv
}

export default formatLimitPlugin
