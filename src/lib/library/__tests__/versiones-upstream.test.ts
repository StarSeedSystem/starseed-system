// Pruebas del resumen puro de versiones upstream (LIB1025A · Ola 1025R).

import { describe, it, expect } from "vitest";
import {
    normalizarVersion,
    resumirVersiones,
    contarNovedades,
    type FuenteVersion,
    type EstadoVersion,
} from "../versiones-upstream";

function fuente(
    id: string,
    instalada: string,
    remota: string | null,
    estado: EstadoVersion = "desconocida",
    fecha: string | null = null,
): FuenteVersion {
    return {
        id,
        instalada,
        remota,
        estado,
        fecha,
        upstream: `https://github.com/ejemplo/${id}`,
        aviso: null,
    };
}

const INSTALADOS = new Set(["a", "b", "c"]);
const SHA40 = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";

describe("normalizarVersion", () => {
    it("normaliza mayúsculas, espacios, prefijo de paquete y «v» inicial", () => {
        expect(normalizarVersion("  V1.2.3  ")).toBe("1.2.3");
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("v2.3.1")).toBe("2.3.1");
        expect(normalizarVersion("version1")).toBe("version1");
    });

    it("recorta un SHA de 7 a 40 hexadecimales a sus 7 primeros", () => {
        expect(normalizarVersion(SHA40.toUpperCase())).toBe("a1b2c3d");
        expect(normalizarVersion("a1b2c3d")).toBe("a1b2c3d");
    });
});
describe("resumirVersiones", () => {
    it("commits (SHA 7 contra 40), etiqueta con prefijo y release con «v»", () => {
        const r = resumirVersiones(
            [
                fuente("a", "a1b2c3d", SHA40, "igual"),
                fuente("b", "0.7.0", "@cloudflare/computer@0.7.0"),
                fuente("c", "2.3.1", "v2.3.1"),
            ],
            INSTALADOS,
        );
        expect(r.map((x) => x.tono)).toEqual(["al-dia", "al-dia", "al-dia"]);
        expect(r[0].texto).toBe(`Al día (${SHA40})`);
    });

    it("distingue igual, novedad y sin comprobar", () => {
        const r = resumirVersiones(
            [
                fuente("a", "1.0.0", "1.0.0", "igual"),
                fuente("b", "1.0.0", "1.1.0"),
                fuente("c", "1.0.0", null),
            ],
            INSTALADOS,
        );
        expect(r.map((x) => x.tono)).toEqual(["al-dia", "novedad", "sin-comprobar"]);
        expect(r[0].texto).toBe("Al día (1.0.0)");
        expect(r[1].texto).toBe("Versión nueva publicada: 1.1.0 (la ficha tiene 1.0.0)");
        expect(r[2].texto).toBe("No se pudo comprobar ahora");
    });
    it("un estado «hay-actualizacion» da novedad aunque el texto coincida", () => {
        const [r] = resumirVersiones(
            [fuente("a", "1.0.0", "1.0.0", "hay-actualizacion")],
            INSTALADOS,
        );
        expect(r.tono).toBe("novedad");
    });
    it("deja fuera los ids no instalados y respeta el orden de entrada", () => {
        expect(resumirVersiones([fuente("z", "1.0.0", "2.0.0")], INSTALADOS)).toEqual([]);
        const r = resumirVersiones(
            [
                fuente("b", "1.0.0", "1.0.0"),
                fuente("a", "1.0.0", "1.0.0"),
                fuente("c", "1.0.0", "1.0.0"),
            ],
            INSTALADOS,
        );
        expect(r.map((x) => x.id)).toEqual(["b", "a", "c"]);
    });

    it("remota nula nunca da novedad; la fecha va entre paréntesis", () => {
        const r = resumirVersiones(
            [fuente("a", "1.0.0", null, "hay-actualizacion")],
            INSTALADOS,
        );
        expect(r[0].tono).toBe("sin-comprobar");
        expect(contarNovedades(r)).toBe(0);
        const [conFecha] = resumirVersiones(
            [fuente("b", "1.0.0", "1.1.0", "hay-actualizacion", "2026-10-23")],
            INSTALADOS,
        );
        expect(conFecha.texto).toContain("(2026-10-23)");
    });
});
describe("contarNovedades", () => {
    it("cuenta solo las filas con tono novedad", () => {
        const r = resumirVersiones(
            [
                fuente("a", "1.0.0", "1.0.0"),
                fuente("b", "1.0.0", "1.1.0"),
                fuente("c", "1.0.0", null),
            ],
            INSTALADOS,
        );
        expect(contarNovedades(r)).toBe(1);
    });
});
