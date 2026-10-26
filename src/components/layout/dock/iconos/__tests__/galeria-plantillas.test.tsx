// @vitest-environment jsdom
/**
 * GaleriaPlantillas — plantillas de iconos para todo el perfil: de serie, de la Biblioteca de la persona y
 * de la Librería pública. Dock y perfil REALES en `localStorage`; Biblioteca y Librería simuladas.
 */
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("sonner", async () => ({ toast: (await import("../__fixtures__/mocks")).toastFalso }));
vi.mock("@/lib/library/entity-library", async () => (await import("../__fixtures__/mocks")).entityLibraryFalsa);
vi.mock("@/lib/library/public-catalog", async () => (await import("../__fixtures__/mocks")).catalogoPublicoFalso);
vi.mock("@/components/library/finder/publish-dialog", () => ({
    PublishDialog: () => null,
}));

import { AppearanceProvider } from "@/context/appearance-context";
import { loadDockConfig } from "@/components/layout/dock-config";
import { leerPerfilIconos } from "@/lib/dock/iconos/almacen";
import { disenoBase, normalizarPlantilla } from "@/lib/dock/iconos/modelo";
import { PLANTILLAS_SERIE } from "@/lib/dock/iconos/plantillas-serie";
import { GaleriaPlantillas } from "../galeria-plantillas";
import { aplicarDisenoAItem } from "../aplicar-dock";
import { guardarDock, guardarPerfil, limpiarEntorno } from "../__fixtures__/entorno";
import {
    bib, catalogoPublicoFalso, elementoGuardado, entityLibraryFalsa, filaPublica, publicos,
    reiniciarMocks, textoDeDiseno, textoDePlantilla, toastFalso,
} from "../__fixtures__/mocks";

