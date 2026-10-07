import Ajv from "ajv"
import addFormats from "../dist"
import type {FormatsUndoHandle} from "../dist"

const FULL_DATE_OK = "2020-09-17"
const FULL_DATE_BAD = "2020-09-35" // valid for the fast (regex) mode, invalid for full mode

describe("undo handle (instance-isolated format registration)", () => {
  let ajv1: Ajv
  let ajv2: Ajv

  beforeEach(() => {
    ajv1 = new Ajv({strictTypes: false})
    ajv2 = new Ajv({strictTypes: false})
  })

  test("default behavior is unchanged: plugin returns the Ajv instance", () => {
    expect(addFormats(ajv1)).toBe(ajv1)
    expect(ajv1.compile({format: "date"})(FULL_DATE_OK)).toBe(true)

    expect(addFormats(ajv2, ["date"])).toBe(ajv2)
    expect(addFormats(ajv2, {mode: "fast", formats: ["date"]})).toBe(ajv2)
    expect(addFormats(ajv2, {formats: ["date"], keywords: false})).toBe(ajv2)
    expect(ajv2.compile({format: "date"})(FULL_DATE_OK)).toBe(true)
  })

  test("{undo: true} returns a handle bound to the same Ajv instance", () => {
    const h = addFormats(ajv1, {formats: ["date"], undo: true})
    expect(h.ajv).toBe(ajv1)
    expect(typeof h.undo).toBe("function")
    expect(ajv1.compile({format: "date"})(FULL_DATE_BAD)).toBe(false)
  })

  test("undo removes formats that did not exist before this registration", () => {
    const h: FormatsUndoHandle = addFormats(ajv1, {formats: ["date"], undo: true})
    expect(ajv1.compile({format: "date"})(FULL_DATE_OK)).toBe(true)
    h.undo()
    expect(() => ajv1.compile({format: "date"})).toThrow()
  })

  test("undo restores the format version this registration replaced", () => {
    addFormats(ajv1, {formats: ["date"]}) // full mode: "2020-09-35" is invalid
    const h = addFormats(ajv1, {mode: "fast", formats: ["date"], undo: true})
    expect(ajv1.compile({format: "date"})(FULL_DATE_BAD)).toBe(true) // fast regex mode
    h.undo()
    expect(ajv1.compile({format: "date"})(FULL_DATE_BAD)).toBe(false) // full mode restored
  })

  test("two Ajv instances: interleaved registration and undo are isolated", () => {
    // interleave registrations on both instances
    const h1 = addFormats(ajv1, {mode: "fast", formats: ["date"], undo: true})
    const h2 = addFormats(ajv2, {formats: ["date"], undo: true})

    expect(ajv1.compile({format: "date"})(FULL_DATE_BAD)).toBe(true) // fast on ajv1
    expect(ajv2.compile({format: "date"})(FULL_DATE_BAD)).toBe(false) // full on ajv2

    h1.undo() // undo on ajv1 must not affect ajv2
    expect(() => ajv1.compile({format: "date"})).toThrow()
    expect(ajv2.compile({format: "date"})(FULL_DATE_BAD)).toBe(false)

    h2.undo()
    expect(() => ajv2.compile({format: "date"})).toThrow()
  })

  test("old handle cannot override a format registered later by another caller", () => {
    const h1 = addFormats(ajv1, {mode: "fast", formats: ["date"], undo: true})
    // another caller replaces "date" afterwards
    const alwaysValid = (): boolean => true
    ajv1.addFormat("date", alwaysValid)

    h1.undo() // must NOT restore/delete the later registration
    const validate = ajv1.compile({format: "date"})
    expect(validate("not a date at all")).toBe(true)
    expect(ajv1.formats.date).toBe(alwaysValid)
  })

  test("old handle stays inert when a later plugin registration is compiled in between", () => {
    const h1 = addFormats(ajv1, {mode: "fast", formats: ["date"], undo: true})
    expect(ajv1.compile({format: "date"})(FULL_DATE_BAD)).toBe(true) // fast in effect

    // another caller replaces "date" via the plugin and compiles with it
    const h2 = addFormats(ajv1, {formats: ["date"], undo: true})
    expect(ajv1.compile({format: "date"})(FULL_DATE_BAD)).toBe(false) // full in effect

    h1.undo() // stale handle: must not restore the fast regex nor delete "date"
    expect(ajv1.compile({format: "date"})(FULL_DATE_BAD)).toBe(false)

    h2.undo() // the live handle unwinds its own registration, back to h1's fast
    expect(ajv1.compile({format: "date"})(FULL_DATE_BAD)).toBe(true)

    h1.undo() // h1 is the current registration again: now it removes the format
    expect(() => ajv1.compile({format: "date"})).toThrow()
  })

  test("stacked registrations unwind like a tolerant stack", () => {
    const h1 = addFormats(ajv1, {formats: ["date"], undo: true}) // full
    const h2 = addFormats(ajv1, {mode: "fast", formats: ["date"], undo: true}) // fast over full

    h1.undo() // stale handle: current definition is h2's, must be a no-op
    expect(ajv1.compile({format: "date"})(FULL_DATE_BAD)).toBe(true)

    h2.undo() // restores h1's full version
    expect(ajv1.compile({format: "date"})(FULL_DATE_BAD)).toBe(false)

    h1.undo() // now h1 is current again: removes the format
    expect(() => ajv1.compile({format: "date"})).toThrow()
  })

  test("repeated undo on the same instance is safe", () => {
    const h = addFormats(ajv1, {formats: ["date"], undo: true})
    h.undo()
    expect(() => h.undo()).not.toThrow()
    expect(() => h.undo()).not.toThrow()
    expect(() => ajv1.compile({format: "date"})).toThrow()
  })

  test("undo on one instance never touches the other instance's formats", () => {
    addFormats(ajv2, {formats: ["date"]}) // full on ajv2, no undo handle
    const h1 = addFormats(ajv1, {formats: ["date"], undo: true})
    h1.undo()
    h1.undo()
    expect(ajv2.compile({format: "date"})(FULL_DATE_OK)).toBe(true)
    expect(ajv2.compile({format: "date"})(FULL_DATE_BAD)).toBe(false)
  })
})
