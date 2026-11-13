import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { FILTRO_TODOS, filtrarFeed, opcionesDeFiltro, type FiltroFeed } from "@/lib/mando/chat-director-feed";
import type { PrefsChatsGenesis } from "@/lib/chats-genesis/tipos";

import { clienteFalso, feedDeEjemplo, ponerAncho, respuestaFeed } from "./ayudas";

const acceso = vi.hoisted(() => ({ valor: null as { miembro: boolean; dueno: boolean } | null }));
const prefsGuardadas = vi.hoisted(() => ({ lista: [] as unknown[], leer: null as unknown, falla: false }));

vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: vi.fn(async () => acceso.valor) }));
vi.mock("@/lib/genesis/entidades", () => ({
    misEntidades: vi.fn(async () => ({ ok: true, lista: [{ tipo: "grupo", id: "g1", slug: "huerto", nombre: "Huerto común", rol: "gestión", rango: 3, dueña: false }] })),
}));
vi.mock("@/lib/chats-genesis/vinculos", async (original) => {
    const real = await original<typeof import("@/lib/chats-genesis/vinculos")>();
    return {
        ...real,
        leerCopiaLocalChatsGenesis: () => ({ v: 1, vinculos: [], conexiones: {} }),
        leerPrefsChatsGenesis: vi.fn(async () => prefsGuardadas.leer ?? { v: 1, vinculos: [], conexiones: {} }),
        guardarPrefsChatsGenesis: vi.fn(async (p: unknown) => {
            if (prefsGuardadas.falla) throw new Error("No se guardaron los chats de Genesis en tu cuenta");
            prefsGuardadas.lista.push(p);
        }),
    };
});

// GEN1114F: la clave del aparato y su estado en la puerta (sin IndexedDB ni red en jsdom).
vi.mock("@/lib/chats-genesis/firma-aparato", async (original) => {
    const real = await original<typeof import("@/lib/chats-genesis/firma-aparato")>();
    const { APARATO_COMPLETO: a } = await import("./ayudas");
    return { ...real, aparatoLocal: vi.fn(async () => a) };
});
vi.mock("@/lib/chats-genesis/emparejar", async (original) => {
    const real = await original<typeof import("@/lib/chats-genesis/emparejar")>();
    const { APARATO_COMPLETO: a } = await import("./ayudas");
    return { ...real, consultarEmparejamiento: vi.fn(async () => a), crearClienteAparatos: vi.fn(() => ({ solicitar: vi.fn(), estado: vi.fn(async () => null) })) };
});

import { PestanaGenesis } from "../pestana-genesis";
import { VISTAS } from "../hilo-direccion";
import { TEXTO_SIN_META } from "../lista-chats-genesis";

const VISTAS_ESPERADAS = ["Todo", "Dirección", "Conversación", "Informes", "Enjambre", "Usos"];

async function montar(opciones: { ancho: number; registros?: ReturnType<typeof feedDeEjemplo>; latidoS?: number | null } = { ancho: 1440 }) {
    ponerAncho(opciones.ancho);
    const registros = opciones.registros ?? feedDeEjemplo();
    const falso = clienteFalso({ feeds: { direccion: respuestaFeed(registros, opciones.latidoS === undefined ? 20 : opciones.latidoS) } });
    // Sin catálogo (la Mac aún no lo publicó): los nombres son los provisionales de GEN1113.
    const clienteCanon = { leer: vi.fn(async () => ({ ok: true as const, catalogo: null })) };
    render(<PestanaGenesis cliente={falso.cliente} clienteCanon={clienteCanon} />);
    await act(async () => { await Promise.resolve(); });
    return { ...falso, registros };
}

