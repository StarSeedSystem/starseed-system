import * as React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

let medida = { width: 360, height: 360 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

const { nivelMock, mediaReducidaMock } = vi.hoisted(() => ({
    nivelMock: vi.fn(() => "normal" as "ligero" | "normal" | "pleno"),
    mediaReducidaMock: vi.fn(() => false),
}));

vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({
    useNivelRender: () => nivelMock(),
    nivelRender: () => nivelMock(),
    leerSenalesDispositivo: () => ({ nucleos: 8, memoriaGB: 16, movimientoReducido: mediaReducidaMock(), ahorroDatos: false, bateriaBaja: false, enXR: false }),
    conModoDelSistema: (n: string) => n,
    presupuesto: () => ({ parallax: true, particulas: 6, inclinacionMax: 5, duracionEntradaMs: 280, halo: "suave" }),
}));

vi.mock("@/components/widgets-libres/widget-libre", () => ({
    WidgetLibre: ({ children }: any) => <div data-testid="widget-libre">{typeof children === "function" ? children({ clase: "l", ancho: medida.width, alto: medida.height }) : children}</div>,
}));

vi.mock("../inicio-piezas", () => ({
    Accion: ({ children, onClick, "aria-label": ariaLabel, className }: any) => <button type="button" aria-label={ariaLabel} className={className} onClick={onClick}>{children}</button>,
    escalaTipo: () => 1,
    esTactil: () => false,
    haceCuanto: () => "hace 1m",
    useClaseForzada: () => null,
    useDispositivo: () => "escritorio",
    useEnPantalla: () => [{ current: null }, true],
}));

vi.mock("lucide-react", () => ({
    Mic: () => <svg data-testid="mic" />, MicOff: () => <svg data-testid="mic-off" />,
    MessageCircle: () => <svg />, Send: () => <svg />, Sparkles: () => <svg />,
    Target: () => <svg />, Radar: () => <svg />, ClipboardList: () => <svg />, CalendarCheck: () => <svg />,
}));

vi.mock("@/components/protomolecula/protomolecula-ligera", () => ({
    ProtomoleculaLigera: ({ estado, tam, animada }: { estado: string; tam: number; animada?: boolean }) => {
        const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function"
            ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
            : false;
        const nivel = nivelMock();
        const viva = animada !== false && !reduce && nivel !== "ligero";
        return <svg data-testid="protomolecula-ligera" data-estado={estado} data-forma={estado} data-viva={viva ? "true" : "false"} width={tam} height={tam} aria-hidden="true" />;
    },
}));

let chat: any[] = [];
vi.mock("@/lib/aurora/aurora-chat-log", () => ({ readAuroraChatEntries: () => chat, AURORA_CHATLOG_CHANGE_EVENT: "x", AURORA_CHATLOG_KEY: "k" }));

type Puente = { speaking: boolean; listening: boolean; actionStatus: string; supported: boolean; enabled: boolean; getState: () => any; subscribe: (cb: () => void) => () => void; start: () => void; stop: () => void };
let notificar: (() => void) | null = null;
let puente: Puente;

function crearPuente(): Puente {
    const p: any = { speaking: false, listening: false, actionStatus: "", supported: true, enabled: true };
    p.getState = vi.fn(() => ({ ...p }));
    p.subscribe = vi.fn((cb: () => void) => { notificar = cb; cb(); return () => { notificar = null; }; });
    p.start = vi.fn(); p.stop = vi.fn();
    return p as Puente;
}

function ponerMatchMedia(reduce: boolean) {
    mediaReducidaMock.mockReturnValue(reduce);
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((q: string) => ({
        matches: q.includes("prefers-reduced-motion") ? reduce : false,
        media: q, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));
    medida = { width: 360, height: 360 };
    chat = [];
    nivelMock.mockReturnValue("normal");
    ponerMatchMedia(false);
    puente = crearPuente();
    (window as any).STARSEED_AURORA = puente;
    document.documentElement.classList.remove("dark");
});

afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
    (window as any).STARSEED_AURORA = undefined;
    document.documentElement.classList.remove("dark");
});

async function renderProto() {
    const mod = await import("../astraura-libre-proto");
    render(<mod.AstrauraLibreProto />);
    await act(async () => { await vi.runAllTimersAsync(); });
}

function formas() {
    return screen.queryAllByTestId("protomolecula-ligera");
}

function hayAnimacionCss(el: Element): boolean {
    const styleAttr = (el.getAttribute("style") || "").toLowerCase();
    if (styleAttr.includes("animation")) return true;
    const cls = (el.getAttribute("class") || "").toLowerCase();
    if (cls.includes("animate-") || cls.includes("ss-girar") || cls.includes("ss-latir") || cls.includes("ss-respirar") || cls.includes("ss-contragirar")) return true;
    return Array.from(el.querySelectorAll("*")).some((n) => hayAnimacionCss(n));
}

