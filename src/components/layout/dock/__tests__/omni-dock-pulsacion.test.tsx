/**
 * OmniDock · mantener presionado (Ola 1025U · V1a)
 * ─────────────────────────────────────────────────────────────────────────────
 * Monta el dock de verdad (con sus iconos, su carril y su menú) y lo trata como una
 * persona: mantiene, arrastra, usa el teclado y quita un icono. Lo que se comprueba es
 * lo que queda GUARDADO (`starseed.dock.items.v2`, `starseed.dock.folders.v1`), que es lo
 * que viaja con la cuenta.
 *
 * jsdom no tiene maquetación: `getBoundingClientRect` se simula con celdas de 60 px cada
 * 64 px (la misma geometría que la prueba pura de `orden-dock`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor, within } from "@testing-library/react";

const push = vi.fn();
let rutaActual = "/hub";
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
    usePathname: () => rutaActual,
}));
vi.mock("@/context/perimeter-context", () => ({
    usePerimeter: () => ({ activeEdge: "anchor", setActiveEdge: vi.fn() }),
}));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { trinity: { dockBehavior: "always-visible", dockDensity: "comfortable" } } }),
}));
vi.mock("@/lib/ui/rito-activo", () => ({ useRitoActivo: () => false }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("../../trinity-fab", () => ({ TrinityFab: () => null }));
vi.mock("@/components/dashboard/apps/app-catalog", () => ({
    APP_CATALOG: [{ id: "mensajes", description: "Mensajería de StarSeed.", open: { route: "/messages" } }],
}));

import { OmniDock } from "../../omni-dock";
import { escucharDisenoIcono, escucharPlantillas } from "@/lib/dock/eventos-dock";

const CLAVE_ITEMS = "starseed.dock.items.v2";
const CLAVE_CARPETAS = "starseed.dock.folders.v1";

// ── Geometría simulada ───────────────────────────────────────────────────────
const PASO = 64;
const ANCHO = 60;
function simularMaquetacion() {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const caja = (left: number, width: number) =>
            ({ left, right: left + width, top: 0, bottom: 80, width, height: 80, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
        if (this.classList.contains("omni-dock-strip")) return caja(0, 600);
        if (this.hasAttribute("data-dock-celda")) {
            const strip = this.closest(".omni-dock-strip");
            const celdas = strip ? Array.from(strip.querySelectorAll("[data-dock-celda]")) : [];
            // Las del mismo carril, una tras otra (las carpetas abiertas no se usan en estas pruebas).
            return caja(celdas.indexOf(this) * PASO, ANCHO);
        }
        return caja(0, 0);
    });
}

function entorno(reducido: boolean) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((q: string) => ({
            matches: q.includes("reduced-motion") ? reducido : q.includes("fine") || q.includes("hover"),
            media: q,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
}

// ── Ayudas ───────────────────────────────────────────────────────────────────
const celda = (id: string) => document.querySelector<HTMLElement>(`[data-dock-celda="${id}"]`)!;
const boton = (id: string) => celda(id).querySelector<HTMLButtonElement>("button")!;
const ordenVisible = () => Array.from(document.querySelectorAll<HTMLElement>("[data-dock-celda]")).map((e) => e.dataset.dockCelda);
const esperar = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function guardado(): Array<{ id: string; enabled: boolean }> {
    const raw = JSON.parse(localStorage.getItem(CLAVE_ITEMS) ?? "null");
    return Array.isArray(raw) ? raw : raw?.items ?? [];
}
const ordenGuardado = () => guardado().filter((i) => i.enabled).map((i) => i.id);

const puntero = (x: number, tipo: "touch" | "mouse" | "pen" = "touch", y = 10) => ({
    pointerId: 7, pointerType: tipo, isPrimary: true, button: 0, clientX: x, clientY: y,
});
const centro = (indice: number) => indice * PASO + ANCHO / 2;

async function montar() {
    render(<OmniDock />);
    await waitFor(() => expect(celda("messages")).toBeTruthy());
    // El primer guardado ya fija el orden de partida (los ajustes por defecto).
    return ordenVisible();
}

/** Mantiene el icono 450 ms sin moverse y lo suelta: abre su menú. */
async function mantenerYSoltar(id: string, tipo: "touch" | "mouse" | "pen" = "touch") {
    const x = centro(ordenVisible().indexOf(id));
    fireEvent.pointerDown(boton(id), puntero(x, tipo));
    await esperar(520);
    fireEvent.pointerUp(boton(id), puntero(x, tipo));
}

