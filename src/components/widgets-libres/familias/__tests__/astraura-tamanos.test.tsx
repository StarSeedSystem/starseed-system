/**
 * ASW15 · El proto `AstrauraLibreProto` por tamaño y por diseño (ola ASW1116A).
 *
 * Comprueba: cada clase (micro, s, m, panorámico, l, xl, torre) pinta su diseño base sin
 * repetir el nombre accesible de un botón; compacto no enseña hilo ni atajos aunque el ajuste
 * pida «acciones»; medio/grande siguen «Conversación si hay chat / Acciones si no»; en tableta
 * con voz la regla pide «Voz»; y el error del puente se anuncia y la forma pasa a semilla.
 *
 * La clase se fuerza con `ContextoMarco` (lo que lee `useClaseForzada`), como en
 * `inicio-familias.test.tsx`; el dispositivo y el puente de Aurora se inyectan por mock (sin
 * red ni `window.STARSEED_AURORA`).
 *
 * Alcance: el proto aún no cablea `DisenoMinimo`, `DisenoConversacion` ni `DisenoVoz` (la
 * tarea de cableado, ASW14, se retiró de la cola). Esas expectativas van como `it.fails` al
 * final: la suite queda verde y, el día que se cableen, empezarán a pasar (habrá que quitar
 * el `.fails`).
 */
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import type { ClaseDispositivo, ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { ContextoMarco, type BaseTamano, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { resolverDiseno } from "@/lib/widgets/astraura/disenos";
import type { EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";

type Turno = { role: "user" | "aurora"; text: string; ts: number };
type Instantanea = { supported: boolean; enabled: boolean; speaking: boolean; listening: boolean; actionStatus: string; error: boolean };

const PX: Record<ClaseTamano, [number, number]> = {
    micro: [90, 90], s: [160, 160], m: [260, 260],
    panoramico: [500, 200], l: [360, 360], xl: [600, 600], torre: [200, 500],
};

let medida = { width: 260, height: 260 };
let dispositivo: ClaseDispositivo = "escritorio";
let chat: Turno[] = [];
let estadoPuente: Instantanea = { supported: true, enabled: true, speaking: false, listening: false, actionStatus: "", error: false };

const puente = {
    getState: () => estadoPuente,
    subscribe: (cb: () => void) => { cb(); return () => {}; },
    start: vi.fn(),
    stop: vi.fn(),
};

vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({
    default: ({ href, children, ...resto }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }) => (
        <a href={String(href)} {...resto}>{children}</a>
    ),
}));
vi.mock("lucide-react", () => {
    const Icono = () => <svg aria-hidden="true" />;
    return {
        Mic: Icono, MicOff: Icono, MessageCircle: Icono, Send: Icono, Sparkles: Icono,
        Target: Icono, CalendarCheck: Icono, ClipboardList: Icono, Radar: Icono, CircleDashed: Icono,
    };
});
vi.mock("@/lib/widgets/forma/tamanos", () => ({
    dispositivoActual: () => dispositivo,
    claseDesdePx: () => "m",
}));
vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({
    useNivelRender: () => "normal",
    nivelRender: () => "normal",
    leerSenalesDispositivo: () => ({ nucleos: 8, memoriaGB: 16, movimientoReducido: false, ahorroDatos: false, bateriaBaja: false, enXR: false }),
    conModoDelSistema: (n: string) => n,
    presupuesto: () => ({ parallax: false, particulas: 0, inclinacionMax: 0, duracionEntradaMs: 0, halo: "suave" }),
}));
vi.mock("@/lib/aurora/aurora-chat-log", () => ({
    readAuroraChatEntries: () => chat,
    AURORA_CHATLOG_CHANGE_EVENT: "starseed:aurora-chat",
    AURORA_CHATLOG_KEY: "starseed.aurora.chat",
}));
vi.mock("@/lib/aurora/open-aurora", () => ({
    getAuroraBridge: () => puente,
    openAurora: () => Promise.resolve(true),
}));
vi.mock("@/components/protomolecula/protomolecula-ligera", async () => {
    const { formaDeEstado } = await vi.importActual<typeof import("@/lib/widgets/astraura/estado-forma")>(
        "@/lib/widgets/astraura/estado-forma",
    );
    return {
        ProtomoleculaLigera: ({ estado, tam }: { estado: EstadoAsistente; tam: number }) => (
            <svg data-testid="protomolecula-ligera" data-estado={estado} data-forma={formaDeEstado(estado)}
                width={tam} height={tam} aria-hidden="true" />
        ),
    };
});

