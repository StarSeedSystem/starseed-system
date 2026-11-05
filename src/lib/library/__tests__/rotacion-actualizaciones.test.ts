// Pruebas del módulo puro de rotación de actualizaciones (Ola 1104R).

import { describe, it, expect } from "vitest";
import {
    loteAConsultar,
    fusionar,
    type ConocidasActualizacion,
} from "../rotacion-actualizaciones";

const AHORA = 1_700_000_000_000;
const MINUTO = 60_000;

const entradas = [
    { id: "a", upstream: "https://github.com/a/a" },
    { id: "b", upstream: "https://github.com/b/b" },
    { id: "c", upstream: "https://github.com/c/c" },
    { id: "d", upstream: "https://github.com/d/d" },
];

describe("loteAConsultar", () => {
    it("primero los nunca vistos y después los más viejos", () => {
        const conocidas: ConocidasActualizacion = {
            a: { remota: "v1", fecha: null, t: AHORA - 30 * MINUTO },
            d: { remota: "v1", fecha: null, t: AHORA - 2 * MINUTO },
        };
        expect(
            loteAConsultar(entradas, conocidas, AHORA, { maxLote: 10, edadMinMs: 5 * MINUTO }),
        ).toEqual(["b", "c", "a"]);
    });

    it("respeta el tope maxLote y el orden de las entradas entre los nuevos", () => {
        const conocidas: ConocidasActualizacion = {
            d: { remota: "v1", fecha: null, t: AHORA - 30 * MINUTO },
        };
        expect(
            loteAConsultar(entradas, conocidas, AHORA, { maxLote: 2, edadMinMs: 5 * MINUTO }),
        ).toEqual(["a", "b"]);
    });

    it("no consulta lo reciente ni las fuentes sin upstream", () => {
        const conocidas: ConocidasActualizacion = {
            a: { remota: "v1", fecha: null, t: AHORA - MINUTO },
        };
        const conHueco = [...entradas, { id: "e", upstream: "" }];
        expect(
            loteAConsultar(conHueco, conocidas, AHORA, { maxLote: 10, edadMinMs: 5 * MINUTO }),
        ).toEqual(["b", "c", "d"]);
    });

    it("un tope cero no consulta nada", () => {
        expect(loteAConsultar(entradas, {}, AHORA, { maxLote: 0, edadMinMs: 0 })).toEqual([]);
    });
});

describe("fusionar", () => {
    it("guarda la remota leída con su fecha y el instante de la pasada", () => {
        const fusionada = fusionar(
            {},
            [{ id: "a", remota: "v2.0.0", fecha: "2026-11-01" }],
            AHORA,
        );
        expect(fusionada.a).toEqual({ remota: "v2.0.0", fecha: "2026-11-01", t: AHORA });
    });

    it("un fallo NUNCA borra una remota buena", () => {
        const conocidas: ConocidasActualizacion = {
            a: { remota: "v2.0.0", fecha: "2026-11-01", t: AHORA - MINUTO },
        };
        const fusionada = fusionar(conocidas, [{ id: "a", remota: null, fecha: null }], AHORA);
        expect(fusionada.a).toEqual({ remota: "v2.0.0", fecha: "2026-11-01", t: AHORA });
    });

    it("un fallo sin versión previa deja constancia del intento, sin inventar", () => {
        const fusionada = fusionar({}, [{ id: "a", remota: null, fecha: null }], AHORA);
        expect(fusionada.a).toEqual({ remota: null, fecha: null, t: AHORA });
    });

    it("conserva las fuentes que no entraron en la pasada", () => {
        const conocidas: ConocidasActualizacion = {
            b: { remota: null, fecha: null, t: AHORA - MINUTO },
        };
        const fusionada = fusionar(conocidas, [{ id: "a", remota: "v1", fecha: null }], AHORA);
        expect(fusionada.b).toEqual(conocidas.b);
        expect(fusionada.a.remota).toBe("v1");
    });
});
