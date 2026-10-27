/**
 * GUI1021J · la guía sin cuenta y por encima de la ventana de acceso (`architecture/guias-introduccion.md` §5).
 *
 * Sin sesión: no hay «Hazlo por mí» a zonas con cuenta («Disponible al entrar»); si falta el puente
 * de Aurora, el modo voz pasa a texto y lo dice; abierta desde la ventana de acceso se pinta en z 240
 * (y su capa de siempre desde otros sitios); el último paso ofrece crear cuenta, entrar o explorar;
 * al cerrarse no navega a ninguna parte; y al iniciar sesión después, lo visto del aparato pasa a la
 * cuenta (`unirVistas`).
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
    usePathname: () => "/otra-pagina", // fuera del rito: nada de navegación de primera visita
}));
vi.mock("next/image", () => ({
    // eslint-disable-next-line @next/next/no-img-element
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
// La decisión de primera visita no interfiere: aquí la guía solo se abre a demanda.
vi.mock("@/lib/onboarding/director-rito", async (original) => ({
    ...(await original<typeof import("@/lib/onboarding/director-rito")>()),
    navegarSuave: sim.navegarSuave,
}));
vi.mock("@/lib/sync/realtime-sync", () => ({ cuandoCuentaFiable: () => () => {} }));

import { AuroraGuide, OPEN_GUIDE_EVENT, zGuia } from "../aurora-guide";
import { abrirGuia, type OrigenGuia } from "@/lib/onboarding/guia-acceso";
import { PASOS_GUIA } from "@/lib/onboarding/guia-completa";
import { AVISO_GUIA_BIENVENIDA, CLAVE_GUIA_VISTA_LOCAL } from "@/lib/onboarding/guia-vista";
import { _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";

/*─ helpers ──────────────────────────────────────────────────────────────────────────── */

const tituloDe = (id: string) => {
    const paso = PASOS_GUIA.find((p) => p.id === id);
    if (!paso) throw new Error(`no existe el paso ${id}`);
    return paso.titulo;
};
const esperarPaso = (id: string) =>
    screen.findByRole("heading", { level: 2, name: tituloDe(id) }, { timeout: 5000 });

/** Abre la guía por la puerta común y elige «solo la guía» (sin voz ni micrófono). */
async function abrir(peticion: { desde: OrigenGuia; temaInicial?: string } = { desde: "boton" }) {
    render(<AuroraGuide />);
    act(() => { abrirGuia(peticion); });
    fireEvent.click(await screen.findByRole("button", { name: /Solo la guía, sin voz/ }));
    await screen.findByTestId("guia-tarjeta");
}

beforeEach(() => {
    vi.clearAllMocks();
    sim.usuario = null;
    sim.avisarAuth = null;
    window.localStorage.clear();
    window.localStorage.setItem(CLAVE_GUIA_VISTA_LOCAL, "1"); // ya vista: solo a demanda
    window.localStorage.setItem("starseed.aurora.intro.v1", "1");
    _reiniciarCacheAvisosParaPruebas();
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
});

afterEach(() => {
    cleanup();
    delete (window as { STARSEED_AURORA?: unknown }).STARSEED_AURORA;
});

describe("GUI1021J · sin sesión usa su modo de guía", () => {
    it("no hay «Hazlo por mí» a una zona con cuenta: queda «Disponible al entrar»", async () => {
        await abrir({ desde: "ajustes", temaInicial: "astraura" });
        await esperarPaso("astraura");
        expect(screen.queryByRole("button", { name: /Llévame a Astraura/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /Abrir Astraura/ })).toBeNull();
        expect(await screen.findByTestId("solo-con-cuenta")).toHaveTextContent("Disponible al entrar");
    });

    it("lo que no pide cuenta se queda («Hazlo por mí» al escritorio)", async () => {
        await abrir({ desde: "ajustes", temaInicial: "escritorio" });
        await esperarPaso("escritorio");
        expect(await screen.findByRole("button", { name: /Llévame al Escritorio/ })).toBeInTheDocument();
        expect(screen.queryByTestId("solo-con-cuenta")).toBeNull();
    });

    it("el último paso, sin cuenta: crear cuenta, entrar o explorar", async () => {
        await abrir({ desde: "ajustes", temaInicial: "cuenta" });
        await esperarPaso("cuenta");
        const panel = screen.getByTestId("guia-cuenta");
        expect(panel.querySelector('[data-testid="solo-con-cuenta"]')).toBeNull();
        ["Crear cuenta", "Entrar", "Explorar sin cuenta"].forEach((n) =>
            expect(screen.getByRole("button", { name: n })).toBeInTheDocument());
    });
});

