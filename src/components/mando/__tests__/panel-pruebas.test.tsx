import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

import { AppearanceProvider } from "@/context/appearance-context";
import type { VersionPrueba } from "@/lib/mando/lanzamientos-pruebas-tipos";
import type { RespuestaVivo } from "@/lib/mando/pruebas-vivas-tipos";
import { PanelPruebas } from "../panel-pruebas";

const fetchOriginal = globalThis.fetch;
const pedidos: { url: string; metodo?: string; cuerpo?: Record<string, unknown> }[] = [];
afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
    pedidos.length = 0;
});

const SHA = "a".repeat(40);
const ahoraIso = () => new Date().toISOString();
const plataforma = (p: "macos" | "windows" | "linux" | "android", estado: string, extra: Record<string, unknown> = {}) => ({
    plataforma: p, titulo: p === "macos" ? "macOS" : p, estado, desde: new Date(Date.now() - 12 * 60_000).toISOString(), hasta: null, job: null, url: null, detalle: "", ...extra,
});
function version(n: number, plataformas: unknown[], extra: Partial<VersionPrueba> = {}): VersionPrueba {
    return {
        numero: n, version: `0.5.1-prueba.${n}`, etiqueta: `prueba.${n}`, sha: SHA, fecha: ahoraIso(), runUrl: null,
        plataformas, publicadaEnTodas: false, vigente: { escritorio: false, android: false }, contenido: null,
        comprobaciones: [], aprobacion: null, director: null, mainMovido: null, desconocido: [], ...extra,
    } as unknown as VersionPrueba;
}
function vivo(r: Partial<RespuestaVivo> = {}): RespuestaVivo {
    return {
        versiones: [], resumen: "Sin versiones de prueba", web: null, avisos: [], generadoEn: ahoraIso(),
        aprobarAqui: true, controlAqui: true, tipicos: {}, peticiones: [],
        director: { formato: 1, t: ahoraIso(), cadaS: 60, pasada: 1, pausado: false, pausaMotivo: null, pidOk: true, enCurso: null, esperando: null, ultimas: [], peticiones: [], avisos: [] },
        banco: null, cola: { sinPublicar: 0, origen: SHA, local: SHA }, accesos: [], prereleaseLeido: true, enMarcha: null, ahoraServidor: Date.now(),
        ...r,
    } as unknown as RespuestaVivo;
}
function servir(r: RespuestaVivo) {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        pedidos.push({ url: String(url), metodo: init?.method, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (init?.method === "POST") return new Response(JSON.stringify({ ok: true, id: "pet-1731371000-ab12", accion: "compilar" }), { status: 200 });
        return new Response(JSON.stringify(r), { status: 200 });
    }) as typeof fetch;
}
const montar = () => render(<AppearanceProvider><PanelPruebas /></AppearanceProvider>);

describe("PanelPruebas", () => {
    it("sin pruebas lo dice y no inventa", async () => {
        servir(vivo());
        montar();
        expect(await screen.findByTestId("sin-pruebas")).toHaveTextContent(/no ve ninguna versión de prueba/);
        expect(screen.getByTestId("cadena").children.length).toBe(8);
    });

    it("en marcha: pasos hechos de total, tiempo y «aún no se sabe» sin historia", async () => {
        const v = version(40, [
            plataforma("macos", "compilando", { pasos: { hechos: 6, total: 11, actual: "Compilar" } }),
            plataforma("windows", "en-cola"),
            plataforma("linux", "publicada"),
            plataforma("android", "en-cola"),
        ]);
        servir(vivo({ versiones: [v], resumen: "prueba.40 · compilando" }));
        montar();
        const mac = await screen.findByTestId("plataforma-macos");
        expect(within(mac).getByText(/Paso 7 de 11/)).toBeInTheDocument();
        expect(within(mac).getByText(/Compilar/)).toBeInTheDocument();
        expect(within(mac).getByTestId("progreso-macos")).toHaveTextContent(/aún no se sabe/i);
        expect(screen.getByTestId("tono-pruebas")).toHaveTextContent("atento");
    });

    it("fallo: job, paso y registro bajo petición; pedir arreglo con nota", async () => {
        const v = version(40, [
            plataforma("macos", "publicada"),
            plataforma("linux", "fallo", { job: "os · ubuntu-24.04", pasoFallido: "Compilar", runId: 11, jobId: 22, url: "https://github.com/x/y/runs/22" }),
        ]);
        servir(vivo({ versiones: [v] }));
        montar();
        const f = await screen.findByTestId("fallo-linux");
        expect(f).toHaveTextContent("os · ubuntu-24.04");
        expect(f).toHaveTextContent("Compilar");
        expect(screen.getByTestId("tono-pruebas")).toHaveTextContent("falla algo");
        expect(within(f).getByRole("button", { name: /últimas líneas/ })).toBeInTheDocument();
    });

    it("director parado: los botones están desactivados y dicen por qué", async () => {
        servir(vivo({ director: { formato: 1, t: "2026-01-01T00:00:00Z", cadaS: 60, pasada: 1, pausado: false, pausaMotivo: null, pidOk: true, enCurso: null, esperando: null, ultimas: [], peticiones: [], avisos: [] } as never }));
        montar();
        const g = await screen.findByRole("group", { name: /Acciones sobre las pruebas/ });
        for (const b of within(g).getAllByRole("button")) expect(b).toBeDisabled();
        expect(screen.getByTestId("botones-sin-director")).toBeInTheDocument();
    });

    it("compilar pide confirmación y no escribe nada hasta confirmar", async () => {
        servir(vivo());
        montar();
        const g = await screen.findByRole("group", { name: /Acciones sobre las pruebas/ });
        fireEvent.click(within(g).getByRole("button", { name: /Compilar/ }));
        const d = await screen.findByTestId("confirmacion-control");
        expect(pedidos.some((p) => p.metodo === "POST")).toBe(false);
        fireEvent.click(within(d).getByRole("button", { name: /Compilar con lo publicado/ }));
        await waitFor(() => expect(pedidos.find((p) => p.metodo === "POST")?.cuerpo).toMatchObject({ accion: "compilar" }));
        expect(pedidos.find((p) => p.metodo === "POST")?.url).toContain("/pruebas/control");
    });

    it("desde otra neurona se ve pero no se pide", async () => {
        servir(vivo({ controlAqui: false, aprobarAqui: false }));
        montar();
        expect(await screen.findByText(/solo funcionan desde Genesis en la Mac/)).toBeInTheDocument();
        const g = screen.getByRole("group", { name: /Acciones sobre las pruebas/ });
        for (const b of within(g).getAllByRole("button")) expect(b).toBeDisabled();
    });

    it("sin evidencia del banco lo dice, sin inventar aparatos", async () => {
        servir(vivo({ versiones: [version(40, [plataforma("macos", "publicada")], { publicadaEnTodas: true })] }));
        montar();
        expect(await screen.findByTestId("sin-banco")).toBeInTheDocument();
    });

    it("un error de lectura no deja la pantalla vacía", async () => {
        globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
        montar();
        expect(await screen.findByRole("alert")).toBeInTheDocument();
    });
});
