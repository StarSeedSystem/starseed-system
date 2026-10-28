/**
 * GUI1021J · la guía de Aurora sin cuenta (invitado).
 *
 * Pruebas: sin sesión no hay «Hazlo por mí» ni «Ir» guardado (etiqueta «Disponible al entrar»),
 * el z es Z_GUIA_SOBRE_ACCESO en invitado sea cual sea el origen (nunca queda tapada), con cuenta
 * vuelve a Z_GUIA_HOY, `temaInicial` funciona, sin puente el modo voz pasa a texto diciéndolo (y con
 * puente se queda en voz), y al cerrarse no navega a ninguna parte.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Forma mínima del puente que exige `auroraBridge()` (objetos con esta pinta: presentes). */
type PuenteAurora = Record<string, unknown>;

const sim = vi.hoisted(() => ({
    push: vi.fn(),
    navegarSuave: vi.fn(),
    usuario: null as null | { id: string; email?: string; is_anonymous?: boolean },
    avisarAuth: null as null | ((sesion: { user: unknown } | null) => void),
    /** El puente que `auroraBridge()` devuelve en cada prueba (null: sin puente de Aurora). */
    puente: null as null | PuenteAurora,
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
// La voz está INYECTADA: el puente que vea la guía sale de `sim.puente` (null = sin Aurora en
// el aparato) y hablar/escuchar son dobles registrables, para no tocar audio ni motores reales.
vi.mock("../aurora-guide-voice", async (original) => ({
    ...(await original<typeof import("../aurora-guide-voice")>()),
    auroraBridge: () => sim.puente,
    auroraSpeak: () => undefined,
    auroraEnsureListening: () => undefined,
}));

import { AuroraGuide, OPEN_GUIDE_EVENT } from "../aurora-guide";
import { abrirGuia, Z_GUIA_SOBRE_ACCESO, VENTANAS_ACCESO } from "@/lib/onboarding/guia-acceso";
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
    }, 60_000);

    it("sin sesión, acciones que requieren cuenta muestran «Disponible al entrar»", async () => {
        await abrir({ desde: "ajustes", temaInicial: "astraura" });
        await esperarPaso("astraura");
        expect(await screen.findByTestId("solo-con-cuenta")).toHaveTextContent("Disponible al entrar");
        expect(screen.queryByRole("button", { name: /Abrir Astraura/ })).toBeNull();
    });

    it("sin sesión, el «Hazlo por mí» del orbe (que no pide cuenta) también queda oculto", async () => {
        await abrir({ desde: "ajustes", temaInicial: "orbe" });
        await esperarPaso("orbe");
        expect(screen.queryByRole("button", { name: "Abrir el chat de Aurora" })).toBeNull();
        expect(await screen.findByTestId("solo-con-cuenta")).toHaveTextContent("Disponible al entrar");
    });

    it("sin puente de Aurora, el modo voz pasa a texto y lo dice", async () => {
        render(<AuroraGuide />);
        act(() => { abrirGuia({ desde: "ajustes" }); });
        // En el test no hay puente (sim.puente a null): pidiendo voz cae a texto avisando.
        fireEvent.click(await screen.findByRole("button", { name: /Con la voz de Aurora/ }));
        expect(await screen.findByTestId("guia-tarjeta")).toBeInTheDocument();
        expect(await screen.findByTestId("guia-voz-a-texto")).toHaveTextContent("la guía continúa en texto");
        await esperarPaso("bienvenida");
    });

    it("con puente de Aurora, el modo voz se queda en voz y no avisa", async () => {
        sim.puente = {};
        render(<AuroraGuide />);
        act(() => { abrirGuia({ desde: "ajustes" }); });
        // El puente está: eligiendo voz NO cae a texto (sin aviso) y queda escuchando.
        fireEvent.click(await screen.findByRole("button", { name: /Con la voz de Aurora/ }));
        await esperarPaso("bienvenida");
        expect(screen.queryByTestId("guia-voz-a-texto")).toBeNull();
        expect(await screen.findByText("Escuchando")).toBeInTheDocument();
    });

    it("al cerrarse la guía no navega a ninguna parte", async () => {
        await abrir({ desde: "login" });
        await esperarPaso("bienvenida");
        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "Guía de StarSeed" })).toBeNull();
        });
        expect(sim.push).not.toHaveBeenCalled();
        expect(sim.navegarSuave).not.toHaveBeenCalled();
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

    it("con cuenta, desde el botón flotante también va a Z_GUIA_HOY (95)", async () => {
        sim.usuario = { id: "u-1", email: "ana@star.seed" };
        await abrir({ desde: "boton" });
        await esperarPaso("bienvenida");
        const root = screen.getByRole("dialog", { name: "Guía de StarSeed" });
        expect(root).toHaveStyle({ zIndex: "95" });
    });

    it("sin sesión queda en Z_GUIA_SOBRE_ACCESO (240) incluso desde ajustes o el botón (nunca tapada)", async () => {
        for (const origen of ["ajustes", "boton"] as const) {
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