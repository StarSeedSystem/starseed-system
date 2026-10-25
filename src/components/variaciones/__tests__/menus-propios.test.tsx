import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CanvasContextMenu, IconContextMenu } from "@/components/desktop/desktop-context-menu";
import { MenuHilo } from "@/components/messages/marco/menu-hilo";
import { suscribirVariaciones, type DetalleVariaciones } from "../variaciones-bus";
import { ETIQUETA_VARIACIONES } from "../accion-variaciones";
import type { Desktop, DesktopIcon } from "@/components/desktop/desktop-store";

// (Ola 1019V · S) La entrada común «Variaciones públicas» en los menús propios
// del Escritorio (lienzo e icono) y del hilo de mensajes, con la raíz del menú
// marcada con data-ss-menu-propio y la apertura por el bus central.

vi.mock("@/components/aurora/aurora-provider", () => ({
    useAurora: () => undefined,
}));

const lienzo: Desktop = { id: "d1", name: "Escritorio", icons: [], windows: [] };
const icono: DesktopIcon = { id: "i1", kind: "file", name: "Nota", x: 0, y: 0, size: "md", viewMode: "icon" };
const escalera = { current: null } as React.RefObject<HTMLDivElement | null>;
const noOp = () => undefined;

const raiz = () => document.querySelector("[data-ss-menu-propio]");
const entrada = () => screen.getAllByText(ETIQUETA_VARIACIONES);
/** Pulsa la entrada del menú que abre la ventana de variaciones. */
const pulsa = () => {
    const nodo = entrada()[0];
    fireEvent.click(nodo.closest("button") ?? nodo);
};

describe("Menús propios con «Variaciones públicas» (Ola 1019V · S)", () => {
    afterEach(() => { cleanup(); });

    it("el menú del LIENZO va marcado y abre la clave escritorio:lienzo", () => {
        const recibidos: DetalleVariaciones[] = [];
        const baja = suscribirVariaciones((d) => recibidos.push(d));
        render(
            <CanvasContextMenu
                x={10} y={10} desktop={lienzo} canvasRef={escalera} snap={false}
                onClose={noOp} onAddApps={noOp} onAddWidgets={noOp}
                onChangeBackground={noOp} onOpenSettings={noOp}
            />,
        );
        expect(raiz()?.getAttribute("data-ss-menu-propio")).toBe("escritorio:lienzo");
        expect(entrada().length).toBe(1);
        pulsa();
        baja();
        expect(recibidos).toEqual([{ clave: "escritorio:lienzo", opciones: {} }]);
    });

    it("el menú del ICONO va marcado y abre la clave escritorio:icono", () => {
        const recibidos: DetalleVariaciones[] = [];
        const baja = suscribirVariaciones((d) => recibidos.push(d));
        render(
            <IconContextMenu
                x={10} y={10} desktop={lienzo} icon={icono} canvasRef={escalera}
                onClose={noOp} onOpen={noOp} onRename={noOp}
            />,
        );
        expect(raiz()?.getAttribute("data-ss-menu-propio")).toBe("escritorio:icono");
        expect(entrada().length).toBe(1);
        pulsa();
        baja();
        expect(recibidos).toEqual([{ clave: "escritorio:icono", opciones: {} }]);
    });

    it("el menú del HILO va marcado y abre la clave mensaje:hilo", () => {
        const recibidos: DetalleVariaciones[] = [];
        const baja = suscribirVariaciones((d) => recibidos.push(d));
        render(
            <MenuHilo
                etiqueta="Opciones de Ana" abierto onAbiertoChange={noOp}
                fijado={false} silencioHasta={null} archivado={false}
                onFijar={noOp} onSilenciar={noOp} onArchivar={noOp} onAjustes={noOp}
            />,
        );
        expect(raiz()?.getAttribute("data-ss-menu-propio")).toBe("mensaje:hilo");
        expect(entrada().length).toBe(1);
        pulsa();
        baja();
        expect(recibidos).toEqual([{ clave: "mensaje:hilo", opciones: {} }]);
    });
});
