/**
 * Menús propios con «Variaciones públicas» (Ola 1019V · §3 del contrato) —
 * Escritorio (lienzos e iconos) y menú de hilo de mensajes. Prueba que cada menú
 * raíz lleva su marca `data-ss-menu-propio` y que su entrada abre la ventana con
 * la clave canónica de SU elemento, por el bus real sobre `window`. Sin red.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { Star } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasContextMenu, IconContextMenu } from "@/components/desktop/desktop-context-menu";
import { MenuHilo } from "@/components/messages/marco/menu-hilo";
import type { Desktop, DesktopIcon } from "@/components/desktop/desktop-store";
import { VARIACIONES_ABRIR_EVENTO, type DetalleVariaciones } from "../variaciones-bus";

afterEach(cleanup);

/** Escucha las aperturas de ventana que el bus despachó sobre `window`. */
function escucharAperturas(): DetalleVariaciones[] {
    const recibidos: DetalleVariaciones[] = [];
    window.addEventListener(VARIACIONES_ABRIR_EVENTO, (e) => {
        const d = (e as CustomEvent<DetalleVariaciones | null>).detail;
        if (d) recibidos.push(d);
    });
    return recibidos;
}

// ── Componentes de utilería ─────────────────────────────────────────
const irA: () => void = () => undefined;

const escritorio = (): Desktop => ({
    id: "e1",
    name: "Escritorio",
    icons: [],
    windows: [],
});

const icono: DesktopIcon = {
    id: "i1", kind: "app", name: "Notas", x: 0, y: 0, size: "sm", viewMode: "icon",
};

const hiloProps = () => ({
    etiqueta: "Opciones del hilo",
    abierto: true,
    onAbiertoChange: irA,
    fijado: false,
    silencioHasta: null,
    archivado: false,
    onFijar: irA,
    onSilenciar: irA,
    onArchivar: irA,
    onAjustes: irA,
});

/** La raíz del menú propio visible, con su marca. */
function raizMenuPropio(): Element | null {
    return document.querySelector('[data-ss-menu-propio][role="menu"]');
}

describe("Menú del lienzo del Escritorio", () => {
    it("es un menú propio con «Variaciones públicas» de su elemento", () => {
        const recibidos = escucharAperturas();
        render(
            <CanvasContextMenu
                x={10}
                y={10}
                desktop={escritorio()}
                canvasRef={createRef<HTMLDivElement>()}
                snap={false}
                onClose={irA}
                onAddApps={irA}
                onAddWidgets={irA}
                onChangeBackground={irA}
                onOpenSettings={irA}
            />,
        );
        expect(raizMenuPropio()).toBeTruthy();
        fireEvent.click(screen.getByRole("menuitem", { name: "Variaciones públicas" }));
        expect(recibidos).toEqual([{ clave: "escritorio:lienzo", opciones: {} }]);
    });
});

describe("Menú de un icono del Escritorio", () => {
    it("es un menú propio con «Variaciones públicas» que no lleva datos privados", () => {
        const recibidos = escucharAperturas();
        render(
            <IconContextMenu
                x={10}
                y={10}
                desktop={escritorio()}
                icon={{ ...icono, name: "Mi nota secreta" }}
                canvasRef={createRef<HTMLDivElement>()}
                onClose={irA}
                onOpen={irA}
                onRename={irA}
            />,
        );
        expect(raizMenuPropio()).toBeTruthy();
        fireEvent.click(screen.getByRole("menuitem", { name: "Variaciones públicas" }));
        // La clave nombra el TIPO de elemento, nunca la instancia ni su nombre.
        expect(recibidos).toEqual([{ clave: "escritorio:icono", opciones: {} }]);
    });
});

describe("Menú de hilo de mensajes", () => {
    it("es un menú propio con «Variaciones públicas» del TIPO de menú, del hilo no", () => {
        const recibidos = escucharAperturas();
        render(<MenuHilo {...hiloProps()} />);
        expect(raizMenuPropio()).toBeTruthy();
        fireEvent.click(screen.getByRole("menuitem", { name: "Variaciones públicas" }));
        expect(recibidos).toEqual([{ clave: "menu:hilo", opciones: {} }]);
    });

    it("la entrada va antes de los ajustes y junto a las acciones del llamador", () => {
        render(
            <MenuHilo
                {...hiloProps()}
                extrasDespues={[{ id: "destacar", etiqueta: "Destacar", icono: Star, onSelect: irA }]}
            />,
        );
        const entradas = screen.getAllByRole("menuitem").map((i) => i.textContent);
        expect(entradas).toContain("Variaciones públicas");
        expect(entradas.indexOf("Destacar")).toBeGreaterThan(-1);
        expect(entradas.indexOf("Variaciones públicas")).toBeGreaterThan(entradas.indexOf("Destacar"));
        expect(entradas[entradas.indexOf("Variaciones públicas") + 1]).toContain("Ajustes del chat");
    });
});
