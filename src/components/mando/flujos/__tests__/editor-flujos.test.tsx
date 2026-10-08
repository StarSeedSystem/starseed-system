import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
    EditorFlujos,
    flujoDesdeServidor,
    flujoParaServidor,
    nuevoIdNodo,
    rutaConexion,
} from "../editor-flujos";
import { CAMPOS_POR_TIPO } from "../panel-nodo";

const fetchOriginal = globalThis.fetch;

const FLUJO_GUARDADO = {
    id: "avisos",
    nombre: "Avisos diarios",
    nodos: [
        { id: "cron-1", tipo: "cron", configuracion: { expresion: "0 8 * * *", posicion: { x: 50, y: 60 } } },
        { id: "ntfy-1", tipo: "ntfy", configuracion: { tema: "genesis", posicion: { x: 300, y: 60 } }, reintentos: 2, espera_ms: 500 },
    ],
    conexiones: [{ origen: "cron-1", destino: "ntfy-1" }],
};

function instalarFetch(respuestas: Record<string, unknown> = {}) {
    const llamadas: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof entrada === "string" ? entrada : entrada.toString();
        llamadas.push({ url, init });
        let cuerpo: unknown = { ok: true };
        if (url === "/api/mando/flujos") cuerpo = respuestas.lista ?? { ok: true, flujos: [{ id: "avisos", nombre: "Avisos diarios", nodos: 2, disparador: "cron" }] };
        else if (url.startsWith("/api/mando/flujos?flujo=")) cuerpo = respuestas.flujo ?? { ok: true, flujo: FLUJO_GUARDADO };
        else if (url.startsWith("/api/mando/flujos?ejecuciones=")) cuerpo = respuestas.ejecuciones ?? { ok: true, ejecuciones: [] };
        else if (url === "/api/mando/claves") cuerpo = respuestas.claves ?? { ok: true, claves: [{ proveedor: "ntfy", variable: "NTFY_TOKEN", presente: true, huella: null, mascara: null, estado: "ok" }] };
        return new Response(JSON.stringify(cuerpo), { status: 200 });
    }) as typeof fetch;
    return llamadas;
}

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

describe("editor-flujos (funciones puras)", () => {
    it("flujoDesdeServidor resiste respuestas incompletas o extrañas", () => {
        expect(flujoDesdeServidor(null)).toBeNull();
        expect(flujoDesdeServidor({ ok: false, error: "veto" })).toBeNull();
        expect(flujoDesdeServidor({ id: "x" })).toBeNull();
    });

    it("flujoDesdeServidor recupera posiciones y descarta conexiones rotas", () => {
        const flujo = flujoDesdeServidor({
            id: "f", nombre: "F",
            nodos: [
                { id: "a", tipo: "cron", configuracion: { expresion: "* * * * *", posicion: { x: 9, y: 7 } } },
                { id: "b", tipo: "set" },
                { id: "", tipo: "set" },
            ],
            conexiones: [{ origen: "a", destino: "b" }, { origen: "a", destino: "z" }],
        });
        expect(flujo).not.toBeNull();
        expect(flujo?.nodos).toHaveLength(2);
        expect(flujo?.nodos[0].posicion).toEqual({ x: 9, y: 7 });
        expect(flujo?.nodos[0].configuracion).toEqual({ expresion: "* * * * *" });
        expect(flujo?.conexiones).toEqual([{ origen: "a", destino: "b" }]);
    });

    it("flujoParaServidor guarda la posición dentro de configuracion", () => {
        const flujo = flujoDesdeServidor(FLUJO_GUARDADO);
        expect(flujo).not.toBeNull();
        const salida = flujoParaServidor(flujo!) as { nodos: Array<Record<string, unknown>> };
        const ntfy = salida.nodos.find((n) => n.id === "ntfy-1")!;
        expect(ntfy.configuracion).toMatchObject({ tema: "genesis", posicion: { x: 300, y: 60 } });
        expect(ntfy.reintentos).toBe(2);
        expect(ntfy.espera_ms).toBe(500);
    });

    it("rutaConexion dibuja una curva cúbica entre los dos puertos", () => {
        const ruta = rutaConexion({ x: 0, y: 0 }, { x: 200, y: 80 });
        expect(ruta.startsWith("M 0 0 C ")).toBe(true);
        expect(ruta.endsWith(", 200 80")).toBe(true);
    });

    it("nuevoIdNodo incrementa hasta encontrar hueco", () => {
        const flujo = flujoDesdeServidor(FLUJO_GUARDADO)!;
        expect(nuevoIdNodo(flujo.nodos, "cron")).toBe("cron-2");
        expect(nuevoIdNodo([], "chat_director")).toBe("chat-director-1");
    });

    it("cada tipo del motor tiene su panel (aunque sea vacío)", () => {
        for (const tipo of ["webhook", "cron", "bus", "chat", "http", "ntfy", "telegram", "chat_director", "ia", "conocimiento", "si", "switch", "fusion", "set", "esperar"]) {
            expect(CAMPOS_POR_TIPO[tipo]).toBeDefined();
        }
    });
});

