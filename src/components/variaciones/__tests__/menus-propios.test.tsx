import { describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MenuHilo } from "@/components/messages/marco/menu-hilo";
import { CanvasContextMenu, IconContextMenu } from "@/components/desktop/desktop-context-menu";
import { accionVariaciones, ETIQUETA_VARIACIONES } from "../accion-variaciones";
import { suscribirVariaciones } from "../variaciones-bus";
import type { Desktop, DesktopIcon } from "@/components/desktop/desktop-store";

const icono: DesktopIcon = {
    id: "i1", kind: "widget", name: "Clima", x: 0.1, y: 0.1, size: "md", viewMode: "icon",
};
const escritorio: Desktop = { id: "d1", name: "Principal", icons: [icono], windows: [] };

function hilos(props: { clave?: string }) {
    return (
        <MenuHilo
            etiqueta="Opciones de Ana"
            abierto
            onAbiertoChange={vi.fn()}
            fijado={false}
            silencioHasta={null}
            archivado={false}
            onFijar={vi.fn()}
            onSilenciar={vi.fn()}
            onArchivar={vi.fn()}
            onAjustes={vi.fn()}
            claveVariaciones={props.clave}
        />
    );
}

/** Punto del lienzo donde se abrió el menú; el shell solo lo posiciona. */
const lienzo = { current: null };
const banda = { x: 10, y: 10, desktop: escritorio, canvasRef: lienzo, onClose: vi.fn() };

describe("Menús propios con «Variaciones públicas» (Ola 1019S)", () => {
    it("la acción común abre la ventana con la clave del elemento", () => {
        let clave = "";
        const baja = suscribirVariaciones((d) => { clave = d.clave; });
        accionVariaciones("escritorio:lienzo").onClick();
        baja();
        expect(clave).toBe("escritorio:lienzo");
    });

    it("el menú de hilo pinta la entrada y su raíz lleva data-ss-menu-propio", () => {
        render(hilos({ clave: "mensaje:hilo" }));
        const entrada = screen.getByText(ETIQUETA_VARIACIONES);
        expect(entrada).toBeTruthy();
        expect(entrada.closest("[data-ss-menu-propio]")).not.toBeNull();
        cleanup();
    });

    it("sin clave, el menú de hilo no pinta la entrada", () => {
        render(hilos({}));
        expect(screen.queryByText(ETIQUETA_VARIACIONES)).toBeNull();
        cleanup();
    });

    it("el menú del lienzo lleva la entrada y data-ss-menu-propio", () => {
        const vista = render(
            <CanvasContextMenu
                {...banda}
                snap={false}
                onAddApps={vi.fn()}
                onAddWidgets={vi.fn()}
                onChangeBackground={vi.fn()}
                onOpenSettings={vi.fn()}
            />,
        );
        expect(screen.getByText(ETIQUETA_VARIACIONES)).toBeTruthy();
        expect(vista.container.querySelector("[data-ss-menu-propio]")).not.toBeNull();
        cleanup();
    });

    it("el menú del icono lleva la entrada y data-ss-menu-propio", () => {
        const vista = render(
            <IconContextMenu {...banda} icon={icono} onOpen={vi.fn()} onRename={vi.fn()} />,
        );
        expect(screen.getByText(ETIQUETA_VARIACIONES)).toBeTruthy();
        expect(vista.container.querySelector("[data-ss-menu-propio]")).not.toBeNull();
        cleanup();
    });

    it("clic en la entrada del lienzo emite la apertura por el bus y cierra", () => {
        let clave = "";
        const baja = suscribirVariaciones((d) => { clave = d.clave; });
        const onClose = vi.fn();
        render(
            <CanvasContextMenu
                x={10}
                y={10}
                desktop={escritorio}
                canvasRef={lienzo}
                snap={false}
                onClose={onClose}
                onAddApps={vi.fn()}
                onAddWidgets={vi.fn()}
                onChangeBackground={vi.fn()}
                onOpenSettings={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByText(ETIQUETA_VARIACIONES));
        baja();
        expect(clave).toBe("escritorio:lienzo");
        expect(onClose).toHaveBeenCalled();
        cleanup();
    });
});
