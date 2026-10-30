import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { CanvasContextMenu } from "@/components/desktop/desktop-context-menu";
import DesktopIconMenu from "@/components/desktop/desktop-icon-menu";
import { MenuHilo } from "@/components/messages/marco/menu-hilo";
import { accionVariaciones, ETIQUETA_VARIACIONES } from "../accion-variaciones";
import { VARIACIONES_ABRIR_EVENTO, type DetalleVariaciones } from "../variaciones-bus";
import type { Desktop, DesktopIcon } from "@/components/desktop/desktop-store";

// ═════════════════════════════════════════════════════════════════
// Ola 1019S: la entrada «Variaciones públicas» en los menús PROPIOS
// del Escritorio (lienzo e iconos) y del hilo de mensajes, con la
// marca data-ss-menu-propio en la raíz de cada menú.
// ═════════════════════════════════════════════════════════════════

const ICONO: DesktopIcon = {
    id: "icono-1", kind: "widget", name: "Notas", x: 0.1, y: 0.1, size: "md", viewMode: "icon",
};
const ESCRITORIO: Desktop = { id: "esc-1", name: "Personal", icons: [ICONO], windows: [] };

/** Registro de aperturas de la ventana, escuchando en window como el anfitrión real. */
const REGISTRO: DetalleVariaciones[] = [];
const oyente = (e: Event) => {
    const d = (e as CustomEvent<DetalleVariaciones>).detail;
    if (d) REGISTRO.push(d);
};

afterEach(() => {
    cleanup();
    REGISTRO.length = 0;
});

/** Suscribe el `oyente` al bus con destino real (window) y devuelve la baja. */
function escucharWindow(): () => void {
    window.addEventListener(VARIACIONES_ABRIR_EVENTO, oyente);
    return () => window.removeEventListener(VARIACIONES_ABRIR_EVENTO, oyente);
}

function LienzoConMenu(props: { desktop: Desktop }) {
    const ref = useRef<HTMLDivElement>(null);
    return (
        <div data-testid="lienzo" ref={ref}>
            <CanvasContextMenu
                x={40} y={40} desktop={props.desktop} canvasRef={ref} snap={false}
                onClose={() => {}} onAddApps={() => {}} onAddWidgets={() => {}}
                onChangeBackground={() => {}} onOpenSettings={() => {}}
            />
        </div>
    );
}

/** Menú del icono con las devoluciones mínimas (sin abrir editores ni vistas). */
function IconoConMenu(props: { desktop: Desktop; icon: DesktopIcon }) {
    const ref = useRef<HTMLDivElement>(null);
    return (
        <div data-testid="lienzo-icono" ref={ref}>
            <DesktopIconMenu
                x={40} y={40} desktop={props.desktop} icon={props.icon} canvasRef={ref}
                onClose={() => {}} onOpen={() => {}} onRename={() => {}}
            />
        </div>
    );
}

const PROPS_HILO = {
    etiqueta: "Opciones del chat de Ana",
    abierto: true,
    onAbiertoChange: () => {},
    fijado: false,
    silencioHasta: null,
    archivado: false,
    onFijar: () => {},
    onSilenciar: () => {},
    onArchivar: () => {},
    onAjustes: () => {},
};

describe("Menú del lienzo del Escritorio", () => {
    it("muestra «Variaciones públicas» y su raíz lleva data-ss-menu-propio", () => {
        render(<LienzoConMenu desktop={ESCRITORIO} />);
        expect(screen.getByText(ETIQUETA_VARIACIONES)).toBeTruthy();
        const raiz = screen.getByText(ETIQUETA_VARIACIONES).closest("[data-ss-menu-propio]");
        expect(raiz).toBeTruthy();
        expect(raiz?.getAttribute("role")).toBe("menu");
    });

    it("al elegirla abre la ventana con la clave del TIPO escritorio:lienzo (sin datos privados)", () => {
        const baja = escucharWindow();
        render(<LienzoConMenu desktop={ESCRITORIO} />);
        fireEvent.click(screen.getByText(ETIQUETA_VARIACIONES));
        baja();
        expect(REGISTRO).toEqual([{ clave: "escritorio:lienzo", opciones: {} }]);
    });
});

describe("Menú de icono del Escritorio", () => {
    it("muestra «Variaciones públicas» y su raíz lleva data-ss-menu-propio", () => {
        render(<IconoConMenu desktop={ESCRITORIO} icon={ICONO} />);
        expect(screen.getByText(ETIQUETA_VARIACIONES)).toBeTruthy();
        expect(screen.getByText(ETIQUETA_VARIACIONES).closest("[data-ss-menu-propio]")).toBeTruthy();
    });

    it("al elegirla abre la ventana con escritorio:icono y el NOMBRE en opciones, nunca en la clave", () => {
        const baja = escucharWindow();
        render(<IconoConMenu desktop={ESCRITORIO} icon={ICONO} />);
        fireEvent.click(screen.getByText(ETIQUETA_VARIACIONES));
        baja();
        expect(REGISTRO.length).toBe(1);
        expect(REGISTRO[0].clave).toBe("escritorio:icono");
        expect(REGISTRO[0].clave.includes("Notas")).toBe(false);
        expect(REGISTRO[0].opciones.nombre).toBe("Notas");
    });

    it("la acción la genera el ayudante común: misma etiqueta e icono que en todo el OS", () => {
        const accion = accionVariaciones("escritorio:icono", { nombre: ICONO.name });
        expect(accion.label).toBe(ETIQUETA_VARIACIONES);
        expect(typeof accion.onClick).toBe("function");
    });
});

describe("Menú de hilo de mensajes", () => {
    afterEach(() => cleanup());

    it("el menú abierto lleva «Variaciones públicas» y su raíz data-ss-menu-propio", () => {
        render(<MenuHilo {...PROPS_HILO} />);
        expect(screen.getByText(ETIQUETA_VARIACIONES)).toBeTruthy();
        expect(screen.getByText(ETIQUETA_VARIACIONES).closest("[data-ss-menu-propio]")).toBeTruthy();
    });

    it("al elegirla abre la ventana con la clave por defecto mensaje:hilo", () => {
        const baja = escucharWindow();
        render(<MenuHilo {...PROPS_HILO} />);
        fireEvent.click(screen.getByText(ETIQUETA_VARIACIONES));
        baja();
        expect(REGISTRO).toEqual([{ clave: "mensaje:hilo", opciones: {} }]);
    });

    it("la clave la fija quien la monta (prop claveVariaciones), la familia comparte la clave", () => {
        const baja = escucharWindow();
        render(<MenuHilo {...PROPS_HILO} claveVariaciones="mensaje:editor" />);
        fireEvent.click(screen.getByText(ETIQUETA_VARIACIONES));
        baja();
        expect(REGISTRO.map((d) => d.clave)).toEqual(["mensaje:editor"]);
    });

    it("cerrado no se renderiza nada del menú (Radix monta el contenido solo con open)", () => {
        const cerrado = { ...PROPS_HILO, abierto: false };
        render(<MenuHilo {...cerrado} />);
        expect(screen.queryByText(ETIQUETA_VARIACIONES)).toBeNull();
    });
});
