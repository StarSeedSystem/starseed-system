/**
 * «Configurar Neurona» (AuroraSetupCenter) con la cuenta (2026-09-29, persistencia entre medios).
 *
 * Los tres gates de apertura automática (tras el alta, al entrar en AI Studio, al abrir Aurora)
 * decidían con el medio vacío. Ahora esperan a la cuenta; si la cuenta ya lo tiene hecho, o este
 * medio lo tenía en su clave antigua, no se abre; cualquier cierre lo deja hecho con la cuenta.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctl = vi.hoisted(() => ({
    listos: [] as Array<() => void>,
    pathname: "/dashboard",
    usuario: { id: "u1" } as { id: string } | null,
    onboardingCompleto: true,
}));

vi.mock("@/lib/sync/realtime-sync", () => ({
    cuandoCuentaFiable: (cb: () => void) => {
        ctl.listos.push(cb);
        return () => {
            ctl.listos = ctl.listos.filter((f) => f !== cb);
        };
    },
}));
vi.mock("next/navigation", () => ({ usePathname: () => ctl.pathname }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: ctl.usuario } }) } }),
}));
vi.mock("@/lib/onboarding/onboarding", () => ({ getOnboarding: async () => ({ completed: ctl.onboardingCompleto }) }));
vi.mock("@/components/ui/section-tabs", () => ({ SectionTabs: () => null }));
vi.mock("../setup/setup-bienvenida", () => ({
    DEFAULT_ANSWERS: {},
    SetupBienvenida: () => null,
    applyBienvenida: () => undefined,
}));

import { AuroraSetupCenter } from "../setup/aurora-setup-center";
import { AURORA_SETUP_KEY, AVISO_SETUP_CENTRO, SETUP_VERSION, isSetupPending } from "@/lib/aurora/setup-config";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";

async function cuentaFiable(ms = 1500): Promise<void> {
    await act(async () => {
        ctl.listos.forEach((f) => f());
        await vi.advanceTimersByTimeAsync(ms);
    });
}

beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-29T10:00:00Z"), toFake: ["setTimeout", "clearTimeout", "Date"] });
    localStorage.clear();
    _reiniciarCacheAvisosParaPruebas();
    ctl.listos = [];
    ctl.pathname = "/dashboard";
    ctl.usuario = { id: "u1" };
    ctl.onboardingCompleto = true;
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("AuroraSetupCenter · gates con la cuenta", () => {
    it("no se abre solo mientras la cuenta no sea fiable", async () => {
        render(<AuroraSetupCenter />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(ctl.listos.length).toBeGreaterThan(0); // esperando a la cuenta
    });

    it("primera vez de verdad (cuenta bajada y vacía): se ofrece tras el alta", async () => {
        render(<AuroraSetupCenter />);
        await cuentaFiable();
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(screen.getByText("Configurar Neurona")).toBeTruthy();
    });

    it("medio nuevo de una cuenta ya configurada: NO se ofrece", async () => {
        localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids: { [AVISO_SETUP_CENTRO]: { estado: "hecho", ts: 5 } }, porNeurona: {} }));
        _reiniciarCacheAvisosParaPruebas();
        render(<AuroraSetupCenter />);
        await cuentaFiable();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("un «hecho» antiguo de la clave local no se ofrece y se copia a la cuenta", async () => {
        localStorage.setItem(AURORA_SETUP_KEY, JSON.stringify({ done: true, version: SETUP_VERSION, at: "2026-08-01T00:00:00Z" }));
        render(<AuroraSetupCenter />);
        await cuentaFiable();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(estadoAviso(AVISO_SETUP_CENTRO).estado).toBe("hecho");
    });

    it("sin sesión (invitado) no se ofrece: primero el alta", async () => {
        ctl.usuario = null;
        render(<AuroraSetupCenter />);
        await cuentaFiable();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("en AI Studio con el perfil sin configurar se ofrece, pero solo con la cuenta ya fiable", async () => {
        ctl.pathname = "/agent";
        ctl.usuario = null; // aísla el gate 2 del gate 1
        render(<AuroraSetupCenter />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(screen.queryByRole("dialog")).toBeNull();
        await cuentaFiable(600);
        expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("al abrir Aurora por primera vez se ofrece, pero solo con la cuenta ya fiable", async () => {
        ctl.usuario = null;
        render(<AuroraSetupCenter />);
        await act(async () => {
            window.dispatchEvent(new Event(AURORA_EXOCORTEX_OPEN_EVENT));
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(screen.queryByRole("dialog")).toBeNull();
        await cuentaFiable(900);
        expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("cerrar (X) lo deja hecho con la cuenta y no vuelve a ofrecerse", async () => {
        render(<AuroraSetupCenter />);
        await cuentaFiable();
        await act(async () => {
            screen.getByLabelText("Cerrar").click();
        });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(estadoAviso(AVISO_SETUP_CENTRO).estado).toBe("hecho");
        expect(isSetupPending()).toBe(false);
    });

    it("Escape también deja rastro", async () => {
        render(<AuroraSetupCenter />);
        await cuentaFiable();
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(estadoAviso(AVISO_SETUP_CENTRO).estado).toBe("hecho");
    });
});
