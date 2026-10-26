// @vitest-environment jsdom
/**
 * MontajeIconosDock — escucha los dos eventos del menú de mantener pulsado del dock y abre, A DEMANDA, el
 * editor de un icono o la galería de plantillas.
 */
import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("sonner", async () => ({ toast: (await import("../__fixtures__/mocks")).toastFalso }));
vi.mock("@/lib/library/entity-library", async () => (await import("../__fixtures__/mocks")).entityLibraryFalsa);
vi.mock("@/lib/library/public-catalog", async () => (await import("../__fixtures__/mocks")).catalogoPublicoFalso);
vi.mock("@/components/library/finder/publish-dialog", () => ({ PublishDialog: () => null }));
vi.mock("@/ai/astraura/availability", () => ({ detectAvailability: vi.fn(async () => []) }));
vi.mock("@/ai/astraura/router", () => ({ astrauraChat: vi.fn() }));

import { AppearanceProvider } from "@/context/appearance-context";
import { loadDockConfig } from "@/components/layout/dock-config";
import MontajeIconosDock, { EVENTO_DISENO_ICONO, EVENTO_PLANTILLAS_ICONOS, abrirEditorIcono, abrirPlantillasIconos } from "../montaje-iconos-dock";
import { guardarDock, limpiarEntorno } from "../__fixtures__/entorno";
import { reiniciarMocks } from "../__fixtures__/mocks";

const montar = (ui: ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);
const emitir = (nombre: string, detail?: unknown) => act(() => { window.dispatchEvent(new CustomEvent(nombre, { detail })); });

beforeAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
    limpiarEntorno();
    reiniciarMocks();
    guardarDock();
    loadDockConfig();
});
afterEach(() => { cleanup(); limpiarEntorno(); });

describe("MontajeIconosDock", () => {
    it("los nombres de los eventos son los que emite el menú del dock", () => {
        expect(EVENTO_DISENO_ICONO).toBe("starseed:dock-diseno-icono");
        expect(EVENTO_PLANTILLAS_ICONOS).toBe("starseed:dock-plantillas");
    });

    it("no pinta ni carga nada hasta que alguien lo pide", () => {
        const { container } = montar(<MontajeIconosDock />);
        expect(container.innerHTML).toBe("");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("«Diseño del icono» abre el editor de ese icono", async () => {
        montar(<MontajeIconosDock />);
        emitir(EVENTO_DISENO_ICONO, { itemId: "messages" });
        expect(await screen.findByText(/Diseño del icono · Mensajes/)).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("«Plantillas de iconos» abre la galería", async () => {
        montar(<MontajeIconosDock />);
        emitir(EVENTO_PLANTILLAS_ICONOS);
        expect(await screen.findByText("Plantillas de iconos")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: /De serie/ })).toBeInTheDocument();
    });

    it("los ayudantes abrirEditorIcono y abrirPlantillasIconos emiten los mismos eventos", async () => {
        montar(<MontajeIconosDock />);
        act(() => abrirEditorIcono("notifications"));
        expect(await screen.findByText(/Diseño del icono · Notificaciones/)).toBeInTheDocument();
        cleanup();
        montar(<MontajeIconosDock />);
        act(() => abrirPlantillasIconos());
        expect(await screen.findByText("Plantillas de iconos")).toBeInTheDocument();
    });

    it.each([
        ["sin detalle", undefined],
        ["detalle nulo", null],
        ["itemId vacío", { itemId: "" }],
        ["itemId que no es texto", { itemId: 42 }],
        ["itemId desmesurado", { itemId: "x".repeat(500) }],
    ])("un evento mal formado se ignora (%s)", async (_t, detalle) => {
        montar(<MontajeIconosDock />);
        emitir(EVENTO_DISENO_ICONO, detalle);
        // da tiempo a que un diálogo, si se hubiera abierto, aparezca
        await new Promise((r) => setTimeout(r, 60));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("si hay varias instancias montadas, solo la primera atiende (nunca dos diálogos)", async () => {
        montar(<><MontajeIconosDock /><MontajeIconosDock /></>);
        emitir(EVENTO_PLANTILLAS_ICONOS);
        await screen.findByText("Plantillas de iconos");
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });

    it("si la primera instancia se desmonta, la siguiente toma el relevo", async () => {
        const a = montar(<MontajeIconosDock />);
        const b = montar(<MontajeIconosDock />);
        a.unmount();
        emitir(EVENTO_PLANTILLAS_ICONOS);
        expect(await screen.findByText("Plantillas de iconos")).toBeInTheDocument();
        b.unmount();
    });

    it("cerrar el editor lo quita, y volver a abrirlo empieza limpio", async () => {
        montar(<MontajeIconosDock />);
        emitir(EVENTO_DISENO_ICONO, { itemId: "messages" });
        await screen.findByText(/Diseño del icono · Mensajes/);
        fireEvent.click(screen.getByRole("button", { name: "Hexágono" }));
        expect(document.querySelector("[data-estado-vista]")).toHaveTextContent("Vista previa · sin aplicar");
        // cerrar con cambios pide confirmación; se descarta
        fireEvent.click(screen.getAllByRole("button", { name: "Cerrar" })[0]);
        fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        emitir(EVENTO_DISENO_ICONO, { itemId: "messages" });
        await screen.findByText(/Diseño del icono · Mensajes/);
        expect(document.querySelector("[data-estado-vista]")).toHaveTextContent("Icono de siempre");
    });

    it("cada icono abre su propio editor", async () => {
        montar(<MontajeIconosDock />);
        emitir(EVENTO_DISENO_ICONO, { itemId: "messages" });
        await screen.findByText(/Diseño del icono · Mensajes/);
        fireEvent.click(screen.getAllByRole("button", { name: "Cerrar" })[0]);
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        emitir(EVENTO_DISENO_ICONO, { itemId: "notifications" });
        expect(await screen.findByText(/Diseño del icono · Notificaciones/)).toBeInTheDocument();
    });

    it("al desmontar deja de escuchar", async () => {
        const { unmount } = montar(<MontajeIconosDock />);
        unmount();
        emitir(EVENTO_PLANTILLAS_ICONOS);
        await new Promise((r) => setTimeout(r, 60));
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
