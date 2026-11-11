import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

import { AppearanceProvider } from "@/context/appearance-context";
import { VersionesPrueba as Base } from "../versiones-prueba";

const VersionesPrueba = () => (
    <AppearanceProvider>
        <Base />
    </AppearanceProvider>
);
import type { RespuestaPruebas, VersionPrueba } from "@/lib/mando/lanzamientos-pruebas-tipos";

const fetchOriginal = globalThis.fetch;
const pedidos: { url: string; metodo?: string; cuerpo?: Record<string, unknown> }[] = [];
afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
    pedidos.length = 0;
});

const SHA = "6".repeat(40);
const publicada: VersionPrueba = {
    numero: 35, version: "0.5.1-prueba.35", etiqueta: "prueba.35", sha: SHA, fecha: "2026-11-10T07:00:43Z", runUrl: "https://x/run/35",
    plataformas: (["macos", "windows", "linux", "android"] as const).map((p) => ({ plataforma: p, titulo: p, estado: "publicada", desde: null, hasta: null, job: null, url: null, detalle: "" })),
    publicadaEnTodas: true, vigente: { escritorio: true, android: true },
    contenido: { desde: "7".repeat(40), total: 1, grupos: [{ tarea: "LLA1111B", commits: [{ sha: "1".repeat(40), asunto: "LLA1111B: voz y vídeo" }] }] },
    comprobaciones: [
        { id: "c1", texto: "Llamada por Bluetooth", aparato: "Mac", estado: "bien", nota: "", quien: "alex", t: null },
        { id: "c2", texto: "Cámara del iPhone", aparato: "Mac", estado: "falla", nota: "selector vacío", quien: "alex", t: null },
        { id: "c3", texto: "Tablet sin Wi-Fi", aparato: "Android", estado: "pendiente", nota: "", quien: "", t: null },
    ],
    aprobacion: null, director: null,
    mainMovido: { cabeza: "c".repeat(40), total: 2, grupos: [{ tarea: "VEN1111D", commits: [{ sha: "9".repeat(40), asunto: "VEN1111D: ventanas" }, { sha: "8".repeat(40), asunto: "VEN1111D: más" }] }] },
    desconocido: [],
};

function servir(r: Partial<RespuestaPruebas> & { aprobarAqui?: boolean }) {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        pedidos.push({ url: String(url), metodo: init?.method, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (init?.method === "POST") return new Response(JSON.stringify({ ok: true }), { status: 200 });
        return new Response(JSON.stringify({ versiones: [], resumen: "Sin versiones de prueba", web: null, avisos: [], generadoEn: "2026-11-11T10:00:00Z", ...r }), { status: 200 });
    }) as typeof fetch;
}

describe("VersionesPrueba", () => {
    it("sin versiones dice qué está vacío y desde cuándo", async () => {
        servir({});
        render(<VersionesPrueba />);
        expect(await screen.findByText(/Ninguna versión de prueba en marcha ni publicada/)).toBeInTheDocument();
    });

    it("marcar una comprobación es un toque", async () => {
        servir({ versiones: [publicada], resumen: "prueba.35 · publicada · 2 de 3 comprobaciones (1 falla)", aprobarAqui: true });
        render(<VersionesPrueba />);
        const fila = await screen.findByTestId("comprobacion-c3");
        fireEvent.click(within(fila).getByRole("button", { name: "Bien" }));
        await waitFor(() => expect(pedidos.find((p) => p.metodo === "POST")?.cuerpo).toEqual({ accion: "marcar", numero: 35, id: "c3", estado: "bien" }));
    });

    it("«Aprobar» abre la confirmación con versión, commit, lo que se lanza, lo pendiente y main movido; nada se envía sin confirmar", async () => {
        servir({ versiones: [publicada], aprobarAqui: true });
        render(<VersionesPrueba />);
        fireEvent.click(await screen.findByRole("button", { name: /^Aprobar$/ }));
        const dialogo = await screen.findByRole("dialog");
        expect(within(dialogo).getByText(/Aprobar 0\.5\.1-prueba\.35 y lanzar la versión oficial 0\.5\.1/)).toBeInTheDocument();
        expect(within(dialogo).getByText(/666666666666/)).toBeInTheDocument();
        expect(within(dialogo).getByText(/Android: \.apk firmado/)).toBeInTheDocument();
        expect(within(dialogo).getByText(/Falla · Mac · Cámara del iPhone/)).toBeInTheDocument();
        expect(within(dialogo).getByText(/Pendiente · Android · Tablet sin Wi-Fi/)).toBeInTheDocument();
        expect(within(dialogo).getByText(/Main avanzó 2 commits/)).toBeInTheDocument();
        expect(pedidos.some((p) => p.metodo === "POST")).toBe(false);
        fireEvent.click(within(dialogo).getByRole("button", { name: /Aprobar y lanzar main \(2 sin probar\)/ }));
        await waitFor(() => expect(pedidos.find((p) => p.metodo === "POST")?.cuerpo).toEqual({ accion: "aprobar", numero: 35, sha: SHA, lanzar_sha: "c".repeat(40) }));
    });

    it("desde otra neurona no hay botón de aprobar", async () => {
        servir({ versiones: [publicada], aprobarAqui: false });
        render(<VersionesPrueba />);
        expect(await screen.findByText(/se aprueba desde Genesis en la Mac/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Aprobar$/ })).toBeNull();
    });
});
