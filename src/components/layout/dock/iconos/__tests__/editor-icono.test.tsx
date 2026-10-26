// @vitest-environment jsdom
/**
 * EditorIcono — el editor del diseño de UN icono del dock. Se prueba con el dock REAL en `localStorage`
 * (sin simular `loadDockConfig` / `saveDockConfig`) y con la Biblioteca, la Librería y la IA simuladas.
 */
import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("sonner", async () => ({ toast: (await import("../__fixtures__/mocks")).toastFalso }));
vi.mock("@/lib/library/entity-library", async () => (await import("../__fixtures__/mocks")).entityLibraryFalsa);
vi.mock("@/lib/library/public-catalog", async () => (await import("../__fixtures__/mocks")).catalogoPublicoFalso);
vi.mock("@/ai/astraura/availability", async () => {
    const { ia } = await import("../__fixtures__/mocks");
    return { detectAvailability: vi.fn(async () => ia.disponibilidad) };
});
vi.mock("@/ai/astraura/router", async () => ({ astrauraChat: (await import("../__fixtures__/mocks")).ia.chat }));
vi.mock("@/ai/astraura/media/media-gen", () => ({
    listMediaProvidersFor: () => ({ available: [{ id: "pollinations", label: "Pollinations.ai", note: "", access: "web" }] }),
}));
vi.mock("@/components/library/finder/publish-dialog", () => ({
    PublishDialog: (p: { defaultCategory?: string; open: boolean }) => (p.open ? <div role="dialog" aria-label="Publicar (simulado)" data-categoria={p.defaultCategory} /> : null),
}));

import { AppearanceProvider } from "@/context/appearance-context";
import { loadDockConfig } from "@/components/layout/dock-config";
import { CLAVE_PERFIL_ICONOS, leerPerfilIconos } from "@/lib/dock/iconos/almacen";
import { SIN_IA_MOTIVO } from "@/lib/dock/iconos/ia-variaciones";
import { disenoBase } from "@/lib/dock/iconos/modelo";
import { PLANTILLAS_SERIE } from "@/lib/dock/iconos/plantillas-serie";
import { EditorIcono } from "../editor-icono";
import { aplicarDisenoAItem } from "../aplicar-dock";
import { guardarDock, guardarPerfil, leerDockGuardado, limpiarEntorno } from "../__fixtures__/entorno";
import { bib, fuenteIA, ia, reiniciarMocks, toastFalso } from "../__fixtures__/mocks";

const montar = (ui: ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

function abrir(itemId = "messages") {
    const alCerrar = vi.fn();
    montar(<EditorIcono itemId={itemId} abierto alCerrar={alCerrar} />);
    return { alCerrar };
}

const vistaPrincipal = () => document.querySelector("[data-vista-principal] [data-icono-disenado]") as HTMLElement | null;
const estadoVista = () => document.querySelector("[data-estado-vista]")!.textContent;
const botonAplicar = () => screen.getByRole("button", { name: /^(Aplicar a este icono|Quitar el diseño)$/ });
const botonCerrar = () => screen.getAllByRole("button", { name: "Cerrar" })[0]; // el del pie; la X del diálogo va la última
const dockItem = (id: string) => loadDockConfig().find((i) => i.id === id);

const SVG_OK = '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="18" stroke="currentColor" fill="none"/></svg>';

beforeAll(() => {
    // jsdom no trae lo que usan el deslizador de Radix ni las descargas
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    URL.createObjectURL = vi.fn(() => "blob:prueba");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
});

beforeEach(() => {
    limpiarEntorno();
    reiniciarMocks();
    guardarDock();
    for (let i = 0; i < 5; i++) {
        const antes = window.localStorage.getItem("starseed.dock.items.v2");
        loadDockConfig();
        if (window.localStorage.getItem("starseed.dock.items.v2") === antes) break;
    }
    vi.mocked(URL.createObjectURL).mockClear();
});
afterEach(() => { cleanup(); limpiarEntorno(); });

describe("EditorIcono · abrir", () => {
    it("lleva el nombre del icono y, si no tiene diseño, dice que se ve el de siempre", () => {
        abrir("messages");
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText(/Diseño del icono · Mensajes/)).toBeInTheDocument();
        expect(estadoVista()).toBe("Icono de siempre");
        expect(vistaPrincipal()).toBeNull();
        expect(botonAplicar()).toBeDisabled();
    });

    it("si el icono ya no está en el dock lo dice y deja cerrar", () => {
        const { alCerrar } = abrir("no-existe");
        expect(screen.getByText(/No encuentro ese icono en tu dock/)).toBeInTheDocument();
        fireEvent.click(botonCerrar());
        expect(alCerrar).toHaveBeenCalled();
    });

    it("las pestañas son un tablist accesible y los botones de elegir miden 44 px como mínimo", () => {
        abrir();
        const tabs = screen.getAllByRole("tab");
        expect(tabs.map((t) => t.textContent)).toEqual(["Diseño", "Con IA", "Guardar y compartir"]);
        expect(tabs[0]).toHaveAttribute("aria-selected", "true");
        for (const t of tabs) expect(t.className).toMatch(/min-h-11/);
        expect(screen.getByRole("button", { name: "Hexágono" }).className).toMatch(/min-h-11/);
    });
});

