import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import {
    adnEnCache,
    aplicarEventoAdn,
    avatarParaXR,
    cargarAdn,
    crearSincroniaAdn,
    payloadEventoAdn,
    refsPorLeer,
    type SincroniaAdn,
} from "@/lib/avatares/adaptadores/sincronia-adn";

const REF = "biblioteca:adn-uno";
const DUEÑO = { tipo: "perfil" as const, id: "usuario-1" };
const adnRev = (rev: number, base: Partial<AdnAvatar> = {}): AdnAvatar => ({ ...adnPorDefecto("adn-uno", "Prueba", DUEÑO), ...base, rev });
const ORBE = (rev: number): AdnAvatar => adnRev(rev, {});

describe("caché del ADN · una lectura por ref+rev", () => {
    it("cada pareja ref+rev se pide una vez por sesión", () => {
        const s = crearSincroniaAdn();
        const presentes = [{ adnRef: REF, adnRev: 3 }];
        expect(refsPorLeer(s, presentes)).toEqual([{ ref: REF, rev: 3 }]);
        expect(refsPorLeer(s, presentes)).toEqual([]);
    });

    it("ignora a quien no lleva ADN y a una rev inválida", () => {
        const s = crearSincroniaAdn();
        expect(refsPorLeer(s, [{}, { adnRef: REF }, { adnRef: REF, adnRev: null }, { adnRef: REF, adnRev: -1 }])).toEqual([]);
    });

    it("una rev nueva vuelve a pedir, pero la rev de un ADN ya en caché no", () => {
        const s = crearSincroniaAdn();
        refsPorLeer(s, [{ adnRef: REF, adnRev: 3 }]);
        expect(refsPorLeer(s, [{ adnRef: REF, adnRev: 4 }])).toEqual([{ ref: REF, rev: 4 }]);
        expect(cargarAdn(s, ORBE(4))).toBe(true);
        expect(refsPorLeer(s, [{ adnRef: REF, adnRev: 4 }])).toEqual([]);
        expect(refsPorLeer(s, [{ adnRef: REF, adnRev: 3 }])).toEqual([]);
    });

    it("cargarAdn valida y no pisa la rev más nueva con una vieja", () => {
        const s = crearSincroniaAdn();
        expect(cargarAdn(s, ORBE(3))).toBe(true);
        expect(adnEnCache(s, REF)?.rev).toBe(3);
        expect(cargarAdn(s, ORBE(1))).toBe(false);
        expect(adnEnCache(s, REF)?.rev).toBe(3);
        expect(adnEnCache(s, "biblioteca:no-hay")).toBeNull();
        expect(cargarAdn(s, { ...ORBE(5), id: "" })).toBe(false);
    });
});

describe("evento `adn` por el canal de la escena", () => {
    it("payload: limpia los cambios y rechaza ref externa o lotes vacíos", () => {
        const p = payloadEventoAdn(REF, 5, [{ op: "nombre", valor: "Ana" }, { op: "nombre", valor: "   " }, 42, null]);
        expect(p).toEqual({ ref: REF, rev: 5, cambios: [{ op: "nombre", valor: "Ana" }] });
        expect(payloadEventoAdn("https://externo.glb", 1, [{ op: "nombre", valor: "Ana" }])).toBeNull();
        expect(payloadEventoAdn(REF, 1, [42])).toBeNull();
        expect(payloadEventoAdn(REF, -2, [{ op: "nombre", valor: "Ana" }])).toBeNull();
    });

    it("aplica un lote solo si la rev es más nueva, con los cambios saneados", () => {
        const s = crearSincroniaAdn();
        cargarAdn(s, ORBE(3));
        const r = aplicarEventoAdn(s, { ref: REF, rev: 4, cambios: [{ op: "morfologia", clave: "altura", valor: 5 }] });
        expect(r).not.toBeNull();
        expect(r?.rev).toBe(4);
        expect(r?.adn.morfologia.altura).toBe(1); // fuera de rango → acotado al aplicarlo
        expect(r?.adn.nombre).toBe("Prueba");
        expect(adnEnCache(s, REF)?.rev).toBe(4);
    });

    it("rev vieja o igual: la copia local vale", () => {
        const s: SincroniaAdn = crearSincroniaAdn();
        cargarAdn(s, ORBE(4));
        expect(aplicarEventoAdn(s, { ref: REF, rev: 4, cambios: [{ op: "nombre", valor: "Otra" }] })).toBeNull();
        expect(aplicarEventoAdn(s, { ref: REF, rev: 2, cambios: [{ op: "nombre", valor: "Otra" }] })).toBeNull();
        expect(adnEnCache(s, REF)?.nombre).toBe("Prueba");
    });

    it("sin copia en caché no se puede aplicar; payload basura tampoco", () => {
        const s = crearSincroniaAdn();
        expect(aplicarEventoAdn(s, { ref: REF, rev: 9, cambios: [] })).toBeNull();
        expect(aplicarEventoAdn(s, null)).toBeNull();
        expect(aplicarEventoAdn(s, { ref: "https://x.glb", rev: 9, cambios: [] })).toBeNull();
        expect(aplicarEventoAdn(s, { ref: REF, rev: "nueve" })).toBeNull();
    });

    it("lote vacío pero rev nueva: solo avanza la revisión local", () => {
        const s = crearSincroniaAdn();
        cargarAdn(s, ORBE(0));
        expect(aplicarEventoAdn(s, { ref: REF, rev: 1, cambios: [42] })).not.toBeNull();
        expect(adnEnCache(s, REF)?.rev).toBe(1);
        expect(aplicarEventoAdn(s, { ref: REF, rev: 1, cambios: [] })).toBeNull();
    });
});

describe("XR · nivel de avatar según la calidad actual (§6)", () => {
    const VRM = adnRev(7, {
        nombre: "Lúa",
        base: { tipo: "vrm", ref: "biblioteca:vrm.lua" },
        esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 },
        materiales: { piel: { color: "#e6c7a8", metal: 0, rugosidad: 0.6, emisivo: 0 } },
        piezas: [{ slot: "cabeza", ref: "biblioteca:p.cabeza" }, { slot: "mascota", ref: "biblioteca:p.masc" }],
        expresionBase: { aa: 0.4, blink: 0.4, happy: 0.6, sad: 0.2, ih: 0.3, ou: 0.3, ee: 0.2, oh: 0.2 },
    } as Partial<AdnAvatar>);

    it("sin ADN se dibuja la orbe de siempre en cualquier nivel", () => {
        const a = avatarParaXR(null, "vrm-completo");
        expect(a.forma).toBe("orbe");
        expect(a.adn).toBeNull();
        const b = avatarParaXR(undefined, "orbe-manos");
        expect(b.presupuesto.triangulos).toBe(2_000);
    });

    it("en el nivel más bajo el ADN se ve como su orbe; en intermedio se recorta", () => {
        const bajo = avatarParaXR(VRM, "orbe-manos");
        expect(bajo.forma).toBe("orbe");
        expect(bajo.adn?.piezas).toEqual([]);
        expect(bajo.adn?.base.tipo).toBe("orbe");
        const medio = avatarParaXR(VRM, "cabeza-manos");
        expect(medio.forma).toBe("malla");
        expect(medio.presupuesto.piezas).toBe(3);
        expect(medio.adn?.piezas.map((p) => p.slot)).toEqual(["cabeza"]);
        expect(medio.adn?.expresionBase.aa).toBe(0.4);
        expect(medio.adn?.expresionBase.sad).toBeUndefined();
        expect(medio.adn?.rev).toBe(7);
    });
});;
