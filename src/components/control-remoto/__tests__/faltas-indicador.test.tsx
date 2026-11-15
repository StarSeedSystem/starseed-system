import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { FaltasIndicador } from "../banda-control";
import type { EstadoIndicador } from "@/lib/control-remoto/nativo";

afterEach(cleanup);

const base: EstadoIndicador = { indicadorPosible: false, falta: [], ultimoRechazo: null };

describe("IND1115F · lo que falta para el indicador, en el panel del aparato controlado", () => {
    it("no sale si no falta nada ni se negó nada, ni fuera de la app", () => {
        const { container, rerender } = render(<FaltasIndicador estado={base} onPedir={() => undefined} />);
        expect(container).toBeEmptyDOMElement();
        rerender(<FaltasIndicador estado={null} onPedir={() => undefined} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("un botón por cada cosa que falta, y cada botón pide SU cosa", async () => {
        const pedir = vi.fn();
        render(<FaltasIndicador estado={{ ...base, falta: ["notificaciones", "superposicion"] }} onPedir={pedir} />);
        expect(screen.queryByTestId("falta-interruptor")).toBeNull();
        await userEvent.click(within(screen.getByTestId("falta-notificaciones")).getByRole("button"));
        await userEvent.click(within(screen.getByTestId("falta-superposicion")).getByRole("button"));
        expect(pedir.mock.calls).toEqual([["notificaciones"], ["superposicion"]]);
    });

    it("dice por qué se negó la última sesión, con el paso y desde cuándo", () => {
        render(
            <FaltasIndicador
                estado={{ ...base, ultimoRechazo: { haceMs: 40_000, falta: [], paso: "primer-plano", error: "superposicion:sin-vista", trasMs: 380 } }}
                onPedir={() => undefined}
            />,
        );
        const t = screen.getByTestId("ultimo-rechazo").textContent ?? "";
        expect(t).toContain("hace 40 s");
        expect(t).toContain("paso: primer-plano");
        expect(t).toContain("superposicion:sin-vista");
    });

    it("lo que no tiene botón (otra plataforma) se dice igual, sin inventar uno", () => {
        render(<FaltasIndicador estado={{ ...base, falta: ["plataforma-sin-borde-atajo-ni-pausa"] }} onPedir={() => undefined} />);
        expect(screen.getByTestId("faltas-indicador")).toHaveTextContent("plataforma-sin-borde-atajo-ni-pausa");
        expect(screen.queryAllByRole("button")).toHaveLength(0);
    });
});
