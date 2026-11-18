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

// ── CAL1115I · quién controla a quién y las palabras de cada plataforma ─────────────────────────────────────────
import { plataformaLocal, quienOpera, textoFalta } from "../banda-control";

describe("CAL1115I · lo que falta se dice con las palabras de la plataforma donde se enseña", () => {
    it("en Android nombra el diálogo de Android; en la Mac, no", () => {
        expect(textoFalta("interruptor", "Android").falta).toBe("Falta tu «Sí» en el diálogo de Android para dejar que otras neuronas controlen este aparato.");
        const mac = textoFalta("interruptor", "macOS").falta;
        expect(mac).toBe("Falta tu «Sí» en el aviso de macOS para dejar que otras neuronas controlen este aparato.");
        expect(mac).not.toContain("Android");
        expect(textoFalta("interruptor", "otra").falta).not.toContain("Android");
    });

    it("«Mostrar sobre otras apps» solo sale en Android", () => {
        expect(textoFalta("superposicion", "Android").falta).toContain("«Mostrar sobre otras apps»");
        expect(textoFalta("superposicion", "macOS").falta).not.toContain("otras apps");
        expect(textoFalta("superposicion", "macOS").boton).not.toContain("otras apps");
    });

    it("el componente usa la plataforma que se le da", () => {
        render(<FaltasIndicador estado={{ ...base, falta: ["interruptor"] }} onPedir={() => undefined} plataforma="macOS" />);
        expect(screen.getByTestId("falta-interruptor")).toHaveTextContent("aviso de macOS");
        expect(screen.getByTestId("falta-interruptor")).not.toHaveTextContent("Android");
    });

    it("la plataforma se lee del agente de usuario", () => {
        expect(plataformaLocal("Mozilla/5.0 (Linux; Android 14; SM-X)")).toBe("Android");
        expect(plataformaLocal("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("macOS");
        expect(plataformaLocal("Mozilla/5.0 (Windows NT 10.0)")).toBe("otra");
    });
});

describe("CAL1115I · las frases de quién opera a quién", () => {
    it("este aparato pide", () => {
        expect(quienOpera.esteAparatoPide("Maggaboard", "A1B2")).toBe("Vas a operar Maggaboard desde este aparato; en Maggaboard tienen que aceptar el código A1B2.");
    });
    it("otro aparato pide", () => {
        expect(quienOpera.otroPide("Maggaboard")).toContain("operar todo el aparato, apps incluidas");
        expect(quienOpera.otroPide("Maggaboard", "protegido")).toContain("no las ventanas de permisos");
    });
    it("lista de aceptados, en los dos sentidos", () => {
        expect(quienOpera.puedeOperarEste("Maggaboard")).toBe("Puede operar este aparato: Maggaboard");
        expect(quienOpera.esteAparatoPuede("Maggaboard")).toBe("Este aparato puede operar: Maggaboard");
    });
});
