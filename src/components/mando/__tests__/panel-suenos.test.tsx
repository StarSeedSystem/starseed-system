import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { PanelSuenos } from "../panel-suenos";

const fetchOriginal = globalThis.fetch;
const pedidos: { url: string; cuerpo?: unknown }[] = [];

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
    pedidos.length = 0;
});

const datos = {
    sesiones: ["2026-09-29"],
    areas: [{ id: "voz", nombre: "Voz" }, { id: "mando", nombre: "Puente de Mando y orquestación" }],
    lentes: [],
    sesion: {
        sesion: "2026-09-29",
        total: 2,
        cuentas: { verificado: 1, analizando: 1 },
        filas: [
            { id: "SA09297", area: "voz", lente: "arquitectura-deuda", estado: "verificado", privado: false, modelo: "nim/moonshotai/kimi-k3", proveedor: "nim", subfase: "", tokens: 48_000, llamadas: 6, segundos: 900, hallazgos: 4, por: "claude-opus-5.5", nota: "" },
            { id: "SA092910", area: "voz", lente: "seguridad-privacidad", estado: "analizando", privado: true, modelo: "llm7/gpt-oss", proveedor: "llm7", subfase: "lectura 2/9 · llm7/gpt-oss", tokens: 3_000, llamadas: 1, segundos: 120, hallazgos: 0, por: "", nota: "" },
        ],
        tokens: 51_000,
        completa: false,
        orquestadorVivo: true,
        informeFinal: true,
        informeMd: null,
        propuesta: { nombre: "suenos-propuesta-2026-09-29", tareas: 3 },
        consolidado: {
            generado: "2026-09-29 13:00:00",
            resumen: "Sueños profundos 2026-09-29: 1 informe.",
            propuestas: 3,
            cuentas: {},
            top: [{ titulo: "Frenar el sondeo de la malla", area: "voz", lente: "rendimiento-consumo", archivo: "src/lib/voces/motor.ts", linea: 40, impacto: 5, esfuerzo: 1, confianza: 0.9, verificacion: "verificado", por: "claude-opus-5.5", capacidad: true, privado: false, puntuacion: 4.5, tarea: "SA09299", apariciones: 2, yaEncargada: false, seccion: "riesgo", propuesta: "Frenar el sondeo" }],
        },
        ultimoLanzamiento: { t: "2026-09-29 10:00:00", horas: 3, por: "mando" },
    },
};

function servir() {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        pedidos.push({ url: u, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (u.startsWith("/api/mando/suenos") && (!init || init.method !== "POST")) {
            return new Response(JSON.stringify({ datos }), { status: 200 });
        }
        if (u === "/api/mando/suenos") return new Response(JSON.stringify({ ok: true, mensaje: "Lanzado por el Puente de Mando.", sesion: "2026-09-29" }), { status: 200 });
        return new Response(JSON.stringify({ colas: [], modelos: [] }), { status: 200 });
    }) as typeof fetch;
}

describe("PanelSuenos", () => {
    it("pinta la rejilla, quién verificó, lo privado y las recomendaciones", async () => {
        servir();
        render(<PanelSuenos />);
        expect(await screen.findByText("Frenar el sondeo de la malla")).toBeInTheDocument();
        expect(screen.getByRole("table", { name: /rejilla de sueños/i })).toBeInTheDocument();
        expect(screen.getByText("claude-opus-5.5 · 48 k")).toBeInTheDocument();
        expect(screen.getByLabelText("privado")).toBeInTheDocument();
        expect(screen.getByText(/No se ha lanzado/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Abrir en Diseñador/ })).toBeInTheDocument();
    });

    it("la ficha de un sueño trae la orden de veredicto para el supervisor", async () => {
        servir();
        render(<PanelSuenos />);
        const celda = await screen.findByTitle(/SA092910/);
        fireEvent.click(celda);
        expect(screen.getByRole("article", { name: /Ficha del sueño SA092910/ })).toBeInTheDocument();
        expect(screen.getByText("lectura 2/9 · llm7/gpt-oss")).toBeInTheDocument();
    });

    it("el diálogo de lanzamiento manda horas, y áreas/lentes solo si no son todas", async () => {
        servir();
        render(<PanelSuenos />);
        fireEvent.click(await screen.findByRole("button", { name: /Lanzar…/ }));
        fireEvent.click(screen.getByLabelText("Voz"));
        fireEvent.click(screen.getByRole("button", { name: /^Lanzar$/ }));
        expect(await screen.findByText("Lanzado por el Puente de Mando.")).toBeInTheDocument();
        const post = pedidos.find((p) => p.cuerpo && (p.cuerpo as { accion?: string }).accion === "lanzar");
        expect(post?.cuerpo).toMatchObject({ accion: "lanzar", horas: 3, areas: ["mando"], lentes: [] });
    });
});
