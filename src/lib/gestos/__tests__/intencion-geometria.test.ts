import { describe, expect, it } from "vitest";
import {
    ejeDe,
    evaluarIntencion,
    fraccionAbierta,
    haciaCierre,
    ladoDeBorde,
    origenTransformPanel,
    signoCierre,
    transformPanel,
    transversal,
    umbralParaPuntero,
} from "@/lib/gestos";

describe("evaluarIntencion (no robar clics ni scroll)", () => {
    it("espera mientras el movimiento es menor que el umbral (un toque sigue siendo un toque)", () => {
        expect(evaluarIntencion("x", 4, 3)).toBe("pendiente");
        expect(evaluarIntencion("x", 5, 0, { umbralPx: 6 })).toBe("pendiente");
    });

    it("acepta un arrastre alineado con el eje", () => {
        expect(evaluarIntencion("x", -30, 6)).toBe("aceptada");
        expect(evaluarIntencion("y", 2, -25)).toBe("aceptada");
    });

    it("rechaza un gesto demasiado inclinado: es desplazamiento del contenido", () => {
        expect(evaluarIntencion("x", 8, 30)).toBe("rechazada");
        expect(evaluarIntencion("y", 30, 12)).toBe("rechazada");
    });

    it("respeta el sentido exigido (abrir desde un borde solo hacia dentro)", () => {
        expect(evaluarIntencion("x", 20, 0, { soloHacia: 1 })).toBe("aceptada");
        expect(evaluarIntencion("x", -20, 0, { soloHacia: 1 })).toBe("rechazada");
    });

    it("usa un umbral menor para el ratón que para el dedo", () => {
        expect(umbralParaPuntero("mouse")).toBeLessThan(umbralParaPuntero("touch"));
        expect(umbralParaPuntero("pen")).toBe(umbralParaPuntero("touch"));
    });
});

describe("geometría de los cuatro lados", () => {
    it("asigna eje y sentido de cierre", () => {
        expect(ejeDe("izquierda")).toBe("x");
        expect(ejeDe("arriba")).toBe("y");
        expect(signoCierre("izquierda")).toBe(-1);
        expect(signoCierre("derecha")).toBe(1);
        expect(signoCierre("arriba")).toBe(-1);
        expect(signoCierre("abajo")).toBe(1);
    });

    it("proyecta el movimiento hacia el borde de cada panel", () => {
        expect(haciaCierre("izquierda", -50, 10)).toBe(50);
        expect(haciaCierre("derecha", -50, 10)).toBe(-50);
        expect(haciaCierre("arriba", 0, -40)).toBe(40);
        expect(haciaCierre("abajo", 0, 40)).toBe(40);
        expect(transversal("izquierda", -50, -12)).toBe(12);
    });

    it("mapea los nodos Trinity a su lado", () => {
        expect(ladoDeBorde("zenith")).toBe("arriba");
        expect(ladoDeBorde("horizon")).toBe("izquierda");
        expect(ladoDeBorde("logic")).toBe("derecha");
        expect(ladoDeBorde("anchor")).toBe("abajo");
    });

    it("fraccionAbierta va de 1 (abierto) a 0 (cerrado) y se recorta", () => {
        expect(fraccionAbierta(0)).toBe(1);
        expect(fraccionAbierta(1)).toBe(0);
        expect(fraccionAbierta(-0.2)).toBe(1);
        expect(fraccionAbierta(0.25)).toBeCloseTo(0.75);
    });
});

describe("transformPanel", () => {
    it("en reposo no deja transform (no atrapa a los hijos fixed)", () => {
        expect(transformPanel("izquierda", 0, 32)).toBe("none");
    });

    it("cerrado sale entero de la pantalla hacia su lado", () => {
        expect(transformPanel("izquierda", 1, 32)).toBe("translate3d(calc(-100.000% + -32.00px), 0, 0)");
        expect(transformPanel("derecha", 1, 32)).toBe("translate3d(calc(100.000% + 32.00px), 0, 0)");
        expect(transformPanel("arriba", 1, 20)).toBe("translate3d(0, calc(-100.000% + -20.00px), 0)");
    });

    it("añade una inclinación 3D proporcional al cierre y nunca en el estirón", () => {
        const t = transformPanel("izquierda", 0.5, 32, 10);
        expect(t).toContain("perspective(1400px)");
        expect(t).toContain("rotateY(5.000deg)");
        expect(transformPanel("izquierda", -0.1, 32, 10)).not.toContain("rotate");
        expect(transformPanel("arriba", 1, 0, 8)).toContain("rotateX(-8.000deg)");
        expect(origenTransformPanel("derecha")).toBe("right center");
    });
});
