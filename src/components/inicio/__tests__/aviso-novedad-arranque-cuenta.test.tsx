/**
 * AvisoNovedadArranque con la cuenta (2026-09-29, persistencia entre medios).
 * La novedad de bloqueo/pantalla inicial salía en cada medio (localhost, Vercel, PWA, Tauri) porque
 * su «ya respondí» era una clave local. Aquí se monta el envoltorio real y se comprueba:
 *  · no decide mientras la cuenta no sea fiable;
 *  · medio nuevo, cuenta antigua sin respuesta → aparece;
 *  · la cuenta ya lo tiene respondido (otro medio) → no aparece;
 *  · una respuesta local antigua se respeta y se copia a la cuenta;
 *  · responder («más tarde») deja huella en la cuenta.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctl = vi.hoisted(() => ({ listos: [] as Array<() => void> }));

vi.mock("@/lib/sync/realtime-sync", () => ({
    cuandoCuentaFiable: (cb: () => void) => {
        ctl.listos.push(cb);
        return () => {
            ctl.listos = ctl.listos.filter((f) => f !== cb);
        };
    },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/escritorios", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }),
}));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: { getUser: async () => ({ data: { user: { created_at: "2026-01-01T00:00:00Z", is_anonymous: false } } }) },
    }),
}));
vi.mock("@/components/inicio/preferencias-arranque", () => ({ PreferenciasArranque: () => null }));

import { AvisoNovedadArranque } from "../aviso-novedad-arranque";
import { AVISO_NOVEDAD_ARRANQUE, CLAVE_AVISO_NOVEDAD_ARRANQUE } from "@/lib/inicio/aviso-novedad";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";

async function cuentaListaYPasa(ms = 4500): Promise<void> {
    await act(async () => {
        ctl.listos.forEach((f) => f());
        await vi.advanceTimersByTimeAsync(ms);
    });
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    localStorage.clear();
    _reiniciarCacheAvisosParaPruebas();
    ctl.listos = [];
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: (q: string) => ({
            matches: false,
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
    vi.useRealTimers();
});

describe("AvisoNovedadArranque · con la cuenta", () => {
    it("mientras la cuenta no sea fiable no decide, pase el tiempo que pase", async () => {
        render(<AvisoNovedadArranque />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(screen.queryByTestId("aviso-novedad-arranque")).toBeNull();
        expect(ctl.listos.length).toBe(1);
    });

    it("medio nuevo, cuenta antigua sin respuesta: aparece tras la calma", async () => {
        render(<AvisoNovedadArranque />);
        await cuentaListaYPasa();
        expect(screen.getByTestId("aviso-novedad-arranque")).toBeTruthy();
    });

    it("otro medio ya respondió «configurado» / «no volver a mostrar»: no aparece", async () => {
        for (const estado of ["hecho", "visto"] as const) {
            localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids: { [AVISO_NOVEDAD_ARRANQUE]: { estado, ts: 5 } }, porNeurona: {} }));
            _reiniciarCacheAvisosParaPruebas();
            ctl.listos = [];
            const { unmount } = render(<AvisoNovedadArranque />);
            await cuentaListaYPasa();
            expect(screen.queryByTestId("aviso-novedad-arranque")).toBeNull();
            unmount();
        }
    });

    it("otro medio dijo «más tarde» hace poco: no aparece todavía", async () => {
        const ahora = Date.now();
        localStorage.setItem(
            AVISOS_KEY,
            JSON.stringify({ v: 1, ids: { [AVISO_NOVEDAD_ARRANQUE]: { estado: "luego", ts: ahora - 1000, hasta: ahora + 86_400_000 } }, porNeurona: {} }),
        );
        _reiniciarCacheAvisosParaPruebas();
        render(<AvisoNovedadArranque />);
        await cuentaListaYPasa();
        expect(screen.queryByTestId("aviso-novedad-arranque")).toBeNull();
    });

    it("una respuesta local antigua se respeta y se copia a la cuenta", async () => {
        localStorage.setItem(CLAVE_AVISO_NOVEDAD_ARRANQUE, JSON.stringify({ respuesta: "no-mostrar", fecha: 1234 }));
        render(<AvisoNovedadArranque />);
        await cuentaListaYPasa();
        expect(screen.queryByTestId("aviso-novedad-arranque")).toBeNull();
        expect(estadoAviso(AVISO_NOVEDAD_ARRANQUE).estado).toBe("visto");
    });

    it("«Recordármelo más tarde» deja la respuesta en este medio y en la cuenta", async () => {
        render(<AvisoNovedadArranque />);
        await cuentaListaYPasa();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Recordármelo más tarde" }));
        });
        expect(screen.queryByTestId("aviso-novedad-arranque")).toBeNull();
        expect(JSON.parse(localStorage.getItem(CLAVE_AVISO_NOVEDAD_ARRANQUE)!).respuesta).toBe("luego");
        expect(estadoAviso(AVISO_NOVEDAD_ARRANQUE).estado).toBe("luego");
    });

    it("si se desmonta antes de que la cuenta responda, no queda nada esperando", () => {
        const { unmount } = render(<AvisoNovedadArranque />);
        expect(ctl.listos.length).toBe(1);
        unmount();
        expect(ctl.listos.length).toBe(0);
    });
});
