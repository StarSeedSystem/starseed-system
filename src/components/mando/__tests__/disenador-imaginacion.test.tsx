/**
 * Ola 1021I · IMN1021K2 — en la ramificación y en el diseñador de olas, la sesión
 * profunda ya se llama «imaginación profunda» (§2 de architecture/imaginacion-autodesarrollo.md).
 *
 * Los identificadores NO cambian a propósito: `suenos.py`, `panel-suenos.tsx`,
 * `src/lib/mando/suenos*.ts` y el prefijo `cola-suenos-` que el vigilante usa para NO
 * coger esas colas siguen como estaban (misma regla que el nombre de Genesis).
 *
 * La guardia de todo el área la escribe IMN1021K4 (`src/lib/__tests__/nombre-imaginacion.test.ts`);
 * esta mira SOLO los dos archivos de esta tarea y además el texto que ve una persona.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { DisenadorOla } from "../disenador-ola";

/**
 * La palabra vieja (con eñe) y el nombre en inglés. Va con clases de caracteres a
 * propósito: este archivo no puede contener lo que vigila.
 */
const NOMBRE_VIEJO = /su[e]ñ\w*|\bD[r]eam\b/gi;

/** Las apariciones del nombre viejo en un texto. */
export function apariciones(texto: string): string[] {
    return texto.match(new RegExp(NOMBRE_VIEJO.source, "gi")) ?? [];
}

/** Los dos archivos de esta tarea. */
export const ARCHIVOS = ["ramificacion-agentes.tsx", "disenador-ola.tsx"];

/** El texto de uno de esos archivos. */
export function textoDe(nombre: string): string {
    return readFileSync(path.resolve(__dirname, "..", nombre), "utf8");
}

const fetchOriginal = globalThis.fetch;

/** El Diseñador pregunta dos cosas: el estado y las colas. */
function servir(): void {
    globalThis.fetch = (async (entrada: RequestInfo | URL) => {
        const url = String(entrada);
        if (url.startsWith("/api/mando/colas")) {
            return new Response(
                JSON.stringify({
                    colas: [
                        {
                            nombre: "suenos-propuesta-2026-09-29",
                            archivo: "olas/cola-suenos-propuesta-2026-09-29.json",
                            modificada: "2026-09-29T10:00:00.000Z",
                            tareas: [
                                { id: "SP092930", ola: "300", titulo: "Frenar el sondeo de la malla", archivos: ["src/lib/mando/medidores.ts"], prompt: "Míralo antes de escribir.", depende: [] },
                            ],
                        },
                    ],
                    modelos: [],
                    lanzadorNube: false,
                }),
                { status: 200 },
            );
        }
        if (url.startsWith("/api/mando/estado")) {
            return new Response(JSON.stringify({ cuentas: { enCurso: 0 } }), { status: 200 });
        }
        return new Response("{}", { status: 404 });
    }) as typeof fetch;
}

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

const noop = () => {};

describe("Diseñador de olas · el texto de la propuesta", () => {
    it("anuncia la cola importada como «imaginación profunda»", async () => {
        servir();
        render(<DisenadorOla colaInicial="suenos-propuesta-2026-09-29" onCerrar={noop} />);
        expect(await screen.findByText(/tareas de la propuesta de la imaginación profunda/i)).toBeInTheDocument();
    });

    it("no dice la palabra vieja en ningún texto de la pantalla", async () => {
        servir();
        const { container } = render(<DisenadorOla colaInicial="suenos-propuesta-2026-09-29" onCerrar={noop} />);
        await screen.findByText(/imaginación profunda/i);
        expect(container.textContent ?? "").not.toMatch(/su[e]ñ\w*/);
    });
});

describe("los dos archivos de IMN1021K2", () => {
    it("no dicen la palabra vieja ni el nombre en inglés", () => {
        const fallos: string[] = [];
        for (const archivo of ARCHIVOS) {
            for (const encontrada of apariciones(textoDe(archivo))) {
                fallos.push(`${archivo}: ${encontrada}`);
            }
        }
        expect(fallos, `§2 de architecture/imaginacion-autodesarrollo.md: escribe «imaginación profunda».\n${fallos.join("\n")}`).toEqual([]);
    });

    it("cada uno nombra la sesión profunda como «imaginación profunda»", () => {
        for (const archivo of ARCHIVOS) {
            expect(textoDe(archivo).toLowerCase(), archivo).toContain("imaginación profunda");
        }
    });

    it("la guardia no confunde los identificadores que se quedan", () => {
        expect(apariciones("suenos.py · panel-suenos.tsx · cola-suenos-2026-09-29")).toEqual([]);
        expect(apariciones("«imaginación profunda» · Imaginación profunda")).toEqual([]);
    });
});