describe("PestanaGenesis", () => {
    beforeEach(() => {
        acceso.valor = { miembro: true, dueno: true };
        prefsGuardadas.lista = [];
        prefsGuardadas.leer = null;
    });
    afterEach(() => {
        cleanup();
        window.localStorage.clear();
    });

    it("un dueño ve el grupo MetaGenesis con Dirección y los tres puentes, y las seis vistas", async () => {
        await montar({ ancho: 1440 });
        const grupo = await screen.findByRole("group", { name: "MetaGenesis" });
        expect(within(grupo).getByText("GENESIS · StarSeed OS")).toBeInTheDocument();
        expect(within(grupo).getAllByTestId("marca-provisional-lista").length).toBe(4);
        for (const p of ["Hermes y avisos", "Peticiones y encargos", "Avisos de los directores"]) expect(within(grupo).getByText(p)).toBeInTheDocument();
        expect(within(grupo).getByText("Puentes de Telegram")).toBeInTheDocument();
        const vistas = await screen.findByRole("tablist", { name: "Vistas de dirección" });
        expect(within(vistas).getAllByRole("tab").map((t) => t.textContent)).toEqual(VISTAS_ESPERADAS);
        expect(VISTAS.map((v) => v.etiqueta)).toEqual(VISTAS_ESPERADAS);
    });

    it("en cada vista, los chips son exactamente los que da opcionesDeFiltro sobre el feed", async () => {
        const { registros } = await montar({ ancho: 1440 });
        await screen.findAllByTestId("mensaje-direccion");
        for (const v of VISTAS) {
            fireEvent.click(screen.getByRole("tab", { name: v.etiqueta }));
            const esperadas = opcionesDeFiltro(v.id as FiltroFeed, filtrarFeed(registros, v.id as FiltroFeed), Date.now(), FILTRO_TODOS);
            const grupo = screen.queryByRole("group", { name: `Filtros de ${v.etiqueta}` });
            if (esperadas.length <= 1) {
                expect(grupo, v.etiqueta).toBeNull();
                continue;
            }
            const chips = within(grupo!).getAllByRole("button").map((b) => b.textContent);
            expect(chips, v.etiqueta).toEqual(esperadas.map((o) => `${o.etiqueta} ${o.cuenta}`));
        }
    });

    it("un desarrollador no ve el compositor de motores ni los puentes A y B", async () => {
        acceso.valor = { miembro: true, dueno: false };
        await montar({ ancho: 1440 });
        const grupo = await screen.findByRole("group", { name: "MetaGenesis" });
        expect(within(grupo).queryByText("Hermes y avisos")).toBeNull();
        expect(within(grupo).queryByText("Peticiones y encargos")).toBeNull();
        expect(within(grupo).getByText("Avisos de los directores")).toBeInTheDocument();
        await screen.findAllByTestId("mensaje-direccion");
        expect(screen.getByTestId("compositor-genesis")).toBeInTheDocument();
        expect(screen.queryByTestId("selector-motor")).toBeNull();
        expect(screen.queryByText(/^Canales \(/)).toBeNull();
        expect(screen.queryByText("Responder con…")).toBeNull();
        expect(screen.getByText(/Escribes solo al hilo/)).toBeInTheDocument();
    });

    it("una cuenta sin acceso no ve el grupo MetaGenesis y no se pide nada a la puerta", async () => {
        acceso.valor = { miembro: false, dueno: false };
        const { feed } = await montar({ ancho: 1440 });
        await screen.findByText(TEXTO_SIN_META);
        expect(screen.queryByRole("group", { name: "MetaGenesis" })).toBeNull();
        expect(screen.queryByText("GENESIS · StarSeed OS")).toBeNull();
        expect(screen.queryByText("Hermes y avisos")).toBeNull();
        expect(screen.getByRole("heading", { name: "Agente de Mi Genesis" })).toBeInTheDocument();
        expect(feed).not.toHaveBeenCalled();
    });

    it("Genesis y PoliGenesis sin vínculos dicen qué falta", async () => {
        acceso.valor = { miembro: false, dueno: false };
        await montar({ ancho: 1440 });
        expect(await screen.findByText(/Aún no has llevado ningún chat a Genesis/)).toBeInTheDocument();
        expect(screen.getAllByText(/Los bots con personalidad llegan en la fase 2/).length).toBeGreaterThan(0);
        expect(screen.getByText("Ningún grupo ni página tiene chats de Genesis todavía.")).toBeInTheDocument();
        expect(screen.getByText("Huerto común")).toBeInTheDocument();
    });

    it("con el latido viejo, la cabecera dice que la Mac no responde y desde cuándo", async () => {
        await montar({ ancho: 1440, latidoS: 600 });
        const cabecera = await screen.findByTestId("cabecera-espejo");
        await waitFor(() => expect(cabecera).toHaveTextContent(/La Mac no responde desde las \d{2}:\d{2} \(hace 10 min\)/));
        expect(cabecera).not.toHaveTextContent(/En vivo/);
    });

    it("la primera vez que un miembro abre la pestaña activa su conexión a MetaGenesis (una sola escritura)", async () => {
        await montar({ ancho: 1440 });
        await waitFor(() => expect(prefsGuardadas.lista.length).toBe(1));
        expect((prefsGuardadas.lista[0] as PrefsChatsGenesis).conexiones.metagenesis).toEqual({ activo: true });
    });

    describe("pantalla de 360 px", () => {
        it("la lista de chats, las vistas y los filtros largos se abren como lista completa, sin tiras", async () => {
            await montar({ ancho: 360 });
            const lista = await screen.findByTestId("lista-chats-genesis");
            expect(lista).toHaveAttribute("data-modo", "menu");
            expect(within(lista).getByRole("button", { name: "Chats de Genesis: GENESIS · StarSeed OS" })).toBeInTheDocument();
            await screen.findAllByTestId("mensaje-direccion");
            expect(screen.queryByRole("tablist", { name: "Vistas de dirección" })).toBeNull();
            expect(screen.getByTestId("vistas-en-lista")).toBeInTheDocument();
            // «Dirección» trae más de tres chips: van en lista.
            fireEvent.click(screen.getByRole("button", { name: "Vistas de dirección: Todo" }));
            fireEvent.click(within(screen.getByRole("dialog")).getByText("Dirección"));
            expect(screen.getByTestId("filtros-en-lista")).toBeInTheDocument();
            // «Enjambre» trae tres chips: caben en su fila, debajo de la vista (no al lado).
            fireEvent.click(screen.getByRole("button", { name: "Vistas de dirección: Dirección" }));
            fireEvent.click(within(screen.getByRole("dialog")).getByText("Enjambre"));
            const chips = screen.getByRole("group", { name: "Filtros de Enjambre" });
            expect(within(chips).getAllByRole("button")).toHaveLength(3);
            expect(chips.parentElement!.className).toMatch(/flex-col/);
            expect(screen.queryByTestId("filtros-en-lista")).toBeNull();
            // Ninguna fila que se desplace de lado.
            const raiz = screen.getByTestId("pestana-genesis");
            for (const el of raiz.querySelectorAll("*")) {
                const c = el.getAttribute("class") ?? "";
                expect(c, c).not.toMatch(/overflow-x-(auto|scroll)|ss-hscroll|flex-nowrap|whitespace-nowrap/);
            }
        });

        it("las acciones de cada mensaje van en «⋯» y el hilo y el cuadro de texto quedan en la misma columna", async () => {
            await montar({ ancho: 360 });
            await screen.findAllByTestId("mensaje-direccion");
            expect(screen.getAllByRole("button", { name: "Acciones del mensaje" }).length).toBeGreaterThan(0);
            expect(screen.queryByText("Responder con…")).toBeNull();
            const hilo = screen.getByTestId("hilo-direccion");
            const log = within(hilo).getByRole("log");
            expect(log.className).toMatch(/flex-1/);
            expect(log.className).toMatch(/min-h-0/);
            expect(log.className).toMatch(/overflow-y-auto/);
            const compositor = screen.getByTestId("compositor-genesis").parentElement!;
            expect(compositor.className).toMatch(/shrink-0/);
            expect(compositor.className).toMatch(/safe-area-inset-bottom/);
        });
    });

    describe("pantalla de 1440 px", () => {
        it("la lista es una columna y las acciones se ven en cada mensaje", async () => {
            await montar({ ancho: 1440 });
            const lista = await screen.findByTestId("lista-chats-genesis");
            expect(lista).toHaveAttribute("data-modo", "columna");
            await screen.findAllByTestId("mensaje-direccion");
            expect(screen.getAllByText("Responder con…").length).toBeGreaterThan(0);
            expect(screen.queryByRole("button", { name: "Acciones del mensaje" })).toBeNull();
            expect(screen.getByTestId("pestana-genesis").className).toMatch(/lg:flex-row/);
        });

        it("elegir un puente abre su hilo", async () => {
            await montar({ ancho: 1440 });
            fireEvent.click(await screen.findByText("Hermes y avisos"));
            expect(await screen.findByTestId("hilo-puente")).toBeInTheDocument();
            // GEN1114F: sin catálogo no hay id real del puente, así que no se ofrece escribir y se dice por qué.
            expect(screen.getByTestId("sin-chat-firmable")).toBeInTheDocument();
            expect(screen.queryByTestId("compositor-puente")).toBeNull();
        });
    });
});

describe("PestanaGenesis · guardado de la primera visita (GEN1113INT)", () => {
    beforeEach(() => {
        acceso.valor = { miembro: true, dueno: true };
        prefsGuardadas.lista = [];
        prefsGuardadas.leer = null;
        prefsGuardadas.falla = false;
    });
    afterEach(() => {
        cleanup();
        window.localStorage.clear();
        prefsGuardadas.falla = false;
    });

    it("la primera visita de un miembro escribe una vez la conexión a MetaGenesis con el ayudante de la biblioteca", async () => {
        await montar({ ancho: 1440 });
        await waitFor(() => expect(prefsGuardadas.lista).toHaveLength(1));
        expect((prefsGuardadas.lista[0] as PrefsChatsGenesis).conexiones.metagenesis).toEqual({ activo: true });
        expect(screen.queryByTestId("aviso-prefs")).toBeNull();
    });

    it("si la cuenta no guarda, se dice en la pestaña", async () => {
        prefsGuardadas.falla = true;
        await montar({ ancho: 1440 });
        expect(await screen.findByTestId("aviso-prefs")).toHaveTextContent("No se pudo guardar en tu cuenta la conexión a MetaGenesis");
    });
});
