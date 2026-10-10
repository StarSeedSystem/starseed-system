import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { EntradaGenesis } from "@/lib/genesis/operaciones";
import type { FilaDock, PuertosGenesis } from "@/lib/genesis/aplicar";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "flat" }, styling: { crystalPreset: "none" } } }),
}));
const avisos: string[] = [];
vi.mock("sonner", () => ({ toast: { success: (t: string) => avisos.push(`ok:${t}`), error: (t: string) => avisos.push(`error:${t}`) } }));

// Historial en memoria (el real va a Supabase o a este aparato).
const registro: EntradaGenesis[] = [];
vi.mock("@/lib/genesis/historial", () => ({
    anotar: async (e: EntradaGenesis) => {
        registro.unshift(e);
        return "cuenta";
    },
    marcarDeshecha: async (e: EntradaGenesis, resultado: string) => {
        const i = registro.findIndex((x) => x.id === e.id);
        if (i >= 0) registro[i] = { ...registro[i], estado: "deshecha", resultado };
    },
    leerHistorial: async () => ({ entradas: [...registro], donde: "cuenta" }),
}));

import { PanelOperaciones } from "../panel-operaciones";

function puertos(dock: FilaDock[]): PuertosGenesis {
    let n = 0;
    const nada = async () => ({ ok: false as const, motivo: "no" });
    return {
        perfil: { leer: nada, escribir: async () => ({ ok: false, filas: 0 }) },
        entidad: { crearPagina: async () => ({ ok: false }), leer: nada, escribir: async () => ({ ok: false, filas: 0 }), contarPublicaciones: async () => null, borrarPagina: async () => ({ ok: false }) },
        dock: {
            leer: () => dock.map((b) => ({ ...b })),
            guardar(items) {
                dock.splice(0, dock.length, ...items);
            },
            iconoValido: () => true,
        },
        tableros: { listar: () => [], leerWidgets: () => [], guardarWidgets: () => undefined, widgetConocido: () => null },
        agentes: { crear: () => null, borrar: () => false, vincular: () => false, desvincular: () => undefined },
        ahora: () => Date.now(),
        nuevoId: () => `e-${++n}`,
    };
}

afterEach(() => {
    cleanup();
    registro.length = 0;
    avisos.length = 0;
    vi.unstubAllGlobals();
});

describe("Mi Genesis de punta a punta (agente → vista previa → aplicar → deshacer)", () => {
    it("aplica lo que propone el agente solo tras confirmar, y lo deshace", async () => {
        const dock: FilaDock[] = [
            { id: "settings", label: "Ajustes", iconKey: "Settings", path: "/settings", color: "neutral", enabled: true, origin: "preset" },
            { id: "decisiones", label: "Decisiones", iconKey: "Vote", path: "/decisiones", color: "amber", enabled: false, origin: "preset" },
        ];
        const pedidas: unknown[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init: RequestInit) => {
                pedidas.push(JSON.parse(String(init.body)));
                return new Response(
                    JSON.stringify({
                        respuesta: "Pongo Decisiones en tu dock.",
                        operaciones: [
                            { op: { tipo: "dock.añadir", elemento: { id: "decisiones" }, motivo: "Lo pediste" }, avisos: [] },
                            // Aunque el servidor la dejara pasar, el navegador la vuelve a validar.
                            { op: { tipo: "dock.quitar", id: "settings", motivo: "estorba" }, avisos: [] },
                        ],
                        modelo: "groq/prueba",
                    }),
                    { status: 200 },
                );
            }),
        );
        const contexto = { dock: dock.map((b) => ({ id: b.id, etiqueta: b.label, ruta: b.path, activo: b.enabled })) };
        render(<PanelOperaciones ambito={{ tipo: "persona" }} modo="aplicar" motivoModo="Se aplican cuando confirmas." puertos={puertos(dock)} cargarContexto={async () => ({ contexto })} />);

        fireEvent.change(screen.getByTestId("genesis-entrada"), { target: { value: "pon decisiones en mi dock" } });
        fireEvent.click(screen.getByRole("button", { name: /pedir/i }));

        expect(await screen.findByText("Pongo Decisiones en tu dock.")).toBeInTheDocument();
        expect(screen.getByText(/groq\/prueba/)).toBeInTheDocument();
        expect(pedidas[0]).toMatchObject({ mensaje: "pon decisiones en mi dock", ambito: { tipo: "persona" } });
        // Solo queda la válida; la que quitaba Ajustes se descartó con su motivo.
        expect(screen.getAllByTestId("genesis-operacion")).toHaveLength(1);
        expect(avisos.some((a) => a.startsWith("error:") && /Ajustes/.test(a))).toBe(true);

        // Un toque no aplica: hace falta confirmar.
        fireEvent.click(screen.getByTestId("genesis-aplicar"));
        expect(dock.find((b) => b.id === "decisiones")?.enabled).toBe(false);
        fireEvent.click(screen.getByTestId("genesis-confirmar"));
        await waitFor(() => expect(dock.find((b) => b.id === "decisiones")?.enabled).toBe(true));
        await waitFor(() => expect(screen.queryAllByTestId("genesis-operacion")).toHaveLength(0));
        expect(registro[0]).toMatchObject({ estado: "aplicada", operacion: { tipo: "dock.añadir" } });

        fireEvent.click(await screen.findByTestId("genesis-deshacer"));
        await waitFor(() => expect(dock.find((b) => b.id === "decisiones")?.enabled).toBe(false));
        await waitFor(() => expect(registro[0].estado).toBe("deshecha"));
    });

    it("sin modelos configurados lo dice tal cual", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Este servidor no tiene ningún modelo gratuito configurado para Genesis." }), { status: 503 })));
        render(<PanelOperaciones ambito={{ tipo: "persona" }} modo="aplicar" motivoModo="" puertos={puertos([])} cargarContexto={async () => ({ contexto: {} })} />);
        fireEvent.change(screen.getByTestId("genesis-entrada"), { target: { value: "hola" } });
        fireEvent.click(screen.getByRole("button", { name: /pedir/i }));
        expect(await screen.findByText(/ningún modelo gratuito configurado/)).toBeInTheDocument();
        expect(screen.queryAllByTestId("genesis-operacion")).toHaveLength(0);
    });
});