beforeEach(() => {
    cleanup();
    localStorage.clear();
    push.mockClear();
    rutaActual = "/hub";
    entorno(false);
    simularMaquetacion();
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe("OmniDock · mantener presionado abre las opciones", () => {
    it("mantener 450 ms sin mover abre el menú del icono, con sus acciones y las comunes", async () => {
        await montar();
        await mantenerYSoltar("messages");
        const menu = await screen.findByRole("menu");
        const dentro = within(menu);
        // Acciones propias de Mensajes (catálogo real) …
        expect(dentro.getByText("Nuevo mensaje")).toBeTruthy();
        expect(dentro.getByText("Contactos")).toBeTruthy();
        // … y las de todos los iconos.
        for (const t of ["Abrir", "Abrir en ventana nueva", "Información", "Cambiar diseño de este icono", "Plantillas de iconos del perfil", "Quitar del dock"]) {
            expect(dentro.getByText(t), t).toBeTruthy();
        }
        // 360 px de ancho máximo y filas táctiles de 44 px (clase min-h-11).
        expect((menu.parentElement as HTMLElement).style.width || menu.style.width).toContain("360px");
        expect(dentro.getAllByRole("menuitem")[0].className).toContain("min-h-11");
    });

    it("también con ratón y con lápiz", async () => {
        for (const tipo of ["mouse", "pen"] as const) {
            cleanup();
            localStorage.clear();
            await montar();
            await mantenerYSoltar("hub", tipo);
            expect(await screen.findByRole("menu")).toBeTruthy();
        }
    });

    it("un toque normal no abre el menú: navega como siempre", async () => {
        await montar();
        const x = centro(ordenVisible().indexOf("messages"));
        fireEvent.pointerDown(boton("messages"), puntero(x));
        await esperar(80);
        fireEvent.pointerUp(boton("messages"), puntero(x));
        fireEvent.click(boton("messages"));
        expect(screen.queryByRole("menu")).toBeNull();
        expect(push).toHaveBeenCalledWith("/messages");
    });

    it("el clic que sigue a una pulsación larga NO navega", async () => {
        await montar();
        await mantenerYSoltar("messages");
        await screen.findByRole("menu");
        fireEvent.click(boton("messages"));
        expect(push).not.toHaveBeenCalled();
    });

    it("moverse más de 8 px antes de los 450 ms cancela la pulsación (era un deslizamiento)", async () => {
        await montar();
        const x = centro(ordenVisible().indexOf("messages"));
        fireEvent.pointerDown(boton("messages"), puntero(x));
        fireEvent.pointerMove(boton("messages"), puntero(x + 20));
        await esperar(520);
        fireEvent.pointerUp(boton("messages"), puntero(x + 20));
        expect(screen.queryByRole("menu")).toBeNull();
        expect(ordenVisible()).toContain("messages");
    });

    it("«Nuevo mensaje» lleva a la página que de verdad lo abre", async () => {
        await montar();
        await mantenerYSoltar("messages");
        fireEvent.click(await screen.findByText("Nuevo mensaje"));
        await waitFor(() => expect(push).toHaveBeenCalledWith("/messages?nuevo=1"));
        await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    });

    it("Escape cierra el menú y devuelve el foco al icono", async () => {
        await montar();
        await mantenerYSoltar("messages");
        const menu = await screen.findByRole("menu");
        fireEvent.keyDown(menu, { key: "Escape" });
        await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(boton("messages")));
    });
});

describe("OmniDock · mantener y arrastrar cambia el orden y lo guarda", () => {
    it("arrastrar «Mensajes» a la segunda posición reordena el dock y lo guarda en starseed.dock.items.v2", async () => {
        const antes = await montar();
        expect(antes.slice(0, 5)).toEqual(["escritorios", "dashboard", "profile", "messages", "contactos"]);

        fireEvent.pointerDown(boton("messages"), puntero(centro(3)));
        await esperar(520); // levantado
        fireEvent.pointerMove(boton("messages"), puntero(centro(3) - 40));
        fireEvent.pointerMove(boton("messages"), puntero(centro(1) - 4)); // justo antes del centro de la 2.ª celda: cae en la 2.ª posición

        // Vista previa: las celdas que ceden su sitio se apartan un paso a la derecha (solo transform).
        expect(celda("dashboard").style.transform).toBe(`translate3d(${PASO}px,0,0)`);
        expect(celda("profile").style.transform).toBe(`translate3d(${PASO}px,0,0)`);
        expect(celda("escritorios").style.transform).toBe("translate3d(0px,0,0)");
        // El icono arrastrado sigue al puntero, crecido, y las celdas animan en 200 ms.
        expect(celda("messages").style.transform).toContain("scale(1.08)");
        expect(celda("messages").getAttribute("data-dock-arrastrando")).toBe("1");
        expect(celda("dashboard").className).toContain("duration-200");

        fireEvent.pointerUp(boton("messages"), puntero(centro(1) - 4));
        await waitFor(() => expect(ordenGuardado().slice(0, 5)).toEqual(["escritorios", "messages", "dashboard", "profile", "contactos"]));
        // El dock se repinta en el nuevo orden y no queda ningún estilo temporal.
        await waitFor(() => expect(ordenVisible().slice(0, 5)).toEqual(["escritorios", "messages", "dashboard", "profile", "contactos"]));
        expect(celda("messages").style.transform).toBe("");
        expect(celda("messages").hasAttribute("data-dock-arrastrando")).toBe(false);
        expect(celda("dashboard").style.transform).toBe("");
        // Y no se abrió ningún menú ni se navegó.
        expect(screen.queryByRole("menu")).toBeNull();
        expect(push).not.toHaveBeenCalled();
    });

    it("el orden guardado sobrevive a recargar el dock (es lo que viaja con la cuenta)", async () => {
        await montar();
        fireEvent.pointerDown(boton("contactos"), puntero(centro(4)));
        await esperar(520);
        fireEvent.pointerMove(boton("contactos"), puntero(centro(4) - 30));
        fireEvent.pointerMove(boton("contactos"), puntero(centro(1) - 4));
        fireEvent.pointerUp(boton("contactos"), puntero(centro(1) - 4));
        await waitFor(() => expect(ordenGuardado()[1]).toBe("contactos"));
        cleanup();
        await montar();
        expect(ordenVisible().slice(0, 3)).toEqual(["escritorios", "contactos", "dashboard"]);
    });

    it("soltar un icono sobre una carpeta lo mete dentro", async () => {
        localStorage.setItem(CLAVE_CARPETAS, JSON.stringify([
            { id: "f1", label: "Mi carpeta", iconKey: "LayoutGrid", color: "neutral", itemIds: ["profile"], enabled: true },
        ]));
        await montar();
        // Carril: escritorios, dashboard, [carpeta f1], messages, contactos …
        expect(ordenVisible().slice(0, 5)).toEqual(["escritorios", "dashboard", "carpeta:f1", "messages", "contactos"]);

        fireEvent.pointerDown(boton("contactos"), puntero(centro(4)));
        await esperar(520);
        fireEvent.pointerMove(boton("contactos"), puntero(centro(4) - 30));
        fireEvent.pointerMove(boton("contactos"), puntero(centro(2))); // el centro de la carpeta
        fireEvent.pointerUp(boton("contactos"), puntero(centro(2)));

        await waitFor(() => {
            const carpetas = JSON.parse(localStorage.getItem(CLAVE_CARPETAS) ?? "[]");
            expect(carpetas[0].itemIds).toEqual(["profile", "contactos"]);
        });
        // Fuera del carril raíz: ya no es una celda suelta.
        await waitFor(() => expect(ordenVisible().slice(0, 4)).toEqual(["escritorios", "dashboard", "carpeta:f1", "messages"]));
    });

    it("dentro de una carpeta abierta, arrastrar reordena solo los iconos de esa carpeta", async () => {
        localStorage.setItem(CLAVE_CARPETAS, JSON.stringify([
            { id: "f1", label: "Mi carpeta", iconKey: "LayoutGrid", color: "neutral", itemIds: ["profile", "messages", "contactos"], enabled: true },
        ]));
        localStorage.setItem("starseed.dock.folders.open.v1", JSON.stringify({ f1: true }));
        await montar();
        // Celdas: escritorios, dashboard, [carpeta], profile, messages, contactos (los hijos van en línea).
        await waitFor(() => expect(ordenVisible().slice(0, 6)).toEqual(["escritorios", "dashboard", "carpeta:f1", "profile", "messages", "contactos"]));
        expect(celda("contactos").getAttribute("data-dock-carril")).toBe("f1");

        fireEvent.pointerDown(boton("contactos"), puntero(centro(5)));
        await esperar(520);
        fireEvent.pointerMove(boton("contactos"), puntero(centro(5) - 40));
        fireEvent.pointerMove(boton("contactos"), puntero(centro(3) - 40)); // antes del centro del primer hijo
        // Solo ceden las celdas de SU carril: el resto del dock no se mueve.
        expect(celda("profile").style.transform).toBe(`translate3d(${PASO}px,0,0)`);
        expect(celda("messages").style.transform).toBe(`translate3d(${PASO}px,0,0)`);
        expect(celda("dashboard").style.transform).toBe("");
        fireEvent.pointerUp(boton("contactos"), puntero(centro(3) - 40));

        await waitFor(() => {
            const carpetas = JSON.parse(localStorage.getItem(CLAVE_CARPETAS) ?? "[]");
            expect(carpetas[0].itemIds).toEqual(["contactos", "profile", "messages"]);
        });
        // El orden del carril raíz no se toca (no se ha escrito el de los iconos).
        expect(localStorage.getItem(CLAVE_ITEMS)).toBeNull();
    });

    it("Escape a mitad de un arrastre lo cancela: nada cambia", async () => {
        await montar();
        fireEvent.pointerDown(boton("messages"), puntero(centro(3)));
        await esperar(520);
        fireEvent.pointerMove(boton("messages"), puntero(centro(3) - 40));
        fireEvent.pointerMove(boton("messages"), puntero(centro(1) - 4));
        fireEvent.keyDown(window, { key: "Escape" });
        await esperar(260);
        expect(localStorage.getItem(CLAVE_ITEMS)).toBeNull();
        expect(ordenVisible().slice(0, 5)).toEqual(["escritorios", "dashboard", "profile", "messages", "contactos"]);
        expect(celda("messages").style.transform).toBe("");
    });

    it("con «reducir movimiento» el icono cae al instante, sin animación de aterrizaje", async () => {
        entorno(true);
        await montar();
        fireEvent.pointerDown(boton("messages"), puntero(centro(3)));
        await esperar(520);
        fireEvent.pointerMove(boton("messages"), puntero(centro(3) - 40));
        fireEvent.pointerMove(boton("messages"), puntero(centro(1) - 4));
        await act(async () => {
            fireEvent.pointerUp(boton("messages"), puntero(centro(1) - 4));
        });
        // Sin esperar los 200 ms de la animación: ya está guardado.
        expect(ordenGuardado().slice(0, 3)).toEqual(["escritorios", "messages", "dashboard"]);
    });
});

describe("OmniDock · teclado", () => {
    it("la tecla Menú y Mayús+F10 abren el menú del icono con foco", async () => {
        await montar();
        boton("messages").focus();
        fireEvent.keyDown(boton("messages"), { key: "ContextMenu" });
        expect(await screen.findByRole("menu")).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
        await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

        boton("hub").focus();
        fireEvent.keyDown(boton("hub"), { key: "F10", shiftKey: true });
        expect(await screen.findByRole("menu")).toBeTruthy();
    });

    it("«Mover en el dock» + flechas reordena y Intro guarda", async () => {
        await montar();
        boton("messages").focus();
        fireEvent.keyDown(boton("messages"), { key: "ContextMenu" });
        fireEvent.click(await screen.findByText("Mover en el dock"));
        await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(boton("messages")));

        fireEvent.keyDown(boton("messages"), { key: "ArrowLeft" });
        fireEvent.keyDown(boton("messages"), { key: "ArrowLeft" });
        // El anuncio para lectores de pantalla dice dónde está.
        expect(document.querySelector("[data-dock-anuncio]")!.textContent).toContain("Posición 2 de");
        // Todavía no se ha guardado nada: se guarda al soltar.
        expect(localStorage.getItem(CLAVE_ITEMS)).toBeNull();
        fireEvent.keyDown(boton("messages"), { key: "Enter" });

        await waitFor(() => expect(ordenGuardado().slice(0, 5)).toEqual(["escritorios", "messages", "dashboard", "profile", "contactos"]));
        expect(document.querySelector("[data-dock-anuncio]")!.textContent).toContain("posición 2");
    });

    it("Escape durante el movimiento con teclado lo cancela", async () => {
        await montar();
        boton("messages").focus();
        fireEvent.keyDown(boton("messages"), { key: "ContextMenu" });
        fireEvent.click(await screen.findByText("Mover en el dock"));
        await waitFor(() => expect(document.activeElement).toBe(boton("messages")));
        fireEvent.keyDown(boton("messages"), { key: "ArrowLeft" });
        fireEvent.keyDown(boton("messages"), { key: "Escape" });
        await waitFor(() => expect(document.querySelector("[data-dock-anuncio]")!.textContent).toContain("cancelado"));
        expect(localStorage.getItem(CLAVE_ITEMS)).toBeNull();
        expect(ordenVisible().slice(0, 5)).toEqual(["escritorios", "dashboard", "profile", "messages", "contactos"]);
    });

    it("el menú se recorre con las flechas y no deja escapar el foco con Tab", async () => {
        await montar();
        boton("messages").focus();
        fireEvent.keyDown(boton("messages"), { key: "ContextMenu" });
        const menu = await screen.findByRole("menu");
        const filas = within(menu).getAllByRole("menuitem").filter((f) => f.getAttribute("aria-disabled") !== "true");
        await waitFor(() => expect(document.activeElement).toBe(filas[0]));
        fireEvent.keyDown(menu, { key: "ArrowDown" });
        expect(document.activeElement).toBe(filas[1]);
        fireEvent.keyDown(menu, { key: "End" });
        expect(document.activeElement).toBe(filas[filas.length - 1]);
        fireEvent.keyDown(menu, { key: "Tab" });
        expect(document.activeElement).toBe(filas[0]);
    });
});

