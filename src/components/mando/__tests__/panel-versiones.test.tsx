import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

import { AppearanceProvider } from "@/context/appearance-context";
import { PanelVersiones } from "../panel-versiones";
import type { LanzamientoEstado } from "@/lib/mando/lanzamientos-tipos";

const fetchOriginal = globalThis.fetch;
const pedidos: { url: string; cuerpo?: unknown; metodo?: string }[] = [];

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
    pedidos.length = 0;
});

function renderConProveedor(ui: React.ReactElement) {
    return render(<AppearanceProvider>{ui}</AppearanceProvider>);
}

const estadoVacio: LanzamientoEstado = {
    fase: "esperando-lista",
    detalle: "sin lanzamientos todavía",
    version: "",
    pasos: [],
    jobs: [],
    medios: {},
    historial: [],
    pausado: false,
    tono: "normal",
};

const estadoConLanzamiento: LanzamientoEstado = {
    fase: "compilando",
    detalle: "compilando v0.4.0 en GitHub",
    version: "0.4.0",
    pasos: [
        { fase: "esperando-lista", t: 1700000000000, detalle: "lista terminada" },
        { fase: "esperando-publicacion", t: 1700000100000, detalle: "publicada la versión: etiqueto" },
        { fase: "preparando", t: 1700000200000, detalle: "preparo v0.4.0" },
        { fase: "etiquetando", t: 1700000300000, detalle: "etiqueta v0.4.0 subida" },
        { fase: "compilando", t: 1700000400000, detalle: "compilando v0.4.0 en GitHub" },
    ],
    jobs: [
        { medio: "macos", job: "macos-latest", estado: "en-curso", url: "https://github.com/.../jobs/1", inicio: "2026-11-05T10:00:00Z", fin: null },
        { medio: "windows", job: "windows-latest", estado: "en-cola", url: "https://github.com/.../jobs/2", inicio: null, fin: null },
        { medio: "linux", job: "ubuntu-latest", estado: "ok", url: "https://github.com/.../jobs/3", inicio: "2026-11-05T10:00:00Z", fin: "2026-11-05T10:05:00Z" },
    ],
    medios: {
        macos: { estado: "generando", faltan: [], pequenos: [] },
        windows: { estado: "generando", faltan: [], pequenos: [] },
        linux: { estado: "al-dia", faltan: [], pequenos: [] },
        android: { estado: "no-disponible", faltan: [], pequenos: [] },
    },
    run_url: "https://github.com/StarSeedSystem/starseed-system/actions/runs/123",
    release_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.4.0",
    historial: [{ t: 1700000000000, tipo: "lanzado", version: "0.3.0" }],
    pausado: false,
    tono: "aviso",
};

function servir(estado: LanzamientoEstado = estadoVacio, config = {}) {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        pedidos.push({ url: u, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined, metodo: init?.method });
        if (init?.method === "POST") {
            const cuerpo = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
            if (cuerpo.accion === "regenerar") {
                return new Response(JSON.stringify({ ok: true, detalle: "Regeneración iniciada" }), { status: 200 });
            }
            if (cuerpo.accion === "lanzar") {
                return new Response(JSON.stringify({ ok: true, detalle: "Lanzamiento iniciado" }), { status: 200 });
            }
            if (cuerpo.accion === "pausar") {
                return new Response(JSON.stringify({ ok: true, detalle: "Pausado" }), { status: 200 });
            }
            if (cuerpo.accion === "reanudar") {
                return new Response(JSON.stringify({ ok: true, detalle: "Reanudado" }), { status: 200 });
            }
            if (cuerpo.accion === "reintentar") {
                return new Response(JSON.stringify({ ok: true, detalle: "Reintento iniciado" }), { status: 200 });
            }
            if (cuerpo.accion === "auto") {
                return new Response(JSON.stringify({ ok: true, detalle: "Auto actualizado" }), { status: 200 });
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ estado, ...config }), { status: 200 });
    }) as typeof fetch;
}

async function esperarCarga() {
    // Espera a que aparezca la versión principal (indica que los datos cargaron)
    await screen.findByText(/v0\.4\.0/i, { selector: 'span[class*="text-lg"]' });
}

