/**
 * GUIA1025U · el recorrido de Aurora recorre la MISMA guía completa que la ventana de acceso.
 *
 * Mismos 24 pasos, el mismo «Paso N de M», la misma barra de capítulos y el mismo índice; encima, lo propio de
 * Aurora (voz, «Ir», «Hazlo por mí»), que sin cuenta se sustituye por «Disponible al entrar», y un final que
 * depende de si hay sesión: sin ella, crear cuenta, entrar o explorar; con ella, su espacio.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("@/lib/onboarding/director-rito", async (original) => ({
    ...(await original<typeof import("@/lib/onboarding/director-rito")>()),
    navegarSuave: sim.navegarSuave,
}));
vi.mock("../demo-gestos-hibridos", () => ({ DemoGestosHibridos: () => <div data-testid="demo-gestos" /> }));
vi.mock("../aurora-guide-demos", () => ({
    StepDemo: ({ stepKey }: { stepKey: string }) => <div data-testid={`demo-${stepKey}`} />,
}));

import { AuroraGuide, OPEN_GUIDE_EVENT } from "../aurora-guide";
import { abrirGuia, EVENTO_ACCION_GUIA } from "@/lib/onboarding/guia-acceso";
import {
    CAPITULOS_GUIA,
    PASOS_GUIA,
    TOTAL_PASOS,
    ULTIMO_PASO,
    etiquetaProgreso,
    indiceDePaso,
    primerPasoDelCapitulo,
} from "@/lib/onboarding/guia-completa";
import { guardarProgresoGuia, leerProgresoGuia } from "@/lib/onboarding/guia-progreso";
import { EVENTO_ABRIR_PRIMER_ARRANQUE } from "@/lib/onboarding/primer-arranque";
import { CLAVE_GUIA_VISTA_LOCAL } from "@/lib/onboarding/guia-vista";

const CUENTA = { id: "u-1", email: "ana@star.seed" };

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
    // Ya vista: no se abre sola, solo a demanda.
    window.localStorage.setItem(CLAVE_GUIA_VISTA_LOCAL, "1");
    window.localStorage.setItem("starseed.aurora.intro.v1", "1");
    delete document.body.dataset.ssGuia;
    movimientoReducido();
});
afterEach(() => cleanup());

/** Abre la guía por la puerta común y elige «solo la guía» (sin voz ni micrófono). */
async function abrir(peticion: { desde: Parameters<typeof abrirGuia>[0]["desde"]; temaInicial?: string } = { desde: "boton" }) {
    render(<AuroraGuide />);
    act(() => { abrirGuia(peticion); });
    fireEvent.click(await screen.findByRole("button", { name: /Solo la guía, sin voz/ }));
    await screen.findByTestId("guia-tarjeta");
}
const tituloDe = (id: string) => (PASOS_GUIA.find((p) => p.id === id) as (typeof PASOS_GUIA)[number]).titulo;
const esperarPaso = (id: string) => screen.findByRole("heading", { level: 2, name: tituloDe(id) }, { timeout: 5000 });
const siguiente = () => fireEvent.click(screen.getByRole("button", { name: /^Siguiente$/ }));

/** Lo que salga por el evento indicado mientras corre `accion`. */
async function eventos<T>(nombre: string, accion: () => void | Promise<void>): Promise<T[]> {
    const recibidos: T[] = [];
    const oir = (e: Event) => recibidos.push((e as CustomEvent<T>).detail);
    window.addEventListener(nombre, oir);
    await accion();
    window.removeEventListener(nombre, oir);
    return recibidos;
}