describe("OmniDock · quitar del dock, con deshacer", () => {
    it("«Quitar del dock» apaga el icono y «Deshacer» lo devuelve exactamente a su sitio", async () => {
        const antes = await montar();
        await mantenerYSoltar("contactos");
        fireEvent.click(await screen.findByText("Quitar del dock"));

        await waitFor(() => expect(ordenVisible()).not.toContain("contactos"));
        expect(ordenGuardado()).not.toContain("contactos");
        // El icono NO se borra: sigue en la lista guardada, apagado.
        expect(guardado().find((i) => i.id === "contactos")?.enabled).toBe(false);
        const aviso = document.querySelector("[data-dock-deshacer]") as HTMLElement;
        expect(aviso.textContent).toContain("Contactos");
        expect(screen.queryByRole("menu")).toBeNull();

        fireEvent.click(within(aviso).getByText("Deshacer"));
        await waitFor(() => expect(ordenVisible()).toEqual(antes));
        expect(guardado().find((i) => i.id === "contactos")?.enabled).toBe(true);
        expect(document.querySelector("[data-dock-deshacer]")).toBeNull();
    });

    it("los accesos fundamentales (Ajustes, Biblioteca, Hub) no se pueden quitar desde el menú rápido", async () => {
        await montar();
        await mantenerYSoltar("hub");
        const quitar = (await screen.findByText("Quitar del dock")).closest("button") as HTMLButtonElement;
        expect(quitar.getAttribute("aria-disabled")).toBe("true");
        fireEvent.click(quitar);
        expect(ordenVisible()).toContain("hub");
        expect(document.querySelector("[data-dock-deshacer]")).toBeNull();
        expect(screen.getByRole("menu")).toBeTruthy(); // el menú sigue abierto y dice por qué
    });
});

