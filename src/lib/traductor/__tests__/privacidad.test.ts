import { describe, expect, it } from "vitest";
import type { IdMotor } from "../tipos";
import { AVISOS, avisoPendiente, aceptarAviso, crearAlmacenMemoria } from "../privacidad";

const MOTORES: IdMotor[] = ["paquete-local", "navegador", "libretranslate", "astraura", "malla"];

function almacenVacio() {
    return crearAlmacenMemoria();
}

describe("AVISOS — textos por motor", () => {
    it("tiene entrada para cada IdMotor", () => {
        for (const m of MOTORES) {
            expect(AVISOS[m]).toBeDefined();
            expect(typeof AVISOS[m].titulo).toBe("string");
            expect(typeof AVISOS[m].sale).toBe("string");
            expect(typeof AVISOS[m].sale_del_aparato).toBe("boolean");
        }
    });

    it("paquete-local: no sale nada, sale_del_aparato false", () => {
        expect(AVISOS["paquete-local"]).toEqual({
            titulo: "Traducción local",
            sale: "No sale nada",
            sale_del_aparato: false,
        });
    });

    it("navegador: no sale nada, sale_del_aparato false", () => {
        expect(AVISOS["navegador"]).toEqual({
            titulo: "Traducción del navegador",
            sale: "No sale nada",
            sale_del_aparato: false,
        });
    });

    it("libretranslate: va a tu propio equipo, sale_del_aparato true", () => {
        expect(AVISOS["libretranslate"]).toEqual({
            titulo: "LibreTranslate (neurona)",
            sale: "Va a tu propio equipo",
            sale_del_aparato: true,
        });
    });

    it("malla: cifrado hacia tus aparatos o vínculos, sale_del_aparato true", () => {
        expect(AVISOS["malla"]).toEqual({
            titulo: "Malla P2P",
            sale: "Cifrado hacia tus aparatos o vínculos",
            sale_del_aparato: true,
        });
    });

    it("astraura: el texto lo ve el modelo que Astraura elija; no se usa con el modo privado, sale_del_aparato true", () => {
        expect(AVISOS["astraura"]).toEqual({
            titulo: "Astraura",
            sale: "El texto lo ve el modelo que Astraura elija; no se usa con el modo privado",
            sale_del_aparato: true,
        });
    });
});

describe("avisoPendiente / aceptarAviso", () => {
    it("avisoPendiente devuelve true para motor con sale_del_aparato si no se ha aceptado", () => {
        const almacen = almacenVacio();
        expect(avisoPendiente("libretranslate", almacen)).toBe(true);
        expect(avisoPendiente("malla", almacen)).toBe(true);
        expect(avisoPendiente("astraura", almacen)).toBe(true);
    });

    it("avisoPendiente devuelve false para motor sin sale_del_aparato (local, navegador)", () => {
        const almacen = almacenVacio();
        expect(avisoPendiente("paquete-local", almacen)).toBe(false);
        expect(avisoPendiente("navegador", almacen)).toBe(false);
    });

    it("tras aceptarAviso, avisoPendiente devuelve false para ese motor", () => {
        const almacen = almacenVacio();
        aceptarAviso("libretranslate", almacen);
        expect(avisoPendiente("libretranslate", almacen)).toBe(false);
        // otros motores siguen pendientes
        expect(avisoPendiente("malla", almacen)).toBe(true);
        expect(avisoPendiente("astraura", almacen)).toBe(true);
    });

    it("aceptarAviso es idempotente: llamar dos veces no falla", () => {
        const almacen = almacenVacio();
        aceptarAviso("malla", almacen);
        aceptarAviso("malla", almacen);
        expect(avisoPendiente("malla", almacen)).toBe(false);
    });

    it("persistencia: aceptar en un almacen y leer en otro con mismos datos", () => {
        const almacen1 = crearAlmacenMemoria();
        aceptarAviso("astraura", almacen1);
        // simular mismo estado en otro almacen
        const almacen2 = crearAlmacenMemoria();
        const raw = almacen1.obtener("starseed.traductor.avisos.v1");
        if (raw) almacen2.guardar("starseed.traductor.avisos.v1", raw);
        expect(avisoPendiente("astraura", almacen2)).toBe(false);
    });
});

describe("modo privado excluye astraura", () => {
    it("astraura tiene sale_del_aparato true, así que en modo privado no se usa", () => {
        // El contrato dice: "el modo privado deja Astraura fuera"
        // Esto se verifica en motores-traductor.ts filtrando por ALCANCES_PRIVADOS
        // Aquí solo comprobamos que el aviso lo refleja
        expect(AVISOS["astraura"].sale_del_aparato).toBe(true);
        expect(AVISOS["astraura"].sale).toContain("modo privado");
    });
});

describe("clave de almacenamiento", () => {
    it("la clave usada es starseed.traductor.avisos.v1", () => {
        const almacen = crearAlmacenMemoria();
        aceptarAviso("libretranslate", almacen);
        const raw = almacen.obtener("starseed.traductor.avisos.v1");
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed.libretranslate).toBe(true);
    });
});