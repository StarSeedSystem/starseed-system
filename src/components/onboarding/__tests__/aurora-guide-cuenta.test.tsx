/**
 * La guía de bienvenida con la cuenta (2026-09-29, persistencia entre medios).
 * Se abría sola en cada medio porque «ya la vi» era una marca local. Ahora:
 *  · espera a que la cuenta sea fiable antes de decidir;
 *  · «vista» en cualquier medio de la cuenta (o marca local antigua) no la abre;
 *  · medio nuevo con el intro hecho y cuenta sin registro → se abre sola;
 *  · cerrarla deja la marca en el medio y en la cuenta.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
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
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/otra-pagina", // fuera del rito: solo cuenta la primera visita
}));
vi.mock("next/image", () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: (p: { alt: string; src: string }) => <img alt={p.alt} src={p.src} />,
}));
vi.mock("@/context/perimeter-context", () => ({
    usePerimeter: () => ({ activeEdge: null, setActiveEdge: vi.fn() }),
}));

import { AuroraGuide } from "../aurora-guide";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";
import { AVISO_GUIA_BIENVENIDA, CLAVE_GUIA_VISTA_LOCAL } from "@/lib/onboarding/guia-vista";

function cuenta(ids: Record<string, { estado: "visto" | "hecho" | "luego"; ts: number }>): void {
    localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids, porNeurona: {} }));
    _reiniciarCacheAvisosParaPruebas();
}

async function cuentaListaYPasa(ms = 1500): Promise<void> {
    await act(async () => {
        ctl.listos.forEach((f) => f());
        await vi.advanceTimersByTimeAsync(ms);
    });
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    localStorage.clear();
    localStorage.setItem("starseed.aurora.intro.v1", "1"); // el intro ya está hecho
    _reiniciarCacheAvisosParaPruebas();
    ctl.listos = [];
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

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("AuroraGuide · primera visita con la cuenta", () => {
    it("no decide mientras la cuenta no sea fiable (ni con tiempo de sobra)", async () => {
        render(<AuroraGuide />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(ctl.listos.length).toBe(1);
        expect(screen.queryByRole("dialog", { name: "Guía de StarSeed" })).toBeNull();
    });

    it("medio nuevo, intro hecho y cuenta sin registro: se abre sola", async () => {
        render(<AuroraGuide />);
        await cuentaListaYPasa();
        expect(screen.getByRole("dialog", { name: "Guía de StarSeed" })).toBeTruthy();
    });

    it("vista ya en otro medio de la cuenta: no se abre", async () => {
        cuenta({ [AVISO_GUIA_BIENVENIDA]: { estado: "hecho", ts: 10 } });
        render(<AuroraGuide />);
        await cuentaListaYPasa();
        expect(screen.queryByRole("dialog", { name: "Guía de StarSeed" })).toBeNull();
    });

    it("marca local antigua: no se abre y se copia a la cuenta", async () => {
        localStorage.setItem(CLAVE_GUIA_VISTA_LOCAL, "1");
        render(<AuroraGuide />);
        await cuentaListaYPasa();
        expect(screen.queryByRole("dialog", { name: "Guía de StarSeed" })).toBeNull();
        expect(estadoAviso(AVISO_GUIA_BIENVENIDA).estado).toBe("hecho");
    });

    it("sin intro de Aurora hecho no se abre sola (no se solapan dos ventanas)", async () => {
        localStorage.removeItem("starseed.aurora.intro.v1");
        render(<AuroraGuide />);
        await cuentaListaYPasa();
        expect(screen.queryByRole("dialog", { name: "Guía de StarSeed" })).toBeNull();
    });

    it("cerrarla deja la marca en este medio y en la cuenta", async () => {
        render(<AuroraGuide />);
        await cuentaListaYPasa();
        await act(async () => {
            screen.getAllByRole("button", { name: "Cerrar la guía" })[0].click();
            await vi.advanceTimersByTimeAsync(50);
        });
        expect(localStorage.getItem(CLAVE_GUIA_VISTA_LOCAL)).toBe("1");
        expect(estadoAviso(AVISO_GUIA_BIENVENIDA).estado).toBe("hecho");
    });

    it("si se desmonta antes de que la cuenta responda, no queda nada esperando", () => {
        const { unmount } = render(<AuroraGuide />);
        expect(ctl.listos.length).toBe(1);
        unmount();
        expect(ctl.listos.length).toBe(0);
    });
});
