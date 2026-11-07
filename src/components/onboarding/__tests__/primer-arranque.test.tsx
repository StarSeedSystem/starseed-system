import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceProvider } from "@/context/appearance-context";

/* ─────────────── Supabase simulado: sesión, perfil y fila de la neurona ─────────────── */

type Usuario = { id: string; email?: string; is_anonymous?: boolean } | null;

const est = vi.hoisted(() => ({
    ruta: "/escritorios",
    nativa: true,
    usuario: null as { id: string; email?: string; is_anonymous?: boolean } | null,
    perfil: null as { handle: string } | null,
    fila: null as { id: string; name: string; created_at: string } | null,
    oyenteAuth: null as null | (() => void),
    consultas: [] as string[],
    /** La cuenta ya se bajó (primer pull hecho). Falso = «sin conexión con la cuenta». */
    cuentaFiable: true,
    esperasCuenta: [] as Array<() => void>,
    /** Neuronas de la cuenta que devuelve `listNeurons` (la de este dispositivo incluida). */
    neuronas: [] as Array<Record<string, unknown>>,
    /** `navegarSuave` del director del rito (lo que hace «Explorar sin cuenta» con la puerta a la vista). */
    navegar: vi.fn(),
}));

// El motor de sync real no corre aquí: el test decide si la cuenta ya está bajada.
vi.mock("@/lib/sync/realtime-sync", () => ({
    esperarPullInicial: async () =>
        est.cuentaFiable ? { estado: "sincronizado", fiable: true } : { estado: "sin-conexion", fiable: false },
    cuandoCuentaFiable: (cb: () => void) => {
        est.esperasCuenta.push(cb);
        return () => {
            est.esperasCuenta = est.esperasCuenta.filter((f) => f !== cb);
        };
    },
}));

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: {
            getSession: async () => ({ data: { session: est.usuario ? { user: est.usuario } : null } }),
            getUser: async () => ({ data: { user: est.usuario } }),
            onAuthStateChange: (cb: () => void) => {
                est.oyenteAuth = cb;
                return { data: { subscription: { unsubscribe: () => undefined } } };
            },
        },
        from: (tabla: string) => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => {
                        est.consultas.push(tabla);
                        return { data: tabla === "profiles" ? est.perfil : est.fila, error: null };
                    },
                }),
            }),
            upsert: async () => ({ error: null }),
        }),
    }),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => est.ruta,
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// El director del rito es el real, salvo la navegación (no hay dónde navegar en jsdom).
vi.mock("@/lib/onboarding/director-rito", async (original) => ({
    ...(await original<typeof import("@/lib/onboarding/director-rito")>()),
    navegarSuave: (...args: unknown[]) => est.navegar(...args),
}));

vi.mock("@/lib/apps-oficiales/dispositivo-actual", () => ({ esAppNativa: () => est.nativa }));

// Piezas pesadas que ya tienen sus propias pruebas.
vi.mock("@/components/auth/auth-form", () => ({
    AuthForm: ({ pestanaInicial }: { pestanaInicial?: string }) => <div data-testid="auth-form" data-pestana={pestanaInicial} />,
}));
vi.mock("../demo-gestos-hibridos", () => ({ DemoGestosHibridos: () => <div data-testid="demo-gestos" /> }));
vi.mock("../aurora-guide-demos", () => ({ StepDemo: ({ stepKey }: { stepKey: string }) => <div data-testid={`demo-${stepKey}`} /> }));