describe("la guía de Aurora recorre el catálogo único", () => {
    it("los 24 pasos, en orden, con «Paso N de 24» y su demostración", async () => {
        await abrir({ desde: "boton" });
        for (let i = 0; i < TOTAL_PASOS; i++) {
            const paso = PASOS_GUIA[i];
            await esperarPaso(paso.id);
            const tarjeta = screen.getByTestId("guia-tarjeta");
            expect(tarjeta.textContent).toContain(etiquetaProgreso(i));
            if (paso.demo) await waitFor(() => expect(tarjeta.querySelector(`[data-demo="${paso.demo}"]`)).not.toBeNull());
            if (i < ULTIMO_PASO) siguiente();
        }
        expect(screen.getByRole("button", { name: "Entendido" })).toBeInTheDocument();
    }, 90_000);

    it("la barra de capítulos y el índice llevan a donde dicen", async () => {
        await abrir({ desde: "boton" });
        const barra = screen.getByRole("group", { name: "Capítulos de la guía" });
        expect(within(barra).getAllByRole("button")).toHaveLength(9);
        const red = CAPITULOS_GUIA[3];
        fireEvent.click(within(barra).getByRole("button", { name: `Ir al capítulo 4 de 9: ${red.titulo}` }));
        await esperarPaso(PASOS_GUIA[primerPasoDelCapitulo(red.id)].id);

        fireEvent.click(screen.getByTestId("indice-guia-boton"));
        const indice = screen.getByRole("navigation", { name: "Índice de capítulos" });
        expect(within(indice).getAllByRole("button", { name: /^Capítulo \d: / })).toHaveLength(9);
        fireEvent.click(within(indice).getByRole("button", { name: /^Capítulo 7: Personalización segura/ }));
        await esperarPaso("personalizacion-segura");
    });

    it("el recorrido rápido no deja un paso viejo en pantalla", async () => {
        await abrir({ desde: "boton" });
        await esperarPaso("bienvenida");
        for (let i = 0; i < 6; i++) siguiente();
        await esperarPaso(PASOS_GUIA[6].id);
        fireEvent.click(screen.getByRole("button", { name: /^Ir al capítulo 9 de 9/ }));
        await esperarPaso("cuenta");
        await waitFor(() => expect(screen.getByTestId("guia-cuenta")).toBeInTheDocument());
        await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
        expect(screen.getByTestId("guia-tarjeta").querySelectorAll("[data-demo]")).toHaveLength(0);
    }, 30_000);

    it("«Atrás» y «Siguiente» respetan los extremos y el teclado también pasa de paso", async () => {
        await abrir({ desde: "boton" });
        await esperarPaso("bienvenida");
        expect(screen.getByRole("button", { name: /Anterior/ })).toBeDisabled();
        fireEvent.keyDown(window, { key: "ArrowRight" });
        await esperarPaso("que-es");
        fireEvent.keyDown(window, { key: "ArrowLeft" });
        await esperarPaso("bienvenida");
    });

    it("Escape cierra la guía; con el foco en el índice, cierra solo el índice", async () => {
        await abrir({ desde: "boton" });
        await esperarPaso("bienvenida");
        fireEvent.click(screen.getByTestId("indice-guia-boton"));
        const capitulo = within(screen.getByRole("navigation", { name: "Índice de capítulos" })).getByRole("button", { name: /^Capítulo 2: / });
        capitulo.focus();
        fireEvent.keyDown(capitulo, { key: "Escape" });
        await waitFor(() => expect(screen.queryByTestId("indice-guia")).toBeNull());
        expect(screen.getByTestId("guia-tarjeta")).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => expect(screen.queryByTestId("guia-tarjeta")).toBeNull());
    });

    it("todo lo que se pulsa mide al menos 44 px", async () => {
        await abrir({ desde: "boton" });
        await esperarPaso("bienvenida");
        const tarjeta = screen.getByTestId("guia-tarjeta");
        const grandes = (b: HTMLElement) => /min-h-\[44px\]|\bh-11\b/.test(b.className) || /\bh-11 w-11\b/.test(b.className);
        const pequenos = within(tarjeta)
            .getAllByRole("button")
            .filter((b) => !b.hasAttribute("data-boton-cerrar"))
            .filter((b) => !grandes(b));
        expect(pequenos.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([]);
    });

    it("la tarjeta se desplaza por dentro y cabe en cualquier pantalla (sin desbordar a 360 px)", async () => {
        await abrir({ desde: "boton" });
        const tarjeta = screen.getByTestId("guia-tarjeta");
        expect(tarjeta.className).toContain("max-h-[calc(100dvh-1.5rem)]");
        expect(tarjeta.className).toContain("flex-col");
        expect(tarjeta.querySelector(".overflow-y-auto")).not.toBeNull();
    });
});

