// Pruebas de la relevancia honesta de las aportaciones del Hub (SP092928).
// Solo funciones puras: nada de red, disco ni azar. La relevancia debe salir
// de la participación real, no de un número inventado.
import { describe, it, expect } from "vitest";
import { puntuacionAportacion, type AportacionEvaluada } from "../relevancia";

// Aportación recién publicada: nadie se ha postulado todavía.
const base: AportacionEvaluada = {
    members: [],
    urgencyVal: 1,
    messagingGroupCreated: false,
    goalsAchieved: false,
};

function conVoluntarios(n: number): AportacionEvaluada {
    return {
        ...base,
        members: Array.from({ length: n }, (_, i) => ({ name: `voluntario-${i}` })),
    };
}

describe("puntuacionAportacion · participación real", () => {
    it("sin participación la relevancia solo refleja la urgencia declarada", () => {
        expect(puntuacionAportacion(base)).toBe(4);
        expect(puntuacionAportacion({ ...base, urgencyVal: 4 })).toBe(16);
    });

    it("cada voluntario inscrito suma su parte", () => {
        expect(puntuacionAportacion(conVoluntarios(1))).toBe(10);
        expect(puntuacionAportacion(conVoluntarios(3))).toBe(22);
    });

    it("el tope de voluntarios evita que el montón tape el resto", () => {
        expect(puntuacionAportacion(conVoluntarios(10))).toBe(64);
        expect(puntuacionAportacion(conVoluntarios(25))).toBe(64);
    });
});

describe("puntuacionAportacion · urgencia y coordinación", () => {
    it("la urgencia se clampea a su rango real", () => {
        expect(puntuacionAportacion({ ...base, urgencyVal: 9 })).toBe(16);
        expect(puntuacionAportacion({ ...base, urgencyVal: -3 })).toBe(0);
    });

    it("una urgencia inválida cuenta como cero y no rompe nada", () => {
        expect(puntuacionAportacion({ ...base, urgencyVal: Number.NaN })).toBe(0);
    });

    it("la coordinación real alrededor de la aportación suma", () => {
        expect(puntuacionAportacion({ ...base, messagingGroupCreated: true })).toBe(12);
        expect(puntuacionAportacion({ ...base, calendarItemId: "cal-1" })).toBe(12);
        expect(puntuacionAportacion({ ...base, goalsAchieved: true })).toBe(12);
    });
});

describe("puntuacionAportacion · honestidad del valor", () => {
    it("nunca supera el cien", () => {
        const todo = {
            members: Array.from({ length: 30 }, (_, i) => ({ name: `v-${i}` })),
            urgencyVal: 4,
            messagingGroupCreated: true,
            goalsAchieved: true,
            calendarItemId: "cal-1",
        };
        expect(puntuacionAportacion(todo)).toBe(100);
    });

    it("es determinista: la misma aportación da siempre el mismo valor", () => {
        const aportacion = conVoluntarios(2);
        expect(puntuacionAportacion(aportacion)).toBe(puntuacionAportacion(aportacion));
        expect(puntuacionAportacion(aportacion)).toBe(16);
    });
});
