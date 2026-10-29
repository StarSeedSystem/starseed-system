// Pruebas del resumen puro de versiones upstream de la Biblioteca (Ola 1025R).

import { describe, it, expect } from "vitest";
import {
    normalizarVersion,
    resumirVersiones,
    contarNovedades,
    type FuenteVersion,
} from "../versiones-upstream";

function fuente(parcial: Partial<FuenteVersion> & { id: string }): FuenteVersion {
    return {
        instalada: "1.0.0",
        remota: "1.0.0",
        estado: "igual",
        fecha: null,
        upstream: "https://github.com/ejemplo/repo",
        aviso: null,
        ...parcial,
    };
}
const INSTALADOS = new Set(["a", "b", "c", "d"]);
describe("normalizarVersion", () => {
    it("un SHA de 40 y su corto de 7 coinciden", () => {
        expect(normalizarVersion("0123456789abcdef0123456789abcdef01234567")).toBe("0123456");
        expect(normalizarVersion("0123456")).toBe("0123456");
        expect(normalizarVersion("A1B2C3D4E5F6")).toBe("a1b2c3d");
    });
    it("se queda con lo que va tras la última @ del paquete", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("0.7.0")).toBe("0.7.0");
    });
    it("quita una v inicial seguida de dígito y los espacios", () => {
        expect(normalizarVersion("v2.3.1")).toBe("2.3.1");
        expect(normalizarVersion(" V2.3.1 ")).toBe("2.3.1");
    });
});
describe("resumirVersiones", () => {
    it("commits: SHA de 7 contra 40 del mismo commit queda al día", () => {
        const fila = resumirVersiones(
            [fuente({ id: "a", instalada: "a1b2c3d", remota: "a1b2c3d4e5f6" })],
            INSTALADOS,
        )[0];
        expect(fila.tono).toBe("al-dia");
        expect(fila.texto).toBe("Al día (a1b2c3d4e5f6)");
    });
    it("etiquetas con prefijo de paquete coinciden con su versión", () => {
        const fila = resumirVersiones(
            [fuente({ id: "a", instalada: "@cloudflare/computer@0.7.0", remota: "0.7.0" })],
            INSTALADOS,
        )[0];
        expect(fila.tono).toBe("al-dia");
    });
    it("release con v inicial coincide con la versión de la ficha", () => {
        const fila = resumirVersiones(
            [fuente({ id: "a", instalada: "2.3.1", remota: "v2.3.1", estado: "desconocida" })],
            INSTALADOS,
        )[0];
        expect(fila.tono).toBe("al-dia");
        expect(fila.texto).toBe("Al día (v2.3.1)");
    });
    it("estado «hay-actualizacion» da novedad con la versión publicada", () => {
        const fila = resumirVersiones(
            [fuente({
                id: "a",
                instalada: "1.0.0",
                remota: "1.1.0",
                estado: "hay-actualizacion",
                fecha: "2026-10-24",
            })],
            INSTALADOS,
        )[0];
        expect(fila.tono).toBe("novedad");
        expect(fila.texto).toBe(
            "Versión nueva publicada: 1.1.0 (la ficha tiene 1.0.0) (2026-10-24)",
        );
    });
    it("versiones distintas en «desconocida» (release) también dan novedad", () => {
        const fila = resumirVersiones(
            [fuente({ id: "a", instalada: "1.0.0", remota: "v1.2.0", estado: "desconocida" })],
            INSTALADOS,
        )[0];
        expect(fila.tono).toBe("novedad");
    });
    it("sin remota queda sin comprobar aunque el estado diga lo contrario", () => {
        const fila = resumirVersiones(
            [fuente({ id: "a", remota: null, estado: "hay-actualizacion" })],
            INSTALADOS,
        )[0];
        expect(fila.tono).toBe("sin-comprobar");
        expect(fila.texto).toBe("No se pudo comprobar ahora");
    });
    it("solo incluye ids instalados y conserva el orden de entrada", () => {
        const filas = resumirVersiones(
            [
                fuente({ id: "b", remota: "2.0.0" }),
                fuente({ id: "fuera", remota: "2.0.0" }),
                fuente({ id: "a" }),
            ],
            INSTALADOS,
        );
        expect(filas.map((f) => f.id)).toEqual(["b", "a"]);
        expect(filas[0].tono).toBe("novedad");
        expect(filas[1].tono).toBe("al-dia");
    });
});
describe("contarNovedades", () => {
    it("cuenta solo las filas con tono «novedad»", () => {
        const filas = resumirVersiones(
            [
                fuente({ id: "a", remota: "2.0.0" }),
                fuente({ id: "b" }),
                fuente({ id: "c", remota: null }),
            ],
            INSTALADOS,
        );
        expect(contarNovedades(filas)).toBe(1);
        expect(contarNovedades([])).toBe(0);
    });
});