describe("EditorIcono · diseñar", () => {
    it("elegir una forma actualiza la vista previa al instante y activa «Aplicar»", () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: "Hexágono" }));
        expect(vistaPrincipal()).toHaveAttribute("data-icono-forma", "hexagono");
        expect(screen.getByRole("button", { name: "Hexágono" })).toHaveAttribute("aria-pressed", "true");
        expect(estadoVista()).toBe("Vista previa · sin aplicar");
        expect(botonAplicar()).toBeEnabled();
        // todavía no se escribió nada en el dock
        expect(dockItem("messages")?.diseno).toBeUndefined();
    });

    it("cambiar el tipo de fondo muestra sus propios controles", () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: "Degradado" }));
        expect(screen.getByText("Color inicial")).toBeInTheDocument();
        expect(screen.getByText("Ángulo del degradado")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Sin fondo" }));
        expect(screen.queryByText("Color inicial")).toBeNull();
    });

    it("un dibujo SVG hostil se saneó: lo malo no llega al diseño", () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: "Dibujo SVG" }));
        fireEvent.change(screen.getByLabelText("Pega un dibujo SVG"), { target: { value: '<svg viewBox="0 0 64 64" onload="x()"><script>alert(1)</script><circle cx="32" cy="32" r="10" stroke="currentColor"/></svg>' } });
        fireEvent.click(screen.getByRole("button", { name: /Usar este dibujo/ }));
        expect(screen.getByRole("status")).toHaveTextContent(/quitó/);
        const fuentes = [...vistaPrincipal()!.querySelectorAll("img")].map((i) => decodeURIComponent(i.getAttribute("src") ?? ""));
        expect(fuentes.some((f) => f.includes("<circle"))).toBe(true);
        for (const f of fuentes) expect(f).not.toMatch(/script|onload/i);
    });

    it("un SVG que no es un SVG se rechaza con un motivo y no cambia nada", () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: "Dibujo SVG" }));
        fireEvent.change(screen.getByLabelText("Pega un dibujo SVG"), { target: { value: "hola" } });
        fireEvent.click(screen.getByRole("button", { name: /Usar este dibujo/ }));
        expect(screen.getByRole("status")).toHaveClass("text-red-300");
        expect(botonAplicar()).toBeDisabled();
    });

    it("buscar entre los iconos disponibles filtra la rejilla y elegir uno cambia el dibujo", () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: "Otro icono" }));
        fireEvent.change(screen.getByPlaceholderText(/Buscar un icono/), { target: { value: "moon" } });
        const rejilla = screen.getByRole("list", { name: "Iconos disponibles" });
        const botones = within(rejilla).getAllByRole("button");
        expect(botones.length).toBeLessThan(5);
        fireEvent.click(within(rejilla).getByRole("button", { name: "Moon" }));
        expect(botonAplicar()).toBeEnabled();
        fireEvent.change(screen.getByPlaceholderText(/Buscar un icono/), { target: { value: "zzzzzz" } });
        expect(screen.getByText(/Ningún icono se llama así/)).toBeInTheDocument();
    });
});