describe("sin cuenta y con cuenta", () => {
    it("sin cuenta, lo que lleva a una zona con cuenta se cambia por «Disponible al entrar»", async () => {
        await abrir({ desde: "ajustes", temaInicial: "astraura" });
        await esperarPaso("astraura");
        expect(await screen.findByTestId("solo-con-cuenta")).toHaveTextContent("Disponible al entrar");
        expect(screen.queryByRole("button", { name: /Abrir Astraura/ })).toBeNull();
    });

    it("con cuenta, «Abrir Astraura» está y «Disponible al entrar» no", async () => {
        sim.usuario = CUENTA;
        await abrir({ desde: "ajustes", temaInicial: "astraura" });
        await esperarPaso("astraura");
        expect(await screen.findByRole("button", { name: /Abrir Astraura/ })).toBeInTheDocument();
        expect(screen.queryByTestId("solo-con-cuenta")).toBeNull();
    });

    it("abrir los escritorios y los bordes Trinity no pide cuenta", async () => {
        await abrir({ desde: "ajustes", temaInicial: "escritorio" });
        await esperarPaso("escritorio");
        await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
        expect(screen.queryByTestId("solo-con-cuenta")).toBeNull();
        expect(screen.getByRole("button", { name: /Ir al Escritorio/ })).toBeInTheDocument();
    });

    it("el último paso, sin cuenta: crear cuenta, entrar o explorar; «Saltar a crear cuenta» ya no hace falta", async () => {
        await abrir({ desde: "ajustes", temaInicial: "cuenta" });
        await esperarPaso("cuenta");
        const panel = screen.getByTestId("guia-cuenta");
        expect(within(panel).getByRole("list", { name: "Por qué crear una cuenta StarSeed" })).toBeInTheDocument();
        expect(within(panel).getByRole("button", { name: "Crear cuenta" })).toBeInTheDocument();
        expect(within(panel).getByRole("button", { name: "Entrar" })).toBeInTheDocument();
        expect(within(panel).getByRole("button", { name: "Explorar sin cuenta" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Saltar a crear cuenta" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Ir a mi espacio" })).toBeNull();
    });

    it("desde Ajustes o un aviso, «Crear cuenta» abre la ventana de acceso en esa pestaña", async () => {
        await abrir({ desde: "ajustes", temaInicial: "cuenta" });
        await esperarPaso("cuenta");
        const abiertas = await eventos<{ paso?: string; pestana?: string }>(EVENTO_ABRIR_PRIMER_ARRANQUE, () => {
            fireEvent.click(within(screen.getByTestId("guia-cuenta")).getByRole("button", { name: "Crear cuenta" }));
        });
        expect(abiertas).toEqual([{ paso: "acceso", pestana: "signup" }]);
        await waitFor(() => expect(screen.queryByTestId("guia-tarjeta")).toBeNull());
    });

    it("desde /login o /bienvenida le pide a esa página la pestaña (el formulario ya está detrás)", async () => {
        await abrir({ desde: "login", temaInicial: "cuenta" });
        await esperarPaso("cuenta");
        const pedidas = await eventos<{ accion: string }>(EVENTO_ACCION_GUIA, () => {
            fireEvent.click(within(screen.getByTestId("guia-cuenta")).getByRole("button", { name: "Entrar" }));
        });
        expect(pedidas).toEqual([{ accion: "entrar" }]);
    });

    it("«Explorar sin cuenta» deja la marca y lleva a los escritorios", async () => {
        await abrir({ desde: "ajustes", temaInicial: "cuenta" });
        await esperarPaso("cuenta");
        fireEvent.click(within(screen.getByTestId("guia-cuenta")).getByRole("button", { name: "Explorar sin cuenta" }));
        expect(window.localStorage.getItem("starseed.primer-arranque.saltado.v1")).toBe("1");
        expect(sim.navegarSuave).toHaveBeenCalledWith(expect.anything(), "/escritorios");
    });

    it("«Saltar a crear cuenta» está en cada paso sin cuenta y sale por la misma puerta", async () => {
        await abrir({ desde: "bienvenida" });
        for (const id of ["bienvenida", "que-es", "orbe"]) {
            await esperarPaso(id);
            expect(await screen.findByRole("button", { name: "Saltar a crear cuenta" })).toBeInTheDocument();
            siguiente();
        }
        const pedidas = await eventos<{ accion: string }>(EVENTO_ACCION_GUIA, () => {
            fireEvent.click(screen.getByRole("button", { name: "Saltar a crear cuenta" }));
        });
        expect(pedidas).toEqual([{ accion: "crear-cuenta" }]);
    }, 30_000);

    it("con cuenta, el último paso termina en su espacio y no ofrece crear cuenta", async () => {
        sim.usuario = CUENTA;
        await abrir({ desde: "ajustes", temaInicial: "cuenta" });
        await screen.findByRole("heading", { level: 2, name: "Tu cuenta, tu espacio" });
        const panel = screen.getByTestId("guia-cuenta");
        const ir = await within(panel).findByRole("button", { name: /Ir a mi espacio/ });
        expect(within(panel).queryByRole("button", { name: "Crear cuenta" })).toBeNull();
        expect(within(panel).queryByRole("button", { name: "Explorar sin cuenta" })).toBeNull();
        fireEvent.click(ir);
        expect(sim.push).toHaveBeenCalledWith("/escritorios");
    });

    it("si la sesión cambia con la guía abierta, el final se adapta solo", async () => {
        await abrir({ desde: "ajustes", temaInicial: "cuenta" });
        await esperarPaso("cuenta");
        expect(within(screen.getByTestId("guia-cuenta")).getByRole("button", { name: "Crear cuenta" })).toBeInTheDocument();
        await waitFor(() => expect(sim.avisarAuth).not.toBeNull());
        act(() => { sim.avisarAuth?.({ user: CUENTA }); });
        expect(await screen.findByRole("button", { name: /Ir a mi espacio/ })).toBeInTheDocument();
    });
});