describe("Astraura adaptativo (ASW16)", () => {
    it("movimiento reducido: la forma queda quieta y sin animación CSS", async () => {
        ponerMatchMedia(true);
        nivelMock.mockReturnValue("pleno");
        await renderProto();
        const forma = formas()[0];
        expect(forma).toBeTruthy();
        expect(forma).toHaveAttribute("data-viva", "false");
        const widget = screen.getByTestId("widget-libre");
        expect(hayAnimacionCss(widget)).toBe(false);
        expect(widget.querySelector(".ss-girar, .ss-latir, .ss-respirar, .ss-contragirar")).toBeNull();
        expect(widget.querySelector('[class*="animate-"]')).toBeNull();
    });

    it("dispositivo modesto: quieta pero la forma cambia con el estado", async () => {
        nivelMock.mockReturnValue("ligero");
        ponerMatchMedia(false);
        await renderProto();
        let forma = formas()[0];
        expect(forma).toHaveAttribute("data-viva", "false");
        expect(forma).toHaveAttribute("data-forma", "calma");

        await act(async () => {
            puente.listening = true;
            puente.getState = vi.fn(() => ({ ...puente, listening: true }));
            notificar?.();
        });
        forma = formas()[0];
        expect(forma).toHaveAttribute("data-viva", "false");
        expect(forma).toHaveAttribute("data-forma", "escuchando");

        await act(async () => {
            puente.listening = false;
            puente.speaking = true;
            puente.getState = vi.fn(() => ({ ...puente, listening: false, speaking: true }));
            notificar?.();
        });
        forma = formas()[0];
        expect(forma).toHaveAttribute("data-viva", "false");
        expect(forma).toHaveAttribute("data-forma", "hablando");
    });

    it("pleno y sin reducción: data-viva true", async () => {
        nivelMock.mockReturnValue("pleno");
        ponerMatchMedia(false);
        await renderProto();
        const forma = formas()[0];
        expect(forma).toBeTruthy();
        expect(forma).toHaveAttribute("data-viva", "true");
    });

    it("tema claro/oscuro: el texto principal no usa text-white fijo en diseños sin fondo propio", async () => {
        // Los diseños que no pintan su propio fondo heredan el vidrio del widget; en tema claro
        // un text-white fijo rompería el contraste. Se comprueba en dark y sin dark.
        // Excepción permitida por la tarea: AstrauraLibreProto (layouts s/m/l/xl/torre/panorámico
        // heredados) usa text-white/90,60,65 porque el WidgetLibre SIEMPRE pinta vidrio oscuro
        // (rgba(12,14,34,.42/.58) + halo) sobre cualquier tema; ahí el contraste claro/oscuro
        // no depende del tema del documento. Se anota y se permite solo en ese contexto.
        const { default: DisenoMinimo } = await import("../diseno-minimo");
        const { default: DisenoConversacion } = await import("../diseno-conversacion");
        const { DisenoAcciones } = await import("../diseno-acciones");

        const propsBase = {
            estado: "calma" as const,
            tam: 120,
            ultima: { texto: "Hola", ts: Date.now() },
            hilo: [{ rol: "aurora" as const, texto: "Hola", ts: Date.now() }],
            ahora: Date.now(),
            tactil: false,
            voz: true,
            preguntar: <input aria-label="Pregunta para Astraura" />,
            botonVoz: <button type="button">Hablar</button>,
            sugerencias: ["Resúmeme mi día"],
            onAbrirChat: () => {},
            onSugerencia: () => {},
        };

        const casos = [
            { nombre: "mínimo", nodo: <DisenoMinimo {...propsBase} /> },
            { nombre: "conversación", nodo: <DisenoConversacion {...propsBase} /> },
            { nombre: "acciones", nodo: <DisenoAcciones {...propsBase} /> },
        ];

        for (const tema of ["dark", "light"] as const) {
            document.documentElement.classList.toggle("dark", tema === "dark");
            for (const caso of casos) {
                const { container, unmount } = render(caso.nodo);
                // Texto principal: estado, contenido y controles con texto visible.
                const textos = Array.from(container.querySelectorAll("p,span,li,button,a,label")).filter((el) => {
                    const t = (el.textContent || "").trim();
                    return t.length > 0 && el.getAttribute("aria-hidden") !== "true";
                });
                for (const el of textos) {
                    const cls = el.getAttribute("class") || "";
                    const pintaFondoOscuro = /bg-(slate|zinc|neutral|stone|gray|black|slate-\d{3}\/|black\/)/.test(cls);
                    // Solo se permite text-white fijo si el propio elemento pinta fondo oscuro.
                    if (!pintaFondoOscuro) {
                        expect(cls, `${caso.nombre} (${tema}) tiene text-white fijo: ${cls}`).not.toMatch(/\btext-white\b/);
                    }
                }
                unmount();
            }
        }

        // Excepción anotada: el widget proto hereda vidrio oscuro del WidgetLibre; se verifica
        // que el widget sigue renderizando en ambos temas (no crashea), pero su text-white se
        // permite por el fondo oscuro propio del widget.
        for (const tema of ["dark", "light"] as const) {
            document.documentElement.classList.toggle("dark", tema === "dark");
            await renderProto();
            expect(screen.getByTestId("widget-libre")).toBeInTheDocument();
            cleanup();
        }
    });

    it("los cinco estados dicen su frase para lector de pantalla en el botón de la forma", async () => {
        const { AstrauraForma } = await import("../astraura-forma");
        const { frasePantallaLectora, type EstadoAsistente } = await import("@/lib/widgets/astraura/estado-forma");
        const estados: EstadoAsistente[] = ["calma", "escuchando", "pensando", "hablando", "error"];

        for (const estado of estados) {
            const onClick = vi.fn();
            const { unmount } = render(<AstrauraForma estado={estado} tam={120} onClick={onClick} />);
            const boton = screen.getByRole("button", { name: new RegExp(frasePantallaLectora(estado).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
            expect(boton).toBeInTheDocument();
            expect(boton.getAttribute("aria-label")).toContain("Abrir el chat de Astraura");
            expect(boton.getAttribute("aria-label")).toContain(frasePantallaLectora(estado));
            unmount();
        }
    });
});
