import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
    ejecutarReintentoInteligente,
    resumenVeredictos,
} from "@/lib/mando/reintento-inteligente";
import {
    BotonReintentoIndividual,
    SeccionBloqueadasReintentos,
} from "@/components/mando/ramificacion-agentes";
import type { RamaOla, RamaTarea } from "@/lib/mando/ramificacion";

describe("Reintento Inteligente · Lógica Pura", () => {
    const fixtureProgreso = {
        T1: { id: "T1", estado: "rechazada", titulo: "Tarea rechazada", nota: "Fallo de tipos" },
        T2: { id: "T2", estado: "sustituida", titulo: "Tarea sustituida", nota: "Reemplazada" },
        T3: { id: "T3", estado: "bloqueada", titulo: "Tarea bloqueada", nota: "dependencia no integrada" },
    };

    const fixtureRevisiones = `
### Ola 340 · T1
Seguimiento: bloqueante

Riesgos reales:
1. Error de tipo en propiedad obligatoria
`;

    it("clasifica fixture de tres tareas y devuelve las tres listas correspondientes", () => {
        const resultado = ejecutarReintentoInteligente({
            ids: ["T1", "T2", "T3"],
            progreso: fixtureProgreso,
            revisionesMd: fixtureRevisiones,
        });

        expect(resultado.reintentadas).toContain("T1b");
        expect(resultado.descartadas).toEqual([
            { id: "T2", motivo: "ya vive con otro id" },
        ]);
        expect(resultado.esperando).toEqual([
            { id: "T3", motivo: "esperando a que se integre la dependencia" },
        ]);
        expect(resultado.reencoladas).toHaveLength(1);
        expect(resultado.reencoladas[0]?.id).toBe("T1b");
    });

    it("sin ids procesa automáticamente todas las tareas elegibles del progreso", () => {
        const resultado = ejecutarReintentoInteligente({
            progreso: fixtureProgreso,
            revisionesMd: fixtureRevisiones,
        });

        expect(resultado.reintentadas).toContain("T1b");
        expect(resultado.descartadas).toHaveLength(1);
        expect(resultado.esperando).toHaveLength(1);
    });

    it("resumenVeredictos genera la cadena formateada de la cabecera", () => {
        const tareas = [
            { id: "T1", estado: "rechazada" },
            { id: "T2", estado: "sustituida" },
            { id: "T3", estado: "bloqueada" },
        ];
        const res = resumenVeredictos(tareas, fixtureProgreso, fixtureRevisiones);
        expect(res.resumenTexto).toBe("1 se reintentan · 1 se descartan · 1 esperan");
    });
});

const fetchOriginal = globalThis.fetch;

function crearTareaFake(id: string, estado: string): RamaTarea {
    return {
        id,
        ola: "340",
        cola: "340",
        titulo: `Tarea de prueba ${id}`,
        dependencias: [],
        estado,
        nivel: 0,
        donde: "mac",
        medio: "mando",
        modelo: "nim/kimi-k3",
        proveedor: "nim",
        revisor: "nim/deepseek",
        sha: "1234567",
        nota: "nota de prueba",
        segundos: 10,
        modelosFallidos: [],
        pasos: [],
        eventos: [],
        vivo: null,
        alcance: null,
        revision: null,
        motivoAprobacion: "revisión rechazada",
        bloqueadaPor: estado === "bloqueada" ? "DEP1" : null,
        aprobacion: null,
        impacto: null,
    };
}

function crearOlaFake(tareas: RamaTarea[]): RamaOla {
    return {
        id: "340",
        numero: 340,
        tareas,
        total: tareas.length,
        hechas: 0,
        enCurso: 0,
        fallidas: 0,
        sinCambios: 0,
        pendientes: 0,
        esperandoAprobacion: 0,
        bloqueadas: tareas.length,
        viva: false,
    };
}

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

describe("Reintento Inteligente · Componentes UI", () => {
    it("el botón individual muestra el veredicto antes de pulsar y envía la petición con su id", async () => {
        const llamadas: Array<{ url: string; cuerpo: unknown }> = [];
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            llamadas.push({ url, cuerpo: JSON.parse(String(init?.body ?? "{}")) });
            return new Response(
                JSON.stringify({ reintentadas: ["T1b"], descartadas: [], esperando: [] }),
                { status: 200 }
            );
        }) as typeof fetch;

        const tarea = crearTareaFake("T1", "rechazada");
        const onHecho = vi.fn();
        render(<BotonReintentoIndividual tarea={tarea} onHecho={onHecho} />);

        expect(screen.getByTestId("veredicto-individual")).toHaveTextContent("veredicto:");

        const boton = screen.getByRole("button", { name: "Reintentar con cambio inteligente" });
        fireEvent.click(boton);

        await waitFor(() => expect(llamadas).toHaveLength(1));
        expect(llamadas[0]?.url).toContain("/api/mando/reintentar");
        expect(llamadas[0]?.cuerpo).toEqual({ ids: ["T1"] });
        await waitFor(() => expect(onHecho).toHaveBeenCalled());
    });

    it("el panel global muestra el resumen de veredictos y llama a la ruta sin ids al confirmar", async () => {
        const llamadas: Array<{ url: string; cuerpo: unknown }> = [];
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            llamadas.push({ url, cuerpo: JSON.parse(String(init?.body ?? "{}")) });
            return new Response(
                JSON.stringify({ reintentadas: ["T1b"], descartadas: [{ id: "T2", motivo: "m" }], esperando: [] }),
                { status: 200 }
            );
        }) as typeof fetch;

        const tareas = [
            crearTareaFake("T1", "rechazada"),
            crearTareaFake("T2", "sustituida"),
        ];
        const ola = crearOlaFake(tareas);
        const onHecho = vi.fn();

        render(<SeccionBloqueadasReintentos olas={[ola]} onVer={() => {}} onHecho={onHecho} />);

        expect(screen.getByTestId("resumen-veredictos")).toBeInTheDocument();

        const botonGlobal = screen.getByRole("button", { name: "Reintentar todas las que sirvan" });
        fireEvent.click(botonGlobal);

        const botonSi = await screen.findByRole("button", { name: "sí" });
        fireEvent.click(botonSi);

        await waitFor(() => expect(llamadas).toHaveLength(1));
        expect(llamadas[0]?.url).toContain("/api/mando/reintentar");
        expect(llamadas[0]?.cuerpo).toEqual({});
        await waitFor(() => expect(onHecho).toHaveBeenCalled());
    });
});
