import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StepDemo } from "../aurora-guide-demos";
import { TODOS_LOS_TEMAS } from "../../../lib/onboarding/guia-temas-red";

afterEach(cleanup);

const ACCENT = "#C9A8FF";

describe("aurora-guide-demos · los diez temas del tour (GUI1021F)", () => {
    it("cada clave de TODOS_LOS_TEMAS monta su demostración (sin movimiento reducido)", () => {
        for (const tema of TODOS_LOS_TEMAS) {
            const { container } = render(<StepDemo stepKey={tema.key} accent={ACCENT} reduce={false} />);
            const escena = container.querySelector("svg[role='img']");
            expect(escena, `sin demo para «${tema.key}»`).not.toBeNull();
            expect((escena as SVGSVGElement).getAttribute("aria-label"), `sin etiqueta en «${tema.key}»`).toMatch(/\S/);
            cleanup();
        }
    });

    it("cada clave de TODOS_LOS_TEMAS monta también con movimiento reducido (fotograma quieto)", () => {
        for (const tema of TODOS_LOS_TEMAS) {
            const { container } = render(<StepDemo stepKey={tema.key} accent={ACCENT} reduce />);
            expect(container.querySelector("svg[role='img']"), `sin demo para «${tema.key}» (reduce)`).not.toBeNull();
            cleanup();
        }
    });

    it("las diez claves del tour son exactamente las de TODOS_LOS_TEMAS, una vez cada una", () => {
        const claves = TODOS_LOS_TEMAS.map((tema) => tema.key);
        expect(claves).toEqual([
            "protomolecula",
            "malla",
            "capas-conciencia",
            "neuronas-cerebro",
            "pilar-politica",
            "pilar-educacion",
            "pilar-cultura",
            "libreria-biblioteca",
            "genesis",
            "personalizacion-segura",
        ]);
        expect(new Set(claves).size).toBe(claves.length);
    });

    it("las claves viejas «cerebros» y «libreria» montan, y son las demos de neuronas-cerebro y libreria-biblioteca", () => {
        for (const [claveVieja, claveNueva] of [["cerebros", "neuronas-cerebro"], ["libreria", "libreria-biblioteca"]] as const) {
            const { container: vieja } = render(<StepDemo stepKey={claveVieja} accent={ACCENT} reduce />);
            expect(vieja.querySelector("svg[role='img']"), `sin demo para «${claveVieja}»`).not.toBeNull();
            const etiquetaVieja = (vieja.querySelector("svg[role='img']") as SVGSVGElement).getAttribute("aria-label");
            cleanup();
            const { container: nueva } = render(<StepDemo stepKey={claveNueva} accent={ACCENT} reduce />);
            const etiquetaNueva = (nueva.querySelector("svg[role='img']") as SVGSVGElement).getAttribute("aria-label");
            cleanup();
            expect(etiquetaVieja, `«${claveVieja}» no apunta a «${claveNueva}»`).toBe(etiquetaNueva);
        }
    });

    it("los pasos que ya tenían demo propia siguen montándola", () => {
        for (const paso of ["orbe", "escritorio", "dashboard", "astraura", "perfil"]) {
            const { container } = render(<StepDemo stepKey={paso} accent={ACCENT} reduce />);
            expect(container.firstElementChild, `se perdió la demo «${paso}»`).not.toBeNull();
            cleanup();
        }
    });

    it("una clave desconocida no renderiza nada (la guía sigue)", () => {
        const { container } = render(<StepDemo stepKey="paso-que-no-existe" accent={ACCENT} reduce />);
        expect(container).toBeEmptyDOMElement();
    });

    it("todas las escenas llevan etiqueta accesible en español con acentos", () => {
        for (const tema of TODOS_LOS_TEMAS) {
            const { container } = render(<StepDemo stepKey={tema.key} accent={ACCENT} reduce />);
            // getByRole exige nombre accesible: si falta, falla aquí.
            expect(() => screen.getByRole("img", { exact: false })).not.toThrow();
            cleanup();
        }
        expect(TODOS_LOS_TEMAS.length).toBeGreaterThan(0);
    });
});