describe("EditorFlujos (render e interacción)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("pinta la paleta de tipos y avisa si aún no hay flujo abierto", async () => {
        instalarFetch();
        render(<EditorFlujos />);
        expect(screen.getByLabelText("Paleta de tipos de nodo")).toBeInTheDocument();
        expect(screen.getByText(/Elige un flujo guardado/)).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByRole("option", { name: /Avisos diarios/ })).toBeInTheDocument();
        });
    });

    it("abre un flujo, enseña sus nodos en la lista y abre el panel al editar", async () => {
        instalarFetch();
        render(<EditorFlujos />);
        await waitFor(() => {
            expect(screen.getByRole("option", { name: /Avisos diarios/ })).toBeInTheDocument();
        });
        fireEvent.change(screen.getByLabelText("Flujo abierto"), { target: { value: "avisos" } });
        await waitFor(() => {
            expect(screen.getByLabelText("Lista de nodos")).toBeInTheDocument();
        });
        fireEvent.click(within(screen.getByLabelText("Lista de nodos")).getAllByRole("button", { name: "Editar" })[1]);
        const panel = await screen.findByLabelText("Parámetros del nodo ntfy-1");
        expect(within(panel).getByLabelText(/Tema/)).toHaveValue("genesis");
        expect(within(panel).getByLabelText(/Reintentos/)).toHaveValue(2);
    });

    it("las credenciales se eligen de NOMBRES de variables, nunca valores", async () => {
        instalarFetch();
        render(<EditorFlujos />);
        fireEvent.click(screen.getByRole("button", { name: "Crear flujo" }));
        fireEvent.click(screen.getByRole("button", { name: "+ HTTP" }));
        fireEvent.click(within(screen.getByLabelText("Lista de nodos")).getByRole("button", { name: "Editar" }));
        const panel = await screen.findByLabelText(/Parámetros del nodo http-1/);
        const seleccion = within(panel).getByLabelText(/Credencial/);
        await waitFor(() => {
            expect(within(seleccion).getByRole("option", { name: "NTFY_TOKEN" })).toBeInTheDocument();
        });
        fireEvent.change(seleccion, { target: { value: "NTFY_TOKEN" } });
        expect((seleccion as HTMLSelectElement).value).toBe("NTFY_TOKEN");
    });

    it("Guardar envía el flujo al servicio y Ejecutar deja la entrada manual", async () => {
        const llamadas = instalarFetch();
        render(<EditorFlujos />);
        fireEvent.click(screen.getByRole("button", { name: "Crear flujo" }));
        fireEvent.click(screen.getByRole("button", { name: "+ Cron" }));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => {
            const guardado = llamadas.find((l) => l.url === "/api/mando/flujos" && l.init?.method === "POST");
            expect(guardado).toBeDefined();
            const cuerpo = JSON.parse(String(guardado!.init?.body)) as { accion: string; flujo: { nodos: Array<{ id: string }> } };
            expect(cuerpo.accion).toBe("guardar");
            expect(cuerpo.flujo.nodos[0].id).toBe("cron-1");
        });
        fireEvent.click(screen.getByRole("button", { name: "Ejecutar" }));
        await waitFor(() => {
            const ejecucion = llamadas.filter((l) => l.url === "/api/mando/flujos" && l.init?.method === "POST").at(-1);
            expect(JSON.parse(String(ejecucion!.init?.body))).toMatchObject({ accion: "ejecutar" });
        });
        expect(await screen.findByText(/Entrada manual dejada/)).toBeInTheDocument();
    });

    it("muestra el aviso del servicio cuando el guardado falla", async () => {
        const llamadas = instalarFetch();
        globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof entrada === "string" ? entrada : entrada.toString();
            llamadas.push({ url, init });
            if (url === "/api/mando/flujos" && init?.method === "POST") {
                return new Response(JSON.stringify({ ok: false, error: "El flujo contiene un ciclo." }), { status: 400 });
            }
            return new Response(JSON.stringify({ ok: true, flujos: [] }), { status: 200 });
        }) as typeof fetch;
        render(<EditorFlujos />);
        fireEvent.click(screen.getByRole("button", { name: "Crear flujo" }));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(await screen.findByText("El flujo contiene un ciclo.")).toBeInTheDocument();
    });
});
