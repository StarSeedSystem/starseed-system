import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { PanelProduccion, normalizarEstado } from "../panel-produccion";

const fetchOriginal = globalThis.fetch;
const pedidos: { url: string; cuerpo?: unknown; metodo?: string }[] = [];

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
    pedidos.length = 0;
});

const estadoCrudo = {
    actualizadoEn: "2026-10-05T12:00:00Z",
    candidatos: [
        {
            tid: "ZX1",
            sha: "abc12345def",
            titulo: "Puente del chat",
            puertas: {
                elegibilidad: "ok",
                seguridad: { estado: "ok", detalle: "sin secretos" },
                coherencia: "corriendo",
                pruebas: "omitida",
                publicar: "falla",
            },
        },
    ],
    medios: { web: { sha: "abc12345def" }, mando: "def67890abc" },
    ultimas: [
        { sha: "111aaa", cuando: "2026-10-04 10:00", revertida: false },
        { sha: "222bbb", cuando: "2026-10-05 09:00", resultado: "revertida" },
    ],
};

function servir(config?: { pausada?: boolean }) {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        pedidos.push({ url: u, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined, metodo: init?.method });
        if (init?.method === "POST") return new Response(JSON.stringify({ ok: true }), { status: 200 });
        return new Response(
            JSON.stringify({
                estado: estadoCrudo,
                config: { modo: "seco" },
                pausada: config?.pausada === true,
                vetos: 2,
                actualizadoEn: "2026-10-05T12:00:01Z",
            }),
            { status: 200 },
        );
    }) as typeof fetch;
}

describe("normalizarEstado (pura)", () => {
    it("devuelve un estado vacío coherente cuando no hay archivo", () => {
        expect(normalizarEstado(null)).toEqual({ actualizadoEn: null, candidatos: [], medios: [], publicaciones: [] });
        expect(normalizarEstado("no-json")).toEqual({ actualizadoEn: null, candidatos: [], medios: [], publicaciones: [] });
    });

    it("normaliza puertas como string u objeto, medios como objeto y recorta a 10 publicaciones", () => {
        const visto = normalizarEstado({
            ...estadoCrudo,
            ultimas: Array.from({ length: 14 }, (_, i) => ({ sha: `s${i}`, cuando: `c${i}` })),
        });
        const c = visto.candidatos[0];
        expect(c.tid).toBe("ZX1");
        expect(c.sha).toBe("abc12345");
        expect(c.puertas.map((p) => p.estado)).toEqual(["ok", "ok", "corriendo", "omitida", "falla"]);
        expect(c.puertas[1].detalle).toBe("sin secretos");
        expect(visto.medios).toEqual([
            { nombre: "web", sha: "abc12345" },
            { nombre: "mando", sha: "def67890" },
        ]);
        expect(visto.publicaciones).toHaveLength(10);
        expect(visto.publicaciones[0].sha).toBe("s13");
    });

    it("marca la reversión por bandera o por resultado", () => {
        const visto = normalizarEstado(estadoCrudo);
        expect(visto.publicaciones[0]).toMatchObject({ sha: "222bbb", revertida: true });
        expect(visto.publicaciones[1]).toMatchObject({ sha: "111aaa", revertida: false });
    });
});

describe("PanelProduccion - Puente (action: puente)", () => {
    it("establece un puente como apartado", async () => {
        servir();
        render(<PanelProduccion />);

        fireEvent.click(await screen.findByRole("button", { name: /Vetar/ }));
        fireEvent.change(screen.getByLabelText(/Sha o tarea a vetar/), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "rompe el chat" } });
        fireEvent.click(screen.getByRole("button", { name: /Confirmar veto/ }));

        const post = pedidos.find((p) => p.metodo === "POST");
        expect(post?.cuerpo).toEqual({ accion: "vetar", clave: "abc12345", motivo: "rompe el chat" });
    });

    it("establece un puente como activo", async () => {
        servir();
        render(<PanelProduccion />);

        fireEvent.click(await screen.findByRole("button", { name: /Vetar/ }));
        fireEvent.change(screen.getByLabelText(/Sha o tarea a vetar/), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "rompe el chat" } });
        fireEvent.click(screen.getByRole("button", { name: /Confirmar veto/ }));

        const post = pedidos.find((p) => p.metodo === "POST");
        expect(post?.cuerpo).toEqual({ accion: "vetar", clave: "abc12345", motivo: "rompe el chat" });
    });
});
