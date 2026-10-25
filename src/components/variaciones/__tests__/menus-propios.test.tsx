import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { RefObject } from "react";
import { CanvasContextMenu, IconContextMenu } from "@/components/desktop/desktop-context-menu";
import { MenuHilo } from "@/components/messages/marco/menu-hilo";
import { ETIQUETA_VARIACIONES } from "@/components/variaciones/accion-variaciones";
import { suscribirVariaciones, type DetalleVariaciones } from "@/components/variaciones/variaciones-bus";
import { leerClave } from "@/lib/variaciones/clave-elemento";
import type { Desktop, DesktopIcon } from "@/components/desktop/desktop-store";

vi.mock("@/components/aurora/aurora-provider", () => ({ useAurora: () => null }));

// Polirelleno mínimo de jsdom para Radix (el menú de hilo): nada toca node:* ni la red.
class ResizeObserverStub {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
}
if (typeof window !== "undefined") {
    if (!("ResizeObserver" in window)) (window as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
    window.HTMLElement.prototype.scrollIntoView = () => { /* noop */ };
    const sinCaptura = () => false;
    window.HTMLElement.prototype.hasPointerCapture = sinCaptura;
    window.HTMLElement.prototype.setPointerCapture = () => { /* noop */ };
    window.HTMLElement.prototype.releasePointerCapture = () => { /* noop */ };
    if (!window.matchMedia) {
        Object.defineProperty(window, "matchMedia", {
            value: (_q: string) => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
        });
    }
}

const escribir = (claves: string[]) => claves;

const escritorio: Desktop = { id: "esc-1", name: "Casa", icons: [], windows: [] };
const icono: DesktopIcon = { id: "ic-1", kind: "folder", name: "Notas", x: 0.2, y: 0.3, size: "md", viewMode: "icon" };
const escritorioConIcono: Desktop = { id: "esc-1", name: "Casa", icons: [icono], windows: [] };
const dibujado = { current: null } as RefObject<HTMLDivElement | null>;

/** Escucha las aperturas del bus durante una prueba y devuelve además la baja. */
function espiaBus(): { recibidos: DetalleVariaciones[]; baja: () => void } {
    const recibidos: DetalleVariaciones[] = [];
    return { recibidos, baja: suscribirVariaciones((d) => recibidos.push(d)) };
}

afterEach(() => cleanup());

describe("Menús propios con «Variaciones públicas» (Ola 1019V)", () => {
    it("las claves del Escritorio y de los mensajes son canónicas", () => {
        expect(escribir(["escritorio:lienzo", "escritorio:icono", "mensaje:hilo"]).every((c) => leerClave(c) !== null)).toBe(true);
    });

    it("el menú del LIENZO lleva su raíz marcada y su entrada que abre la ventana", () => {
        const { recibidos, baja } = espiaBus();
        render(
            <CanvasContextMenu
                x={10} y={10} desktop={escritorio} canvasRef={dibujado} snap={false}
                onClose={() => {}} onAddApps={() => {}} onAddWidgets={() => {}}
                onChangeBackground={() => {}} onOpenSettings={() => {}}
            />,
        );
        expect(document.querySelector("[data-ss-menu-propio]")).not.toBeNull();
        fireEvent.click(screen.getByText(ETIQUETA_VARIACIONES));
        expect(recibidos).toEqual([{ clave: "escritorio:lienzo", opciones: {} }]);
        baja();
    });

    it("el menú de un ICONO lleva su entrada que abre la ventana del TIPO de icono", () => {
        const { recibidos, baja } = espiaBus();
        render(
            <IconContextMenu
                x={10} y={10} desktop={escritorioConIcono} icon={icono} canvasRef={dibujado}
                onClose={() => {}} onOpen={() => {}} onRename={() => {}}
            />,
        );
        expect(document.querySelector("[data-ss-menu-propio]")).not.toBeNull();
        fireEvent.click(screen.getByText(ETIQUETA_VARIACIONES));
        expect(recibidos).toEqual([{ clave: "escritorio:icono", opciones: {} }]);
        baja();
    });

    it("el menú de HILO de mensajes lleva su raíz marcada y su entrada", () => {
        const { recibidos, baja } = espiaBus();
        render(
            <MenuHilo
                etiqueta="Opciones de Ana" abierto onAbiertoChange={() => {}}
                fijado={false} silencioHasta={null} archivado={false}
                onFijar={() => {}} onSilenciar={() => {}} onArchivar={() => {}} onAjustes={() => {}}
            />,
        );
        expect(document.querySelector("[data-ss-menu-propio]")).not.toBeNull();
        fireEvent.click(screen.getByText(ETIQUETA_VARIACIONES));
        expect(recibidos).toEqual([{ clave: "mensaje:hilo", opciones: {} }]);
        baja();
    });
});

