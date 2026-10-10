import { describe, it, expect } from "vitest";

import {
    construirResumenRed,
    idDeEntradaCapa,
    leerBanco,
    leerCatalogoCapas,
    leerNuevas,
    type CapaCatalogo,
} from "../capas-red";
import { crearFichaNodo } from "@/lib/network/capacidades-nodo";

const CATALOGO_CRUDO = {
    esquema: 1,
    capas: [
        { id: "needle3-reflejo", capa: "reflejo", modelo: "Cactus Needle 3", version: "3.1.2", estado: "recomendado", sha256: "abc123", espejos: ["https://capas.oracle"] },
        { id: "ternary-bonsai-4b", capa: "palabra", modelo: "Ternary Bonsai 4B", version: "1.58", estado: "recomendado", sha256: null, espejos: [] },
        { roto: true },
    ],
};

describe("leerCatalogoCapas", () => {
    it("criba entradas ilegibles y conserva versión, estado y espejos", () => {
        const capas = leerCatalogoCapas(CATALOGO_CRUDO);
        expect(capas).toHaveLength(2);
        expect(capas[0]).toMatchObject({ id: "needle3-reflejo", version: "3.1.2", estado: "recomendado", espejos: ["https://capas.oracle"] });
        expect(capas[1].sha256).toBeNull();
    });

    it("sin `capas` devuelve lista vacía", () => {
        expect(leerCatalogoCapas(null)).toEqual([]);
        expect(leerCatalogoCapas({})).toEqual([]);
    });
});

describe("leerNuevas", () => {
    it("lee las nuevas del estado del renovador", () => {
        const { nuevas, actualizado } = leerNuevas({
            actualizado: "2026-10-09T10:00",
            nuevas: [{ repo: "Cactus-Compute/needle4", estado: "en-banco", lastModified: "2026-10-08" }],
        });
        expect(actualizado).toBe("2026-10-09T10:00");
        expect(nuevas).toEqual([{ repo: "Cactus-Compute/needle4", estado: "en-banco", lastModified: "2026-10-08" }]);
    });

    it("estado ausente → vacío sin romperse", () => {
        expect(leerNuevas(null)).toEqual({ nuevas: [], actualizado: null });
    });
});

describe("leerBanco", () => {
    it("lista: identifica por capaId y gana el más reciente", () => {
        const mapa = leerBanco([
            { capaId: "needle3-reflejo", tok_s: 40, latencia_ms: 25, acierto: 0.9, fecha: "2026-10-01" },
            { capaId: "needle3-reflejo", tok_s: 50, latencia_ms: 20, acierto: 0.95, fecha: "2026-10-02" },
        ]);
        expect(mapa.get("needle3-reflejo")).toEqual({ tokS: 50, latenciaMs: 20, acierto: 0.95, fecha: "2026-10-02" });
    });

    it("mapa: usa la clave del objeto", () => {
        const mapa = leerBanco({ "ternary-bonsai-4b": { tokS: 12, acierto: 0.8 } });
        expect(mapa.get("ternary-bonsai-4b")).toMatchObject({ tokS: 12, latenciaMs: null });
    });
});

describe("idDeEntradaCapa", () => {
    it("quita versión y sha8 de «id@versión#sha8»", () => {
        expect(idDeEntradaCapa("Needle3-Reflejo@3.1.2#abc123ff")).toBe("needle3-reflejo");
        expect(idDeEntradaCapa("bitnet")).toBe("bitnet");
    });
});

describe("construirResumenRed", () => {
    const catalogo: CapaCatalogo[] = leerCatalogoCapas(CATALOGO_CRUDO);

    it("cuenta dispositivos y servidores desde las fichas reales", () => {
        const fichas = [
            crearFichaNodo({ nodoId: "mac-1", medio: "mac", capas: ["needle3-reflejo@3.1.2"] }),
            crearFichaNodo({ nodoId: "android-1", medio: "android", capas: ["needle3-reflejo@3.1.2", "ternary-bonsai-4b@1.58#deadbeef"] }),
            crearFichaNodo({ nodoId: "oracle", medio: "nube", capas: ["needle3-reflejo@3.1.2", "ternary-bonsai-4b@1.58"] }),
        ];
        const { filas } = construirResumenRed({ catalogo, fichas });
        expect(filas[0]).toMatchObject({ id: "needle3-reflejo", dispositivos: 2, servidores: 1, espejos: 1, shaVerificado: true });
        expect(filas[1]).toMatchObject({ id: "ternary-bonsai-4b", dispositivos: 1, servidores: 1, shaVerificado: false });
    });

    it("sin fichas, los conteos son null («sin medir»), nunca cero", () => {
        const { filas } = construirResumenRed({ catalogo, fichas: [] });
        expect(filas[0].dispositivos).toBeNull();
        expect(filas[0].servidores).toBeNull();
    });

    it("une el último banco y propaga nuevas y fecha", () => {
        const fichas = [crearFichaNodo({ nodoId: "mac-1", medio: "mac", capas: [] })];
        const banco = leerBanco([{ capaId: "needle3-reflejo", tok_s: 50, acierto: 0.95, fecha: "2026-10-02" }]);
        const resumen = construirResumenRed({
            catalogo,
            fichas,
            banco,
            nuevas: [{ repo: "needle4", estado: "en-banco", lastModified: null }],
            actualizado: "2026-10-09",
        });
        expect(resumen.filas[0].banco).toMatchObject({ tokS: 50, acierto: 0.95 });
        expect(resumen.filas[1].banco).toBeNull();
        expect(resumen.nuevas).toHaveLength(1);
        expect(resumen.actualizado).toBe("2026-10-09");
    });
});