describe("EditorIcono · deshacer, rehacer y restablecer", () => {
    it("deshacer y rehacer recorren los cambios", () => {
        abrir();
        const deshacer = screen.getByRole("button", { name: "Deshacer" });
        const rehacer = screen.getByRole("button", { name: "Rehacer" });
        expect(deshacer).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Hexágono" }));
        fireEvent.click(screen.getByRole("button", { name: "Rombo" }));
        expect(vistaPrincipal()).toHaveAttribute("data-icono-forma", "rombo");
        fireEvent.click(deshacer);
        expect(vistaPrincipal()).toHaveAttribute("data-icono-forma", "hexagono");
        expect(rehacer).toBeEnabled();
        fireEvent.click(rehacer);
        expect(vistaPrincipal()).toHaveAttribute("data-icono-forma", "rombo");
        fireEvent.click(deshacer);
        fireEvent.click(deshacer);
        expect(vistaPrincipal()).toBeNull();
        expect(estadoVista()).toBe("Icono de siempre");
    });

    it("restablecer quita el diseño y se puede deshacer", () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: "Gota" }));
        fireEvent.click(screen.getByRole("button", { name: "Quitar el diseño: icono de siempre" }));
        expect(vistaPrincipal()).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
        expect(vistaPrincipal()).toHaveAttribute("data-icono-forma", "gota");
    });
});

