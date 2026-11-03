import { describe, expect, it } from "vitest";

import {
    capasVisibles,
    compararVersiones,
    normalizarEstado,
    porcentaje,
    textoNoche,
    vacioAutomejora,
} from "../automejora";
import type { ArchivoDirectivas, DirectivaCapa } from "../directivas";

const directiva = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
    capa: "regla", version: 2, sha256: "a".repeat(64), acierto: 0.6, base: 0.5, n: 80,
    fecha: "2026-10-27", origen: "meta-n", estado: "activa", texto: "Comprueba el dato.", ...extra,
});
const archivo = (historial: DirectivaCapa[], activa: number | null): ArchivoDirectivas =>
    ({ v: 1, capa: "regla", activa, historial });

describe("normalizarEstado", () => {
    it("basura o nula → estado vacío y sin noche", () => {
        const estado = normalizarEstado("no soy objeto");
        expect(estado.vacio).toBe(true);
        expect(estado.ultimaNoche).toBe(null);
        expect(estado.config.capas).toEqual({});
    });

    it("lee config, capas, aportar y la última noche sin campos inventados", () => {
        const estado = normalizarEstado({
            vacio: false,
            config: { capas: { regla: true }, aportar: { regla: false }, preguntar: true, frecuencia: "semana", topeLlamadas: 12 },
            directivas: { regla: archivo([directiva()], 2) },
            ultimaNoche: {
                fecha: "2026-10-30", donde: "A1", llamadas: 7, motivo: "hecho",
                propuestas: [{ task_id: "AMJ1", titulo: "ayuda", capa: "regla" }, "basura"],
                aprobadas: [{ capa: "regla", version: 2, acierto: 0.8, base: 0.5, n: 40 }],
            },
        });
        expect(estado.vacio).toBe(false);
        expect(estado.config.capas.regla).toBe(true);
        expect(estado.config.aportar.regla).toBe(false);
        expect(estado.config.preguntar).toBe(true);
        expect(estado.config.topeLlamadas).toBe(12);
        expect(estado.directivas.regla?.historial).toHaveLength(1);
        expect(estado.ultimaNoche?.propuestas).toHaveLength(1);
        expect(estado.ultimaNoche?.aprobadas[0].acierto).toBe(0.8);
    });
});

describe("capasVisibles", () => {
    it("une las conocidas con las de la config y las directivas, sin repetir", () => {
        const estado = vacioAutomejora();
        estado.config.capas = { regla: true, nueva: false };
        estado.directivas = { otra: archivo([], null) };
        const capas = capasVisibles(estado);
        expect(capas).toContain("regla");
        expect(capas).toContain("needle");
        expect(capas).toContain("nueva");
        expect(capas).toContain("otra");
        expect(new Set(capas).size).toBe(capas.length);
    });
});

describe("compararVersiones", () => {
    it("devuelve la activa y la anterior más reciente de versión menor", () => {
        const r = compararVersiones(archivo([
            directiva({ version: 1, estado: "anterior", acierto: 0.5 }),
            directiva({ version: 3, estado: "activa", acierto: 0.62 }),
        ], 3));
        expect(r.activa?.version).toBe(3);
        expect(r.anterior?.version).toBe(1);
    });

    it("sin archivo, sin activa o con estado incoherente → null", () => {
        expect(compararVersiones(undefined)).toEqual({ activa: null, anterior: null });
        expect(compararVersiones(archivo([directiva()], null))).toEqual({ activa: null, anterior: null });
        expect(compararVersiones(archivo([directiva({ estado: "anterior" })], 2))).toEqual({ activa: null, anterior: null });
    });
});

describe("textos", () => {
    it("sin noche dice «Aún no ha corrido»; con noche enseña fecha y dónde", () => {
        expect(textoNoche(null)).toBe("Aún no ha corrido");
        expect(textoNoche({
            fecha: "2026-10-30", donde: "A1", llamadas: 3, motivo: "",
            propuestas: [], aprobadas: [],
        })).toBe("Última noche: 2026-10-30 en A1");
    });

    it("el acierto se enseña como porcentaje y sin medida «—»", () => {
        expect(porcentaje(0.62)).toBe("62 %");
        expect(porcentaje(null)).toBe("—");
    });
});