describe("OmniDock · Información y diseño (punto de entrada para V1b)", () => {
    it("«Información» enseña qué es el acceso y se vuelve con Escape", async () => {
        await montar();
        await mantenerYSoltar("messages");
        fireEvent.click(await screen.findByText("Información"));
        expect(await screen.findByText("Mensajería de StarSeed.")).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
        await waitFor(() => expect(screen.queryByText("Mensajería de StarSeed.")).toBeNull());
        expect(screen.getByRole("menu")).toBeTruthy();
    });

    it("sin diseñador de iconos instalado, el menú es honesto: «Próximamente» y no se cierra", async () => {
        await montar();
        await mantenerYSoltar("messages");
        fireEvent.click(await screen.findByText("Cambiar diseño de este icono"));
        expect(await screen.findByText(/Próximamente/)).toBeTruthy();
        expect(screen.getByRole("menu")).toBeTruthy();
        fireEvent.click(screen.getByText("Plantillas de iconos del perfil"));
        await waitFor(() => expect(screen.getAllByText(/Próximamente/).length).toBeGreaterThan(0));
    });

    it("con un diseñador escuchando, «Cambiar diseño» le entrega el id del icono y cierra el menú", async () => {
        const recibido = vi.fn();
        const quitar = escucharDisenoIcono(recibido);
        try {
            await montar();
            await mantenerYSoltar("messages");
            fireEvent.click(await screen.findByText("Cambiar diseño de este icono"));
            await waitFor(() => expect(recibido).toHaveBeenCalledWith("messages"));
            await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
        } finally {
            quitar();
        }
    });

    it("con plantillas escuchando, «Plantillas de iconos del perfil» las abre", async () => {
        const abrir = vi.fn();
        const quitar = escucharPlantillas(abrir);
        try {
            await montar();
            await mantenerYSoltar("hub");
            fireEvent.click(await screen.findByText("Plantillas de iconos del perfil"));
            await waitFor(() => expect(abrir).toHaveBeenCalledTimes(1));
            await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
        } finally {
            quitar();
        }
    });
});