describe("EditorIcono · aplicar y cerrar", () => {
    it("aplicar escribe el diseño en el dock real, avisa a OmniDock, lo dice y cierra", () => {
        const avisos = vi.fn();
        window.addEventListener("starseed:dock", avisos);
        const { alCerrar } = abrir();
        fireEvent.click(screen.getByRole("button", { name: "Escudo" }));
        fireEvent.click(botonAplicar());
        window.removeEventListener("starseed:dock", avisos);
        expect(dockItem("messages")?.diseno?.forma).toBe("escudo");
        expect(dockItem("notifications")?.diseno).toBeUndefined();
        expect(avisos).toHaveBeenCalledTimes(1);
        expect(toastFalso.success).toHaveBeenCalledWith(expect.stringContaining("Mensajes"));
        expect(alCerrar).toHaveBeenCalled();
        expect((leerDockGuardado().find((i) => i.id === "messages")?.diseno as { forma: string }).forma).toBe("escudo");
    });

    it("cerrar con cambios pide confirmación; «Seguir editando» la quita y «Descartar» cierra sin escribir", () => {
        const { alCerrar } = abrir();
        fireEvent.click(screen.getByRole("button", { name: "Flor" }));
        fireEvent.click(botonCerrar());
        const aviso = screen.getByRole("alertdialog", { name: "Cambios sin aplicar" });
        expect(alCerrar).not.toHaveBeenCalled();
        fireEvent.click(within(aviso).getByRole("button", { name: "Seguir editando" }));
        expect(screen.queryByRole("alertdialog")).toBeNull();
        fireEvent.click(botonCerrar());
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Descartar" }));
        expect(alCerrar).toHaveBeenCalledTimes(1);
        expect(dockItem("messages")?.diseno).toBeUndefined();
    });

    it("cerrar sin cambios cierra a la primera", () => {
        const { alCerrar } = abrir();
        fireEvent.click(botonCerrar());
        expect(alCerrar).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("si el icono desaparece del dock mientras se edita, no escribe y lo dice", () => {
        // un icono propio de la persona (los de serie siempre vuelven al catálogo, apagados)
        const guardado = JSON.parse(window.localStorage.getItem("starseed.dock.items.v2")!);
        const lista = Array.isArray(guardado) ? guardado : guardado.items;
        lista.push({ id: "mio-1", label: "Mi enlace", iconKey: "Sparkles", path: "/mio", color: "cyan", enabled: true, origin: "user" });
        window.localStorage.setItem("starseed.dock.items.v2", JSON.stringify({ defaultsVersion: 99, items: lista }));
        abrir("mio-1");
        fireEvent.click(screen.getByRole("button", { name: "Flor" }));
        // otro aparato lo quitó: el dock ya no lo tiene
        window.localStorage.setItem("starseed.dock.items.v2", JSON.stringify({ defaultsVersion: 99, items: lista.filter((i: { id: string }) => i.id !== "mio-1") }));
        fireEvent.click(botonAplicar());
        expect(toastFalso.error).toHaveBeenCalledWith("Ese icono ya no está en tu dock.");
    });
});

describe("EditorIcono · icono con diseño propio", () => {
    it("abre con su diseño, y «Quitar el diseño» lo borra del dock", () => {
        aplicarDisenoAItem("messages", { ...disenoBase("#ef4444"), forma: "rombo" });
        abrir();
        expect(vistaPrincipal()).toHaveAttribute("data-icono-forma", "rombo");
        expect(estadoVista()).toBe("Así se ve ahora");
        expect(botonAplicar()).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Quitar el diseño: icono de siempre" }));
        const quitar = screen.getByRole("button", { name: "Quitar el diseño" });
        expect(quitar).toBeEnabled();
        fireEvent.click(quitar);
        expect(dockItem("messages")?.diseno).toBeUndefined();
    });
});

describe("EditorIcono · con una plantilla en el perfil", () => {
    beforeEach(() => guardarPerfil(PLANTILLAS_SERIE[0]));

    it("enseña el diseño de la plantilla y lo dice", () => {
        abrir();
        expect(estadoVista()).toBe("De la plantilla");
        expect(vistaPrincipal()).not.toBeNull();
        expect(screen.getByText(new RegExp(`Usa el diseño de la plantilla «${PLANTILLAS_SERIE[0].nombre}»`))).toBeInTheDocument();
    });

    it("retocarlo lo hace solo de este icono; restablecer lo devuelve a la plantilla sin dejar nada pendiente", () => {
        abrir();
        const reponer = screen.getByRole("button", { name: "Volver al diseño de la plantilla" });
        expect(reponer).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Escudo" }));
        expect(estadoVista()).toBe("Vista previa · sin aplicar");
        fireEvent.click(reponer);
        expect(estadoVista()).toBe("De la plantilla");
        expect(botonAplicar()).toBeDisabled();
    });

    it("aplicar un retoque lo guarda en el item y no toca la plantilla del perfil", () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: "Escudo" }));
        fireEvent.click(botonAplicar());
        expect(dockItem("messages")?.diseno?.forma).toBe("escudo");
        expect(leerPerfilIconos().plantilla?.id).toBe(PLANTILLAS_SERIE[0].id);
    });
});

