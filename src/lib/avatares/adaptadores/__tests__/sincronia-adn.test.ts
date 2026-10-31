import { describe, expect, it } from "vitest";
import {
    adnParaNivelXr,
    crearCacheAdn,
    mensajeDeLote,
    sanearMensajeAdn,
    type MensajeAdn,
} from "@/lib/avatares/adaptadores/sincronia-adn";
import { sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { adnPorDefecto, sanearAdn, type AdnAvatar } from "@/lib/avatares/adn/adn";

const REF = "biblioteca:adn-anA";
/** ADN válido de prueba con la revisión y las piezas/expressiones indicadas. */
const adnDe = (sobres: Record<string, unknown> = {}, rev = 3): AdnAvatar =>
    sanearAdn({ ...adnPorDefecto("adn-ana", "Ana", { tipo: "perfil", id: "u1" }), rev, ...sobres })!;

const cambiarAcento = (color: string): CambioAvatar => sanearCambio({ op: "material", slot: "acento", campo: "color", valor: color })!;
const subirCabeza = sanearCambio({ op: "morfologia", clave: "cabeza", valor: 0.2 })!;

describe("mensaje del evento «adn» en el canal", () => {
    it("un lote del editor se convierte en {ref, rev, cambios}", () => {
        const m = mensajeDeLote(REF, 7, [
            { op: "material", slot: "acento", campo: "color", valor: "#FFBF00" },
            { op: "morfologia", clave: "cabeza", valor: 0.2 },
        ]);
        expect(m?.ref).toBe(REF);
        expect(m?.rev).toBe(7);
        expect(m?.cambios).toEqual([cambiarAcento("#ffbf00"), subirCabeza]);
    });

    it("los cambios inválidos se filtran y un lote sin nada válido no viaja", () => {
        expect(mensajeDeLote(REF, 7, [{ op: "aura", campo: "no-existe", valor: 1 }])).toBeNull();
        expect(mensajeDeLote(REF, 7, [cambiarAcento("#ffbf00"), { op: "que" }])).toEqual({
            ref: REF,
            rev: 7,
            cambios: [cambiarAcento("#ffbf00")],
        });
    });

    it("rechaza referencias externas, revisiones raras y basura", () => {
        expect(sanearMensajeAdn({ ref: "https://malo.com/a", rev: 3, cambios: [cambiarAcento("#ffbf00")] })).toBeNull();
        expect(sanearMensajeAdn({ ref: REF, rev: -1, cambios: [] })).toBeNull();
        expect(sanearMensajeAdn({ ref: REF, rev: 1.5, cambios: [] })).toBeNull();
        expect(sanearMensajeAdn(null)).toBeNull();
    });
});

describe("caché de ADN por ref+rev · una lectura por par", () => {
    it("la primera vez pide UNA vez (sin sondeos en bucle)", () => {
        const c = crearCacheAdn();
        expect(c.para(REF, 3)).toEqual({ adn: null, pedir: true });
        expect(c.para(REF, 3).pedir).toBe(false);
        expect(c.para(REF, 3).pedir).toBe(false);
    });

    it("los presentes con el mismo ADN comparten la petición", () => {
        const c = crearCacheAdn();
        expect(c.refsPorPedir([{ adnRef: REF, adnRev: 3 }, { adnRef: REF, adnRev: 3 }])).toEqual([REF]);
        expect(c.refsPorPedir([{ adnRef: "biblioteca:adn-2", adnRev: 1 }])).toEqual(["biblioteca:adn-2"]);
        expect(c.refsPorPedir([{ adnRef: REF, adnRev: 3 }])).toEqual([]);
    });

    it("guardar acepta solo ADN válido y actualiza lo pedido", () => {
        const c = crearCacheAdn();
        c.para(REF, 5);
        expect(c.guardar(REF, { malo: true })).toBeNull();
        expect(c.guardar(REF, adnDe())?.id).toBe("adn-ana");
        expect(c.para(REF, 5).adn?.rev).toBe(3);
        expect(c.para(REF, 5).pedir).toBe(false);
        expect(c.conocidas()).toBe(1);
    });

    it("una revisión más nueva del presente se pide UNA vez más", () => {
        const c = crearCacheAdn();
        c.para(REF, 3);
        c.guardar(REF, adnDe());
        const r = c.para(REF, 5);
        expect(r.pedir).toBe(true);
        expect(r.adn).toBe(c.para(REF, 3).adn);
        expect(c.para(REF, 5).pedir).toBe(false);
    });
});

describe("edición en vivo: aplicar solo si la revisión es más nueva", () => {
    it("aplica los cambios saneados y sube a la revisión del mensaje", () => {
        const c = crearCacheAdn();
        c.para(REF, 3);
        c.guardar(REF, adnDe());
        const m = { ref: REF, rev: 5, cambios: [cambiarAcento("#ffbf00"), { op: "no-existe" }] };
        const nuevo = c.aplicar(m);
        expect(nuevo?.materiales.acento?.color).toBe("#ffbf00");
        expect(nuevo?.rev).toBe(5);
        expect(c.para(REF, 5).pedir).toBe(false);
    });

    it("una revisión vieja o igual no cambia nada", () => {
        const c = crearCacheAdn();
        c.para(REF, 7);
        c.guardar(REF, adnDe({ materiales: {} }, 7));
        const actual = c.para(REF, 7).adn;
        expect(c.aplicar({ ref: REF, rev: 7, cambios: [cambiarAcento("#ffbf00")] })).toBe(actual);
        expect(c.aplicar({ ref: REF, rev: 4, cambios: [cambiarAcento("#ffbf00")] })?.rev).toBe(7);
    });

    it("sin ADN guardado todavía no se aplica nada (la lectura completa lo traerá)", () => {
        const c = crearCacheAdn();
        c.para(REF, 3);
        expect(c.aplicar({ ref: REF, rev: 9, cambios: [cambiarAcento("#ffbf00")] })).toBeNull();
        expect(c.aplicar(null)).toBeNull();
    });
});

describe("XR · nivel de avatar según la calidad en curso", () => {
    it("sin ADN no hay nada que recortar", () => {
        expect(adnParaNivelXr(null, "media")).toBeNull();
    });

    it("minima → orbe-manos: queda la orbe con su aura (la identidad no cambia)", () => {
        const r = adnParaNivelXr(adnDe(), "minima");
        expect(r?.presupuesto.forma).toBe("orbe");
        expect(r?.adn.piezas).toEqual([]);
    });

    it("media → vrm-ligero: un ADN de malla se recorta al presupuesto del nivel", () => {
        const adn = adnDe({
            base: { tipo: "vrm", ref: "biblioteca:malla-1" },
            esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 },
            piezas: [
                { slot: "cabeza", ref: "biblioteca:p1" },
                { slot: "torso", ref: "biblioteca:p2" },
                { slot: "mascota", ref: "biblioteca:p3" },
            ],
            expresionBase: { aa: 1, blink: 0.5, lookUp: 1, happy: 1 },
        });
        const r = adnParaNivelXr(adn, "media");
        expect(r?.presupuesto.forma).toBe("malla");
        expect(r?.presupuesto.piezas).toBe(6);
        expect(r?.adn.piezas.map((p) => p.slot)).toEqual(["cabeza", "torso"]);
        expect(Object.keys(r?.adn.expresionBase ?? {}).sort()).toEqual(["aa", "blink", "happy"]);
    });
});
