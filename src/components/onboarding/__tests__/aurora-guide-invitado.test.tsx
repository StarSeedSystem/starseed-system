/**
 * GUI1021J · la guía de Aurora sin cuenta (invitado).
 *
 * Pruebas: sin sesión no hay "Hazlo por mí", el z es 240 desde login/bienvenida/aviso,
 * y temaInicial funciona.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
    push: vi.fn(),
    navegarSuave: vi.fn(),
    usuario: null as null | { id: string; email?: string; is_anonymous?: boolean },
    avisarAuth: null as null | ((sesion: { user: unknown } | null) => void),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: sim.push }),
    usePathname: () => "/otra-pagina",
}));
vi.mock("next/image", () => ({
    default: (p: { alt: string; src: string }) => <img alt={p.alt} src={p.src} />,
}));
vi.mock("@/context/perimeter-context", () => ({
    usePerimeter: () => ({ activeEdge: null, setActiveEdge: vi.fn() }),
}));
vi.mock("@/lib/consumo/usuario", () => ({ usuarioActual: async () => sim.usuario }));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: {
            onAuthStateChange: (cb: (evento: string, sesion: { user: unknown } | null) => void) => {
                sim.avisarAuth = (sesion) => cb("TEST", sesion);
                return { data: { subscription: { unsubscribe: () => { sim.avisarAuth = null; } } } };
            },
        },
    }),
}));
vi.mock("@/lib/onboarding/director-rito", async (original) => ({
    ...(await original<typeof import("@/lib/onboarding/director-rito")>()),
    navegarSuave: sim.navegarSuave,
}));
vi.mock("../demo-gestos-hibridos", () => ({ DemoGestosHibridos: () => <div data-testid="demo-gestos" /> }));
vi.mock("../aurora-guide-demos", () => ({
    StepDemo: ({ stepKey }: { stepKey: string }) => <div data-testid={`demo-${stepKey}`} />,
}));

import { AuroraGuide, OPEN_GUIDE_EVENT } from "../aurora-guide";
import { abrirGuia, EVENTO_ACCION_GUIA, Z_GUIA_SOBRE_ACCESO, VENTANAS_ACCESO } from "@/lib/onboarding/guia-acceso";
import {
    PASOS_GUIA,
    TOTAL_PASOS,
    etiquetaProgreso,
    indiceDePaso,
} from "@/lib/onboarding/guia-completa";
import { CLAVE_GUIA_VISTA_LOCAL } from "@/lib/onboarding/guia-vista";

function movimientoReducido() {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: (q: string) => ({
            matches: q.includes("reduced-motion"),
            media: q,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
        }),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    sim.usuario = null;
    sim.avisarAuth = null;
    window.localStorage.clear();
    window.localStorage.setItem(CLAVE_GUIA_VISTA_LOCAL, "1");
    window.localStorage.setItem("starseed.aurora.intro.v1", "1");
    delete document.body.dataset.ssGuia;
    movimientoReducido();
});
afterEach(() => cleanup());

async function abrir(peticion: { desde: Parameters<typeof abrirGuia>[0]["desde"]; temaInicial?: string } = { desde: "boton" }) {
    render(<AuroraGuide />);
    act(() => { abrirGuia(peticion); });
    fireEvent.click(await screen.findByRole("button", { name: /Solo la guía, sin voz/ }));
    await screen.findByTestId("guia-tarjeta");
}
const tituloDe = (id: string) => (PASOS_GUIA.find((p) => p.id === id) as (typeof PASOS_GUIA)[number]).titulo;
const esperarPaso = (id: string) => screen.findByRole("heading", { level: 2, name: tituloDe(id) }, { timeout: 5000 });
const siguiente = () => fireEvent.click(screen.getByRole("button", { name: /^Siguiente$/ }));

async function eventos<T>(nombre: string, accion: () => void | Promise<void>): Promise<T[]> {
    const recibidos: T[] = [];
    const oir = (e: Event) => recibidos.push((e as CustomEvent<T>).detail);
    window.addEventListener(nombre, oir);
    await accion();
    window.removeEventListener(nombre, oir);
    return recibidos;
}

describe("GUI1021J · guía de Aurora sin cuenta (invitado)", () => {
    it("sin sesión, no hay botón «Hazlo por mí» en ningún paso", async () => {
        await abrir({ desde: "ajustes" });
        for (let i = 0; i < TOTAL_PASOS - 1; i++) {
            const paso = PASOS_GUIA[i];
            await esperarPaso(paso.id);
            expect(screen.queryByRole("button", { name: /Hazlo por mí/ })).toBeNull();
            if (i < TOTAL_PASOS - 2) siguiente();
        }
    });

    it("sin sesión, acciones que requieren cuenta muestran «Disponible al entrar»", async () => {
        await abrir({ desde: "ajustes", temaInicial: "astraura" });
        await esperarPaso("astraura");
        expect(await screen.findByTestId("solo-con-cuenta")).toHaveTextContent("Disponible al entrar");
        expect(screen.queryByRole("button", { name: /Abrir Astraura/ })).toBeNull();
    });

    it("z-index es 240 (Z_GUIA_SOBRE_ACCESO) cuando se abre desde login", async () => {
        await abrir({ desde: "login" });
        await esperarPaso("bienvenida");
        const root = screen.getByRole("dialog", { name: "Guía de StarSeed" });
        expect(root).toHaveStyle({ zIndex: String(Z_GUIA_SOBRE_ACCESO) });
    });

    it("z-index es 240 cuando se abre desde bienvenida", async () => {
        await abrir({ desde: "bienvenida" });
        await esperarPaso("bienvenida");
        const root = screen.getByRole("dialog", { name: "Guía de StarSeed" });
        expect(root).toHaveStyle({ zIndex: String(Z_GUIA_SOBRE_ACCESO) });
    });

    it("z-index es 240 cuando se abre desde aviso", async () => {
        await abrir({ desde: "aviso" });
        await esperarPaso("bienvenida");
        const root = screen.getByRole("dialog", { name: "Guía de StarSeed" });
        expect(root).toHaveStyle({ zIndex: String(Z_GUIA_SOBRE_ACCESO) });
    });

    it("z-index es 95 (Z_GUIA_HOY) cuando se abre desde ajustes con cuenta", async () => {
        sim.usuario = { id: "u-1", email: "ana@star.seed" };
        await abrir({ desde: "ajustes" });
        await esperarPaso("bienvenida");
        const root = screen.getByRole("dialog", { name: "Guía de StarSeed" });
        expect(root).toHaveStyle({ zIndex: "95" });
    });

    it("temaInicial abre la guía en el paso indicado", async () => {
        await abrir({ desde: "ajustes", temaInicial: "malla" });
        await esperarPaso("malla");
        expect(screen.getByTestId("guia-tarjeta")).toHaveTextContent(etiquetaProgreso(indiceDePaso("malla")));
    });

    it("temaInicial funciona con id de paso que no existe (empieza en 0)", async () => {
        await abrir({ desde: "ajustes", temaInicial: "paso-inexistente" });
        await esperarPaso("bienvenida");
    });

    it("temaInicial funciona con número de posición", async () => {
        render(<AuroraGuide />);
        act(() => { window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT, { detail: { step: 5, desde: "ajustes" } })); });
        fireEvent.click(await screen.findByRole("button", { name: /Solo la guía, sin voz/ }));
        await esperarPaso(PASOS_GUIA[5].id);
    });

    it("los bordes Trinity y el escritorio no piden cuenta (tienen botón «Ir»)", async () => {
        await abrir({ desde: "ajustes", temaInicial: "escritorio" });
        await esperarPaso("escritorio");
        expect(screen.queryByTestId("solo-con-cuenta")).toBeNull();
        expect(screen.getByRole("button", { name: /Ir al Escritorio/ })).toBeInTheDocument();
    });

    it("el último paso sin cuenta ofrece Crear cuenta, Entrar y Explorar sin cuenta", async () => {
        await abrir({ desde: "ajustes", temaInicial: "cuenta" });
        await esperarPaso("cuenta");
        const panel = screen.getByTestId("guia-cuenta");
        expect(within(panel).getByRole("button", { name: "Crear cuenta" })).toBeInTheDocument();
        expect(within(panel).getByRole("button", { name: "Entrar" })).toBeInTheDocument();
        expect(within(panel).getByRole("button", { name: "Explorar sin cuenta" })).toBeInTheDocument();
    });

    it("«Saltar a crear cuenta» está en cada paso sin cuenta", async () => {
        await abrir({ desde: "bienvenida" });
        for (const id of ["bienvenida", "que-es", "orbe", "trinity-zenith"]) {
            await esperarPaso(id);
            expect(await screen.findByRole("button", { name: "Saltar a crear cuenta" })).toBeInTheDocument();
            siguiente();
        }
    });

    it("todos los orígenes de VENTANAS_ACCESO usan Z_GUIA_SOBRE_ACCESO", async () => {
        for (const origen of VENTANAS_ACCESO) {
            vi.clearAllMocks();
            window.localStorage.clear();
            window.localStorage.setItem(CLAVE_GUIA_VISTA_LOCAL, "1");
            window.localStorage.setItem("starseed.aurora.intro.v1", "1");
            await abrir({ desde: origen });
            await esperarPaso("bienvenida");
            const root = screen.getByRole("dialog", { name: "Guía de StarSeed" });
            expect(root).toHaveStyle({ zIndex: String(Z_GUIA_SOBRE_ACCESO) });
            cleanup();
        }
    });
});

function within(el: HTMLElement) {
    return {
        getByRole: (role: string, opts?: { name?: string | RegExp }) => {
            return el.querySelector(`[role="${role}"]`) as HTMLElement;
        },
        queryByRole: (role: string, opts?: { name?: string | RegExp }) => {
            return el.querySelector(`[role="${role}"]`) as HTMLElement | null;
        },
        getByTestId: (id: string) => {
            return el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
        },
    };
}