const neuronas = vi.hoisted(() => ({ nombres: [] as string[] }));
vi.mock("@/lib/neurons/neurons", () => ({
    NEURON_PREFS_KEY: "starseed.neurons.prefs.v1",
    thisDeviceId: () => "dispositivo-1",
    listNeurons: async () => est.neuronas,
    permissionsFor: () => ({ compute: true, storage: true, sync: true, agent: true, senses: true, wake: true }),
    settingsFor: () => ({}),
    setPermission: vi.fn(),
    setNeuronSettings: vi.fn(),
    setNeuronName: (_id: string, n: string) => {
        neuronas.nombres.push(n);
    },
}));
vi.mock("@/lib/brains/brains", () => ({ listBrains: async () => [] }));
vi.mock("@/lib/onboarding/onboarding", () => ({ saveOnboarding: async () => null }));
vi.mock("@/lib/onboarding/neuron-recommend", () => ({
    detectar: async () => ({ so: "macOS", arch: "arm", nucleos: 8, ramGB: 8 }),
    recomendar: () => ({ modelo: "bitnet-2b", conciencia: "semilla", razones: ["Este equipo mueve bien el modelo local."] }),
}));
vi.mock("@/lib/perf/fondo-vivo", () => ({ guardarPreferenciaFondo: vi.fn() }));

// (NEU1107B) «Esta neurona»: la decisión y la ventana tienen sus propias pruebas; aquí solo cuándo se abre.
const bienv = vi.hoisted(() => ({ mostrar: false, lecturas: 0 }));
vi.mock("@/lib/neurons/neurona-bienvenida-acciones", () => ({
    reunirDatosBienvenida: async () => {
        bienv.lecturas += 1;
        return { uid: "u-1" };
    },
    decidirConDatos: (_d: unknown, manual?: boolean) =>
        bienv.mostrar || manual ? { mostrar: true, pasos: ["ajustes", "resumen"] } : { mostrar: false, motivo: "ya-vista" },
}));
vi.mock("@/components/neurons/bienvenida-neurona", () => ({
    BienvenidaNeurona: ({ manual, onClose }: { manual?: boolean; onClose: () => void }) => (
        <div data-testid="bienvenida-neurona" data-manual={manual ? "1" : "0"}>
            <button type="button" onClick={onClose}>
                Cerrar «Esta neurona»
            </button>
        </div>
    ),
}));

import { PrimerArranque } from "../primer-arranque";
import { EVENTO_ABRIR_BIENVENIDA_NEURONA } from "@/lib/neurons/neurona-bienvenida";
import { AVISO_NEURONA_CONFIGURADA, AVISO_NEURONA_NUEVA_LUEGO } from "@/lib/onboarding/primer-arranque";
import { _reiniciarPuertasParaPruebas, registrarPuerta } from "@/lib/onboarding/puerta-visible";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";

const CUENTA: Usuario = { id: "u-1", email: "ana@star.seed" };

/** Un elemento NUEVO cada vez: con el mismo objeto React no volvería a pintar y la ruta simulada no se releería. */
const arranque = () => (
    <AppearanceProvider>
        <PrimerArranque esperaMs={5} />
    </AppearanceProvider>
);

function montar() {
    return render(arranque());
}

/** Deja correr los temporizadores de cortesía y las promesas simuladas. */
// const pausa = (ms = 80) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