const montar = (ui: ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

function abrir() {
    const alCerrar = vi.fn();
    montar(<GaleriaPlantillas abierto alCerrar={alCerrar} />);
    return { alCerrar };
}

const tarjetas = () => [...document.querySelectorAll("[data-plantilla]")] as HTMLElement[];
const tarjeta = (nombre: string | RegExp) => {
    const t = tarjetas().find((c) => (typeof nombre === "string" ? c.textContent?.includes(nombre) : nombre.test(c.textContent ?? "")));
    if (!t) throw new Error(`No hay tarjeta «${String(nombre)}»`);
    return t;
};
const irA = (nombre: RegExp) => fireEvent.click(screen.getByRole("tab", { name: nombre }));
const dockItem = (id: string) => loadDockConfig().find((i) => i.id === id);

const plantillaPublica = normalizarPlantilla({ ...PLANTILLAS_SERIE[1], id: "aurora-comunidad", nombre: "Aurora de la comunidad", autor: "Ana", licencia: "CC0 · dominio público" })!;
const plantillaPropia = normalizarPlantilla({ ...PLANTILLAS_SERIE[2], id: "mi-flor-1", nombre: "Mi flor guardada", autor: "Yo" })!;
const rojo = { ...disenoBase("#ef4444"), forma: "rombo" as const, nombre: "Rombo rojo" };

beforeAll(() => {
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
});
afterEach(() => { cleanup(); limpiarEntorno(); });

describe("GaleriaPlantillas · de serie", () => {
    it("enseña las cuatro plantillas de serie y dice que aún no hay ninguna aplicada", () => {
        abrir();
        expect(screen.getByText(/Ninguna plantilla aplicada/)).toBeInTheDocument();
        expect(tarjetas()).toHaveLength(4);
        for (const nombre of ["Trinity", "Cristal líquido", "Flor de la vida", "Monocromo"]) expect(tarjeta(nombre)).toBeInTheDocument();
        // cada tarjeta enseña una muestra con iconos diseñados
        expect(tarjeta("Trinity").querySelectorAll("[data-icono-disenado]").length).toBeGreaterThanOrEqual(3);
    });

    it("las pestañas de origen son un tablist y los botones miden 44 px", () => {
        abrir();
        const tabs = screen.getAllByRole("tab");
        expect(tabs.map((t) => t.textContent)).toEqual(["De serie", "Mi Biblioteca", "Librería"]);
        for (const t of tabs) expect(t.className).toMatch(/min-h-11/);
        expect(within(tarjeta("Trinity")).getByRole("button", { name: /Aplicar Trinity/ }).className).toMatch(/h-11/);
    });

    it("aplicar escribe la plantilla en el perfil, avisa a quien escucha y marca «En uso»", () => {
        const aviso = vi.fn();
        window.addEventListener("starseed:dock-iconos", aviso);
        abrir();
        fireEvent.click(within(tarjeta("Trinity")).getByRole("button", { name: /Aplicar Trinity/ }));
        window.removeEventListener("starseed:dock-iconos", aviso);
        expect(leerPerfilIconos().plantilla?.id).toBe("serie-trinity");
        expect(aviso).toHaveBeenCalled();
        expect(toastFalso.success).toHaveBeenCalledWith(expect.stringContaining("Trinity"), expect.anything());
        expect(within(tarjeta("Trinity")).getByText("En uso")).toBeInTheDocument();
        expect(within(tarjeta("Trinity")).getByRole("button", { name: /Aplicar Trinity/ })).toBeDisabled();
        expect(screen.getByText(/Plantilla del perfil:/)).toHaveTextContent("Trinity");
    });

    it("sin diseños sueltos no pide confirmación", () => {
        abrir();
        fireEvent.click(within(tarjeta("Monocromo")).getByRole("button", { name: /Aplicar Monocromo/ }));
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(leerPerfilIconos().plantilla?.id).toBe("serie-monocromo");
    });
});

describe("GaleriaPlantillas · con iconos cambiados a mano", () => {
    beforeEach(() => {
        aplicarDisenoAItem("messages", rojo);
        aplicarDisenoAItem("notifications", { ...rojo, forma: "gota" });
    });

    it("pregunta antes de aplicar y ofrece conservar lo hecho a mano (por defecto, conservar)", () => {
        abrir();
        fireEvent.click(within(tarjeta("Trinity")).getByRole("button", { name: /Aplicar Trinity/ }));
        const confirma = screen.getByRole("alertdialog", { name: /Aplicar Trinity/ });
        expect(confirma).toHaveTextContent("Conservar los 2 icono(s) que cambié a mano");
        expect(within(confirma).getByRole("switch")).toBeChecked();
        // todavía no se aplicó nada
        expect(leerPerfilIconos().plantilla).toBeNull();
        fireEvent.click(within(confirma).getByRole("button", { name: "Aplicar" }));
        expect(leerPerfilIconos().plantilla?.id).toBe("serie-trinity");
        expect(dockItem("messages")?.diseno?.forma).toBe("rombo");
        expect(dockItem("notifications")?.diseno?.forma).toBe("gota");
    });

    it("sin conservar, los iconos retocados pasan a seguir la plantilla", () => {
        abrir();
        fireEvent.click(within(tarjeta("Trinity")).getByRole("button", { name: /Aplicar Trinity/ }));
        const confirma = screen.getByRole("alertdialog");
        fireEvent.click(within(confirma).getByRole("switch"));
        fireEvent.click(within(confirma).getByRole("button", { name: "Aplicar" }));
        expect(dockItem("messages")?.diseno).toBeUndefined();
        expect(dockItem("notifications")?.diseno).toBeUndefined();
        expect(toastFalso.success).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ description: expect.stringContaining("2 icono(s)") }));
    });

    it("cancelar no cambia nada", () => {
        abrir();
        fireEvent.click(within(tarjeta("Trinity")).getByRole("button", { name: /Aplicar Trinity/ }));
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(leerPerfilIconos().plantilla).toBeNull();
        expect(dockItem("messages")?.diseno?.forma).toBe("rombo");
    });
});

describe("GaleriaPlantillas · quitar", () => {
    it("quitar la plantilla deja lo hecho a mano", () => {
        guardarPerfil(PLANTILLAS_SERIE[0]);
        aplicarDisenoAItem("messages", rojo);
        abrir();
        fireEvent.click(screen.getByRole("button", { name: /Quitar diseños/ }));
        fireEvent.click(screen.getByRole("button", { name: "Quitar la plantilla" }));
        expect(leerPerfilIconos().plantilla).toBeNull();
        expect(dockItem("messages")?.diseno?.forma).toBe("rombo");
        expect(screen.getByText(/Ninguna plantilla aplicada/)).toBeInTheDocument();
    });

    it("«Todo como de fábrica» quita también los diseños sueltos", () => {
        guardarPerfil(PLANTILLAS_SERIE[0]);
        aplicarDisenoAItem("messages", rojo);
        abrir();
        fireEvent.click(screen.getByRole("button", { name: /Quitar diseños/ }));
        fireEvent.click(screen.getByRole("button", { name: "Todo como de fábrica" }));
        expect(leerPerfilIconos().plantilla).toBeNull();
        expect(dockItem("messages")?.diseno).toBeUndefined();
    });

    it("cancelar el menú de quitar no toca nada", () => {
        guardarPerfil(PLANTILLAS_SERIE[0]);
        abrir();
        fireEvent.click(screen.getByRole("button", { name: /Quitar diseños/ }));
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(leerPerfilIconos().plantilla?.id).toBe("serie-trinity");
        expect(screen.getByRole("button", { name: /Quitar diseños/ })).toBeInTheDocument();
    });

    it("sin plantilla ni diseños sueltos no hay nada que quitar", () => {
        abrir();
        expect(screen.queryByRole("button", { name: /Quitar diseños/ })).toBeNull();
    });
});

