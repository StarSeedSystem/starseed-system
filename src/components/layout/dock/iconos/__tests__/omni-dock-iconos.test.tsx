// @vitest-environment jsdom
/**
 * OmniDock + diseño de iconos — el dock REAL pinta el diseño propio de un item, el de la plantilla del
 * perfil, y deja los demás como siempre; se repinta al cambiar el perfil o el dock.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/messages",
}));
vi.mock("@/context/perimeter-context", () => ({
    usePerimeter: () => ({ activeEdge: "anchor", setActiveEdge: vi.fn() }),
}));
vi.mock("@/components/layout/trinity-fab", () => ({ TrinityFab: () => null }));
vi.mock("@/lib/ui/rito-activo", () => ({ useRitoActivo: () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("sonner", async () => ({ toast: (await import("../__fixtures__/mocks")).toastFalso }));
// la galería y el editor no deben hablar con ninguna nube en una prueba
vi.mock("@/lib/library/entity-library", async () => (await import("../__fixtures__/mocks")).entityLibraryFalsa);
vi.mock("@/lib/library/public-catalog", async () => (await import("../__fixtures__/mocks")).catalogoPublicoFalso);
vi.mock("@/components/library/finder/publish-dialog", () => ({ PublishDialog: () => null }));
vi.mock("@/ai/astraura/availability", () => ({ detectAvailability: vi.fn(async () => []) }));

import { AppearanceProvider } from "@/context/appearance-context";
import { loadDockConfig } from "@/components/layout/dock-config";
import { OmniDock } from "@/components/layout/omni-dock";
import { PLANTILLAS_SERIE } from "@/lib/dock/iconos/plantillas-serie";
import { disenoBase } from "@/lib/dock/iconos/modelo";
import { guardarPerfilIconos, quitarPlantillaDelPerfil } from "@/lib/dock/iconos/almacen";
import { aplicarDisenoAItem } from "../aplicar-dock";
import { guardarDock, limpiarEntorno } from "../__fixtures__/entorno";

function montar() {
    return render(<AppearanceProvider><OmniDock /></AppearanceProvider>);
}
/** Los botones del dock por su etiqueta (el `title` del botón). */
const boton = (etiqueta: string) => screen.getByTitle(etiqueta) as HTMLButtonElement;
const disenado = (etiqueta: string) => boton(etiqueta).querySelector(":scope > [data-icono-disenado]") as HTMLElement | null;

beforeAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    (window as { matchMedia?: unknown }).matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
    Element.prototype.scrollBy ??= (() => {}) as never;
});
beforeEach(() => {
    limpiarEntorno();
    guardarDock();
    for (let i = 0; i < 5; i++) {
        const antes = window.localStorage.getItem("starseed.dock.items.v2");
        loadDockConfig();
        if (window.localStorage.getItem("starseed.dock.items.v2") === antes) break;
    }
});
afterEach(() => { cleanup(); limpiarEntorno(); });

