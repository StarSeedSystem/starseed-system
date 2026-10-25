/**
 * ACC1025B · La puerta de sesión.
 *
 * Sin sesión: detrás, la vista previa del perfil vacío (la cabecera real con datos vacíos), difuminada y sin
 * poder tocarse; delante, centrada, «Te damos la bienvenida a StarSeed OS» con sus tres acciones; y el aviso
 * de abajo del primer arranque NO sale. Con sesión: la página real, sin puerta.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render as renderCrudo, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceProvider } from "@/context/appearance-context";

const sim = vi.hoisted(() => ({
    push: vi.fn(),
    navegar: vi.fn(),
    user: null as null | { id: string },
    handle: null as null | string,
    /** Falso = web normal (el primer arranque pinta el aviso de abajo); verdadero = app nativa. */
    nativa: false,
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: sim.push, replace: sim.push, refresh: vi.fn() }),
    usePathname: () => "/profile",
}));
vi.mock("@/lib/onboarding/director-rito", async (original) => ({
    ...(await original<typeof import("@/lib/onboarding/director-rito")>()),
    navegarSuave: (...args: unknown[]) => sim.navegar(...args),
}));
// La cuenta: la página decide con ella; la cabecera del perfil la lee para los conteos.
vi.mock("@/context/account-context", () => ({
    useAccount: () => ({ user: sim.user, session: null, profile: sim.handle ? { username: sim.handle } : null, loading: false }),
}));
vi.mock("@/lib/profiles/profiles", async (original) => ({
    ...(await original<typeof import("@/lib/profiles/profiles")>()),
    useActiveProfile: () => ({ profile: null, loading: false }),
}));
vi.mock("@/components/profiles/account-profiles-switcher", () => ({
    AccountProfilesSwitcher: () => <div data-testid="creador-de-perfiles" />,
}));
// Supabase: sin sesión (el primer arranque la consulta) y con listas vacías para la cabecera del perfil.
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: {
            getSession: async () => ({ data: { session: null } }),
            getUser: async () => ({ data: { user: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        },
        from: () => ({
            select: () => ({
                eq: Object.assign(async () => ({ data: [], error: null }), {
                    maybeSingle: async () => ({ data: null, error: null }),
                }),
            }),
            upsert: async () => ({ error: null }),
        }),
    }),
}));
// Lo del primer arranque que no es de esta prueba (misma simulación que su propia prueba).
vi.mock("@/lib/sync/realtime-sync", () => ({
    esperarPullInicial: async () => ({ estado: "sincronizado", fiable: true }),
    cuandoCuentaFiable: () => () => undefined,
}));
vi.mock("@/lib/apps-oficiales/dispositivo-actual", () => ({ esAppNativa: () => sim.nativa }));
vi.mock("@/lib/neurons/neurons", () => ({
    NEURON_PREFS_KEY: "starseed.neurons.prefs.v1",
    thisDeviceId: () => "dispositivo-1",
    listNeurons: async () => [],
    permissionsFor: () => ({ compute: true, storage: true, sync: true, agent: true, senses: true, wake: true }),
    settingsFor: () => ({}),
    setPermission: vi.fn(),
    setNeuronSettings: vi.fn(),
    setNeuronName: vi.fn(),
}));
vi.mock("@/lib/brains/brains", () => ({ listBrains: async () => [] }));
vi.mock("@/lib/onboarding/onboarding", () => ({ saveOnboarding: async () => null }));
vi.mock("@/lib/onboarding/neuron-recommend", () => ({
    detectar: async () => ({ so: "macOS", arch: "arm", nucleos: 8, ramGB: 8 }),
    recomendar: () => ({ modelo: "bitnet-2b", conciencia: "semilla", razones: ["Este equipo mueve bien el modelo local."] }),
}));
vi.mock("@/lib/perf/fondo-vivo", () => ({ guardarPreferenciaFondo: vi.fn() }));
vi.mock("@/components/onboarding/demo-gestos-hibridos", () => ({ DemoGestosHibridos: () => <div data-testid="demo-gestos" /> }));
vi.mock("@/components/onboarding/aurora-guide-demos", () => ({ StepDemo: () => <div data-testid="demo-paso" /> }));

import { PuertaSesion } from "../puerta-sesion";
import ProfileIndexPage from "@/app/(app)/profile/page";
import { PrimerArranque } from "@/components/onboarding/primer-arranque";
import { _reiniciarPuertasParaPruebas, hayPuertaVisible } from "@/lib/onboarding/puerta-visible";
import { CLAVE_INTRO_SALTADA, EVENTO_ABRIR_PRIMER_ARRANQUE } from "@/lib/onboarding/primer-arranque";

