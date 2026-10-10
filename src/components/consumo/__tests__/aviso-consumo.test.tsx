import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const est = vi.hoisted(() => {
    const limpio = Object.freeze({ corte: false, corteHasta: null as number | null, frenoLocalHasta: null as number | null, diaAgotado: false });
    return {
        limpio,
        aviso: limpio as { corte: boolean; corteHasta: number | null; frenoLocalHasta: number | null; diaAgotado: boolean },
        oyentes: new Set<() => void>(),
        freno: Object.freeze({ activo: false, motivo: null as string | null, hasta: null as string | null }) as {
            activo: boolean;
            motivo: string | null;
            hasta: string | null;
        },
    };
});

vi.mock("@/lib/consumo/guardian", () => ({
    PRESUPUESTO_DIA: 8000,
    leerAvisoConsumo: () => est.aviso,
    avisoConsumoServidor: () => est.limpio,
    suscribirConsumo: (o: () => void) => {
        est.oyentes.add(o);
        return () => est.oyentes.delete(o);
    },
}));
vi.mock("@/lib/consumo/freno", () => ({ useFreno: () => est.freno }));

import { AvisoConsumo, describirAviso } from "../aviso-consumo";

const AHORA = Date.parse("2026-09-29T10:00:00Z");
const INACTIVO = { activo: false, motivo: null, hasta: null };

function fijarAviso(parcial: Partial<typeof est.aviso>) {
    est.aviso = Object.freeze({ ...est.limpio, ...parcial });
    act(() => {
        for (const o of est.oyentes) o();
    });
}

afterEach(() => {
    cleanup();
    est.aviso = est.limpio;
    est.oyentes.clear();
});

describe("describirAviso", () => {
    it("nada que decir cuando todo está en orden", () => {
        expect(describirAviso(est.limpio, INACTIVO, AHORA)).toBeNull();
    });

    it("prioriza el corte, luego el freno remoto, el día y la pausa local", () => {
        const todo = { corte: true, corteHasta: AHORA + 30 * 60_000, frenoLocalHasta: AHORA + 60_000, diaAgotado: true };
        const freno = { activo: true, motivo: "Presupuesto diario superado", hasta: null };
        expect(describirAviso(todo, freno, AHORA)?.titulo).toBe("La nube de StarSeed está en pausa");
        expect(describirAviso({ ...todo, corte: false }, freno, AHORA)?.titulo).toBe("Freno diario del proyecto");
        expect(describirAviso({ ...todo, corte: false }, INACTIVO, AHORA)?.titulo).toBe("Este dispositivo usó su presupuesto de hoy");
        expect(describirAviso({ ...todo, corte: false, diaAgotado: false }, INACTIVO, AHORA)?.titulo).toBe("Pausa breve en esta pestaña");
    });

    it("cuando el corte venció, dice que está comprobando", () => {
        const d = describirAviso({ ...est.limpio, corte: true, corteHasta: AHORA - 1 }, INACTIVO, AHORA);
        expect(d?.titulo).toBe("Comprobando si la nube ha vuelto");
    });

    it("el freno remoto cuenta su motivo y que las escrituras siguen", () => {
        const d = describirAviso(est.limpio, { activo: true, motivo: "Presupuesto diario superado.", hasta: null }, AHORA);
        expect(d?.detalle).toMatch(/^Presupuesto diario superado\. Las lecturas de la nube vuelven a las /);
        expect(d?.detalle).toContain("lo que escribas se sigue guardando");
    });
});

describe("describirAviso · CON1010 (qué gastó más y qué hace el OS)", () => {
    const top = { ruta: "/rest/v1/rpc/merge_user_prefs", nombre: "guardado de tus preferencias", n: 2664 };

    it("el aviso del día dice la ruta que más gastó y que el OS ya frenó los sondeos", () => {
        const d = describirAviso({ ...est.limpio, diaAgotado: true }, INACTIVO, AHORA, { hoy: 8929, rutaTop: top });
        expect(d?.titulo).toBe("Este dispositivo usó su presupuesto de hoy");
        expect(d?.detalle).toContain("Lo que más gastó: guardado de tus preferencias (2664)".replace("2664", (2664).toLocaleString("es-ES")));
        expect(d?.detalle).toContain("El OS ya espació los sondeos de fondo");
        expect(d?.detalle).toContain("lo que escribas, tu sesión y tus preferencias se siguen guardando");
    });

    it("sin datos de rutas, el aviso del día sigue siendo correcto", () => {
        const d = describirAviso({ ...est.limpio, diaAgotado: true }, INACTIVO, AHORA);
        expect(d?.detalle).not.toContain("Lo que más gastó");
        expect(d?.detalle).toMatch(/^Llegó a /);
    });

    it("ANTES de la pausa: el modo ahorro fuerte avisa con lo que lleva y lo que más gasta", () => {
        const d = describirAviso({ ...est.limpio, nivelRitmo: 2 } as typeof est.limpio, INACTIVO, AHORA, { hoy: 6900, rutaTop: top });
        expect(d?.titulo).toBe("Modo ahorro de consumo");
        expect(d?.detalle).toContain(`va por ${(6900).toLocaleString("es-ES")} de ${(8000).toLocaleString("es-ES")}`);
        expect(d?.detalle).toContain("Lo que más gasta: guardado de tus preferencias");
        expect(d?.detalle).toContain("escribir, la sesión y tus preferencias siguen igual");
    });

    it("el ahorro suave (nivel 1) no molesta con una banda", () => {
        expect(describirAviso({ ...est.limpio, nivelRitmo: 1 } as typeof est.limpio, INACTIVO, AHORA)).toBeNull();
    });
});

describe("<AvisoConsumo />", () => {
    it("no pinta nada sin pausa y aparece cuando el guardián abre el corte", async () => {
        render(<AvisoConsumo />);
        expect(screen.queryByTestId("aviso-consumo")).toBeNull();

        fijarAviso({ corte: true, corteHasta: Date.now() + 30 * 60_000 });
        const banda = await screen.findByTestId("aviso-consumo");
        expect(banda.getAttribute("role")).toBe("status");
        expect(banda.textContent).toContain("La nube de StarSeed está en pausa");
        expect(banda.textContent).toContain("Pausa de consumo");
    });

    it("se puede ocultar y vuelve si la situación cambia", async () => {
        render(<AvisoConsumo />);
        fijarAviso({ frenoLocalHasta: Date.now() + 120_000 });
        await screen.findByTestId("aviso-consumo");

        const cerrar = screen.getByRole("button", { name: "Ocultar este aviso" });
        expect(cerrar.className).toContain("ss-redondo");
        fireEvent.click(cerrar);
        await waitFor(() => expect(screen.queryByTestId("aviso-consumo")).toBeNull());

        fijarAviso({ corte: true, corteHasta: Date.now() + 30 * 60_000 });
        expect((await screen.findByTestId("aviso-consumo")).textContent).toContain("en pausa");
    });
});
