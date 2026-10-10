/**
 * (2026-10-10, OPB1011) «Bloqueadas» en tres grupos: cifras, cadenas, transformadas de hoy y la
 * decisión de Alex con su botón (POST «decidir-bloqueada»).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { BloqueadasGrupos } from "@/components/mando/bloqueadas-grupos";
import type { DetalleMedidor } from "@/lib/mando/medidores";

const detalle: DetalleMedidor = {
    clave: "bloqueadas",
    titulo: "Bloqueadas",
    resumen: "1 te necesita · 2 en cadena",
    acciones: [],
    filas: [
        { id: "A", titulo: "a", estado: "bloqueada", grupo: "cadena", acciones: [] },
        { id: "B", titulo: "b", estado: "bloqueada", grupo: "cadena", acciones: [] },
        { id: "K1", titulo: "k", estado: "bloqueante", grupo: "alex", acciones: [] },
    ],
    bloqueadas: {
        valor: 1,
        enCadena: 2,
        atascadas: 0,
        alex: 1,
        transformadasHoy: 1,
        pastilla: "2 en cadena · ábrelo para ver por qué",
        texto: "1 te necesita · 2 en cadena",
        cadenas: [{ raiz: "PM1010F0A", titulo_raiz: "Molécula", va_por: "pendiente en cola", esperan: ["A", "B"], n: 2 }],
        transformadas: [{ t: "2026-10-10 04:30:00", tid: "PM1010F0K", accion: "reintentar", motivo: "cerrojo de git", resultado: "aplicada" }],
        preguntas: [{ id: "K1", pregunta: "¿La rehago o la descarto?", opciones: ["rehacer", "descartar"] }],
        revisorAlDia: true,
        revisorDesde: "2026-10-10T04:58:00",
        revisorMedio: "maggasukha",
    },
};

describe("BloqueadasGrupos", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("enseña cifras, cadenas, transformadas y la pregunta", () => {
        render(<BloqueadasGrupos detalle={detalle} />);
        expect(screen.getByTestId("bloqueadas-cifras")).toHaveTextContent("2en cadena");
        expect(screen.getByTestId("bloqueadas-cadenas")).toHaveTextContent("esperan a PM1010F0A");
        expect(screen.getByTestId("bloqueadas-transformadas")).toHaveTextContent("reintentada sin gastar intento");
        expect(screen.getByTestId("bloqueadas-alex")).toHaveTextContent("¿La rehago o la descarto?");
        expect(screen.getByTestId("revisor-frescura")).toHaveTextContent("04:58");
        expect(screen.queryByTestId("bloqueadas-atascadas")).toBeNull();
    });

    it("el botón manda la decisión de Alex", async () => {
        const cuerpos: unknown[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                cuerpos.push(JSON.parse(String(init?.body)));
                return new Response(JSON.stringify({ ok: true, resumen: "K1 vuelve a la cola" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }),
        );
        const alHecho = vi.fn();
        render(<BloqueadasGrupos detalle={detalle} alHecho={alHecho} />);
        fireEvent.click(screen.getByTestId("decidir-K1-rehacer"));
        await waitFor(() => expect(screen.getByTestId("bloqueadas-grupos-resultado")).toHaveTextContent("K1 vuelve a la cola"));
        expect(cuerpos[0]).toEqual({ clave: "bloqueadas", accion: "decidir-bloqueada", id: "K1", opcion: "rehacer" });
        expect(alHecho).toHaveBeenCalled();
    });
});