const render = (ui: ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

beforeEach(() => {
    vi.clearAllMocks();
    sim.user = null;
    sim.handle = null;
    sim.nativa = false;
    window.localStorage.clear();
    window.sessionStorage.clear();
    _reiniciarPuertasParaPruebas();
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

afterEach(() => cleanup());

describe("PuertaSesion · la vista previa de detrás", () => {
    it("pinta el perfil por defecto vacío, difuminado, sin poder tocarse ni leerse", async () => {
        render(<PuertaSesion vista="perfil" nombrePagina="Tu perfil" />);
        const detras = screen.getByTestId("puerta-vista-previa");
        // Difuminada, inerte y fuera del árbol de accesibilidad.
        expect(detras).toHaveAttribute("aria-hidden", "true");
        expect(detras.hasAttribute("inert")).toBe(true);
        expect(detras.className).toContain("pointer-events-none");
        expect(detras.innerHTML).toContain("blur-[7px]");
        // El velo encima de la vista previa.
        expect(screen.getByTestId("puerta-velo").className).toContain("bg-background/60");
        // La cabecera REAL del perfil con los datos vacíos: «Tu nombre», «@usuario», sin biografía.
        const perfil = await within(detras).findByTestId("vista-previa-perfil");
        expect(perfil.textContent).toContain("Tu nombre");
        expect(perfil.textContent).toContain("@usuario");
        expect(within(perfil).getByRole("tablist", { hidden: true })).toBeInTheDocument();
        expect(perfil.querySelector("img[src]:not([alt=''])")).toBeNull(); // sin avatar ni portada reales
        // Y nada de lo de detrás es alcanzable por accesibilidad.
        expect(screen.queryByRole("tab")).toBeNull();
    });

    it("la Biblioteca y los Correos tienen su propia vista neutra", async () => {
        const { rerender } = render(<PuertaSesion vista="biblioteca" nombrePagina="Tu Biblioteca" />);
        expect(await screen.findByTestId("vista-previa-biblioteca")).toBeInTheDocument();
        rerender(
            <AppearanceProvider>
                <PuertaSesion vista="correos" nombrePagina="Correos StarSeed" />
            </AppearanceProvider>,
        );
        expect(await screen.findByTestId("vista-previa-correos")).toBeInTheDocument();
    });
});

describe("PuertaSesion · la tarjeta de delante", () => {
    it("«Te damos la bienvenida a StarSeed OS» centrada, con sus tres acciones, por encima de la vista previa", () => {
        render(<PuertaSesion nombrePagina="Tu perfil" />);
        const puerta = screen.getByTestId("puerta-sesion");
        const tarjeta = within(puerta).getByTestId("tarjeta-bienvenida");
        expect(tarjeta).toHaveAttribute("data-variante", "puerta");
        expect(within(tarjeta).getByRole("heading", { name: "Te damos la bienvenida a StarSeed OS" })).toBeInTheDocument();
        for (const nombre of ["Entrar o crear cuenta", "Ver la introducción", "Explorar sin cuenta"]) {
            expect(within(tarjeta).getByRole("button", { name: nombre })).toBeInTheDocument();
        }
        // Centrada (flex centrado) y por delante (z-10) de la vista previa.
        expect(puerta.className).toMatch(/items-center/);
        expect(puerta.className).toMatch(/justify-center/);
        const envoltorio = tarjeta.parentElement as HTMLElement;
        expect(envoltorio.className).toContain("z-10");
        expect(envoltorio.className).toContain("justify-center");
        // La página sigue teniendo un título para quien la lee con lector de pantalla.
        expect(within(puerta).getByRole("heading", { level: 1, name: "Tu perfil" })).toBeInTheDocument();
    });

    function escucharAbrir() {
        const recibidos: Array<{ paso?: string; pestana?: string }> = [];
        const oir = (e: Event) => recibidos.push((e as CustomEvent).detail);
        window.addEventListener(EVENTO_ABRIR_PRIMER_ARRANQUE, oir);
        return { recibidos, parar: () => window.removeEventListener(EVENTO_ABRIR_PRIMER_ARRANQUE, oir) };
    }

    it("«Entrar o crear cuenta» abre la ventana de acceso en la cuenta, en «Entrar»", () => {
        const oyente = escucharAbrir();
        render(<PuertaSesion nombrePagina="Tu perfil" />);
        fireEvent.click(screen.getByRole("button", { name: "Entrar o crear cuenta" }));
        oyente.parar();
        expect(oyente.recibidos).toEqual([{ paso: "acceso", pestana: "signin" }]);
    });

    it("«Ver la introducción» la abre desde el principio", () => {
        const oyente = escucharAbrir();
        render(<PuertaSesion nombrePagina="Tu perfil" />);
        fireEvent.click(screen.getByRole("button", { name: "Ver la introducción" }));
        oyente.parar();
        expect(oyente.recibidos).toEqual([{ paso: "intro", pestana: undefined }]);
    });

    it("«Explorar sin cuenta» deja la marca y lleva a los escritorios", () => {
        render(<PuertaSesion nombrePagina="Tu perfil" />);
        fireEvent.click(screen.getByRole("button", { name: "Explorar sin cuenta" }));
        expect(window.localStorage.getItem(CLAVE_INTRO_SALTADA)).toBe("1");
        expect(sim.navegar).toHaveBeenCalledWith(expect.anything(), "/escritorios");
    });

    it("avisa de que hay una puerta mientras está montada y lo retira al irse", () => {
        expect(hayPuertaVisible()).toBe(false);
        const { unmount } = render(<PuertaSesion nombrePagina="Tu perfil" />);
        expect(hayPuertaVisible()).toBe(true);
        unmount();
        expect(hayPuertaVisible()).toBe(false);
    });
});

describe("/profile · con y sin sesión", () => {
    it("sin sesión pinta la puerta (y ya no la tarjeta suelta «Tu perfil · Inicia sesión…»)", async () => {
        const { container } = render(<ProfileIndexPage />);
        expect(screen.getByTestId("puerta-sesion")).toBeInTheDocument();
        await screen.findByTestId("vista-previa-perfil");
        expect(container.textContent).not.toContain("Inicia sesión con tu cuenta StarSeed para ver y editar");
        expect(screen.queryByRole("link", { name: /Entrar \/ Crear cuenta/ })).toBeNull();
    });

    it("con sesión y perfil no se muestra la puerta: lleva al perfil real", async () => {
        sim.user = { id: "u1" };
        sim.handle = "ana";
        render(<ProfileIndexPage />);
        await waitFor(() => expect(sim.push).toHaveBeenCalledWith("/profile/ana"));
        expect(screen.queryByTestId("puerta-sesion")).toBeNull();
        expect(hayPuertaVisible()).toBe(false);
    });

    it("con sesión pero sin @ enseña el creador de perfiles, no la puerta", () => {
        sim.user = { id: "u1" };
        render(<ProfileIndexPage />);
        expect(screen.getByTestId("creador-de-perfiles")).toBeInTheDocument();
        expect(screen.queryByTestId("puerta-sesion")).toBeNull();
    });
});

describe("la puerta y el aviso de abajo del primer arranque", () => {
    // El primer arranque en una web normal sin sesión: aviso discreto abajo. Con la puerta, no sale.
    function montarJunto(conPuerta: boolean) {
        return render(
            <>
                {conPuerta && <PuertaSesion nombrePagina="Tu perfil" />}
                <PrimerArranque esperaMs={5} />
            </>,
        );
    }

    it("sin puerta (otra página cualquiera) el aviso de abajo sí sale", async () => {
        montarJunto(false);
        const aviso = await screen.findByTestId("aviso-bienvenida-web", undefined, { timeout: 4000 });
        expect(within(aviso).getByTestId("tarjeta-bienvenida")).toHaveAttribute("data-variante", "aviso");
    });

    it("con la puerta a la vista solo hay UNA tarjeta de bienvenida (la del centro) y ningún aviso", async () => {
        montarJunto(true);
        // Deja pasar de sobra lo que el control de arriba tarda en pintar el aviso (decisión + cortesía).
        await screen.findByTestId("vista-previa-perfil");
        await act(async () => {
            await new Promise((r) => setTimeout(r, 600));
        });
        expect(screen.queryByTestId("aviso-bienvenida-web")).toBeNull();
        expect(screen.getAllByTestId("tarjeta-bienvenida")).toHaveLength(1);
        expect(screen.getByTestId("tarjeta-bienvenida")).toHaveAttribute("data-variante", "puerta");
    });

    it("de punta a punta: «Ver la introducción» de la puerta abre la ventana de acceso única desde el principio", async () => {
        montarJunto(true);
        fireEvent.click(screen.getByRole("button", { name: "Ver la introducción" }));
        const ventana = await screen.findByTestId("ventana-bienvenida");
        expect(ventana.textContent).toContain("Te damos la bienvenida a StarSeed OS");
        expect(screen.queryByTestId("aviso-bienvenida-web")).toBeNull();
    });

    it("de punta a punta: «Entrar o crear cuenta» de la puerta abre la ventana en la cuenta", async () => {
        montarJunto(true);
        fireEvent.click(screen.getByRole("button", { name: "Entrar o crear cuenta" }));
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        expect(await screen.findByRole("tab", { name: "Entrar" })).toHaveAttribute("aria-selected", "true");
    });
});
