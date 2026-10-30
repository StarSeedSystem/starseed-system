/** SINCRONÍA DEL ADN EN ESCENAS COMPARTIDAS Y XR (AV1011E). Funciones puras: con lector de ADN inyectado,
 * sin red, sin disco y sin importar ningún route.ts (vitest corre con globals en false). */
import { describe, expect, it, vi } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import {
    adnParaNivelXR,
    aplicarEventoAdn,
    crearCacheAdn,
    eventoAdnDeLote,
    eventoEsAplicable,
    sanearEventoAdn,
} from "../sincronia-adn";

const adn = (): AdnAvatar => adnPorDefecto("adn-prueba", "Prueba", { tipo: "perfil", id: "p1" }, 260);
const REF = "biblioteca:adn-prueba";

describe("sanearEventoAdn", () => {
    it("acepta un evento valido y sana cada cambio", () => {
        const e = sanearEventoAdn({ ref: REF, rev: 3, cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }, { op: "aura", campo: "tono", valor: 500 }] });
        expect(e).toEqual({ ref: REF, rev: 3, cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }, { op: "aura", campo: "tono", valor: 140 }] });
    });
    it("rechaza ref externa, rev rara y sin cambios validos", () => {
        expect(sanearEventoAdn({ ref: "https://otro.dev/adn", rev: 1, cambios: [{ op: "morfologia", clave: "altura", valor: 0.5 }] })).toBeNull();
        expect(sanearEventoAdn({ ref: REF, rev: -1, cambios: [] })).toBeNull();
        expect(sanearEventoAdn({ ref: REF, rev: 1, cambios: [{ op: "basura" }] })).toBeNull();
        expect(sanearEventoAdn({ ref: REF, rev: 1 })).toBeNull();
        expect(sanearEventoAdn("pandora")).toBeNull();
    });
});

describe("eventoAdnDeLote", () => {
    it("del lote de lote()sale el evento; sin lote no viaja nada", () => {
        const e = eventoAdnDeLote(REF, 2, [{ op: "morfologia", clave: "altura", valor: 0.9 }]);
        expect(e?.cambios.length).toBe(1);
        expect(eventoAdnDeLote(REF, 2, null)).toBeNull();
        expect(eventoAdnDeLote(REF, 2, [])).toBeNull();
    });
});

describe("aplicarEventoAdn", () => {
    it("solo aplica si la revision llega mas nueva, y sella su rev", () => {
        const base = adn();
        const e = sanearEventoAdn({ ref: REF, rev: 5, cambios: [{ op: "morfologia", clave: "altura", valor: 0.1 }] })!;
        const aplicado = aplicarEventoAdn(base, e, REF);
        expect(aplicado?.morfologia.altura).toBe(0.1);
        expect(aplicado?.rev).toBe(5);
        // misma revision y mas vieja: queda igual
        expect(aplicarEventoAdn(aplicado!, e, REF)?.rev).toBe(5);
        const viejo = sanearEventoAdn({ ref: REF, rev: 4, cambios: [{ op: "aura", campo: "tono", valor: 10 }] })!;
        expect(aplicarEventoAdn(aplicado!, viejo, REF)?.aura.tono).toBe(260);
    });

    it("no aplica si el ref no es el esperado y devuelve el mismo ADN", () => {
        const base = adn();
        const e = sanearEventoAdn({ ref: REF, rev: 5, cambios: [{ op: "aura", campo: "tono", valor: 10 }] })!;
        const mismo = aplicarEventoAdn(base, e, "genesis:otro");
        expect(mismo).toBe(base);
        expect(mismo?.rev).toBe(0);
    });

    it("sin ADN local devuelve null", () => {
        const e = sanearEventoAdn({ ref: REF, rev: 5, cambios: [{ op: "aura", campo: "tono", valor: 10 }] })!;
        expect(aplicarEventoAdn(null, e, REF)).toBeNull();
    });
});

describe("crearCacheAdn", () => {
    it("lee cada ref UNA vez por sesion; la misma o menor rev se sirve de cache", () => {
        const leer = vi.fn(() => ({ ...adn(), rev: 2 }));
        const cache = crearCacheAdn(leer);
        const primero = cache.obtener(REF, 2)!;
        // pedir lo mismo (entradas repetidas) y algo mas viejo: nadie vuelve a leer
        expect(cache.tiene(REF, 2)).toBe(true);
        expect(cache.obtener(REF, 2)).toBe(primero);
        expect(cache.obtener(REF, 1)).toBe(primero);
        expect(cache.obtener(REF, -3)).toBe(primero);
        expect(leer).toHaveBeenCalledTimes(1);
    });

    it("una revision mas nueva que la cacheada fuerza UNA relectura", () => {
        const leer = vi.fn<() => unknown>().mockImplementationOnce(() => ({ ...adn(), rev: 2 })).mockImplementationOnce(() => ({ ...adn(), rev: 3 }));
        const cache = crearCacheAdn(leer);
        expect(cache.obtener(REF, 2)?.rev).toBe(2);
        expect(cache.obtener(REF, 3)?.rev).toBe(3);
        expect(leer).toHaveBeenCalledTimes(2);
        // la nueva ya esta cacheada: pedir de nuevo no relee
        expect(cache.obtener(REF, 3)?.rev).toBe(3);
        expect(leer).toHaveBeenCalledTimes(2);
    });

    it("ref invalida o lector sin datos: devuelve null sin inventar", () => {
        const cache = crearCacheAdn(() => ({ v: 9 }));
        expect(cache.obtener("https://fuera.dev/adn", 1)).toBeNull();
        const vacio = crearCacheAdn(() => null);
        expect(vacio.obtener(REF, 1)).toBeNull();
    });
});

describe("adnParaNivelXR", () => {
    it("el nivel sale de la calidad del aparato y el ADN se recorta con identidad intacta", () => {
        const conPiezas: AdnAvatar = {
            ...adn(),
            base: { tipo: "vrm", ref: "biblioteca:avatares/plantillas/arla.vrm" },
            esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 },
            morfologia: { altura: 0.9 },
            piezas: [{ slot: "cabeza", ref: "biblioteca:avatares/piezas/gorra.glb" }, { slot: "mascota", ref: "biblioteca:avatares/piezas/gato.glb" }],
            expresionBase: { happy: 0.8, blink: 1 },
        };
        const xr = adnParaNivelXR(conPiezas, "minima");
        expect(PERFILES.minima.avatar).toBe("orbe-manos");
        expect(xr.adn.piezas).toEqual([]);
        expect(xr.presupuesto.forma).toBe("orbe");
        const xrMedia = adnParaNivelXR(conPiezas, "baja");
        expect(PERFILES.baja.avatar).toBe("cabeza-manos");
        expect(xrMedia.adn.piezas.map((p) => p.slot)).toEqual(["cabeza"]);
        expect(xrMedia.adn.morfologia.altura).toBe(0.9);
    });
});