describe("GUI1021J · la capa del panel", () => {
    it("zGuia es una función pura: 240 sobre el acceso, 95 en el resto", () => {
        expect(zGuia("login")).toBe(240);
        expect(zGuia("bienvenida")).toBe(240);
        expect(zGuia("ajustes")).toBe(95);
        expect(zGuia(undefined)).toBe(95);
    });

    it("abierta desde la ventana de acceso se pinta en z 240; desde otros sitios, en su capa", async () => {
        await abrir({ desde: "login", temaInicial: "cuenta" });
        expect(screen.getByRole("dialog", { name: "Guía de StarSeed" }).style.zIndex).toBe("240");
        cleanup();
        await abrir({ desde: "ajustes", temaInicial: "cuenta" });
        expect(screen.getByRole("dialog", { name: "Guía de StarSeed" }).style.zIndex).toBe("95");
    });
});

describe("GUI1021J · el evento abre por el tema pedido", () => {
    it("con «temaInicial» empieza por ese tema (malla)", async () => {
        await abrir({ desde: "ajustes", temaInicial: "malla" });
        await esperarPaso("malla");
    });

    it("el detalle crudo del evento manda: desde y temaInicial a la vez", async () => {
        render(<AuroraGuide />);
        act(() => {
            window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT, { detail: { desde: "login", temaInicial: "genesis" } }));
        });
        fireEvent.click(await screen.findByRole("button", { name: /Solo la guía, sin voz/ }));
        await esperarPaso("genesis");
        // Y, al venir de la ventana de acceso, la capa es la suya:
        expect(screen.getByRole("dialog", { name: "Guía de StarSeed" }).style.zIndex).toBe("240");
    });
});

describe("GUI1021J · el modo voz sin el puente de Aurora", () => {
    it("pasando a texto: lo dice y no queda escuchando", async () => {
        delete (window as { STARSEED_AURORA?: unknown }).STARSEED_AURORA;
        render(<AuroraGuide />);
        act(() => { abrirGuia({ desde: "boton" }); });
        fireEvent.click(await screen.findByRole("button", { name: /Con la voz de Aurora/ }));
        await screen.findByTestId("guia-tarjeta");
        expect(await screen.findByTestId("guia-aviso-voz")).toHaveTextContent(
            "El puente de Aurora no está disponible ahora mismo: la guía sigue en texto.",
        );
        expect(screen.queryByText("Escuchando")).toBeNull();
    }, 20_000);

    it("con el puente, el modo voz se queda como siempre", async () => {
        (window as unknown as { STARSEED_AURORA: unknown }).STARSEED_AURORA = {
            getState: () => ({ enabled: true, listening: true, transcript: "", interim: "" }),
        };
        render(<AuroraGuide />);
        act(() => { abrirGuia({ desde: "boton" }); });
        fireEvent.click(await screen.findByRole("button", { name: /Con la voz de Aurora/ }));
        await screen.findByTestId("guia-tarjeta");
        expect(await screen.findByText("Escuchando")).toBeInTheDocument();
        expect(screen.queryByTestId("guia-aviso-voz")).toBeNull();
    }, 20_000);
});

describe("GUI1021J · cerrar no navega y al entrar se une lo visto", () => {
    it("al cerrarse no navega a ninguna parte (vuelve a lo que había detrás)", async () => {
        await abrir({ desde: "boton" });
        await esperarPaso("bienvenida");
        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => expect(screen.queryByTestId("guia-tarjeta")).toBeNull());
        expect(sim.push).not.toHaveBeenCalled();
        expect(sim.navegarSuave).not.toHaveBeenCalled();
    });

    it("al iniciar sesión después, lo visto del aparato pasa a la cuenta (unirVistas)", async () => {
        await abrir({ desde: "boton" });
        await waitFor(() => expect(sim.avisarAuth).not.toBeNull());
        expect(estadoAviso(AVISO_GUIA_BIENVENIDA).estado).toBeNull();
        act(() => { sim.avisarAuth?.({ user: { id: "u-1", email: "ana@star.seed" } }); });
        await waitFor(() => expect(estadoAviso(AVISO_GUIA_BIENVENIDA).estado).toBe("hecho"));
    });
});