describe("OmniDock · eventos del diseño (contrato con V1b)", () => {
    it("los eventos llevan el nombre pactado y el detalle { itemId }", async () => {
        const { EVENTO_DISENO_ICONO, EVENTO_PLANTILLAS, pedirDisenoIcono, pedirPlantillas } = await import("@/lib/dock/eventos-dock");
        expect(EVENTO_DISENO_ICONO).toBe("starseed:dock-diseno-icono");
        expect(EVENTO_PLANTILLAS).toBe("starseed:dock-plantillas");
        // Sin oyente nadie lo atiende.
        expect(pedirDisenoIcono("messages")).toBe(false);
        expect(pedirPlantillas()).toBe(false);
        // Un oyente que solo hace preventDefault también cuenta; uno que llama a atender() también.
        const a = (e: Event) => e.preventDefault();
        window.addEventListener(EVENTO_DISENO_ICONO, a);
        expect(pedirDisenoIcono("messages")).toBe(true);
        window.removeEventListener(EVENTO_DISENO_ICONO, a);
        let detalle: { itemId?: string } | undefined;
        const b = (e: Event) => {
            const d = (e as CustomEvent<{ itemId: string; atender: () => void }>).detail;
            detalle = d;
            d.atender();
        };
        window.addEventListener(EVENTO_DISENO_ICONO, b);
        expect(pedirDisenoIcono("hub")).toBe(true);
        window.removeEventListener(EVENTO_DISENO_ICONO, b);
        expect(detalle?.itemId).toBe("hub");
    });
});
