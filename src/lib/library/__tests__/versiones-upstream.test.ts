// Pruebas del resumen puro de versiones upstream de la Librería (LIB1025A · Ola 1025R).

import { describe, it, expect } from "vitest";
import {
    contarNovedades,
    normalizarVersion,
    resumirVersiones,
    type FuenteVersion,
    type ResumenVersion,
} from "../versiones-upstream";

/** Ficha de la ruta con valores de ejemplo, para no repetir en cada caso. */
function fuente(parcial: Partial<FuenteVersion> & Pick<FuenteVersion, "id">): FuenteVersion {
    return {
        instalada: "0.7.0", remota: null, estado: "desconocida",
        fecha: null, upstream: "https://github.com/cloudflare/computer", aviso: null,
        ...parcial,
    };
}

const INSTALADOS = new Set(["lib-cloudflare-computer", "lib-klavis", "lib-inbox-zero"]);

describe("normalizarVersion", () => {
    it("coincide «@cloudflare/computer@0.7.0» con «0.7.0»", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("0.7.0")).toBe("0.7.0");
    });

    it("minúsculas, sin espacios y sin una «v» inicial seguida de dígito", () => {
        expect(normalizarVersion(" 0.7.0 ")).toBe("0.7.0");
        expect(normalizarVersion("V2.0.0")).toBe("2.0.0");
        expect(normalizarVersion("v0.1.206")).toBe("0.1.206");
    });

    it("un SHA de 7 a 40 hexadecimales queda con sus 7 primeros caracteres", () => {
        expect(normalizarVersion("A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2")).toBe("a1b2c3d");
        expect(normalizarVersion("45c9f7d")).toBe("45c9f7d");
        expect(normalizarVersion("a1b2c3")).toBe("a1b2c3"); // 6 hexadecimales: no es un SHA
    });
});

describe("resumirVersiones", () => {
    it("commits: SHA de 7 contra 40 del mismo commit van al día, con la fecha entre paréntesis", () => {
        const [kl] = resumirVersiones([
            fuente({
                id: "lib-klavis",
                instalada: "45c9f7d",
                remota: "45c9f7daaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                estado: "igual",
                fecha: "2026-10-23T10:00:00Z",
            }),
        ], INSTALADOS);
        expect(kl.tono).toBe("al-dia");
        expect(kl.texto).toBe("Al día (45c9f7daaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) (2026-10-23T10:00:00Z)");
    });

    it("commits: SHA distinto es novedad, con o sin veredicto de la ruta", () => {
        const [kl] = resumirVersiones([
            fuente({ id: "lib-klavis", instalada: "45c9f7d", remota: "77aa88b" }),
            fuente({ id: "lib-cloudflare-computer", instalada: "a1b2c3d", remota: "a1b2c3e", estado: "hay-actualizacion" }),
        ], INSTALADOS);
        expect(kl.tono).toBe("novedad");
        expect(kl.texto).toBe("Versión nueva publicada: 77aa88b (la ficha tiene 45c9f7d)");
        expect(kl.upstream).toBe("https://github.com/cloudflare/computer");
    });

    it("etiquetas con prefijo de paquete: decide aunque la ruta diga «desconocida»", () => {
        const resumen = resumirVersiones([
            fuente({ id: "lib-klavis", instalada: "klavis-45c9f7d", remota: "klavis-45c9f7d" }),
            fuente({ id: "lib-klavis", instalada: "klavis-45c9f7d", remota: "klavis-77aa88b" }),
        ], INSTALADOS);
        expect(resumen[0].tono).toBe("al-dia");
        expect(resumen[1].tono).toBe("novedad");
    });

    it("release con «v», y «@paquete@x.y.z» contra «x.y.z»: misma versión, al día", () => {
        const resumen = resumirVersiones([
            fuente({ id: "lib-inbox-zero", instalada: "2.30.0", remota: "v2.30.0" }),
            fuente({ id: "lib-cloudflare-computer", instalada: "@cloudflare/computer@0.7.0", remota: "0.7.0" }),
        ], INSTALADOS);
        expect(resumen[0].tono).toBe("al-dia");
        expect(resumen[0].texto).toBe("Al día (v2.30.0)");
        expect(resumen[1].tono).toBe("al-dia");
        expect(resumen[1].texto).toBe("Al día (0.7.0)");
    });

    it("sin versión remota nunca hay novedad, tenga el estado el que tenga", () => {
        const tonos = resumirVersiones([
            fuente({ id: "lib-cloudflare-computer" }),
            fuente({ id: "lib-klavis", remota: null, estado: "hay-actualizacion" }),
        ], INSTALADOS);
        expect(tonos.map((r) => r.tono)).toEqual(["sin-comprobar", "sin-comprobar"]);
        expect(tonos[0].texto).toBe("No se pudo comprobar ahora");
    });

    it("solo las piezas instaladas, en el orden de entrada", () => {
        const resumen = resumirVersiones([
            fuente({ id: "lib-klavis", instalada: "45c9f7d", remota: "77aa88b" }),
            fuente({ id: "no-instalada", remota: "a1b2c3d", estado: "igual" }),
            fuente({ id: "lib-inbox-zero", remota: "3.0.0" }),
        ], INSTALADOS);
        expect(resumen.map((r) => r.id)).toEqual(["lib-klavis", "lib-inbox-zero"]);
        expect(resumen.map((r) => r.tono)).toEqual(["novedad", "novedad"]);
    });
});

describe("contarNovedades", () => {
    it("cuenta solo las de tono «novedad»; una lista vacía no cuenta nada", () => {
        expect(contarNovedades([])).toBe(0);
        const ejemplo: ResumenVersion[] = [
            { id: "a", tono: "novedad", texto: "", instalada: "1.0.0", remota: "1.1.0", fecha: null, upstream: "u" },
            { id: "b", tono: "al-dia", texto: "", instalada: "1.0.0", remota: "1.0.0", fecha: null, upstream: "u" },
        ];
        expect(contarNovedades(ejemplo)).toBe(1);
    });
});
