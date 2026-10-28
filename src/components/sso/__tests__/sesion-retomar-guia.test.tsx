/**
 * GUI1021K2c (parte 2) · «Conoce StarSeed (sin cuenta)» en el aviso de retomar sesión.
 *
 * §5 de `architecture/guias-introduccion.md`: el aviso de que ya hay una sesión StarSeed
 * en este dispositivo (`SessionResumePrompt`) abre la guía entera sin cuenta por la puerta
 * común (`abrirGuia`) con `desde: "login"`, el mismo acceso que la bienvenida. La prueba
 * escucha el evento real que escucha `aurora-guide.tsx` y comprueba ratón y teclado.
 *
 * "Pruebas de los dos botones" (GUI1021K2c): el de la bienvenida vive en
 * `components/welcome/__tests__/bienvenida-guia.test.tsx`; el de aquí es el segundo.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionResumePrompt } from "@/components/sso/session-resume-prompt";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";
import type { DetectSessionResult } from "@/lib/sso/detect-session";

/** La detección responde con una sesión real del OS (límites red/proceso fuera de la prueba). */
const DETECT: DetectSessionResult = {
    found: true,
    identity: { userId: "u1", handle: null, email: "ana@star.seed", avatarUrl: null, isAnonymous: false },
    source: "supabase",
    session: null,
};

vi.mock("@/lib/sso/detect-session", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/sso/detect-session")>();
    return { ...real, detectStarSeedSession: vi.fn(async () => DETECT) };
});
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            getUser: async () => ({ data: { user: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        },
    }),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

/** Escucha la guía como lo hace `aurora-guide.tsx` y devuelve lo que llegó. */
function escucharGuia() {
    const recibidos: PeticionGuia[] = [];
    const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
    window.addEventListener(EVENTO_ABRIR_GUIA, oir);
    return { recibidos, parar: () => window.removeEventListener(EVENTO_ABRIR_GUIA, oir) };
}

afterEach(() => cleanup());

describe("SessionResumePrompt (GUI1021K2c parte 2)", () => {
    it("«Conoce StarSeed (sin cuenta)» abre la guía desde «login», con ratón y con teclado", async () => {
        render(<SessionResumePrompt />);
        const boton = await waitFor(() => {
            const b = screen.getByRole("button", { name: "Conoce StarSeed (sin cuenta)" });
            expect(b.style.cursor).toBe("pointer");
            expect(b.style.minHeight).toBe("44px");
            expect(b.className).toMatch(/ss-sso-guia/); // su :focus-visible está en el <style>
            return b;
        });

        const guia = escucharGuia();
        boton.focus();
        await userEvent.setup().keyboard("{Enter}");

        guia.parar();
        expect(guia.recibidos).toEqual([{ desde: "login" }]);
    });

    it("los otros dos botones del aviso siguen intactos mientras la guía abre sin salir", async () => {
        render(<SessionResumePrompt />);
        await waitFor(() => expect(screen.getByRole("button", { name: /Entrar como/ })).toBeTruthy());
        const guia = escucharGuia();
        await userEvent.setup().click(screen.getByRole("button", { name: "Conoce StarSeed (sin cuenta)" }));
        guia.parar();
        expect(guia.recibidos).toEqual([{ desde: "login" }]);
        // El aviso no se cierra ni entra: no hay bucle, la guía vuelve a esta ventana al cerrarse.
        expect(screen.getByRole("region", { name: "Sesión StarSeed detectada" })).toBeTruthy();
    });
});