describe("retomar donde se quedó", () => {
    it("abierta sin pedir un paso, sigue por el que se dejó y ofrece «Empezar de nuevo»", async () => {
        guardarProgresoGuia(indiceDePaso("malla"));
        await abrir({ desde: "boton" });
        await esperarPaso("malla");
        expect(screen.getByTestId("guia-retomada")).toHaveTextContent("Retomas donde lo dejaste");
        fireEvent.click(screen.getByRole("button", { name: /Empezar de nuevo/ }));
        await esperarPaso("bienvenida");
        expect(leerProgresoGuia()).toBeNull();
    });

    it("pedir un paso concreto no retoma, y lo que se lee se apunta (llegar a la cuenta lo borra)", async () => {
        guardarProgresoGuia(indiceDePaso("malla"));
        await abrir({ desde: "ajustes", temaInicial: "genesis" });
        await esperarPaso("genesis");
        expect(screen.queryByTestId("guia-retomada")).toBeNull();
        expect(leerProgresoGuia()).toBe(indiceDePaso("genesis"));
        fireEvent.click(screen.getByRole("button", { name: /^Ir al capítulo 9 de 9/ }));
        await esperarPaso("cuenta");
        await waitFor(() => expect(leerProgresoGuia()).toBeNull());
    });

    it("el evento de siempre con { step } sigue abriendo por esa posición", async () => {
        render(<AuroraGuide />);
        act(() => { window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT, { detail: { step: 3 } })); });
        fireEvent.click(await screen.findByRole("button", { name: /Solo la guía, sin voz/ }));
        await esperarPaso(PASOS_GUIA[3].id);
    });
});
