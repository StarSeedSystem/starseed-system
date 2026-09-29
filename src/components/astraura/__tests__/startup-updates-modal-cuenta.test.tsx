/**
 * StartupUpdatesModal con la cuenta (2026-09-29, persistencia entre medios).
 *
 * «Hay ventanas que reaparecen al reiniciar». El envoltorio decidía a los 1,2 s con el medio
 * vacío y cada cierre dejaba (o no) una marca local. Aquí se monta el envoltorio real (con el
 * contenido y los porteros ajenos sustituidos) y se comprueba:
 *  · NO decide mientras la cuenta no sea fiable (nada de «nunca visto» a ciegas);
 *  · con la cuenta ya configurada (o un «visto» local antiguo) no abre nada;
 *  · medio nuevo y cuenta vacía → abre la ventana grande;
 *  · cambio de catálogo → aviso pequeño con «Ver», no ventana, y solo una vez;
 *  · toda vía de cierre deja rastro con la cuenta (cerrar sin aplicar, «recordar luego», aplicar).
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctl = vi.hoisted(() => ({
    listos: [] as Array<() => void>,
    toast: vi.fn(),
}));

vi.mock("@/lib/sync/realtime-sync", () => ({
    // El test decide CUÁNDO la cuenta pasa a ser fiable (`ctl.listos`).
    cuandoCuentaFiable: (cb: () => void) => {
        ctl.listos.push(cb);
        return () => {
            ctl.listos = ctl.listos.filter((f) => f !== cb);
        };
    },
}));
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => ctl.toast(...a) }));
vi.mock("@/lib/aurora/setup-config", () => ({
    isSetupPending: () => false,
    subscribeSetup: () => () => undefined,
    markSetupDone: () => undefined,
}));
vi.mock("@/lib/onboarding/director-rito", () => ({
    esMiTurno: () => false,
    terminarEtapa: () => undefined,
    suscribirRito: () => () => undefined,
}));
vi.mock("@/hooks/use-modal-a11y", () => ({ useModalA11y: () => undefined }));
vi.mock("@/components/onboarding/icono-starseed", () => ({ IconoStarSeed: () => null }));
vi.mock("@/lib/ui/rito-activo", () => ({ marcarRitoActivo: () => undefined }));
vi.mock("@/lib/ui/fullscreen-modal", () => ({
    alLiberarsePrimerPlano: (cb: () => void) => {
        cb();
        return () => undefined;
    },
    primerPlanoOcupado: () => false,
    subscribeFullscreenModal: () => () => undefined,
}));
vi.mock("@/components/astraura/astraura-omnivoice-config", async () => {
    const su = await import("@/lib/astraura/startup-updates");
    return {
        AstrauraOmniVoiceConfig: (p: { onApply?: () => void; onDismiss?: () => void }) => (
            <div data-testid="contenido">
                <button onClick={() => { su.markUpdatesSeen({ autoUpdate: true, strategy: "auto" }); p.onApply?.(); }}>aplicar</button>
                <button onClick={() => p.onDismiss?.()}>cerrar-sin-aplicar</button>
                <button onClick={() => { su.snoozeUpdates(); p.onDismiss?.(); }}>recordar-luego</button>
            </div>
        ),
    };
});

import { StartupUpdatesModal } from "../startup-updates-modal";
import {
    AVISO_CATALOGO_PREFIJO,
    AVISO_SISTEMAS_INICIO,
    AVISO_SISTEMAS_LUEGO,
    STARTUP_UPDATES_KEY,
    catalogIds,
    catalogSignature,
    decidirArranque,
} from "@/lib/astraura/startup-updates";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";

const SIG = catalogSignature();

function cuenta(ids: Record<string, { estado: "visto" | "hecho" | "luego"; ts: number; hasta?: number }>): void {
    localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids, porNeurona: {} }));
    _reiniciarCacheAvisosParaPruebas();
}

/** Deja pasar el retardo de 1,2 s y avisa al envoltorio de que la cuenta ya es fiable. */
async function arrancarConCuentaFiable(): Promise<void> {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(1300);
    });
    expect(ctl.listos.length).toBe(1);
    await act(async () => {
        ctl.listos.forEach((f) => f());
        await vi.advanceTimersByTimeAsync(50);
    });
}

beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-29T10:00:00Z"), toFake: ["setTimeout", "clearTimeout", "Date"] });
    localStorage.clear();
    localStorage.setItem("starseed.neuron.device-id", "neurona-modal");
    _reiniciarCacheAvisosParaPruebas();
    ctl.listos = [];
    ctl.toast.mockClear();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("StartupUpdatesModal", () => {
    it("mientras la cuenta no sea fiable NO decide: ni ventana ni aviso", async () => {
        render(<StartupUpdatesModal />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(20_000);
        });
        expect(ctl.listos.length).toBe(1); // esperando a la cuenta
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(ctl.toast).not.toHaveBeenCalled();
    });

    it("medio nuevo y cuenta vacía: abre la ventana grande (primera configuración)", async () => {
        render(<StartupUpdatesModal />);
        await arrancarConCuentaFiable();
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(ctl.toast).not.toHaveBeenCalled();
    });

    it("la cuenta ya lo tiene configurado y visto: no abre nada", async () => {
        cuenta({ [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 }, [AVISO_CATALOGO_PREFIJO + SIG]: { estado: "visto", ts: 6 } });
        render(<StartupUpdatesModal />);
        await arrancarConCuentaFiable();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(ctl.toast).not.toHaveBeenCalled();
    });

    it("un «visto» local antiguo se respeta y se copia a la cuenta", async () => {
        localStorage.setItem(STARTUP_UPDATES_KEY, JSON.stringify({ firstRunDone: true, lastSig: SIG, lastCatalog: catalogIds() }));
        render(<StartupUpdatesModal />);
        await arrancarConCuentaFiable();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(estadoAviso(AVISO_SISTEMAS_INICIO).estado).toBe("hecho");
        expect(estadoAviso(AVISO_CATALOGO_PREFIJO + SIG).estado).toBe("visto");
    });

    it("cambio de catálogo: aviso pequeño con «Ver», sin ventana, sellado en la cuenta", async () => {
        cuenta({ [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 } });
        localStorage.setItem(
            STARTUP_UPDATES_KEY,
            JSON.stringify({ firstRunDone: true, lastSig: "firma-vieja", lastCatalog: catalogIds().slice(1), autoUpdate: true }),
        );
        render(<StartupUpdatesModal />);
        await arrancarConCuentaFiable();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(ctl.toast).toHaveBeenCalledTimes(1);
        const [titulo, opciones] = ctl.toast.mock.calls[0] as [string, { action: { label: string }; description: string }];
        expect(titulo).toBe("Astraura tiene novedades");
        expect(opciones.action.label).toBe("Ver");
        expect(opciones.description).toMatch(/nuev/);
        expect(estadoAviso(AVISO_CATALOGO_PREFIJO + SIG).estado).toBe("visto");
        // En otro arranque (o en otro medio) ya no se repite.
        expect(decidirArranque().accion).toBe("nada");
    });

    it("«Ver» del aviso abre la ventana con el detalle", async () => {
        cuenta({ [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 } });
        localStorage.setItem(STARTUP_UPDATES_KEY, JSON.stringify({ firstRunDone: true, lastSig: "firma-vieja", lastCatalog: catalogIds().slice(1) }));
        render(<StartupUpdatesModal />);
        await arrancarConCuentaFiable();
        const accion = (ctl.toast.mock.calls[0][1] as { action: { onClick: () => void } }).action;
        await act(async () => {
            accion.onClick();
        });
        expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("cerrar SIN aplicar (enlace, botón «Cerrar») pospone con la cuenta y no reabre", async () => {
        render(<StartupUpdatesModal />);
        await arrancarConCuentaFiable();
        await act(async () => {
            screen.getByText("cerrar-sin-aplicar").click();
        });
        expect(screen.queryByRole("dialog")).toBeNull();
        const luego = estadoAviso(AVISO_SISTEMAS_LUEGO);
        expect(luego.estado).toBe("luego");
        expect(luego.hasta).toBeGreaterThan(Date.now());
        expect(decidirArranque()).toEqual({ accion: "nada", motivo: "pospuesto" });
    });

    it("«Recordar luego» pospone una sola vez (no reescribe el plazo al cerrar)", async () => {
        render(<StartupUpdatesModal />);
        await arrancarConCuentaFiable();
        await act(async () => {
            screen.getByText("recordar-luego").click();
        });
        const primero = estadoAviso(AVISO_SISTEMAS_LUEGO);
        expect(primero.estado).toBe("luego");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(estadoAviso(AVISO_SISTEMAS_LUEGO)).toBe(primero); // el cierre no volvió a marcar
    });

    it("aplicar deja hecha la primera configuración y la firma vista en la cuenta", async () => {
        render(<StartupUpdatesModal />);
        await arrancarConCuentaFiable();
        await act(async () => {
            screen.getByText("aplicar").click();
        });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(estadoAviso(AVISO_SISTEMAS_INICIO).estado).toBe("hecho");
        expect(estadoAviso(AVISO_CATALOGO_PREFIJO + SIG).estado).toBe("visto");
        expect(estadoAviso(AVISO_SISTEMAS_LUEGO).estado).toBeNull();
    });

    it("un «recordar luego» vigente en la cuenta no se salta su hora", async () => {
        cuenta({ [AVISO_SISTEMAS_LUEGO]: { estado: "luego", ts: 5, hasta: Date.now() + 3 * 3_600_000 } });
        render(<StartupUpdatesModal />);
        await arrancarConCuentaFiable();
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