describe("EditorIcono · con IA", () => {
    const irAIa = () => fireEvent.click(screen.getByRole("tab", { name: /Con IA/ }));
    const respuesta = `### Variación 1: Luna\nforma: hexagono\ncolorGlifo: #ffffff\n${SVG_OK}\n### Variación 2: Sol\nforma: rombo\ncolorGlifo: #fbbf24\n${SVG_OK}`;

    it("sin ninguna IA lista lo dice con el camino para arreglarlo y no deja pedir", async () => {
        abrir();
        irAIa();
        expect(await screen.findByRole("status")).toHaveTextContent(SIN_IA_MOTIVO);
        fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "una luna de cristal" } });
        expect(screen.getByRole("button", { name: /Crear variaciones/ })).toBeDisabled();
        expect(ia.chat).not.toHaveBeenCalled();
    });

    it("los modelos de pago no se ofrecen hasta activar el interruptor", async () => {
        ia.disponibilidad = [fuenteIA("gratis", "free-key"), fuenteIA("pagado", "paid")];
        abrir();
        irAIa();
        const selector = await screen.findByLabelText("Modelo");
        await waitFor(() => expect(within(selector).getAllByRole("option").length).toBeGreaterThan(1));
        expect(within(selector).queryByRole("option", { name: /PAGADO/ })).toBeNull();
        expect(screen.getByText(/hay 1 de pago listo/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("switch", { name: "Permitir modelos de pago" }));
        expect(within(selector).getByRole("option", { name: /PAGADO.*de pago/ })).toBeInTheDocument();
    });

    it("pide UNA vez al modelo gratuito, enseña las variaciones y «Usar esta» la lleva al editor", async () => {
        ia.disponibilidad = [fuenteIA("gratis", "free-key")];
        ia.chat.mockResolvedValue({ text: respuesta, route: { sourceLabel: "GRATIS", modelLabel: "m1", free: true, local: false } });
        abrir();
        irAIa();
        const crear = await screen.findByRole("button", { name: /Crear variaciones/ });
        fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "una luna de cristal con anillo" } });
        await waitFor(() => expect(crear).toBeEnabled());
        fireEvent.click(crear);

        const seccion = await screen.findByRole("region", { name: "Variaciones propuestas" });
        expect(ia.chat).toHaveBeenCalledTimes(1);
        expect(ia.chat.mock.calls[0][0].forceSource).toEqual({ sourceId: "gratis", modelId: "m1" });
        expect(ia.chat.mock.calls[0][0].taskHint).toBe("creative");
        expect(within(seccion).getAllByRole("button", { name: /Usar la variación/ })).toHaveLength(2);
        expect(within(seccion).getByText(/GRATIS · m1/)).toBeInTheDocument();
        // nada se aplicó solo
        expect(dockItem("messages")?.diseno).toBeUndefined();

        fireEvent.click(within(seccion).getByRole("button", { name: "Usar la variación Luna" }));
        // vuelve a la pestaña de diseño con la variación puesta, sin aplicar
        expect(screen.getByRole("tab", { name: "Diseño" })).toHaveAttribute("aria-selected", "true");
        expect(vistaPrincipal()).toHaveAttribute("data-icono-forma", "hexagono");
        expect(estadoVista()).toBe("Vista previa · sin aplicar");
        expect(dockItem("messages")?.diseno).toBeUndefined();
    });

    it("si la IA no responde (solo la local de reserva) lo cuenta como fallo, no como éxito", async () => {
        ia.disponibilidad = [fuenteIA("gratis", "free-key")];
        ia.chat.mockResolvedValue({ text: respuesta, route: { sourceLabel: "Reserva", modelLabel: "x", free: true, local: true } });
        abrir();
        irAIa();
        const crear = await screen.findByRole("button", { name: /Crear variaciones/ });
        fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "una luna" } });
        await waitFor(() => expect(crear).toBeEnabled());
        fireEvent.click(crear);
        expect(await screen.findByRole("alert")).toHaveTextContent(/Ninguna IA respondió/);
        expect(screen.queryByRole("region", { name: "Variaciones propuestas" })).toBeNull();
    });

    it("avisa de que los modelos de texto no ven las imágenes de referencia", async () => {
        abrir();
        irAIa();
        expect(await screen.findByText(/no ven las imágenes/)).toBeInTheDocument();
    });
});

