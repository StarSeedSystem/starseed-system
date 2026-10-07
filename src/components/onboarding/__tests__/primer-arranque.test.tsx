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

import { PrimerArranque } from "../primer-arranque";
import { AVISO_NEURONA_CONFIGURADA, AVISO_NEURONA_NUEVA_LUEGO } from "@/lib/onboarding/primer-arranque";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";

const CUENTA: Usuario = { id: "u-1", email: "ana@star.seed" };

function montar() {
    return render(
        <AppearanceProvider>
            <PrimerArranque esperaMs={5} />
        </AppearanceProvider>,
    );
}

/** Deja correr los temporizadores de cortesía y las promesas simuladas. */
const pausa = (ms = 80) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

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
    neuronas.nombres = [];
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
        fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
        await screen.findByRole("heading", { name: "Gestos naturales en cualquier pantalla" });
        expect(await screen.findByTestId("demo-gestos")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Crear cuenta o entrar/ }));
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        expect((await screen.findByTestId("auth-form")).getAttribute("data-pestana")).toBe("signup");
    });

    it("«Ya tengo cuenta» salta directo al formulario en «Entrar»", async () => {
        montar();
        await screen.findByTestId("ventana-bienvenida");
        fireEvent.click(screen.getByRole("button", { name: "Ya tengo cuenta" }));
        await screen.findByRole("heading", { name: "Crea tu cuenta o entra" });
        expect((await screen.findByTestId("auth-form")).getAttribute("data-pestana")).toBe("signin");
    });

    it("«Explorar sin cuenta» la cierra y ya no vuelve sola en este dispositivo", async () => {
        const primera = montar();
        await screen.findByTestId("ventana-bienvenida");
        fireEvent.click(screen.getByRole("button", { name: "Explorar sin cuenta" }));
        await waitFor(() => expect(screen.queryByTestId("ventana-bienvenida")).toBeNull());
        expect(window.localStorage.getItem("starseed.primer-arranque.saltado.v1")).toBe("1");
        primera.unmount();

        montar();
        await pausa();
        expect(screen.queryByTestId("ventana-bienvenida")).toBeNull();
    });

    it("se puede abrir a mano aunque se hubiera saltado", async () => {
        window.localStorage.setItem("starseed.primer-arranque.saltado.v1", "1");
        montar();
        await pausa();
        expect(screen.queryByTestId("ventana-bienvenida")).toBeNull();
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

    it("en la consola de Genesis no abre nada", async () => {
        est.ruta = "/mando";
        montar();
        await pausa();
        expect(screen.queryByTestId("ventana-bienvenida")).toBeNull();
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
        expect(screen.getByTestId("resumen-sincronizado").textContent).toContain("2 escritorios");

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
        await pausa(200);
        expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull();
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
        await pausa(200);
        expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull();
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
        await pausa(200);
        expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull();
    });

    it("con la cuenta bajada y sin nada suyo, sí abre los ajustes al volver la cuenta", async () => {
        est.cuentaFiable = false;
        montar();
        await pausa(100);
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
        await pausa(200);
        expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull();
    });

    it("una marca local antigua de «configurada» se respeta y se copia a la cuenta", async () => {
        window.localStorage.setItem("starseed.neuron.setup.v1", "1");
        montar();
        await pausa(200);
        expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull();
        expect(estadoAviso(AVISO_NEURONA_CONFIGURADA, { neurona: "dispositivo-1" }).estado).toBe("hecho");
    });

    it("terminar deja la neurona configurada también en la cuenta", async () => {
        montar();
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
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
        await pausa();
        expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull();
        expect(screen.queryByTestId("ventana-bienvenida")).toBeNull();
    });

    it("una cuenta recién creada sin perfil la deja al asistente de alta", async () => {
        est.perfil = null;
        montar();
        await pausa();
        expect(screen.queryByRole("heading", { name: "Nueva neurona en tu cuenta" })).toBeNull();
    });
});