beforeEach(() => {
    est.ruta = "/escritorios";
    est.nativa = true;
    est.usuario = null;
    est.perfil = null;
    est.fila = null;
    est.oyenteAuth = null;
    est.consultas = [];
    est.cuentaFiable = true;
    est.esperasCuenta = [];
    est.neuronas = [];
    est.navegar = vi.fn();
    neuronas.nombres = [];
    bienv.mostrar = false;
    bienv.lecturas = 0;
    _reiniciarPuertasParaPruebas();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("starseed.neuron.device-id", "dispositivo-1");
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

afterEach(() => cleanup());

describe("PrimerArranque · sin sesión", () => {
    it("en la app nativa abre sola la bienvenida y lleva hasta crear cuenta o entrar", async () => {
        montar();
        const ventana = await screen.findByTestId("ventana-bienvenida");
        expect(ventana.textContent).toContain("Te damos la bienvenida a StarSeed OS");

        fireEvent.click(screen.getByRole("button", { name: "Empezar la introducción" }));
        await screen.findByRole("heading", { name: "Qué es StarSeed OS" });
        // (GUIA1025U) Sigue la guía completa: tras «Qué es» viene Trinity, y «Saltar a crear cuenta» está en cada paso.
        fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
        await screen.findByRole("heading", { name: "El Orbe de Aurora" });
        fireEvent.click(screen.getByRole("button", { name: "Saltar a crear cuenta" }));
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        expect((await screen.findByTestId("auth-form", {}, { timeout: 5000 })).getAttribute("data-pestana")).toBe("signup");
    });

    it("«Ya tengo cuenta» salta directo al formulario en «Entrar»", async () => {
        montar();
        await screen.findByTestId("ventana-bienvenida");
        fireEvent.click(screen.getByRole("button", { name: "Ya tengo cuenta" }));
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        expect((await screen.findByTestId("auth-form", {}, { timeout: 5000 })).getAttribute("data-pestana")).toBe("signin");
    });

    it("«Explorar sin cuenta» la cierra y ya no vuelve sola en este dispositivo", async () => {
        const primera = montar();
        await screen.findByTestId("ventana-bienvenida");
        fireEvent.click(screen.getByRole("button", { name: "Explorar sin cuenta" }));
        await waitFor(() => expect(screen.queryByTestId("ventana-bienvenida")).toBeNull());
        expect(window.localStorage.getItem("starseed.primer-arranque.saltado.v1")).toBe("1");
        primera.unmount();

        montar();
        await waitFor(() => expect(screen.queryByTestId("ventana-bienvenida")).toBeNull());
    });

    it("se puede abrir a mano aunque se hubiera saltado", async () => {
        window.localStorage.setItem("starseed.primer-arranque.saltado.v1", "1");
        montar();
        await waitFor(() => expect(screen.queryByTestId("ventana-bienvenida")).toBeNull());
        act(() => {
            window.dispatchEvent(new CustomEvent("starseed:abrir-primer-arranque", { detail: { paso: "acceso" } }));
        });
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
    });

    it("en una web normal solo aparece el aviso discreto, que abre la misma ventana", async () => {
        est.nativa = false;
        montar();
        const aviso = await screen.findByTestId("aviso-bienvenida-web");
        expect(screen.queryByTestId("ventana-bienvenida")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Entrar o crear cuenta" }));
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        expect(aviso.isConnected).toBe(false);
    });

    it("es la ventana de acceso única: capítulos para recorrer la guía completa y el formulario unificado dentro", async () => {
        montar();
        const ventana = await screen.findByTestId("ventana-bienvenida");
        const capitulos = Array.from(ventana.querySelectorAll("button[aria-label^='Ir al capítulo']"));
        expect(capitulos).toHaveLength(9);
        expect(document.querySelectorAll("[data-tarjeta-acceso]")).toHaveLength(1);
        // Se salta a la cuenta con el último capítulo.
        fireEvent.click(capitulos[8] as HTMLElement);
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        expect((await screen.findByTestId("auth-form", {}, { timeout: 5000 })).getAttribute("data-pestana")).toBe("signup");
    });

    it("el evento de abrir a mano puede pedir la pestaña «Entrar»", async () => {
        window.localStorage.setItem("starseed.primer-arranque.saltado.v1", "1");
        montar();
        await waitFor(() => expect(screen.queryByTestId("ventana-bienvenida")).toBeNull());
        act(() => {
            window.dispatchEvent(new CustomEvent("starseed:abrir-primer-arranque", { detail: { paso: "acceso", pestana: "signin" } }));
        });
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        expect((await screen.findByTestId("auth-form", {}, { timeout: 5000 })).getAttribute("data-pestana")).toBe("signin");
    });

    it("«Ver la introducción» del aviso abre la ventana desde el principio y retira el aviso", async () => {
        est.nativa = false;
        montar();
        await screen.findByTestId("aviso-bienvenida-web");
        fireEvent.click(screen.getByRole("button", { name: "Ver la introducción" }));
        await screen.findByRole("heading", { name: "Te damos la bienvenida a StarSeed OS" });
        expect(screen.queryByTestId("aviso-bienvenida-web")).toBeNull();
    });

    it("con la puerta de sesión a la vista el aviso de abajo NO aparece; al retirarse, vuelve", async () => {
        est.nativa = false;
        let soltar = () => undefined as void;
        act(() => {
            soltar = registrarPuerta();
        });
        montar();
        await waitFor(() => expect(screen.queryByTestId("aviso-bienvenida-web")).toBeNull());
        act(() => soltar());
        await screen.findByTestId("aviso-bienvenida-web");
    });

    it("con la puerta a la vista tampoco se abre sola la ventana completa de la app nativa", async () => {
        est.nativa = true;
        act(() => {
            registrarPuerta();
        });
        montar();
        await waitFor(() => expect(screen.queryByTestId("ventana-bienvenida")).toBeNull());
        // Pero a mano (los botones de la puerta) sí se abre.
        act(() => {
            window.dispatchEvent(new CustomEvent("starseed:abrir-primer-arranque", { detail: { paso: "intro" } }));
        });
        await screen.findByTestId("ventana-bienvenida");
    });

    it("«Explorar sin cuenta» con la puerta a la vista además lleva a los escritorios", async () => {
        est.nativa = false;
        act(() => {
            registrarPuerta();
        });
        montar();
        act(() => {
            window.dispatchEvent(new CustomEvent("starseed:abrir-primer-arranque", { detail: { paso: "acceso" } }));
        });
        fireEvent.click(await screen.findByRole("button", { name: "Explorar sin cuenta" }));
        await waitFor(() => expect(screen.queryByTestId("ventana-bienvenida")).toBeNull());
        expect(est.navegar).toHaveBeenCalledWith(expect.anything(), "/escritorios");
        expect(window.localStorage.getItem("starseed.primer-arranque.saltado.v1")).toBe("1");
    });

    it("al cambiar de ruta relee las marcas: lo saltado en la puerta no vuelve en la página siguiente", async () => {
        est.nativa = false;
        est.ruta = "/login"; // ruta con su propio acceso: no abre nada
        const { rerender } = montar();
        await waitFor(() => expect(screen.queryByTestId("aviso-bienvenida-web")).toBeNull());
        // La puerta (otro componente) marca «saltada» y navega.
        window.localStorage.setItem("starseed.primer-arranque.saltado.v1", "1");
        est.ruta = "/escritorios";
        rerender(arranque());
        await waitFor(() => expect(screen.queryByTestId("aviso-bienvenida-web")).toBeNull());
        expect(screen.queryByTestId("ventana-bienvenida")).toBeNull();
    });

    it("en la consola de Genesis no abre nada", async () => {
        est.ruta = "/mando";
        montar();
        await waitFor(() => expect(screen.queryByTestId("ventana-bienvenida")).toBeNull());
    });

    it("al entrar con una cuenta se retira la bienvenida", async () => {
        montar();
        await screen.findByTestId("ventana-bienvenida");
        est.usuario = CUENTA;
        est.perfil = { handle: "ana" };
        est.fila = { id: "dispositivo-1", name: "Mac", created_at: "2026-01-01T00:00:00Z" };
        window.localStorage.setItem("starseed.neuron.setup.v1", "1");
        await act(async () => {
            est.oyenteAuth?.();
        });
        await waitFor(() => expect(screen.queryByTestId("ventana-bienvenida")).toBeNull());
    });
});

describe("PrimerArranque · con cuenta", () => {
    beforeEach(() => {
        est.usuario = CUENTA;
        est.perfil = { handle: "ana" };
    });

    it("una neurona que no estaba en la cuenta abre sus ajustes y avisa de lo sincronizado", async () => {
        window.localStorage.setItem("starseed.desktops.v1", JSON.stringify({ desktops: [{ id: "a" }, { id: "b" }] }));
        montar();
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
        expect(est.consultas).toEqual(expect.arrayContaining(["profiles", "neuron_devices"]));
        // El resumen se calcula tras el título; con la máquina cargada llega un instante después.
        await waitFor(() => expect(screen.getByTestId("resumen-sincronizado").textContent).toContain("2 escritorios"));

        fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
        await screen.findByRole("heading", { name: "Qué puede hacer esta neurona" });
        expect(await screen.findByRole("switch", { name: "Cómputo" })).toBeTruthy();
        expect(screen.getByRole("switch", { name: "Sentidos" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
        await screen.findByRole("heading", { name: "Calidad del fondo en esta pantalla" });
        expect(await screen.findByRole("radio", { name: /Automática/ })).toBeTruthy();
        // (Ola 381 · INI6) Último paso: pantalla inicial y bloqueo de esta neurona.
        fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
        await screen.findByRole("heading", { name: "Al abrir StarSeed aquí" });
        expect(await screen.findByRole("radiogroup", { name: "Pantalla al abrir StarSeed" })).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Listo" }));
        });
        await waitFor(() => expect(screen.queryByRole("heading", { name: /Al abrir StarSeed aquí/ })).toBeNull());
        expect(window.localStorage.getItem("starseed.neuron.setup.v1")).toBe("1");
        expect(neuronas.nombres).toEqual(["Neurona macOS"]);
    });

    it("«Más tarde» la pospone con la cuenta, por neurona (no vuelve al reiniciar)", async () => {
        montar();
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
        fireEvent.click(screen.getByRole("button", { name: "Más tarde" }));
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull());
        expect(window.sessionStorage.getItem("starseed.primer-arranque.neurona-pospuesta.v1")).toBe("1");
        expect(window.localStorage.getItem("starseed.neuron.setup.v1")).toBeNull();
        // Con la cuenta: registro `luego` de ESTA neurona, con su hora.
        const luego = estadoAviso(AVISO_NEURONA_NUEVA_LUEGO, { neurona: "dispositivo-1" });
        expect(luego.estado).toBe("luego");
        expect(luego.hasta).toBeGreaterThan(Date.now());
        // «Reiniciar» (visita nueva: sessionStorage vacío, montaje nuevo): sigue pospuesta.
        cleanup();
        window.sessionStorage.clear();
        montar();
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull());
    });

    it("«Más tarde» de OTRA neurona no pospone a esta", async () => {
        window.localStorage.setItem(
            AVISOS_KEY,
            JSON.stringify({ v: 1, ids: {}, porNeurona: { "otra-neurona": { [AVISO_NEURONA_NUEVA_LUEGO]: { estado: "luego", ts: 5, hasta: Date.now() + 3_600_000 } } } }),
        );
        _reiniciarCacheAvisosParaPruebas();
        montar();
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
    });

    it("mientras la cuenta no esté bajada NO abre los ajustes; al bajar, decide con lo que ya sabe la cuenta", async () => {
        est.cuentaFiable = false;
        montar();
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull());
        expect(est.esperasCuenta.length).toBe(1); // esperando a la cuenta, sin sondear
        // La cuenta baja y resulta que esta neurona ya estaba configurada.
        window.localStorage.setItem(
            AVISOS_KEY,
            JSON.stringify({ v: 1, ids: {}, porNeurona: { "dispositivo-1": { [AVISO_NEURONA_CONFIGURADA]: { estado: "hecho", ts: 5 } } } }),
        );
        _reiniciarCacheAvisosParaPruebas();
        est.cuentaFiable = true;
        await act(async () => {
            est.esperasCuenta.forEach((f) => f());
        });
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull());
    });

    it("con la cuenta bajada y sin nada suyo, sí abre los ajustes al volver la cuenta", async () => {
        est.cuentaFiable = false;
        montar();
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull());
        est.cuentaFiable = true;
        await act(async () => {
            est.esperasCuenta.forEach((f) => f());
        });
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
    });

    it("la cuenta dice que esta neurona ya está configurada: no abre nada", async () => {
        window.localStorage.setItem(
            AVISOS_KEY,
            JSON.stringify({ v: 1, ids: {}, porNeurona: { "dispositivo-1": { [AVISO_NEURONA_CONFIGURADA]: { estado: "hecho", ts: 5 } } } }),
        );
        _reiniciarCacheAvisosParaPruebas();
        montar();
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull());
    });

    it("una marca local antigua de «configurada» se respeta y se copia a la cuenta", async () => {
        window.localStorage.setItem("starseed.neuron.setup.v1", "1");
        montar();
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull());
        expect(estadoAviso(AVISO_NEURONA_CONFIGURADA, { neurona: "dispositivo-1" }).estado).toBe("hecho");
    });

    it("terminar deja la neurona configurada también en la cuenta", async () => {
        montar();
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
        // (2026-10-12) Ese mismo título lo lleva la fase «buscando» (mientras mira las neuronas de la
        // cuenta), que aún no tiene botones: se espera al asistente. Sin esto la prueba dependía de la
        // velocidad de la máquina y tumbó al guardián del A1 (main rojo → el A1 no prestaba).
        await screen.findByRole("button", { name: /Siguiente/ });
        for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
        await screen.findByRole("heading", { name: "Al abrir StarSeed aquí" });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Listo" }));
        });
        await waitFor(() => expect(screen.queryByRole("heading", { name: /Al abrir StarSeed aquí/ })).toBeNull());
        expect(estadoAviso(AVISO_NEURONA_CONFIGURADA, { neurona: "dispositivo-1" }).estado).toBe("hecho");
    });

    it("una neurona conocida (en la cuenta desde antes y con nombre) no abre nada", async () => {
        est.fila = { id: "dispositivo-1", name: "Mac de Ana", created_at: "2026-01-01T00:00:00Z" };
        window.localStorage.setItem("starseed.neurons.prefs.v1", JSON.stringify({ names: { "dispositivo-1": "Mac de Ana" } }));
        montar();
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull());
        expect(screen.queryByTestId("ventana-bienvenida")).toBeNull();
    });

    it("una cuenta recién creada sin perfil la deja al asistente de alta", async () => {
        est.perfil = null;
        montar();
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull());
    });

    it("(NEU1107B) en la app nativa, tras iniciar sesión, abre «Esta neurona» antes que «Neurona nueva», y lo mira una sola vez", async () => {
        bienv.mostrar = true;
        montar();
        const ventana = await screen.findByTestId("bienvenida-neurona");
        expect(ventana.getAttribute("data-manual")).toBe("0");
        expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull();
        // Un refresco del token (otro evento de sesión) no vuelve a leer las neuronas.
        await act(async () => {
            est.oyenteAuth?.();
        });
        expect(bienv.lecturas).toBe(1);
        fireEvent.click(screen.getByRole("button", { name: "Cerrar «Esta neurona»" }));
        await waitFor(() => expect(screen.queryByTestId("bienvenida-neurona")).toBeNull());
    });

    it("(NEU1107B) en la app nativa, si no toca (ya vista), sigue «Neurona nueva» como siempre", async () => {
        montar();
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
        expect(screen.queryByTestId("bienvenida-neurona")).toBeNull();
        expect(bienv.lecturas).toBe(1);
    });

    it("(NEU1107B) en la web no se abre sola (ni lee nada), pero sí a mano desde Ajustes", async () => {
        est.nativa = false;
        bienv.mostrar = true;
        est.fila = { id: "dispositivo-1", name: "Mac de Ana", created_at: "2026-01-01T00:00:00Z" };
        window.localStorage.setItem("starseed.neurons.prefs.v1", JSON.stringify({ names: { "dispositivo-1": "Mac de Ana" } }));
        montar();
        await waitFor(() => expect(est.consultas).toContain("neuron_devices"));
        expect(screen.queryByTestId("bienvenida-neurona")).toBeNull();
        expect(bienv.lecturas).toBe(0);
        await act(async () => {
            window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_BIENVENIDA_NEURONA));
        });
        expect((await screen.findByTestId("bienvenida-neurona")).getAttribute("data-manual")).toBe("1");
    });
});