describe("EditorIcono · guardar y compartir", () => {
    const irACompartir = () => fireEvent.click(screen.getByRole("tab", { name: /Guardar y compartir/ }));

    it("«Adjuntar a una publicación» está apagado, dice por qué y ofrece un enlace real al compositor", () => {
        abrir();
        irACompartir();
        const adjuntar = screen.getByRole("button", { name: /Adjuntar a una publicación/ });
        expect(adjuntar).toBeDisabled();
        expect(adjuntar).toHaveAttribute("aria-describedby", "iconos-adjuntar-motivo");
        expect(document.getElementById("iconos-adjuntar-motivo")).toHaveTextContent(/solo recibe texto/);
        const enlace = screen.getByRole("link", { name: /Abrir el compositor de publicaciones/ });
        expect(enlace.getAttribute("href")).toMatch(/^\/publicar\?area=cultura&tipo=archivo&intent=/);
    });

    it("exportar JSON y SVG descarga un archivo y lo dice", () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: "Hexágono" }));
        irACompartir();
        fireEvent.click(screen.getByRole("button", { name: /Exportar como JSON/ }));
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
        const blobJson = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blobJson.type).toBe("application/json");
        fireEvent.click(screen.getByRole("button", { name: /Exportar como SVG/ }));
        expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
        expect((vi.mocked(URL.createObjectURL).mock.calls[1][0] as Blob).type).toBe("image/svg+xml");
        expect(toastFalso.success).toHaveBeenCalledWith("Archivo SVG descargado");
    });

    it("guarda en la Biblioteca con la etiqueta de iconos y el diseño del borrador", async () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: "Rombo" }));
        irACompartir();
        fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Mi rombo" } });
        fireEvent.click(screen.getByRole("button", { name: /Guardar en mi Biblioteca/ }));
        await waitFor(() => expect(bib.guardados).toHaveLength(1));
        const guardado = bib.guardados[0] as { tags: string[]; content: string; type: string; title: string };
        expect(guardado.type).toBe("file");
        expect(guardado.tags).toContain("starseed-iconos");
        expect(guardado.title).toContain("Mi rombo");
        expect(JSON.parse(guardado.content).diseno.forma).toBe("rombo");
        await waitFor(() => expect(toastFalso.success).toHaveBeenCalledWith("Guardado en tu Biblioteca", expect.anything()));
    });

    it("compartir en la Librería guarda primero y abre la publicación en la categoría «Diseños de iconos»", async () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: "Rombo" }));
        irACompartir();
        fireEvent.click(screen.getByRole("button", { name: /Compartir en la Librería/ }));
        const dialogo = await screen.findByRole("dialog", { name: "Publicar (simulado)" });
        expect(dialogo).toHaveAttribute("data-categoria", "iconos");
        expect(bib.guardados).toHaveLength(1);
    });

    it("sin sesión, guardar y compartir están apagados y se explica; exportar sigue funcionando", () => {
        bib.destinos = [];
        abrir();
        irACompartir();
        expect(screen.getByRole("button", { name: /Guardar en mi Biblioteca/ })).toBeDisabled();
        expect(screen.getByRole("button", { name: /Compartir en la Librería/ })).toBeDisabled();
        expect(screen.getByRole("note")).toHaveTextContent(/hace falta iniciar sesión/);
        expect(screen.getByRole("button", { name: /Exportar como JSON/ })).toBeEnabled();
    });

    it("«Usar este estilo en todos mis iconos» pide confirmar, ofrece conservar lo hecho a mano y escribe el perfil", () => {
        aplicarDisenoAItem("notifications", { ...disenoBase("#f59e0b"), forma: "gota" });
        const { alCerrar } = abrir();
        fireEvent.click(screen.getByRole("button", { name: "Hexágono" }));
        irACompartir();
        fireEvent.click(screen.getByRole("button", { name: /Usar este estilo en todos mis iconos/ }));
        expect(screen.getByText(/Conservar los 1 icono\(s\) que cambié a mano/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Aplicar a todo el perfil/ }));
        const perfil = leerPerfilIconos();
        expect(perfil.plantilla?.porDefecto?.forma).toBe("hexagono");
        expect(window.localStorage.getItem(CLAVE_PERFIL_ICONOS)).toContain("hexagono");
        // el icono cambiado a mano se conserva
        expect(dockItem("notifications")?.diseno?.forma).toBe("gota");
        expect(alCerrar).toHaveBeenCalled();
    });
});

describe("EditorIcono · abrir de nuevo", () => {
    it("el estado arranca limpio cada vez (no arrastra el borrador anterior)", () => {
        const a = abrir();
        fireEvent.click(screen.getByRole("button", { name: "Flor" }));
        cleanup();
        void a;
        abrir();
        expect(estadoVista()).toBe("Icono de siempre");
        act(() => {});
    });
});
