// Barra del editor superior: grupos que abren su panel, «Listo», añadir widget y deshacer.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
// Las sugerencias de Astraura llaman a proveedores de IA: fuera de la prueba.
vi.mock("../../dashboard-ai-suggestions", () => ({ DashboardAiSuggestions: () => null }));

import { EditorSuperior, type EditorSuperiorProps } from "../editor-superior";
import type { AccionesEditor, DashboardConAspecto } from "../tipos";
import type { PropsSistema } from "../panel-sistema";

beforeAll(() => {
    // Sin animaciones: los paneles cambian al instante.
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
    };
}

const sistema: PropsSistema = {
    perfiles: [], perfilActivoId: null, onPerfil: vi.fn(), memoria: [], onRasgo: vi.fn(),
    proveedorIa: "ollama", onProveedorIa: vi.fn(), temperatura: 0.7, onTemperatura: vi.fn(), agente: "central", onAgente: vi.fn(),
    servicios: { supabase: true, ipfs: false, github: true, vercel: true }, onServicio: vi.fn(),
    servidores: ["vercel"], onServidor: vi.fn(), vpn: false, onVpn: vi.fn(), tor: false, onTor: vi.fn(), zkp: true, onZkp: vi.fn(),
    sincronizando: false, progreso: 0, onSincronizar: vi.fn(), onUbicacion: vi.fn(),
};

const inicio: DashboardConAspecto = { id: "d1", profile_id: "local", name: "Inicio", is_default: true, category: "social", created_at: "", updated_at: "" };
const red: DashboardConAspecto = { id: "d2", profile_id: "local", name: "Red", is_default: false, category: "red", created_at: "", updated_at: "" };

/** Monta el editor controlando el grupo abierto como lo haría el tablero. */
function montar(extra: Partial<Omit<EditorSuperiorProps, "grupo" | "onGrupo">> = {}) {
    const a = acciones();
    let grupo: EditorSuperiorProps["grupo"] = null;
    const props = (): EditorSuperiorProps => ({
        dashboard: inicio, dashboards: [inicio, red], widgets: [], grupo, onGrupo: (g) => { grupo = g; utils.rerender(<EditorSuperior {...props()} />); },
        acciones: a, puedeDeshacer: false, puedeRehacer: false, cuadricula: false, onCuadricula: vi.fn(), estiloBarra: "liquid-crystal",
        onEstiloBarra: vi.fn(), pantallaCompleta: true, onPantallaCompleta: vi.fn(), faltanTematicas: 0, temasRecientes: [], onAplicarTema: vi.fn(),
        sistema, ...extra,
    });
    const utils = render(<EditorSuperior {...props()} />);
    return { a, utils };
}

describe("EditorSuperior", () => {
    it("es una barra de herramientas con los seis grupos, deshacer/rehacer y «Listo»", () => {
        montar();
        const barra = screen.getByRole("toolbar", { name: /editor del tablero inicio/i });
        for (const g of ["Widgets", "Acomodo", "Pestaña", "Apariencia", "Plantillas", "Sistema"]) {
            expect(within(barra).getByRole("button", { name: g })).toBeTruthy();
        }
        expect(within(barra).getByRole("button", { name: "Deshacer" })).toHaveProperty("disabled", true);
        expect(within(barra).getByRole("button", { name: /listo/i })).toBeTruthy();
        // Los botones redondos o en pastilla llevan ss-redondo (la regla global cuadra los botones).
        expect(within(barra).getByRole("button", { name: "Widgets" }).className).toContain("ss-redondo");
    });

    it("cada grupo abre su panel bajo la barra y se alternan", async () => {
        montar();
        fireEvent.click(screen.getByRole("button", { name: "Acomodo" }));
        expect(await screen.findByRole("region", { name: "Panel Acomodo" })).toBeTruthy();
        expect(screen.getByRole("button", { name: /auto-acomodar/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Acomodo" }).getAttribute("aria-expanded")).toBe("true");

        fireEvent.click(screen.getByRole("button", { name: "Pestaña" }));
        expect(await screen.findByRole("region", { name: "Panel Pestaña" })).toBeTruthy();
        await waitFor(() => expect(screen.queryByRole("region", { name: "Panel Acomodo" })).toBeNull());
        expect(screen.getByRole("button", { name: /duplicar/i })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Sistema" }));
        expect(await screen.findByRole("navigation", { name: /secciones de sistema/i })).toBeTruthy();

        // El panel queda DEBAJO de la barra en el documento.
        const barra = screen.getByRole("toolbar");
        const panel = screen.getByRole("region", { name: "Panel Sistema" });
        expect(barra.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("«Listo» sale del editor", () => {
        const { a } = montar();
        fireEvent.click(screen.getByRole("button", { name: /listo/i }));
        expect(a.onListo).toHaveBeenCalledTimes(1);
    });

    it("tocar una ficha del catálogo llama a la función de añadir con la talla elegida", async () => {
        const { a } = montar();
        fireEvent.click(screen.getByRole("button", { name: "Widgets" }));
        await screen.findByRole("region", { name: "Panel Widgets" });
        fireEvent.change(screen.getByPlaceholderText(/buscar por nombre/i), { target: { value: "reloj" } });
        fireEvent.click(await screen.findByRole("button", { name: /añadir reloj y fecha \(mediano\)/i }));
        expect(a.onAnadirWidget).toHaveBeenCalledWith("CLOCK_DATE", { talla: "M" });

        fireEvent.click(screen.getByRole("radio", { name: /panorámico/i }));
        fireEvent.click(screen.getByRole("button", { name: /añadir reloj y fecha \(panorámico\)/i }));
        expect(a.onAnadirWidget).toHaveBeenLastCalledWith("CLOCK_DATE", { talla: "panoramico" });
    });

    it("deshacer y rehacer: botones y atajos de teclado", () => {
        const { a } = montar({ puedeDeshacer: true, puedeRehacer: true });
        fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
        expect(a.onDeshacer).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(window, { key: "z", ctrlKey: true });
        expect(a.onDeshacer).toHaveBeenCalledTimes(2);
        fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
        expect(a.onRehacer).toHaveBeenCalledTimes(1);
    });

    it("las flechas mueven el foco entre los grupos", () => {
        montar();
        const widgets = screen.getByRole("button", { name: "Widgets" });
        widgets.focus();
        fireEvent.keyDown(widgets, { key: "ArrowRight" });
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Acomodo" }));
        fireEvent.keyDown(document.activeElement!, { key: "End" });
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sistema" }));
    });
});
