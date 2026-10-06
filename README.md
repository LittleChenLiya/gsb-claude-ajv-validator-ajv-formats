# ajv-formats

JSON Schema formats for Ajv

[![Build Status](https://travis-ci.org/ajv-validator/ajv-formats.svg?branch=master)](https://travis-ci.org/ajv-validator/ajv-formats)
[![npm](https://img.shields.io/npm/v/ajv-formats.svg)](https://www.npmjs.com/package/ajv-formats)
[![Gitter](https://img.shields.io/gitter/room/ajv-validator/ajv.svg)](https://gitter.im/ajv-validator/ajv)
[![GitHub Sponsors](https://img.shields.io/badge/$-sponsors-brightgreen)](https://github.com/sponsors/epoberezkin)

## Usage

```javascript
// ESM/TypeScript import
import Ajv from "ajv"
import addFormats from "ajv-formats"
// Node.js require:
const Ajv = require("ajv")
const addFormats = require("ajv-formats")

const ajv = new Ajv()
addFormats(ajv)
```

## Formats

The package defines these formats:

- _date_: full-date according to [RFC3339](http://tools.ietf.org/html/rfc3339#section-5.6).
- _time_: time (time-zone is mandatory).
- _date-time_: date-time (time-zone is mandatory).
- _iso-time_: time with optional time-zone.
- _iso-date-time_: date-time with optional time-zone.
- _duration_: duration from [RFC3339](https://tools.ietf.org/html/rfc3339#appendix-A)
- _uri_: full URI.
- _uri-reference_: URI reference, including full and relative URIs.
- _uri-template_: URI template according to [RFC6570](https://tools.ietf.org/html/rfc6570)
- _url_ (deprecated): [URL record](https://url.spec.whatwg.org/#concept-url).
- _email_: email address.
- _hostname_: host name according to [RFC1034](http://tools.ietf.org/html/rfc1034#section-3.5).
- _ipv4_: IP address v4.
- _ipv6_: IP address v6.
- _regex_: tests whether a string is a valid regular expression by passing it to RegExp constructor.
- _uuid_: Universally Unique IDentifier according to [RFC4122](http://tools.ietf.org/html/rfc4122).
- _json-pointer_: JSON-pointer according to [RFC6901](https://tools.ietf.org/html/rfc6901).
- _relative-json-pointer_: relative JSON-pointer according to [this draft](http://tools.ietf.org/html/draft-luff-relative-json-pointer-00).
- _byte_: base64 encoded data according to the [openApi 3.0.0 specification](https://spec.openapis.org/oas/v3.0.0#data-types)
- _int32_: signed 32 bits integer according to the [openApi 3.0.0 specification](https://spec.openapis.org/oas/v3.0.0#data-types)
- _int64_: signed 64 bits according to the [openApi 3.0.0 specification](https://spec.openapis.org/oas/v3.0.0#data-types)
- _float_: float according to the [openApi 3.0.0 specification](https://spec.openapis.org/oas/v3.0.0#data-types)
- _double_: double according to the [openApi 3.0.0 specification](https://spec.openapis.org/oas/v3.0.0#data-types)
- _password_: password string according to the [openApi 3.0.0 specification](https://spec.openapis.org/oas/v3.0.0#data-types)
- _binary_: binary string according to the [openApi 3.0.0 specification](https://spec.openapis.org/oas/v3.0.0#data-types)

See regular expressions used for format validation and the sources that were used in [formats.ts](https://github.com/ajv-validator/ajv-formats/blob/master/src/formats.ts).

**Please note**: JSON Schema draft-07 also defines formats `iri`, `iri-reference`, `idn-hostname` and `idn-email` for URLs, hostnames and emails with international characters. These formats are available in [ajv-formats-draft2019](https://github.com/luzlab/ajv-formats-draft2019) plugin.

## Keywords to compare values: `formatMaximum` / `formatMinimum` and `formatExclusiveMaximum` / `formatExclusiveMinimum`

These keywords allow to define minimum/maximum constraints when the format keyword defines ordering (`compare` function in format definition).

These keywords are added to ajv instance when ajv-formats is used without options or with option `keywords: true`.

These keywords apply only to strings. If the data is not a string, the validation succeeds.

The value of keywords `formatMaximum`/`formatMinimum` and `formatExclusiveMaximum`/`formatExclusiveMinimum` should be a string or [$data reference](https://github.com/ajv-validator/ajv/blob/master/docs/guide/combining-schemas.md#data-reference). This value is the maximum (minimum) allowed value for the data to be valid as determined by `format` keyword. If `format` keyword is not present schema compilation will throw exception.

When these keyword are added, they also add comparison functions to formats `"date"`, `"time"` and `"date-time"`. User-defined formats also can have comparison functions. See [addFormat](https://github.com/ajv-validator/ajv/blob/master/docs/api.md#api-addformat) method.

```javascript
require("ajv-formats")(ajv)

const schema = {
  type: "string",
  format: "date",
  formatMinimum: "2016-02-06",
  formatExclusiveMaximum: "2016-12-27",
}

const validDataList = ["2016-02-06", "2016-12-26"]

const invalidDataList = ["2016-02-05", "2016-12-27", "abc"]
```

## Options

Options can be passed via the second parameter. Options value can be

1. The list of format names that will be added to ajv instance:

```javascript
addFormats(ajv, ["date", "time"])
```

**Please note**: when ajv encounters an undefined format it throws exception (unless ajv instance was configured with `strict: false` option). To allow specific undefined formats they have to be passed to ajv instance via `formats` option with `true` value:

```javascript
const ajv = new Ajv({formats: {date: true, time: true}}) // to ignore "date" and "time" formats in schemas.
```

2. Format validation mode (default is `"full"`) with optional list of format names and `keywords` option to add additional format comparison keywords:

```javascript
addFormats(ajv, {mode: "fast"})
```

or

```javascript
addFormats(ajv, {mode: "fast", formats: ["date", "time"], keywords: true})
```

In `"fast"` mode the following formats are simplified: `"date"`, `"time"`, `"date-time"`, `"iso-time"`, `"iso-date-time"`, `"uri"`, `"uri-reference"`, `"email"`. For example, `"date"`, `"time"` and `"date-time"` do not validate ranges in `"fast"` mode, only string structure, and other formats have simplified regular expressions.

## Explicit format contracts

`registerFormat` / `registerFormats` (also available as `addFormats.registerFormat` / `addFormats.registerFormats`) add custom formats under an explicit execution contract: you declare the applicable data `type` (`"string"` or `"number"`) and whether `validate` is sync (`async: false`) or async (`async: true`). The declared contract is trusted and enforced - the user `validate` function is never called during registration or schema compilation to infer its type.

```typescript
import Ajv from "ajv"
import addFormats from "ajv-formats"

const ajv = new Ajv()
addFormats(ajv) // built-in formats keep working by default

// three formats, checked first and published atomically
addFormats.registerFormats(ajv, {
  slug: {type: "string", async: false, validate: (s) => /^[a-z0-9-]+$/.test(s)}, // sync string
  even: {type: "number", async: false, validate: (n) => n % 2 === 0}, // sync number
  "free-name": {type: "string", async: true, validate: async (s) => s !== "root"}, // async string
})
```

Contract rules:

- A sync contract must return `boolean`. A `Promise<boolean>` is always truthy, so it can never be a sync result: TypeScript rejects it at compile time, a native async function declared sync throws `FormatContractError` at registration, and a Promise returned at validation time throws `FormatContractError` instead of passing as truthy.
- An async contract (`async: true`) must return `Promise<boolean>`; failures are reported with the standard Ajv `format` error (`keyword: "format"`, `params: {format}`) via the usual async validation flow (`$async: true` schemas).
- Unknown `type` values are rejected; only `"string"` and `"number"` are applicable.
- Re-registering an existing name (including built-in formats) fails unless explicitly authorized with `{override: true}`.
- `registerFormats` is atomic: all contracts are checked before anything is published, so a bad contract or a name conflict leaves the Ajv instance untouched.

Run the self-contained three-format example locally (builds `dist` first):

```bash
npm run example:contract
```

## Tests

```bash
npm install
git submodule update --init
npm test
```

## License

[MIT](https://github.com/ajv-validator/ajv-formats/blob/master/LICENSE)
