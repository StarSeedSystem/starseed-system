/**
 * Menús propios con «Variaciones públicas» (Ola 1019V · tarea S del contrato
 * architecture/variaciones-publicas.md §3). Cada menú que ya existía añade la
 * MISMA entrada con `accionVariaciones` y marca su raíz con
 * `data-ss-menu-propio` (el anfitrión global no pinta otra encima).
 * Pruebas sin red ni disco: los destinos de eventos son `window` (jsdom) o se
 * escuchan directamente.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasContextMenu, IconContextMenu } from "@/components/desktop/desktop-context-menu";
import MenuHilo from "@/components/messages/marco/menu-hilo";
import { VARIACIONES_ABRIR_EVENTO, type DetalleVariaciones } from "../variaciones-bus";
import type { Desktop, DesktopIcon } from "@/components/desktop/desktop-store";

afterEach(cleanup);

/** Escucha en `window` las aperturas de la ventana de variaciones. */
function escuchar(): DetalleVariaciones[] {
    const recibidos: DetalleVariaciones[] = [];
    window.addEventListener(VARIACIONES_ABRIR_EVENTO, (e) => {
        const d = (e as CustomEvent<DetalleVariaciones | null>).detail;
        if (d) recibidos.push(d);
    });
    return recibidos;
}

function escritorio(): Desktop {
    return { id: "mesa", name: "Mesa", icons: [], windows: [] };
}

function icono(): DesktopIcon {
    return { id: "ic1", kind: "app", refId: "notas", name: "Nota", x: 0.1, y: 0.1, size: "md", viewMode: "icon" };
}

function lienzos(): React.RefObject<HTMLDivElement | null> {
    return { current: null };
}

describe("Menú del Escritorio (lienzo e icono) con Variaciones públicas", () => {
    it("el lienzo marca su raíz con data-ss-menu-propio y trae la entrada", () => {
        const eventos = escuchar();
        render(
            <CanvasContextMenu
                x={10}
                y={10}
                desktop={escritorio()}
                canvasRef={lienzos()}
                snap={false}
                onClose={() => {}}
                onAddApps={() => {}}
                onAddWidgets={() => {}}
                onChangeBackground={() => {}}
                onOpenSettings={() => {}}
            />,
        );
        expect(screen.getByRole("menu").hasAttribute("data-ss-menu-propio")).toBe(true);
        const entrada = screen.getByText("Variaciones públicas");
        fireEvent.click(entrada);
        expect(eventos).toEqual([{ clave: "escritorio:iconos", opciones: { nombre: "Mesa" } }]);
    });

    it("el icono marca su raíz con data-ss-menu-propio y abre la ventana de su clave", () => {
        const eventos = escuchar();
        render(
            <IconContextMenu
                x={10}
                y={10}
                desktop={escritorio()}
                icon={icono()}
                canvasRef={lienzos()}
                onClose={() => {}}
                onOpen={() => {}}
                onRename={() => {}}
            />,
        );
        expect(screen.getByRole("menu").hasAttribute("data-ss-menu-propio")).toBe(true);
        fireEvent.click(screen.getByText("Variaciones públicas"));
        expect(eventos).toEqual([{ clave: "escritorio:icono", opciones: { nombre: "Nota" } }]);
    });
});

describe("Menú de hilo de mensajes con Variaciones públicas", () => {
    it("el menú abierto marca su raíz con data-ss-menu-propio y la entrada abre la ventana", () => {
        const eventos = escuchar();
        render(
            <MenuHilo
                etiqueta="Opciones de Ana"
                abierto
                onAbiertoChange={() => {}}
                fijado={false}
                silencioHasta={null}
                archivado={false}
                onFijar={() => {}}
                onSilenciar={() => {}}
                onArchivar={() => {}}
                onAjustes={() => {}}
            />,
        );
        const menu = screen.getByRole("menu");
        expect(menu.hasAttribute("data-ss-menu-propio")).toBe(true);
        fireEvent.click(screen.getByText("Variaciones públicas"));
        expect(eventos).toEqual([{ clave: "mensaje:hilo", opciones: { nombre: "Hilo" } }]);
    });
});

