/**
 * GUI1021K1b (parte 1 de GUI1021K1) · «Conoce StarSeed» en la puerta de acceso.
 * ═══════════════════════════════════════════════════════════════════════════
 * (§5 de `architecture/guias-introduccion.md`) Desde AuthGate —la puerta del acceso, montada en
 * `app-providers.tsx`— sale la ventana única (`PaginaAcceso`) y en ella, bajo los dos modos
 * (Entrar y Crear cuenta), el botón secundario que abre la guía SIN iniciar sesión ni crear nada,
 * por la puerta común (`abrirGuia`) con `desde: "login"`: esta pantalla YA no es la ruta
 * `/bienvenida` (que monta su propia `PaginaAcceso`); es el portero de toda la sección.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as renderCrudo, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

import { AppearanceProvider } from "@/context/appearance-context";
import { AuthGate } from "../auth-gate";

const sim = vi.hoisted(() => ({
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signUp: vi.fn(async () => ({ error: null, data: { session: null } })),
    signInAnonymously: vi.fn(async () => ({ error: null })),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/escritorios",
}));

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: {
            signInWithPassword: sim.signInWithPassword,
            signUp: sim.signUp,
            signInAnonymously: sim.signInAnonymously,
            setSession: vi.fn(async () => ({ error: null })),
            getSession: async () => ({ data: { session: null } }),
            getUser: async () => ({ data: { user: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        },
    }),
}));

/** Escucha la guía como lo hace `aurora-guide.tsx` y devuelve lo que llegó. */
function escucharGuia() {
    const recibidos: { desde: string }[] = [];
    const oir = (e: Event) => recibidos.push((e as CustomEvent<{ desde: string }>).detail);
    window.addEventListener("starseed:open-guide", oir);
    return { recibidos, parar: () => window.removeEventListener("starseed:open-guide", oir) };
}

const render = (ui: ReactElement): ReturnType<typeof renderCrudo> => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
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

describe("AuthGate · «Conoce StarSeed» sin cuenta (GUI1021K1b)", () => {
    const NOMBRE = "Conoce StarSeed";

    it("en el modo Entrar, el botón abre la guía por la puerta común con «desde: login»", async () => {
        const guia = escucharGuia();
        render(<AuthGate />);
        expect(await screen.findByRole("tab", { name: "Entrar" })).toHaveAttribute("aria-selected", "true");
        fireEvent.click(await screen.findByRole("button", { name: NOMBRE }));
        guia.parar();

        expect(guia.recibidos).toEqual([{ desde: "login" }]);
        // Honestidad: abrir la guía no inicia sesión ni crea cuenta por su cuenta,
        // y el modo del formulario queda tal cual («Entrar» sigue elegido).
        expect(sim.signInWithPassword).not.toHaveBeenCalled();
        expect(sim.signUp).not.toHaveBeenCalled();
        expect(sim.signInAnonymously).not.toHaveBeenCalled();
        expect(screen.getByRole("tab", { name: "Entrar" })).toHaveAttribute("aria-selected", "true");
    });

    it("al pasar a Crear cuenta el botón sigue ahí y sigue abriendo con «desde: login»", async () => {
        const guia = escucharGuia();
        render(<AuthGate />);
        fireEvent.click(await screen.findByRole("tab", { name: "Crear cuenta" }));
        expect(screen.getByRole("tab", { name: "Crear cuenta" })).toHaveAttribute("aria-selected", "true");

        fireEvent.click(screen.getByRole("button", { name: NOMBRE }));
        guia.parar();

        expect(guia.recibidos).toEqual([{ desde: "login" }]);
        expect(sim.signUp).not.toHaveBeenCalled();
    });

    it("es accesible por teclado y diana táctil (44 px, cursor pointer)", async () => {
        const guia = escucharGuia();
        const usuario = userEvent.setup();
        render(<AuthGate />);
        const boton = await screen.findByRole("button", { name: NOMBRE });

        expect(boton.className).toContain("min-h-[44px]");
        expect(boton.className).toContain("cursor-pointer");
        boton.focus();
        expect(boton).toHaveFocus();
        // Teclado real: Enter y Espacio disparan el click nativo del botón (uno por pulsación).
        await usuario.keyboard("{Enter}");
        await usuario.keyboard(" ");
        guia.parar();

        expect(guia.recibidos).toEqual([{ desde: "login" }, { desde: "login" }]);
    });
});