describe("GaleriaPlantillas · Mi Biblioteca", () => {
    it("lista lo guardado con la etiqueta, valida cada elemento y avisa de los que no se pudieron leer", async () => {
        bib.items = [
            elementoGuardado("b1", textoDePlantilla(plantillaPropia)),
            elementoGuardado("b2", textoDeDiseno(rojo)),
            elementoGuardado("b3", "esto no es un paquete"),
            elementoGuardado("b4", textoDePlantilla(plantillaPublica), { tags: ["otra-cosa"] }), // sin la etiqueta: ni se mira
        ];
        abrir();
        irA(/Mi Biblioteca/);
        expect(await screen.findByText("Mi flor guardada")).toBeInTheDocument();
        expect(entityLibraryFalsa.listLibrary).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Rombo rojo")).toBeInTheDocument();
        expect(screen.queryByText("Aurora de la comunidad")).toBeNull();
        expect(screen.getByText(/Un solo diseño: se usa como estilo para todos/)).toBeInTheDocument();
        expect(screen.getByText(/1 elemento\(s\) con la etiqueta de iconos no se pudieron leer/)).toBeInTheDocument();
    });

    it("aplicar una plantilla de la Biblioteca la pone en el perfil", async () => {
        bib.items = [elementoGuardado("b1", textoDePlantilla(plantillaPropia))];
        abrir();
        irA(/Mi Biblioteca/);
        await screen.findByText("Mi flor guardada");
        fireEvent.click(within(tarjeta("Mi flor guardada")).getByRole("button", { name: /Aplicar Mi flor guardada/ }));
        expect(leerPerfilIconos().plantilla?.id).toBe("mi-flor-1");
    });

    it("un diseño suelto de la Biblioteca se aplica como estilo de todo el perfil", async () => {
        bib.items = [elementoGuardado("b2", textoDeDiseno(rojo))];
        abrir();
        irA(/Mi Biblioteca/);
        await screen.findByText("Rombo rojo");
        fireEvent.click(within(tarjeta("Rombo rojo")).getByRole("button", { name: /Aplicar Rombo rojo/ }));
        expect(leerPerfilIconos().plantilla?.porDefecto?.forma).toBe("rombo");
    });

    it("sin nada guardado lo explica y dice cómo guardar", async () => {
        abrir();
        irA(/Mi Biblioteca/);
        expect(await screen.findByText("Aún no guardaste ninguna")).toBeInTheDocument();
    });

    it("sin sesión pide iniciar sesión (no finge una lista vacía)", async () => {
        bib.destinos = [];
        abrir();
        irA(/Mi Biblioteca/);
        expect(await screen.findByText("Inicia sesión para ver tu Biblioteca")).toBeInTheDocument();
        expect(entityLibraryFalsa.listLibrary).not.toHaveBeenCalled();
    });

    it("si la nube no responde usa la copia de este aparato y lo dice", async () => {
        bib.items = [elementoGuardado("b1", textoDePlantilla(plantillaPropia))];
        entityLibraryFalsa.listLibrary.mockRejectedValueOnce(new Error("sin red"));
        abrir();
        irA(/Mi Biblioteca/);
        expect(await screen.findByText("Mi flor guardada")).toBeInTheDocument();
        expect(screen.getByText(/No pude consultar la nube/)).toBeInTheDocument();
    });
});

describe("GaleriaPlantillas · Librería pública", () => {
    it("pide solo la categoría «iconos» y enseña lo válido", async () => {
        publicos.filas = [filaPublica("p1", textoDePlantilla(plantillaPublica), "Aurora")];
        abrir();
        irA(/Librería/);
        expect(await screen.findByText("Aurora de la comunidad")).toBeInTheDocument();
        expect(catalogoPublicoFalso.listPublicItems).toHaveBeenCalledWith({ category: "iconos" });
        expect(screen.getByText(/Ana · CC0/)).toBeInTheDocument();
    });

    it("lo hostil o roto no se muestra, ni su texto llega a la página, y se avisa", async () => {
        publicos.filas = [
            filaPublica("p1", textoDePlantilla(plantillaPublica)),
            filaPublica("p2", "<script>alert('hola')</script>", "Script"),
            filaPublica("p3", { no: "es texto" }, "Objeto"),
            filaPublica("p4", "x".repeat(2_000_000), "Enorme"),
        ];
        abrir();
        irA(/Librería/);
        await screen.findByText("Aurora de la comunidad");
        expect(tarjetas()).toHaveLength(1);
        expect(document.body.innerHTML).not.toContain("alert('hola')");
        expect(screen.getByText(/3 publicación\(es\) no se muestran/)).toBeInTheDocument();
    });

    it("una plantilla pública se aplica igual que cualquier otra", async () => {
        publicos.filas = [filaPublica("p1", textoDePlantilla(plantillaPublica))];
        abrir();
        irA(/Librería/);
        await screen.findByText("Aurora de la comunidad");
        fireEvent.click(within(tarjeta("Aurora de la comunidad")).getByRole("button", { name: /Aplicar Aurora/ }));
        expect(leerPerfilIconos().plantilla?.id).toBe("aurora-comunidad");
        expect(leerPerfilIconos().plantilla?.autor).toBe("Ana");
    });

    it("sin publicaciones, o sin conexión, lo dice con claridad", async () => {
        abrir();
        irA(/Librería/);
        expect(await screen.findByText("No hay diseños publicados todavía")).toBeInTheDocument();
    });
});

