import Ajv from "ajv"
import addFormats from "../dist"
import type {FormatUndo} from "../dist"

// custom "date" formats used to distinguish registrations by identity/behavior
const yearOnly = /^\d{4}$/ // accepts "2020", rejects "2020-09-17"
const slugDate = /^d-\d+$/ // accepts "d-1", rejects everything else

function compileDate(ajv: Ajv) {
  // fresh schema object every time to avoid ajv compiled-schema cache
  return ajv.compile({format: "date"})
}

describe("undoable format registration (instance isolation)", () => {
  let ajv: Ajv

  beforeEach(() => {
    ajv = new Ajv({strictTypes: false})
  })

  describe("default behavior is unchanged when the option is not used", () => {
    test("returns the ajv instance for all legacy call shapes", () => {
      expect(addFormats(ajv)).toBe(ajv)
      expect(addFormats(new Ajv({strictTypes: false}), ["date", "time"])).toBeInstanceOf(Ajv)
      expect(
        addFormats(new Ajv({strictTypes: false}), {mode: "fast", formats: ["date"]})
      ).toBeInstanceOf(Ajv)
      expect(addFormats(new Ajv({strictTypes: false}), {keywords: true})).toBeInstanceOf(Ajv)
    })

    test("legacy calls still register formats", () => {
      addFormats(ajv, ["date"])
      expect(compileDate(ajv)("2020-09-17")).toEqual(true)
      expect(compileDate(ajv)("2020-09-35")).toEqual(false)
    })
  })

  describe("undo handle", () => {
    test("returns an undo handle when undoable: true", () => {
      const undo = addFormats(ajv, {formats: ["date"], undoable: true})
      expect(typeof undo).toEqual("function")
    })

    test("undo removes formats that did not exist before the registration", () => {
      expect(() => compileDate(ajv)).toThrow(/unknown format "date"/)
      const undo: FormatUndo = addFormats(ajv, {formats: ["date"], undoable: true})
      expect(compileDate(ajv)("2020-09-17")).toEqual(true)
      undo()
      expect(() => compileDate(ajv)).toThrow(/unknown format "date"/)
    })

    test("undo restores the format definition replaced by this registration", () => {
      ajv.addFormat("date", yearOnly)
      expect(compileDate(ajv)("2020")).toEqual(true)

      const undo = addFormats(ajv, {formats: ["date"], undoable: true})
      // registration replaced the custom format with the full "date" format
      expect(compileDate(ajv)("2020-09-17")).toEqual(true)
      expect(compileDate(ajv)("2020")).toEqual(false)

      undo()
      // the previous custom definition is restored
      expect(compileDate(ajv)("2020")).toEqual(true)
      expect(compileDate(ajv)("2020-09-17")).toEqual(false)
    })

    test("old handle does not remove or overwrite formats registered later", () => {
      const undo = addFormats(ajv, {formats: ["date"], undoable: true})
      // another caller re-registers "date" afterwards
      ajv.addFormat("date", slugDate)

      undo() // must NOT delete/restore: the current definition is not ours

      expect(compileDate(ajv)("d-1")).toEqual(true)
      expect(compileDate(ajv)("2020-09-17")).toEqual(false)
    })

    test("repeated undo on the same instance is safe", () => {
      ajv.addFormat("date", yearOnly)
      const undo = addFormats(ajv, {formats: ["date"], undoable: true})
      expect(compileDate(ajv)("2020-09-17")).toEqual(true)

      undo()
      expect(compileDate(ajv)("2020")).toEqual(true)
      expect(() => undo()).not.toThrow()
      undo()
      // state is unchanged after extra undo calls
      expect(compileDate(ajv)("2020")).toEqual(true)
      expect(compileDate(ajv)("2020-09-17")).toEqual(false)
    })

    test("undo after re-registration by later caller keeps later format (stale handle)", () => {
      const undo1 = addFormats(ajv, {formats: ["date"], undoable: true})
      undo1() // removes "date" added by undo1's registration
      expect(() => compileDate(ajv)).toThrow(/unknown format "date"/)

      ajv.addFormat("date", slugDate) // later registration by another caller
      undo1() // stale handle must not touch it
      expect(compileDate(ajv)("d-1")).toEqual(true)
    })
  })

  describe("two Ajv instances: interleaved registration, replacement and undo", () => {
    test("each handle only affects its own instance", () => {
      const ajv1 = new Ajv({strictTypes: false})
      const ajv2 = new Ajv({strictTypes: false})

      // both instances start with their own custom "date"
      ajv1.addFormat("date", yearOnly)
      ajv2.addFormat("date", slugDate)

      // interleaved undoable registrations
      const undo1 = addFormats(ajv1, {formats: ["date", "time"], undoable: true})
      const undo2 = addFormats(ajv2, {formats: ["date"], undoable: true})

      // both instances now use the built-in "date"
      expect(compileDate(ajv1)("2020-09-17")).toEqual(true)
      expect(compileDate(ajv2)("2020-09-17")).toEqual(true)
      expect(compileDate(ajv1)("2020")).toEqual(false)
      expect(compileDate(ajv2)("d-1")).toEqual(false)

      // undo on instance 1 only
      undo1()
      expect(compileDate(ajv1)("2020")).toEqual(true) // ajv1 restored to yearOnly
      expect(compileDate(ajv1)("2020-09-17")).toEqual(false)
      expect(compileDate(ajv2)("2020-09-17")).toEqual(true) // ajv2 untouched
      expect(compileDate(ajv2)("d-1")).toEqual(false)

      // a later caller replaces "date" on ajv2, then the old handle fires
      ajv2.addFormat("date", yearOnly)
      undo2() // must not restore slugDate over the newer yearOnly registration
      expect(compileDate(ajv2)("2020")).toEqual(true)
      expect(compileDate(ajv2)("d-1")).toEqual(false)

      // ajv1 still unaffected by anything that happened to ajv2
      expect(compileDate(ajv1)("2020")).toEqual(true)
    })

    test("undoing one instance does not remove formats added to the other", () => {
      const ajv1 = new Ajv({strictTypes: false})
      const ajv2 = new Ajv({strictTypes: false})

      const undo1 = addFormats(ajv1, {formats: ["date"], undoable: true})
      addFormats(ajv2, ["date"]) // legacy, non-undoable registration on ajv2

      undo1()
      expect(() => compileDate(ajv1)).toThrow(/unknown format "date"/)
      expect(compileDate(ajv2)("2020-09-17")).toEqual(true) // ajv2 keeps its format
    })
  })
})
