import { describe, expect, it } from "vitest";
import {
    adnXR,
    aplicarEventoAdn,
    calidadAvatarDe,
    crearCacheAdn,
    emisionAdn,
    esRefAdn,
    sanearEventoAdn,
} from "@/lib/avatares/adaptadores/sincronia-adn";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { sanearCambio, aplicarCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { avataresDePresencia, mismosAvatares } from "@/lib/vivo/espacial/avatares";
import type { NivelCalidad } from "@/lib/xr/tipos";

/** ADN válido de pruebas: orbe con id de almacén. */
const adn = (id: string, rev = 0): AdnAvatar => ({ ...adnPorDefecto(id, "Ana", { tipo: "perfil", id: "p-1" }), rev });

describe("esRefAdn · solo referencias internas, nunca URL externa", () => {
    it("acepta ids de almacén y refs internas del contrato", () => {
        expect(esRefAdn("adn-4f9e2c0a-1234-5678-abcd-00000000eeee")).toBe(true);
        expect(esRefAdn("biblioteca:orbes/nube")).toBe(true);
        expect(esRefAdn("genesis:avatares/1")).toBe(true);
    });
    it("rechaza lo que no es un ref del avatar (URL suelta, otro prefijo, basura)", () => {
        expect(esRefAdn("https://yo.com/modelo.glb")).toBe(false);
        expect(esRefAdn("http://x")).toBe(false);
        expect(esRefAdn("otro:ref")).toBe(false);
        expect(esRefAdn("adn-")).toBe(false);
        expect(esRefAdn(42)).toBe(false);
        expect(esRefAdn(null)).toBe(false);
    });
});

describe("emisión y saneo del evento `adn` del canal de la escena", () => {
    it("envuelve un lote de `lote()` con { ref, rev, cambios }", () => {
        const cs = [{ op: "morfologia", clave: "altura", valor: 0.8 }] as CambioAvatar[];
        const e = emisionAdn("adn-1", 7.9, cs);
        expect(e).toEqual({ ref: "adn-1", rev: 7, cambios: cs });
        expect(emisionAdn("adn-1", 3, [])).toBeNull();
        expect(emisionAdn("https://x", 3, cs)).toBeNull();
        expect(emisionAdn("adn-1", Number.NaN, cs)).toBeNull();
    });

    it("sanearEventoAdn exige ref y rev válidas y FILTRA los cambios no saneados", () => {
        expect(sanearEventoAdn({ ref: "adn-1", rev: 2, cambios: [{ op: "morfologia", clave: "altura", valor: 0.5 }, { op: "trampa", valor: 1 }] }))
            .toEqual({ ref: "adn-1", rev: 2, cambios: [{ op: "morfologia", clave: "altura", valor: 0.5 }] });
        expect(sanearEventoAdn({ ref: "https://malo", rev: 2, cambios: [] })).toBeNull();
        expect(sanearEventoAdn({ ref: "adn-1", rev: -1, cambios: [] })).toBeNull();
        expect(sanearEventoAdn({ ref: "adn-1", rev: 2, cambios: "no" })).toBeNull();
        expect(sanearEventoAdn("basura")).toBeNull();
    });

    it("los valores de cambio saneados salen acotados", () => {
        const s = sanearCambio({ op: "morfologia", clave: "altura", valor: 5 });
        expect(s?.op).toBe("morfologia");
        if (s?.op === "morfologia") expect(s.valor).toBe(1);
    });
});

describe("aplicar un evento ajeno: solo si su rev es más nueva", () => {
    it("aplica el lote y clava la rev de quien lo mandó", () => {
        const a = adn("adn-1", 3);
        const b = aplicarEventoAdn(a, { ref: "adn-1", rev: 5, cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }] });
        expect(b.rev).toBe(5);
        expect(b.morfologia.altura).toBe(0.9);
        expect(a.rev).toBe(3);
        expect(a.morfologia.altura).toBeUndefined();
    });

    it("ignora rev vieja o igual, ref de otro y eventos de basura", () => {
        const a = adn("adn-1", 3);
        expect(aplicarEventoAdn(a, { ref: "adn-1", rev: 3, cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }] })).toBe(a);
        expect(aplicarEventoAdn(a, { ref: "adn-1", rev: 2, cambios: [] })).toBe(a);
        expect(aplicarEventoAdn(a, { ref: "adn-otro", rev: 9, cambios: [] })).toBe(a);
        expect(aplicarEventoAdn(a, "no-es-evento")).toBe(a);
    });

    it("aplicar con aplicarCambio no queda fuera de la puerta (cambios válidos, valores acotados)", () => {
        const a = adn("adn-1", 0);
        const b = aplicarEventoAdn(a, { ref: "adn-1", rev: 2, cambios: [{ op: "morfologia", clave: "altura", valor: -3 }] });
        expect(b.morfologia.altura).toBe(0);
        const c = aplicarCambio(a, { op: "morfologia", clave: "altura", valor: 2 }) as AdnAvatar;
        expect(c.rev).toBe(1);
    });
});

