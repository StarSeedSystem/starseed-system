/**
 * ACC1025A · UNA sola ventana de acceso.
 *
 * Había tres diseños (`/login`, `/bienvenida`, la ventana guiada del primer arranque). Aquí se monta cada
 * superficie real y se comprueba que pintan la MISMA ventana: una tarjeta, el símbolo y «StarSeed» arriba,
 * las pestañas Entrar / Crear cuenta, «Mostrar», el código por correo, «Explorar sin cuenta», las tres
 * razones y los puntos de paso. Y que lo propio de cada ruta se conserva (el `?next=`, «Continuar como…»,
 * el paso por el que abre).
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render as renderCrudo, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { AppearanceProvider } from "@/context/appearance-context";

const sim = vi.hoisted(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
    navegarSuave: vi.fn(),
    iniciarRito: vi.fn(),
    sesionDetectada: false,
    usuario: null as null | { id: string; email?: string; is_anonymous?: boolean },
    perfil: null as null | { handle: string },
    onboardingCompleto: false,
    etapa: null as null | string,
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: sim.push, refresh: sim.refresh }),
    usePathname: () => "/login",
}));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: {
            signInWithPassword: vi.fn(async () => ({ error: null })),
            signUp: vi.fn(async () => ({ error: null, data: { session: null } })),
            setSession: vi.fn(async () => ({ error: null })),
            getSession: async () => ({ data: { session: sim.usuario ? { user: sim.usuario } : null } }),
            getUser: async () => ({ data: { user: sim.usuario }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sim.perfil, error: null }) }) }) }),
    }),
}));
vi.mock("@/lib/onboarding/director-rito", () => ({
    iniciarRito: sim.iniciarRito,
    navegarSuave: sim.navegarSuave,
    etapaActual: () => sim.etapa,
}));
vi.mock("@/lib/onboarding/onboarding", () => ({
    getOnboarding: async () => ({ completed: sim.onboardingCompleto, skipped: false }),
}));
vi.mock("@/lib/entorno/deteccion-entorno", () => ({ emailSugerido: () => null, olvidarEmailSugerido: () => undefined }));
vi.mock("@/lib/aurora/voz-starseed/motor", () => ({ precalentar: async () => undefined }));
vi.mock("@/lib/aurora/motor-voz", () => ({ precalentarMotorNeural: async () => undefined }));
vi.mock("@/lib/aurora/motor-local", () => ({ mantenerCaliente: () => () => undefined }));
vi.mock("@/lib/sso/detect-session", async (original) => ({
    ...(await original<typeof import("@/lib/sso/detect-session")>()),
    detectStarSeedSession: async () =>
        sim.sesionDetectada
            ? { found: true, source: "supabase", session: null, identity: { userId: "u1", handle: "ana", email: "ana@star.seed", avatarUrl: null, isAnonymous: false } }
            : { found: false, source: "none", session: null, identity: null },
}));
// Piezas pesadas que ya tienen sus propias pruebas.
vi.mock("@/components/onboarding/demo-gestos-hibridos", () => ({ DemoGestosHibridos: () => <div data-testid="demo-gestos" /> }));
vi.mock("@/components/onboarding/aurora-guide-demos", () => ({ StepDemo: ({ stepKey }: { stepKey: string }) => <div data-testid={`demo-${stepKey}`} /> }));
vi.mock("@/components/onboarding/onboarding-wizard", () => ({ default: () => <div data-testid="onboarding-wizard" /> }));

import { VentanaAcceso, PaginaAcceso } from "../ventana-acceso";
import { LoginExperience } from "../login-experience";
import LoginPage from "@/app/(main)/login/page";
import BienvenidaPage from "@/app/(app)/bienvenida/page";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";
import { CLAVE_INTRO_SALTADA } from "@/lib/onboarding/primer-arranque";

/** Los botones del OS leen la apariencia: como en la app, todo va dentro de su proveedor. */
const render = (ui: ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

beforeEach(() => {
    vi.clearAllMocks();
    sim.sesionDetectada = false;
    sim.usuario = null;
    sim.perfil = null;
    sim.onboardingCompleto = false;
    sim.etapa = null;
    window.localStorage.clear();
    window.history.pushState({}, "", "/login");
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

/** Lo que TODA superficie de acceso tiene que enseñar en el paso de la cuenta. */
function comprobarVentanaUnica(raiz: HTMLElement) {
    // Una sola tarjeta (nada de tarjeta dentro de tarjeta).
    expect(raiz.querySelectorAll("[data-tarjeta-acceso]")).toHaveLength(1);
    const tarjeta = raiz.querySelector("[data-tarjeta-acceso]") as HTMLElement;
    // El símbolo y el nombre de StarSeed arriba.
    const marca = within(tarjeta).getByTestId("marca-starseed");
    const simbolo = marca.querySelector("img") as HTMLImageElement;
    expect(simbolo.getAttribute("alt")).toBe("StarSeed");
    expect(decodeURIComponent(simbolo.getAttribute("src") ?? "")).toContain("/starseed-symbol.png");
    expect(marca.textContent).toContain("StarSeed");
    // Pestañas, formulario, código por correo.
    expect(within(tarjeta).getByRole("tab", { name: "Entrar" })).toBeInTheDocument();
    expect(within(tarjeta).getByRole("tab", { name: "Crear cuenta" })).toBeInTheDocument();
    expect(within(tarjeta).getByLabelText("Correo")).toBeInTheDocument();
    expect(within(tarjeta).getByRole("button", { name: "Mostrar contraseña" })).toBeInTheDocument();
    expect(within(tarjeta).getByRole("button", { name: "Entrar con código por correo (sin contraseña)" })).toBeInTheDocument();
    expect(within(tarjeta).getByRole("button", { name: "Explorar sin cuenta" })).toBeInTheDocument();
    // Tres razones breves.
    const razones = within(tarjeta).getByRole("list", { name: "Por qué crear una cuenta StarSeed" });
    expect(within(razones).getAllByRole("listitem")).toHaveLength(3);
    expect(razones.textContent).toContain("Una sola cuenta");
    expect(razones.textContent).toContain("Dirección @star.seed");
    expect(razones.textContent).toContain("Aurora te guía");
    // Puntos de paso.
    expect(within(tarjeta).getAllByRole("button", { name: /^Ir al paso \d de 4/ })).toHaveLength(4);
    // Y no quedan restos de los diseños viejos.
    expect(raiz.textContent).not.toContain("Identidad Digital");
    expect(raiz.textContent).not.toContain("Accede al StarSeed Network");
    expect(raiz.textContent).not.toContain("StarSeed OS · Inicia sesión");
    expect(within(tarjeta).queryByText("Registrarse")).toBeNull();
}

describe("PaginaAcceso (la ventana en una página)", () => {
    it("abre en la cuenta: una tarjeta con todo lo de la ventana única", async () => {
        const { container } = render(<PaginaAcceso desde="login" />);
        expect(await screen.findByRole("heading", { level: 1, name: "Crea tu cuenta o entra" })).toBeInTheDocument();
        comprobarVentanaUnica(container);
        expect(screen.getByRole("tab", { name: "Entrar" })).toHaveAttribute("aria-selected", "true");
    });

    it("sin paso inicial abierto en la cuenta, los puntos recorren la introducción y se vuelve a la cuenta", async () => {
        render(<PaginaAcceso desde="bienvenida" />);
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        fireEvent.click(screen.getByRole("button", { name: /^Ir al paso 1 de 4/ }));
        await screen.findByRole("heading", { name: "Te damos la bienvenida a StarSeed OS" });
        // El cuerpo del paso entra con su animación: se espera al botón.
        fireEvent.click(await screen.findByRole("button", { name: "Empezar la introducción" }));
        await screen.findByRole("heading", { name: "Qué es StarSeed OS" });
        fireEvent.click(screen.getByRole("button", { name: /^Ir al paso 4 de 4/ }));
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
    });

    it("«Ver la introducción» (paso inicial «intro») arranca desde el principio y termina en «Crear cuenta»", async () => {
        render(<PaginaAcceso desde="login" pasoInicial="intro" />);
        await screen.findByRole("heading", { name: "Te damos la bienvenida a StarSeed OS" });
        fireEvent.click(screen.getByRole("button", { name: /^Ir al paso 4 de 4/ }));
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        // Quien recorrió la introducción llega a «Crear cuenta».
        expect(await screen.findByRole("tab", { name: "Crear cuenta" })).toHaveAttribute("aria-selected", "true");
    });

    it("«Conoce StarSeed» abre la guía de Aurora por la puerta común, desde la ruta que la pinta", async () => {
        const recibidos: PeticionGuia[] = [];
        const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
        window.addEventListener(EVENTO_ABRIR_GUIA, oir);
        render(<PaginaAcceso desde="bienvenida" />);
        fireEvent.click(await screen.findByRole("button", { name: "Conoce StarSeed" }));
        window.removeEventListener(EVENTO_ABRIR_GUIA, oir);
        expect(recibidos).toEqual([{ desde: "bienvenida" }]);
    });

    it("«Explorar sin cuenta» deja la marca y lleva a los escritorios", async () => {
        render(<PaginaAcceso desde="login" />);
        fireEvent.click(await screen.findByRole("button", { name: "Explorar sin cuenta" }));
        expect(window.localStorage.getItem(CLAVE_INTRO_SALTADA)).toBe("1");
        expect(sim.navegarSuave).toHaveBeenCalledWith(expect.anything(), "/escritorios");
    });

    it("va bajo la guía de Aurora (z 90 < 95) para que el recorrido se vea por encima", async () => {
        render(<PaginaAcceso desde="login" />);
        const pagina = await screen.findByTestId("pagina-acceso");
        expect(pagina.className).toContain("z-[90]");
    });
});

describe("/login (LoginExperience)", () => {
    it("pinta la ventana única, en «Entrar», sin su diseño anterior", async () => {
        const { container } = render(<LoginExperience />);
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        comprobarVentanaUnica(container);
        expect(screen.getByTestId("pagina-acceso")).toHaveAttribute("data-desde", "login");
        expect(screen.getByRole("tab", { name: "Entrar" })).toHaveAttribute("aria-selected", "true");
    });

    it("la página /login es esa misma ventana", async () => {
        const { container } = render(<LoginPage />);
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        comprobarVentanaUnica(container);
    });

    it("«Continuar como…» sigue ahí, dentro de la misma tarjeta y sin tarjeta propia", async () => {
        sim.sesionDetectada = true;
        const { container } = render(<LoginExperience />);
        const region = await screen.findByRole("region", { name: "Sesión StarSeed detectada" });
        const tarjeta = container.querySelector("[data-tarjeta-acceso]") as HTMLElement;
        expect(tarjeta.contains(region)).toBe(true);
        expect(container.querySelectorAll("[data-tarjeta-acceso]")).toHaveLength(1);
        // Incrustada: sin sombra ni desenfoque propios.
        const interior = region.querySelector(".ss-sso-card") as HTMLElement;
        const estilo = interior.getAttribute("style") ?? "";
        expect(estilo).not.toMatch(/box-shadow/);
        expect(estilo).not.toMatch(/backdrop-filter/);
        expect(screen.getByRole("button", { name: /Entrar como @ana/ })).toBeInTheDocument();
    });

    it("conserva el ?next= en «Continuar como…»", async () => {
        sim.sesionDetectada = true;
        window.history.pushState({}, "", "/login?next=%2Fllamada%2Fabc");
        render(<LoginExperience />);
        // Sin sesión real simulada (getSession devuelve null) «Entrar como» no navega; basta con que el
        // aviso salga: el ?next= se pasa como redirectTo (lo cubre la prueba de siguiente-seguro).
        expect(await screen.findByRole("button", { name: /Entrar como @ana/ })).toBeInTheDocument();
    });
});

describe("/bienvenida", () => {
    it("sin cuenta enseña la ventana única (ya no AuthGate)", async () => {
        const { container } = render(<BienvenidaPage />);
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" }, { timeout: 5000 });
        comprobarVentanaUnica(container);
        expect(screen.getByTestId("pagina-acceso")).toHaveAttribute("data-desde", "bienvenida");
    });

    it("con cuenta recién creada (sin perfil) arranca la guía, no el acceso", async () => {
        sim.usuario = { id: "u1", email: "ana@star.seed" };
        render(<BienvenidaPage />);
        expect(await screen.findByTestId("onboarding-wizard")).toBeInTheDocument();
        expect(screen.queryByTestId("pagina-acceso")).toBeNull();
        expect(sim.iniciarRito).toHaveBeenCalled();
    });

    it("con una cuenta ya configurada no se queda en blanco: va a los escritorios", async () => {
        sim.usuario = { id: "u1", email: "ana@star.seed" };
        sim.perfil = { handle: "ana" };
        sim.onboardingCompleto = true;
        render(<BienvenidaPage />);
        await waitFor(() => expect(sim.navegarSuave).toHaveBeenCalledWith(expect.anything(), "/escritorios"));
        expect(screen.queryByTestId("pagina-acceso")).toBeNull();
    });
});

describe("VentanaAcceso (la ventana encima de otra página)", () => {
    it("es un diálogo con la misma ventana: abre en la introducción y se cierra con la X", async () => {
        const alCerrar = vi.fn();
        render(<VentanaAcceso pasoInicial="intro" onSaltar={vi.fn()} onCerrar={alCerrar} />);
        const ventana = await screen.findByTestId("ventana-bienvenida");
        expect(ventana).toHaveAttribute("role", "dialog");
        expect(ventana.textContent).toContain("Te damos la bienvenida a StarSeed OS");
        expect(within(ventana).getAllByRole("button", { name: /^Ir al paso \d de 4/ })).toHaveLength(4);
        fireEvent.click(within(ventana).getByRole("button", { name: /^Cerrar/ }));
        expect(alCerrar).toHaveBeenCalled();
    });

    it("abierta en la cuenta tiene todo lo de la ventana única y respeta la pestaña pedida", async () => {
        render(<VentanaAcceso pasoInicial="acceso" pestanaInicial="signup" onSaltar={vi.fn()} onCerrar={vi.fn()} />);
        const ventana = await screen.findByTestId("ventana-bienvenida");
        expect(ventana).toHaveAttribute("data-tarjeta-acceso");
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        expect(screen.getByRole("tab", { name: "Crear cuenta" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByLabelText("Confirmar contraseña")).toBeInTheDocument();
        expect(within(ventana).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    });

    it("«Explorar sin cuenta» llama al manejador de quien la abre", async () => {
        const saltar = vi.fn();
        render(<VentanaAcceso pasoInicial="acceso" onSaltar={saltar} onCerrar={vi.fn()} />);
        await act(async () => {
            fireEvent.click(await screen.findByRole("button", { name: "Explorar sin cuenta" }));
        });
        expect(saltar).toHaveBeenCalled();
    });
});