describe("OmniDock · diseño de iconos", () => {
    it("sin plantilla ni diseños, los iconos son los de siempre (nada diseñado, nada cambia)", async () => {
        montar();
        await screen.findByTitle("Mensajes");
        expect(document.querySelectorAll("[data-icono-disenado]")).toHaveLength(0);
        expect(boton("Mensajes").querySelector("svg")).not.toBeNull();
    });

    it("el diseño propio de UN item se pinta solo en ese item", async () => {
        aplicarDisenoAItem("messages", { ...disenoBase("#ef4444"), forma: "rombo" });
        montar();
        await screen.findByTitle("Mensajes");
        expect(disenado("Mensajes")).toHaveAttribute("data-icono-forma", "rombo");
        expect(disenado("Notificaciones")).toBeNull();
        expect(document.querySelectorAll("[data-icono-disenado]")).toHaveLength(1);
    });

    it("la plantilla del perfil se pinta en TODOS los iconos del dock, y cada uno conserva su dibujo", async () => {
        guardarPerfilIconos({ v: 1, plantilla: PLANTILLAS_SERIE[0], actualizado: 1 });
        montar();
        await screen.findByTitle("Mensajes");
        const activos = loadDockConfig().filter((i) => i.enabled);
        await waitFor(() => expect(disenado("Mensajes")).not.toBeNull());
        for (const i of activos) expect(disenado(i.label), i.label).not.toBeNull();
        // el dibujo propio de «Mensajes» sigue siendo un SVG de Lucide, no una imagen suelta
        expect(disenado("Mensajes")!.querySelector("svg")).not.toBeNull();
    });

    it("el diseño propio gana a la plantilla", async () => {
        guardarPerfilIconos({ v: 1, plantilla: PLANTILLAS_SERIE[0], actualizado: 1 });
        aplicarDisenoAItem("messages", { ...disenoBase("#ef4444"), forma: "escudo" });
        montar();
        await screen.findByTitle("Mensajes");
        expect(disenado("Mensajes")).toHaveAttribute("data-icono-forma", "escudo");
        expect(disenado("Notificaciones")).not.toHaveAttribute("data-icono-forma", "escudo");
    });

    it("se repinta solo al aplicar o quitar una plantilla (sin recargar)", async () => {
        montar();
        await screen.findByTitle("Mensajes");
        expect(document.querySelectorAll("[data-icono-disenado]")).toHaveLength(0);
        act(() => { guardarPerfilIconos({ v: 1, plantilla: PLANTILLAS_SERIE[1], actualizado: 2 }); });
        await waitFor(() => expect(disenado("Mensajes")).not.toBeNull());
        act(() => { quitarPlantillaDelPerfil(); });
        await waitFor(() => expect(document.querySelectorAll("[data-icono-disenado]")).toHaveLength(0));
    });

    it("se repinta al cambiar el diseño de un item (evento starseed:dock)", async () => {
        montar();
        await screen.findByTitle("Mensajes");
        act(() => { aplicarDisenoAItem("messages", { ...disenoBase("#22c55e"), forma: "gota" }); });
        await waitFor(() => expect(disenado("Mensajes")).toHaveAttribute("data-icono-forma", "gota"));
        act(() => { aplicarDisenoAItem("messages", null); });
        await waitFor(() => expect(disenado("Mensajes")).toBeNull());
    });

    it("el botón sigue siendo un botón accesible: nombre, ruta activa y área táctil", async () => {
        aplicarDisenoAItem("messages", { ...disenoBase("#ef4444"), forma: "rombo" });
        montar();
        const b = await screen.findByRole("button", { name: "Mensajes" });
        expect(b).toHaveAttribute("aria-current", "page");
        expect(b.className).toMatch(/w-12 h-12|max-sm:w-11/);
        // el dibujo diseñado es decorativo: el nombre lo da el botón
        expect(b.querySelector("[data-icono-disenado]")).toHaveAttribute("aria-hidden", "true");
    });

    it("monta el editor y la galería A DEMANDA: con el dock abierto no hay ningún diálogo", async () => {
        montar();
        await screen.findByTitle("Mensajes");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("«Diseño del icono» del menú del dock abre el editor del icono pedido", async () => {
        montar();
        await screen.findByTitle("Mensajes");
        act(() => { window.dispatchEvent(new CustomEvent("starseed:dock-diseno-icono", { detail: { itemId: "messages" } })); });
        expect(await screen.findByText(/Diseño del icono · Mensajes/)).toBeInTheDocument();
    });

    it("«Plantillas de iconos» del menú del dock abre la galería", async () => {
        montar();
        await screen.findByTitle("Mensajes");
        act(() => { window.dispatchEvent(new CustomEvent("starseed:dock-plantillas")); });
        expect(await screen.findByText("Plantillas de iconos")).toBeInTheDocument();
    });
});