describe("caché de ADN: se lee UNA vez por ref (y revisión)", () => {
    it("dos pedidos del mismo ref+rev → una sola lectura", async () => {
        let veces = 0;
        const c = crearCacheAdn((ref) => { veces += 1; return adn(ref, 1); });
        const [x, y] = await Promise.all([c.obtener("adn-1", 1), c.obtener("adn-1", 1)]);
        expect(veces).toBe(1);
        expect(x.id).toBe("adn-1");
        expect(y.rev).toBe(1);
        expect(c.tiene("adn-1", 1)).toBe(true);
        expect(c.tamano()).toBe(1);
    });

    it("entrar no relee: una rev pedida más vieja usa la que ya hay", async () => {
        let veces = 0;
        const c = crearCacheAdn((r) => { veces += 1; return adn(r, 4); });
        await c.obtener("adn-1", 4);
        const atrasada = await c.obtener("adn-1", 2);
        expect(atrasada.rev).toBe(4);
        expect(veces).toBe(1);
    });

    it("una rev más nueva que la guardada provoca una lectura nueva", async () => {
        let rev = 2;
        const c = crearCacheAdn((r) => adn(r, rev));
        await c.obtener("adn-1", 2);
        rev = 3;
        const n = await c.obtener("adn-1", 3);
        expect(n.rev).toBe(3);
        expect(c.tiene("adn-1", 3)).toBe(true);
    });

    it("ref que no se puede salvar → adn de reserva (orbe), sin cachearse; se puede reintentar", async () => {
        let veces = 0;
        const c = crearCacheAdn(() => { veces += 1; return { v: 999, nada: true }; });
        const r1 = await c.obtener("adn-1", 3);
        expect(r1.base.tipo).toBe("orbe");
        expect(r1.rev).toBe(3);
        expect(c.tiene("adn-1", 3)).toBe(false);
        expect(veces).toBe(1);
        await c.obtener("adn-1", 3);
        expect(veces).toBe(2); // falló: se relee (con sondeos sobra decir que no, esto es a petición)
    });

    it("el tope no expulsa lo que se está usando: entra por FIFO", async () => {
        const c = crearCacheAdn((r) => adn(r, 0), 2);
        await c.obtener("adn-1", 0);
        await c.obtener("adn-2", 0);
        expect(c.tamano()).toBe(2);
        await c.obtener("adn-3", 0);
        expect(c.tamano()).toBe(2);
        expect(c.tiene("adn-1", 0)).toBe(false);
    });

    it("lectura que lanza también resuelve con reserva (no rompe el canal)", async () => {
        const c = crearCacheAdn(() => { throw new Error("red"); });
        const r = await c.obtener("adn-1", 0);
        expect(r.base.tipo).toBe("orbe");
    });
});

describe("MetaAvatar con ADN (AV1011E)", () => {
    it("quien manda adnRef/adnRev los conserva; quien no, no ve nada nuevo", () => {
        const estado = {
            "ana:1": [{ nombre: "Ana", adnRef: "adn-aa", adnRev: 6, desde: 1 }],
            "leo:2": [{ nombre: "Leo", adnRef: "https://malo", adnRev: -2, desde: 2 }],
        };
        const lista = avataresDePresencia(estado, "yo:1");
        expect(lista[0].adnRef).toBe("adn-aa");
        expect(lista[0].adnRev).toBe(6);
        expect(lista[1].adnRef).toBeUndefined();
        expect(lista[1].adnRev).toBeUndefined();
    });

    it("mismosAvatares distingue una rev nueva del ADN", () => {
        const a = avataresDePresencia({ "ana:1": [{ nombre: "Ana", adnRef: "adn-aa", adnRev: 2 }] }, "yo:1");
        const b = avataresDePresencia({ "ana:1": [{ nombre: "Ana", adnRef: "adn-aa", adnRev: 3 }] }, "yo:1");
        expect(mismosAvatares(a, b)).toBe(false);
        expect(mismosAvatares(a, a.slice())).toBe(true);
    });
});

describe("XR: el nivel del avatar sale de la calidad en vigor (§6)", () => {
    it("cada nivel de calidad mapea a su nivel de avatar", () => {
        expect(calidadAvatarDe("minima" as NivelCalidad)).toBe("orbe-manos");
        expect(calidadAvatarDe("baja" as NivelCalidad)).toBe("cabeza-manos");
        expect(calidadAvatarDe("media" as NivelCalidad)).toBe("vrm-ligero");
        expect(calidadAvatarDe("maxima" as NivelCalidad)).toBe("vrm-completo");
    });

    it("adnXR recorta con adnParaCalidad: la identidad no cambia, cambia cuánto se dibuja", () => {
        const base: AdnAvatar = {
            ...adn("adn-1", 5),
            base: { tipo: "vrm", ref: "biblioteca:orbes/1" },
            piezas: [{ slot: "cabeza", ref: "biblioteca:piezas/cabeza-1" }, { slot: "mascota", ref: "biblioteca:piezas/perro" }],
        };
        const bajito = adnXR("minima" as NivelCalidad, base);
        expect(bajito.adn.base.tipo).toBe("orbe");
        expect(bajito.adn.piezas).toEqual([]);
        expect(bajito.presupuesto.forma).toBe("orbe");
        const alto = adnXR("maxima" as NivelCalidad, base);
        expect(alto.adn.base.tipo).toBe("vrm");
        expect(alto.adn.piezas.length).toBe(2);
        expect(alto.presupuesto.triangulos).toBeGreaterThan(bajito.presupuesto.triangulos);
    });
});