global.window.matchMedia = global.window.matchMedia || function () {
    return {
        matches: false,
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {},
    };
};

const baseDe = (clase: ClaseTamano): BaseTamano => (clase === "panoramico" || clase === "torre" ? "m" : clase);

const marco = (clase: ClaseTamano): ContextoMarcoUnificado => ({
    acento: "#7c5cff",
    acento2: "#23d5ab",
    clase,
    base: baseDe(clase),
    horizontal: false,
    espaciado: { cabecera: "", cuerpo: "", pie: "", icono: "", iconoSvg: "", radio: 20 },
});

const widgetCon = (settings: Record<string, unknown>): DashboardWidget => ({ settings } as unknown as DashboardWidget);

const nombresDeBotones = (): string[] =>
    screen.getAllByRole("button").map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim());

function renderProto(clase: ClaseTamano, opciones: { widget?: DashboardWidget } = {}) {
    const [ancho, alto] = PX[clase];
    medida = { width: ancho, height: alto };
    return render(
        <ContextoMarco.Provider value={marco(clase)}>
            <AstrauraLibreProto widget={opciones.widget} />
        </ContextoMarco.Provider>,
    );
}

import { AstrauraLibreProto } from "../astraura-libre-proto";

beforeEach(() => {
    medida = { width: 260, height: 260 };
    dispositivo = "escritorio";
    chat = [];
    estadoPuente = { supported: true, enabled: true, speaking: false, listening: false, actionStatus: "", error: false };
    window.localStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const CON_CHAT: Turno[] = [
    { role: "user", text: "¿Qué tal?", ts: 1 },
    { role: "aurora", text: "Todo en calma en la malla.", ts: 2 },
];

describe("AstrauraLibreProto: las siete clases", () => {
    const CASOS: Array<{ clase: ClaseTamano; esperado: string }> = [
        { clase: "micro", esperado: "micro" },
        { clase: "s", esperado: "s" },
        { clase: "m", esperado: "m" },
        { clase: "panoramico", esperado: "panoramico" },
        { clase: "l", esperado: "l-hilo" },
        { clase: "xl", esperado: "xl-hilo" },
        { clase: "torre", esperado: "torre" },
    ];

    it.each(CASOS)("$clase pinta su diseño base sin repetir nombres accesibles", ({ clase, esperado }) => {
        chat = [...CON_CHAT];
        const { container } = renderProto(clase);
        expect(container.querySelector("[data-diseno]")?.getAttribute("data-diseno")).toBe(esperado);
        const nombres = nombresDeBotones();
        expect(nombres.length).toBeGreaterThan(0);
        expect(new Set(nombres).size).toBe(nombres.length);
    });

    it("en compacto (micro y s) manda Mínimo: sin hilo ni atajos aunque el ajuste pida acciones", () => {
        chat = [...CON_CHAT];
        const widget = widgetCon({ astrauraDiseno: "acciones" });
        for (const clase of ["micro", "s"] as const) {
            const { container, unmount } = renderProto(clase, { widget });
            expect(screen.getByTestId("protomolecula-ligera")).toBeTruthy();
            expect(screen.queryByRole("group", { name: "Atajos para empezar rápido" })).toBeNull();
            expect(container.querySelector('[aria-label="Última conversación"]')).toBeNull();
            expect(screen.queryByText("Resúmeme mi día")).toBeNull();
            unmount();
        }
        // El proto compacto no monta el selector; la nota de «degradado» vive en
        // SelectorDisenoAstraura (ya probada en selector-diseno-astraura.test.tsx). Aquí se
        // comprueba la regla que la enciende: compacto + acciones ⇒ Mínimo degradado.
        expect(resolverDiseno("acciones", {
            tamano: "compacto", tactil: false, hayVoz: true, hayConversacion: true,
        })).toEqual({ diseno: "minimo", degradado: true });
    });
});

describe("AstrauraLibreProto: medio, grande y tableta", () => {
    it("en medio con conversación enseña el último intercambio y no los atajos", () => {
        chat = [...CON_CHAT];
        renderProto("m");
        expect(screen.getByText("Todo en calma en la malla.")).toBeTruthy();
        expect(screen.queryByRole("group", { name: "Atajos para empezar rápido" })).toBeNull();
    });

    it("en medio sin conversación la regla pide Acciones", () => {
        expect(resolverDiseno("auto", {
            tamano: "medio", tactil: false, hayVoz: true, hayConversacion: false,
        })).toEqual({ diseno: "acciones", degradado: false });
    });

    it("en grande con conversación enseña el hilo", () => {
        chat = [...CON_CHAT];
        renderProto("l");
        expect(screen.getByRole("list", { name: "Última conversación" })).toBeTruthy();
        expect(screen.getByText("Tú: ¿Qué tal?")).toBeTruthy();
    });

    it("en grande sin conversación la regla pide Acciones", () => {
        expect(resolverDiseno("auto", {
            tamano: "grande", tactil: false, hayVoz: true, hayConversacion: false,
        })).toEqual({ diseno: "acciones", degradado: false });
    });

    it("en tableta, grande y con voz la regla pide Voz y el widget ofrece hablar", () => {
        dispositivo = "tablet";
        chat = [{ role: "aurora", text: "Todo en calma en la malla.", ts: 2 }];
        renderProto("l");
        expect(resolverDiseno("auto", {
            tamano: "grande", tactil: true, hayVoz: true, hayConversacion: true,
        })).toEqual({ diseno: "voz", degradado: false });
        expect(screen.getByRole("button", { name: "Hablar con Astraura por voz" })).toBeTruthy();
    });
});

describe("AstrauraLibreProto: elecciones y error", () => {
    it("la elección Acciones en grande se marca con data-diseno=acciones", () => {
        chat = [...CON_CHAT];
        const { container } = renderProto("l", { widget: widgetCon({ astrauraDiseno: "acciones" }) });
        expect(container.querySelector('[data-diseno="acciones"]')).not.toBeNull();
    });

    it("el error del puente se anuncia y la forma pasa a semilla", () => {
        estadoPuente = { supported: true, enabled: true, speaking: false, listening: false, actionStatus: "", error: true };
        chat = [...CON_CHAT];
        renderProto("l", { widget: widgetCon({ astrauraDiseno: "acciones" }) });
        expect(screen.getByRole("status").textContent).toContain("Algo falló");
        const forma = screen.getByTestId("protomolecula-ligera");
        expect(forma.getAttribute("data-forma")).toBe("semilla");
        expect(forma.getAttribute("data-estado")).toBe("error");
        const nombres = nombresDeBotones();
        expect(new Set(nombres).size).toBe(nombres.length);
    });
});

describe("AstrauraLibreProto: cableado pendiente (rojo esperado)", () => {
    it.fails("en medio sin conversación monta Acciones (falta cablear el diseño)", () => {
        chat = [];
        renderProto("m");
        screen.getByRole("group", { name: "Atajos para empezar rápido" });
    });

    it.fails("en grande sin conversación monta Acciones (falta cablear el diseño)", () => {
        chat = [];
        renderProto("l");
        screen.getByRole("group", { name: "Atajos para empezar rápido" });
    });

    it.fails("en tableta con voz pinta el diseño Voz (falta cablear DisenoVoz)", () => {
        dispositivo = "tablet";
        chat = [...CON_CHAT];
        const { container } = renderProto("l");
        expect(container.querySelector('[data-diseno="voz"]')).not.toBeNull();
    });

    it.fails("cada elección explícita en grande se marca con su data-diseno (faltan Mínimo, Conversación y Voz)", () => {
        for (const eleccion of ["minimo", "conversacion", "voz"] as const) {
            chat = [...CON_CHAT];
            const { container, unmount } = renderProto("l", { widget: widgetCon({ astrauraDiseno: eleccion }) });
            expect(container.querySelector(`[data-diseno="${eleccion}"]`)).not.toBeNull();
            unmount();
        }
    });
});