describe("GaleriaPlantillas · importar un archivo", () => {
    const entrada = () => screen.getByLabelText("Elegir un archivo de iconos") as HTMLInputElement;
    const subir = (contenido: string, nombre = "mis-iconos.json") =>
        fireEvent.change(entrada(), { target: { files: [new File([contenido], nombre, { type: "application/json" })] } });

    it("un paquete válido aparece como tarjeta «Importada de un archivo» y se puede aplicar o descartar", async () => {
        abrir();
        subir(textoDePlantilla(plantillaPropia));
        expect(await screen.findByText("Importada de un archivo")).toBeInTheDocument();
        const t = tarjeta("Mi flor guardada");
        fireEvent.click(within(t).getByRole("button", { name: /Aplicar Mi flor guardada/ }));
        expect(leerPerfilIconos().plantilla?.id).toBe("mi-flor-1");
    });

    it("un diseño suelto exportado también se importa", async () => {
        abrir();
        subir(textoDeDiseno(rojo), "rombo.starseed-iconos-icono.json");
        expect(await screen.findByText("Importada de un archivo")).toBeInTheDocument();
        expect(tarjeta("Rombo rojo")).toBeInTheDocument();
    });

    it("un archivo que no es de iconos se rechaza con el motivo y no deja nada importado", async () => {
        abrir();
        subir("esto no es json");
        expect(await screen.findByRole("status")).toHaveTextContent(/JSON válido/);
        expect(screen.queryByText("Importada de un archivo")).toBeNull();
    });

    it("descartar quita la importada", async () => {
        abrir();
        subir(textoDePlantilla(plantillaPropia));
        await screen.findByText("Importada de un archivo");
        fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
        expect(screen.queryByText("Importada de un archivo")).toBeNull();
    });
});

describe("GaleriaPlantillas · crear desde mi dock", () => {
    it("si el dock aún no tiene diseños lo dice en vez de crear una plantilla vacía", () => {
        abrir();
        fireEvent.click(screen.getByRole("button", { name: /Crear desde mi dock/ }));
        expect(toastFalso.info).toHaveBeenCalledWith("Tu dock todavía no tiene diseños", expect.anything());
        expect(screen.queryByRole("button", { name: /Guardar en mi Biblioteca/ })).toBeNull();
    });

    it("con diseños, ofrece guardarla y compartirla; guardar la deja en la Biblioteca con su etiqueta", async () => {
        aplicarDisenoAItem("messages", rojo);
        aplicarDisenoAItem("notifications", { ...rojo, forma: "gota" });
        abrir();
        fireEvent.change(screen.getByLabelText("Mi dock como plantilla"), { target: { value: "Mi dock rojo" } });
        fireEvent.click(screen.getByRole("button", { name: /Crear desde mi dock/ }));
        const guardar = await screen.findByRole("button", { name: /Guardar en mi Biblioteca/ });
        fireEvent.click(guardar);
        await waitFor(() => expect(bib.guardados).toHaveLength(1));
        const g = bib.guardados[0] as { tags: string[]; content: string };
        expect(g.tags).toEqual(expect.arrayContaining(["starseed-iconos", "plantilla"]));
        expect(JSON.parse(g.content).plantilla.nombre).toBe("Mi dock rojo");
        // exportar una plantilla es JSON; el SVG suelto no aplica a una plantilla entera
        expect(screen.getByRole("button", { name: /Exportar como SVG/ })).toBeDisabled();
    });
});

describe("GaleriaPlantillas · cerrar", () => {
    it("«Cerrar» avisa al montaje", () => {
        const { alCerrar } = abrir();
        fireEvent.click(screen.getAllByRole("button", { name: "Cerrar" })[0]);
        expect(alCerrar).toHaveBeenCalledTimes(1);
    });
});
