// Paneles del editor con el tema de la pestaña (2026-09-29): variantes de plantilla, novedad de
// diseño, fondo ambiental, exportar, herramientas de acomodo nuevas y el tamaño «Sugerido».
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: {
            widgets: { marco: "libre", compact: false, designMode: "theme", bgStyle: "glass", borderStyle: "thin", headerStyle: "simple", shadows: "md", glassOpacity: 0.6, innerGlow: "none" },
            background: { type: "spline" },
            animations: { hover: false, enabled: false },
        },
        updateConfig: vi.fn(),
    }),
}));
vi.mock("../../dashboard-ai-suggestions", () => ({ DashboardAiSuggestions: () => null }));

import { EditorSuperior, type EditorSuperiorProps } from "../editor-superior";
import type { AccionesEditor, DashboardConAspecto } from "../tipos";
import type { PropsSistema } from "../panel-sistema";
import type { DashboardWidget } from "../../dashboard-types";
import { DEFAULT_DASHBOARD_TEMPLATES } from "../../dashboard-defaults";

beforeAll(() => {
    document.documentElement.dataset.perf = "eco";
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => cleanup());

function acciones(): AccionesEditor {
    return {
        onAnadirWidget: vi.fn(), onForjar: vi.fn(), onCrearDesdePlantilla: vi.fn(), onCambiarWidgets: vi.fn(),
        onRestablecerPredeterminados: vi.fn(), onRenombrar: vi.fn(), onAspecto: vi.fn(), onDuplicar: vi.fn(), onMover: vi.fn(),
        onEliminar: vi.fn(), onPrincipal: vi.fn(), onNuevaPestana: vi.fn(), onCompartir: vi.fn(), onDispositivos: vi.fn(),
        onGestorDispositivos: vi.fn(), onRestaurarTematicas: vi.fn(), onAplicarPlantilla: vi.fn(), onDeshacer: vi.fn(),
        onRehacer: vi.fn(), onListo: vi.fn(),
        onAplicarNovedad: vi.fn(), onDescartarNovedad: vi.fn(), onRestablecerDiseno: vi.fn(), onAmbiente: vi.fn(),
        onExportar: vi.fn(), onImportar: vi.fn(),
    };
}

const sistema: PropsSistema = {
    perfiles: [], perfilActivoId: null, onPerfil: vi.fn(), memoria: [], onRasgo: vi.fn(),
    proveedorIa: "ollama", onProveedorIa: vi.fn(), temperatura: 0.7, onTemperatura: vi.fn(), agente: "central", onAgente: vi.fn(),
    servicios: { supabase: true, ipfs: false, github: true, vercel: true }, onServicio: vi.fn(),
    servidores: ["vercel"], onServidor: vi.fn(), vpn: false, onVpn: vi.fn(), tor: false, onTor: vi.fn(), zkp: true, onZkp: vi.fn(),
    sincronizando: false, progreso: 0, onSincronizar: vi.fn(), onUbicacion: vi.fn(),
};

const clima: DashboardConAspecto = {
    id: "c1", profile_id: "local", name: "Clima", is_default: false, category: "clima", created_at: "", updated_at: "",
    plantilla: { cat: "clima", v: "gen11", huella: "" },
};

// Un Clima «tocado»: sin el héroe y con un hueco a la derecha.
const widgets: DashboardWidget[] = [
    { id: "a", dashboard_id: "c1", widget_type: "WEATHER_TEMPERATURE", layout: { x: 0, y: 0, w: 3, h: 3, i: "a" }, settings: {}, created_at: "" },
    { id: "b", dashboard_id: "c1", widget_type: "WEATHER_WIND", layout: { x: 3, y: 0, w: 3, h: 5, i: "b" }, settings: {}, created_at: "" },
];

function montar(extra: Partial<EditorSuperiorProps> = {}) {
    const a = acciones();
    let grupo: EditorSuperiorProps["grupo"] = null;
    const props = (): EditorSuperiorProps => ({
        dashboard: clima, dashboards: [clima], widgets, grupo, onGrupo: (g) => { grupo = g; utils.rerender(<EditorSuperior {...props()} />); },
        acciones: a, puedeDeshacer: false, puedeRehacer: false, cuadricula: false, onCuadricula: vi.fn(), estiloBarra: "liquid-crystal",
        onEstiloBarra: vi.fn(), pantallaCompleta: true, onPantallaCompleta: vi.fn(), faltanTematicas: 0, temasRecientes: [], onAplicarTema: vi.fn(),
        sistema, novedad: true, predeterminada: true, currentDevice: "tablet", ...extra,
    });
    const utils = render(<EditorSuperior {...props()} />);
    return { a };
}

describe("paneles del editor con el tema de la pestaña", () => {
    it("Plantillas: las tres variantes de su tema van primero y se aplican con su variante", async () => {
        const { a } = montar();
        fireEvent.click(screen.getByRole("button", { name: "Plantillas" }));
        const panel = await screen.findByRole("region", { name: "Panel Plantillas" });
        expect(within(panel).getByRole("heading", { name: /para esta pestaña · clima/i })).toBeTruthy();
        fireEvent.click(within(panel).getByRole("button", { name: "Aplicar Clima Esencial a Clima" }));
        expect(a.onAplicarPlantilla).toHaveBeenCalledWith("clima", "esencial");
        fireEvent.click(within(panel).getByRole("button", { name: "Aplicar Clima Enfoque a Clima" }));
        expect(a.onAplicarPlantilla).toHaveBeenLastCalledWith("clima", "enfoque");
    });

    it("Pestaña: estrenar o mantener el diseño nuevo, fondo ambiental, exportar e icono del tema", async () => {
        const { a } = montar();
        fireEvent.click(screen.getByRole("button", { name: "Pestaña" }));
        const panel = await screen.findByRole("region", { name: "Panel Pestaña" });
        fireEvent.click(within(panel).getByRole("button", { name: /estrenar el diseño nuevo/i }));
        expect(a.onAplicarNovedad).toHaveBeenCalledWith("c1");
        fireEvent.click(within(panel).getByRole("button", { name: /mantener la mía/i }));
        expect(a.onDescartarNovedad).toHaveBeenCalledWith("c1");
        fireEvent.click(within(panel).getByRole("radio", { name: "Apagado" }));
        expect(a.onAmbiente).toHaveBeenCalledWith("c1", "apagado");
        fireEvent.click(within(panel).getByRole("button", { name: /exportar \(\.json\)/i }));
        expect(a.onExportar).toHaveBeenCalledWith("c1");
        fireEvent.click(within(panel).getByRole("button", { name: /restablecer esta pestaña/i }));
        expect(a.onRestablecerDiseno).toHaveBeenCalledWith("c1");
        expect(within(panel).getByRole("radio", { name: /el del tema/i }).getAttribute("aria-checked")).toBe("true");
    });

    it("Acomodo: acomodo inteligente, igualar alturas y rellenar huecos; marca este dispositivo", async () => {
        const { a } = montar();
        fireEvent.click(screen.getByRole("button", { name: "Acomodo" }));
        const panel = await screen.findByRole("region", { name: "Panel Acomodo" });
        fireEvent.click(within(panel).getByRole("button", { name: /igualar alturas por fila/i }));
        const igualado = (a.onCambiarWidgets as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as DashboardWidget[];
        expect(igualado.find((w) => w.id === "a")!.layout.h).toBe(5);
        fireEvent.click(within(panel).getByRole("button", { name: /rellenar huecos/i }));
        const relleno = (a.onCambiarWidgets as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as DashboardWidget[];
        expect(relleno.find((w) => w.id === "b")!.layout.w).toBe(9);
        expect(within(panel).getByRole("button", { name: /acomodo inteligente/i })).toBeTruthy();
        expect(within(panel).getByText("este dispositivo")).toBeTruthy();
    });

    it("Widgets: con «Sugerido», la pieza del tema que falta se añade con la huella de su diseño", async () => {
        const { a } = montar();
        fireEvent.click(screen.getByRole("button", { name: "Widgets" }));
        const panel = await screen.findByRole("region", { name: "Panel Widgets" });
        fireEvent.click(within(panel).getByRole("radio", { name: /sugerido/i }));
        const ficha = panel.querySelector<HTMLButtonElement>("[data-widget-tipo='WEATHER_BASIC']")!;
        expect(ficha.getAttribute("aria-label")).toMatch(/sugerido/i);
        expect(ficha.textContent).toContain("El protagonista de Clima");
        fireEvent.click(ficha);
        const heroe = DEFAULT_DASHBOARD_TEMPLATES.find((t) => t.categoryId === "clima")!.widgets.find((w) => w.type === "WEATHER_BASIC")!;
        expect(a.onAnadirWidget).toHaveBeenCalledWith("WEATHER_BASIC", expect.objectContaining({ dims: { w: heroe.w, h: heroe.h } }));
    });
});
