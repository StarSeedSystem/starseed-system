// ════════════════════════════════════════════════════════════════════════════
// Pruebas del resumen de versiones upstream (LIB1025A · 1025R). Módulos puros:
// entrada → salida, sin red, disco ni procesos.
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
    contarNovedades,
    normalizarVersion,
    resumirVersiones,
    type FuenteVersion,
} from "../versiones-upstream";

function fuente(parcial: Partial<FuenteVersion> & { id: string }): FuenteVersion {
    return {
        instalada: "",
        remota: null,
        estado: "desconocida",
        fecha: null,
        upstream: "https://github.com/ejemplo/repo",
        aviso: null,
        ...parcial,
    };
}

describe("normalizarVersion", () => {
    it("recorta un SHA de 40 a sus 7 primeros caracteres", () => {
        expect(normalizarVersion("538eed0abc1234def567890fedcba9876543210f")).toBe("538eed0");
    });

    it(" deja un SHA de 7 como está", () => {
        expect(normalizarVersion("538eed0")).toBe("538eed0");
    });

    it(" se queda con lo que va tras la última @", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
    });

    it(" quita una v inicial seguida de dígito", () => {
        expect(normalizarVersion("v2.30.0")).toBe("2.30.0");
    });

    it(" minúsculas y sin espacios", () => {
        expect(normalizarVersion(" V2.0.0-ALPHA.3 ")).toBe("2.0.0-alpha.3");
    });

    it(" no recorta una versión con puntos", () => {
        expect(normalizarVersion("0.14.6")).toBe("0.14.6");
    });
});

describe("resumirVersiones", () => {
    it(" SHA de 7 contra 40: igual si los 7 primeros coinciden, novedad si no", () => {
        const instalado = new Set(["lib-awesome-llm"]);
        const fuentes = [
            fuente({
                id: "lib-awesome-llm",
                instalada: "538eed0",
                remota: "538eed0abcdef1234567890abcdef1234567890f",
                estado: "igual",
            }),
        ];
        const resumen = resumirVersiones(fuentes, instalado);
        expect(resumen).toHaveLength(1);
        expect(resumen[0]?.tono).toBe("al-dia");
        expect(resumen[0]?.texto).toBe("Al día (538eed0)");

        const otra = [
            fuente({
                id: "lib-awesome-llm",
                instalada: "538eed0",
                remota: "ffffffffffffffffffffffffffffffffffffffff",
                estado: "hay-actualizacion",
            }),
        ];
        expect(resumirVersiones(otra, instalado)[0]?.tono).toBe("novedad");
    });

    it(" etiquetas con prefijo de paquete coinciden con la versión a secas", () => {
        const instalado = new Set(["lib-cloudflare-computer"]);
        const igual = fuente({
            id: "lib-cloudflare-computer",
            instalada: "@cloudflare/computer@0.7.0",
            remota: "0.7.0",
            estado: "desconocida",
        });
        const nueva = { ...igual, remota: "0.7.1" };
        const resumen = resumirVersiones([igual, nueva], instalado);
        expect(resumen[0]?.tono).toBe("al-dia");
        expect(resumen[1]?.tono).toBe("novedad");
        expect(resumen[1]?.texto).toBe(
            "Versión nueva publicada: 0.7.1 (la ficha tiene @cloudflare/computer@0.7.0)",
        );
    });

    it(" release con v inicial: al día si coincide, novedad si avanza", () => {
        const instalado = new Set(["lib-inbox-zero"]);
        const igual = fuente({
            id: "lib-inbox-zero",
            instalada: "2.30.0",
            remota: "v2.30.0",
            estado: "desconocida",
        });
        const nueva = { ...igual, remota: "v2.31.0", fecha: "2026-10-18" };
        const resumen = resumirVersiones([igual, nueva], instalado);
        expect(resumen[0]?.tono).toBe("al-dia");
        expect(resumen[1]?.tono).toBe("novedad");
        expect(resumen[1]?.texto).toBe(
            "Versión nueva publicada: v2.31.0 (la ficha tiene 2.30.0) (2026-10-18)",
        );
    });

    it(" sin remota: tono sin-comprobar, aunque el estado diga hay-actualizacion", () => {
        const instalado = new Set(["lib-klavis"]);
        const resumen = resumirVersiones(
            [fuente({ id: "lib-klavis", instalada: "45c9f7d", estado: "hay-actualizacion" })],
            instalado,
        );
        expect(resumen[0]?.tono).toBe("sin-comprobar");
        expect(resumen[0]?.texto).toBe("No se pudo comprobar ahora");
    });

    it(" con fecha, el texto la lleva entre paréntesis", () => {
        const instalado = new Set(["lib-ossu-cs"]);
        const resumen = resumirVersiones(
            [
                fuente({
                    id: "lib-ossu-cs",
                    instalada: "33d44a4",
                    remota: "33d44a4",
                    estado: "igual",
                    fecha: "2026-07-13",
                }),
            ],
            instalado,
        );
        expect(resumen[0]?.texto).toBe("Al día (33d44a4) (2026-07-13)");
    });

    it(" ids no instalados quedan fuera y el orden es el de entrada", () => {
        const instalado = new Set(["lib-koog", "lib-deepcode"]);
        const fuentes = [
            fuente({ id: "lib-koog", instalada: "1.3.0", remota: "1.3.1" }),
            fuente({ id: "lib-nanobot", instalada: "0.3.5", remota: "0.3.6" }),
            fuente({ id: "lib-deepcode", instalada: "2.3.1", remota: "2.4.0" }),
        ];
        const resumen = resumirVersiones(fuentes, instalado);
        expect(resumen.map((r) => r.id)).toEqual(["lib-koog", "lib-deepcode"]);
        expect(resumen[0]?.tono).toBe("novedad");
        expect(resumen[0]?.upstream).toBe("https://github.com/ejemplo/repo");
        expect(resumen[0]?.remota).toBe("1.3.1");
        expect(resumen[0]?.instalada).toBe("1.3.0");
    });

    it(" remota: null nunca da novedad", () => {
        const instalado = new Set(["lib-powerinfer"]);
        const resumen = resumirVersiones(
            [fuente({ id: "lib-powerinfer", instalada: "8bd56d6", remota: null, estado: "desconocida" })],
            instalado,
        );
        expect(resumen[0]?.tono).toBe("sin-comprobar");
        expect(contarNovedades(resumen)).toBe(0);
    });

    it(" estado igual manda, aunque algo raro se cuele", () => {
        const instalado = new Set(["lib-crewai"]);
        const resumen = resumirVersiones(
            [fuente({ id: "lib-crewai", instalada: "crews/v1", remota: "otra-forma", estado: "igual" })],
            instalado,
        );
        expect(resumen[0]?.tono).toBe("al-dia");
    });
});

describe("contarNovedades", () => {
    it(" cuenta solo las de tono novedad", () => {
        const instalado = new Set(["a", "b", "c"]);
        const resumen = resumirVersiones(
            [
                fuente({ id: "a", instalada: "1.0.0", remota: "1.0.0", estado: "igual" }),
                fuente({ id: "b", instalada: "1.0.0", remota: "1.1.0" }),
                fuente({ id: "c", instalada: "1.0.0", remota: null }),
            ],
            instalado,
        );
        expect(contarNovedades(resumen)).toBe(1);
        expect(contarNovedades([])).toBe(0);
    });
});
