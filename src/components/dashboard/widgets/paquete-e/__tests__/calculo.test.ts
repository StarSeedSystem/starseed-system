import { describe, expect, it } from "vitest";
import { aplicarTecla, calcular, formatearNumero, numeroParaExpresion, parentesisInteligente, teclaACalculadora } from "../calculo";

const v = (e: string) => {
    const r = calcular(e);
    if (!r.ok) throw new Error(r.error);
    return Number(r.valor.toPrecision(12));
};

describe("calcular (sin eval)", () => {
    it("respeta la precedencia y los paréntesis", () => {
        expect(v("2+3×4")).toBe(14);
        expect(v("(2+3)×4")).toBe(20);
        expect(v("10−4−3")).toBe(3);
        expect(v("2^3^2")).toBe(512);
        expect(v("-2^2")).toBe(-4);
    });

    it("entiende coma y punto decimales y los símbolos de teclado", () => {
        expect(v("0,1+0,2")).toBe(0.3);
        expect(v("1.5*2")).toBe(3);
        expect(v("9/3-1")).toBe(2);
    });

    it("porcentaje de calculadora", () => {
        expect(v("200+10%")).toBe(220);
        expect(v("200−25%")).toBe(150);
        expect(v("50×10%")).toBe(5);
        expect(v("10%")).toBe(0.1);
    });

    it("raíz, π y multiplicación implícita", () => {
        expect(v("√16")).toBe(4);
        expect(v("2π")).toBe(Number((2 * Math.PI).toPrecision(12)));
        expect(v("3(4+1)")).toBe(15);
        expect(v("√(9)+1")).toBe(4);
    });

    it("cierra solos los paréntesis que quedan abiertos al final", () => {
        expect(v("2×(3+4")).toBe(14);
    });

    it("explica los errores en español y nunca lanza", () => {
        expect(calcular("5÷0")).toEqual({ ok: false, error: "No se puede dividir entre cero" });
        expect(calcular("2+")).toMatchObject({ ok: false });
        expect(calcular("√(−4)")).toEqual({ ok: false, error: "Raíz de un número negativo" });
        expect(calcular("2)")).toEqual({ ok: false, error: "Sobra un paréntesis" });
        expect(calcular("alert(1)")).toMatchObject({ ok: false });
        expect(calcular("1,2,3")).toMatchObject({ ok: false });
        expect(calcular("")).toMatchObject({ ok: false });
    });
});

describe("formato y teclas", () => {
    it("formatea en español con miles y decimales", () => {
        expect(formatearNumero(1234.5)).toBe("1.234,5");
        expect(formatearNumero(0.1 + 0.2)).toBe("0,3");
        expect(formatearNumero(-1000000)).toBe("-1.000.000");
        expect(formatearNumero(1e20)).toMatch(/^1e\+20$/);
        expect(numeroParaExpresion(1234.5)).toBe("1234,5");
    });

    it("el paréntesis inteligente abre o cierra según lo que haya", () => {
        expect(parentesisInteligente("")).toBe("(");
        expect(parentesisInteligente("2×")).toBe("(");
        expect(parentesisInteligente("2×(3")).toBe(")");
        expect(parentesisInteligente("2")).toBe("(");
    });

    it("las teclas se aplican con sentido", () => {
        expect(aplicarTecla("2+", "×")).toBe("2×");
        expect(aplicarTecla("2×", "−")).toBe("2×−");
        expect(aplicarTecla("", "×")).toBe("");
        expect(aplicarTecla("", ",")).toBe("0,");
        expect(aplicarTecla("1,5", ",")).toBe("1,5");
        expect(aplicarTecla("12", "⌫")).toBe("1");
        expect(aplicarTecla("12", "C")).toBe("");
        expect(teclaACalculadora("*")).toBe("×");
        expect(teclaACalculadora("Enter")).toBe("=");
        expect(teclaACalculadora("q")).toBeNull();
    });
});
