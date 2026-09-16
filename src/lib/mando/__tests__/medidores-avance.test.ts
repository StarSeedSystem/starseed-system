import { describe, it, expect } from "vitest";
import { avanceCombinado, DatosAvance } from "@/lib/mando/medidores";

describe("avanceCombinado", () => {
    it("base por etapa sin movimiento: escribiendo = 17 %", () => {
        expect(avanceCombinado({ etapa: "escribiendo", segundosEnEtapa: 0 })).toBe(17);
    });

    it("verificando base = 33 %, probando = 50 %, revisando = 67 %, visto bueno = 83 %", () => {
        expect(avanceCombinado({ etapa: "verificando", segundosEnEtapa: 0 })).toBe(33);
        expect(avanceCombinado({ etapa: "probando", segundosEnEtapa: 0 })).toBe(50);
        expect(avanceCombinado({ etapa: "revisando", segundosEnEtapa: 0 })).toBe(67);
        expect(avanceCombinado({ etapa: "visto bueno", segundosEnEtapa: 0 })).toBe(83);
    });

    it("integrada es 100 % sin importar segundos", () => {
        expect(avanceCombinado({ etapa: "integrada", segundosEnEtapa: 999 })).toBe(100);
    });

    it("con tiempo típico cubierto llega al inicio de la etapa siguiente (menos 100 %)", () => {
        // escribiendo (25 min típico): 1500 s → 100 % del rango 17→33 → 33 %
        expect(avanceCombinado({ etapa: "escribiendo", segundosEnEtapa: 25 * 60 })).toBe(33);
    });

    it("dentro de la etapa avanza proporcional al tiempo", () => {
        // escribiendo: 750 s (mitad del típico 1500) → base 17 + 0.5 * 16 = 25
        expect(avanceCombinado({ etapa: "escribiendo", segundosEnEtapa: 750 })).toBe(25);
    });

    it("nunca retrocede: respeta porcentajePrevio mayor", () => {
        const datos: DatosAvance = { etapa: "escribiendo", segundosEnEtapa: 0, porcentajePrevio: 30 };
        expect(avanceCombinado(datos)).toBe(30);
    });

    it("nunca llega a 100 antes de integrada", () => {
        // visto bueno con tiempo infinito: base 83 + rango limitado al 99 % del intervalo 83→100
        expect(avanceCombinado({ etapa: "visto bueno", segundosEnEtapa: 999999 })).toBeLessThan(100);
        expect(avanceCombinado({ etapa: "visto bueno", segundosEnEtapa: 999999 })).toBeGreaterThanOrEqual(83);
    });

    it("no usa fechas del sistema: ahora se pasa pero no afecta el cálculo", () => {
        // probando: base 50 %, rango 50→67 (17 puntos), 300 s de 1200 típicos → ~50 + 4 = 54.
        const conAhora = avanceCombinado({ etapa: "probando", segundosEnEtapa: 300, ahora: 1234567890 });
        const sinAhora = avanceCombinado({ etapa: "probando", segundosEnEtapa: 300 });
        expect(conAhora).toBe(sinAhora);
        expect(sinAhora).toBeGreaterThanOrEqual(50);
    });

    it("etapa desconocida devuelve porcentajePrevio o 0", () => {
        expect(avanceCombinado({ etapa: "inexistente", segundosEnEtapa: 10 })).toBe(0);
        expect(avanceCombinado({ etapa: "inexistente", segundosEnEtapa: 10, porcentajePrevio: 42 })).toBe(42);
    });

    it("visto bueno con tiempo típico no supera el 99 % del rango", () => {
        // 20 min típico: 1200 s → base 83 + 0.99 * 17 ≈ 99
        const resultado = avanceCombinado({ etapa: "visto bueno", segundosEnEtapa: 20 * 60 });
        expect(resultado).toBeLessThan(100);
        expect(resultado).toBeGreaterThanOrEqual(83);
    });
});