describe("PanelVersiones", () => {
    it("muestra «sin lanzamientos todavía» cuando no hay estado", async () => {
        servir(estadoVacio);
        renderConProveedor(<PanelVersiones />);
        expect(await screen.findByText(/sin lanzamientos todavía/i)).toBeInTheDocument();
    });

    it("pinta la versión publicada, fase y detalle", async () => {
        servir(estadoConLanzamiento);
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        // La versión principal está en un span con text-lg font-mono
        const versionPrincipal = screen.getByText(/v0\.4\.0/i, { selector: 'span[class*="text-lg"]' });
        expect(versionPrincipal).toBeInTheDocument();
        // El detalle está en un span con text-xs text-white/60
        const detalle = screen.getByText(/compilando v0\.4\.0 en GitHub/i, { selector: 'span[class*="text-xs"]' });
        expect(detalle).toBeInTheDocument();
        // La fase en la pastilla
        expect(screen.getByText(/compilando/i, { selector: 'span[class*="rounded-full"]' })).toBeInTheDocument();
    });

    it("muestra enlaces al run y a la release", async () => {
        servir(estadoConLanzamiento);
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        expect(await screen.findByRole("link", { name: /ver run/i })).toHaveAttribute("href", "https://github.com/StarSeedSystem/starseed-system/actions/runs/123");
        expect(screen.getByRole("link", { name: /ver release/i })).toHaveAttribute("href", "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.4.0");
    });

    it("pinta una fila por medio con icono, título, formatos, versión, estado y botón", async () => {
        servir(estadoConLanzamiento);
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        const tituloMacos = await screen.findByRole("heading", { name: /macOS/i });
        expect(tituloMacos).toBeInTheDocument();
        // La versión en la fila también existe
        const filaMacos = tituloMacos.closest("div[class*='rounded-lg']") as HTMLElement;
        expect(within(filaMacos).getByText(/v0\.4\.0/i)).toBeInTheDocument();
        // El botón de esa fila
        expect(within(filaMacos).getByRole("button", { name: /generar\/actualizar/i })).toBeInTheDocument();
    });

    it("el botón de web dice «Publicar ahora»", async () => {
        servir(estadoConLanzamiento);
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        await screen.findByRole("button", { name: /publicar ahora/i });
    });

    it("el botón «Generar/Actualizar» de macos hace POST {accion:'regenerar', medio:'macos'}", async () => {
        servir(estadoConLanzamiento);
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        // Encontrar el botón dentro de la fila de macOS usando el heading como ancla
        const headingMacos = await screen.findByRole("heading", { name: /macOS/i });
        const filaMacos = headingMacos.closest("div[class*='rounded-lg']");
        const boton = within(filaMacos!).getByRole("button", { name: /generar\/actualizar/i });
        fireEvent.click(boton);
        await waitFor(() => {
            const post = pedidos.find((p) => p.metodo === "POST");
            expect(post).toBeDefined();
            expect(post?.cuerpo).toEqual({ accion: "regenerar", medio: "macos" });
        });
    });

    it("botón «Lanzar versión» hace POST {accion:'lanzar'}", async () => {
        servir({ ...estadoConLanzamiento, fase: "esperando-lista" });
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        const boton = await screen.findByRole("button", { name: /lanzar versión/i });
        fireEvent.click(boton);
        await waitFor(() => {
            const post = pedidos.find((p) => p.metodo === "POST");
            expect(post).toBeDefined();
            expect(post?.cuerpo).toEqual({ accion: "lanzar" });
        });
    });

    it("interruptor «Lanzar sola al terminar cada lista» hace POST {accion:'auto', activo:...}", async () => {
        servir(estadoConLanzamiento);
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        const interruptor = await screen.findByRole("switch", { name: /lanzar sola al terminar cada lista/i });
        expect(interruptor).toHaveAttribute("aria-checked", "false");
        fireEvent.click(interruptor);
        await waitFor(() => {
            const post = pedidos.find((p) => p.metodo === "POST");
            expect(post).toBeDefined();
            expect(post?.cuerpo).toEqual({ accion: "auto", activo: true });
        });
    });

    it("botón «Pausar/Reanudar» alterna entre pausar y reanudar", async () => {
        servir({ ...estadoConLanzamiento, pausado: false });
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        const botonPausar = await screen.findByRole("button", { name: /pausar/i });
        fireEvent.click(botonPausar);
        await waitFor(() => {
            const post = pedidos.find((p) => p.metodo === "POST");
            expect(post).toBeDefined();
            expect(post?.cuerpo).toEqual({ accion: "pausar" });
        });
        pedidos.length = 0;

        servir({ ...estadoConLanzamiento, pausado: true });
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        const botonReanudar = await screen.findByRole("button", { name: /reanudar/i });
        fireEvent.click(botonReanudar);
        await waitFor(() => {
            const post = pedidos.find((p) => p.metodo === "POST");
            expect(post).toBeDefined();
            expect(post?.cuerpo).toEqual({ accion: "reanudar" });
        });
    });

    it("botón «Reintentar paso» solo aparece cuando está atascado", async () => {
        // Con fase atascado: el botón debe aparecer
        servir({ ...estadoConLanzamiento, fase: "atascado", detalle: "fallo en macos" });
        const { unmount } = renderConProveedor(<PanelVersiones />);
        await screen.findByRole("button", { name: /reintentar paso/i });
        unmount();

        // Sin fase atascado: nuevo render con estado normal, el botón NO debe aparecer
        pedidos.length = 0;
        servir(estadoConLanzamiento);
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        expect(screen.queryByRole("button", { name: /reintentar paso/i })).not.toBeInTheDocument();
    });

    it("pinta la línea de tiempo con pasos y jobs", async () => {
        servir(estadoConLanzamiento);
        renderConProveedor(<PanelVersiones />);
        await esperarCarga();
        await screen.findByText(/línea de tiempo/i);
        expect(screen.getByText(/esperando-lista/i)).toBeInTheDocument();
        expect(screen.getByText(/macos-latest/i)).toBeInTheDocument();
        expect(screen.getByText(/en-curso/i)).toBeInTheDocument();
    });
});