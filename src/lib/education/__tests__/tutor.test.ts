import { describe, it, expect } from "vitest";
import { esPeticionDeAprender, normalizarNivel, planTutoria, promptTutor, type RecuerdoTutor } from "../tutor";
describe("esPeticionDeAprender", () => {
    it.each([
        "Explícame la fotosíntesis",
        "explicame las derivadas",
        "Quiero aprender cálculo",
        "No entiendo la recursión",
        "¿Cómo funciona un transformador?",
        "cómo funciona un compilador",
        "Enséñame a programar",
        "Ayúdame a entender Bayes",
        "cómo puedo aprender guitarra",
        "Quiero estudiar sobre redes",
        "teach me quantum mechanics",
        "Explain how a compiler works",
        "I don't understand recursion",
        "I want to learn Rust",
        "Help me understand the central limit theorem",
        "how does a transistor work?",
    ])("detecta «%s»", (texto) => {
        expect(esPeticionDeAprender(texto)).toBe(true);
    });

    it.each([
        "",
        "   ",
        "La fotosíntesis es el proceso por el cual las plantas producen glucosa.",
        "Ayer expliqué la lección a mi hermano.",
        "El manual explica cómo funciona el motor.",
        "The documentation explains how the compiler works.",
        "Me gusta aprender cosas nuevas.",
    ])("no confunde «%s»", (texto) => {
        expect(esPeticionDeAprender(texto)).toBe(false);
    });

    it("tolera mayúsculas, acentos y espacios repetidos", () => {
        expect(esPeticionDeAprender("  EXPLÍCAME   LA   LUZ  ")).toBe(true);
    });

    it("no rompe con una entrada nula o indefinida", () => {
        expect(esPeticionDeAprender(null as unknown as string)).toBe(false);
        expect(esPeticionDeAprender(undefined as unknown as string)).toBe(false);
    });
});

describe("normalizarNivel", () => {
    it("entiende español e inglés y cae en principiante por defecto", () => {
        expect(normalizarNivel("experto")).toBe("avanzado");
        expect(normalizarNivel("Advanced")).toBe("avanzado");
        expect(normalizarNivel("intermedio")).toBe("intermedio");
        expect(normalizarNivel("medium")).toBe("intermedio");
        expect(normalizarNivel("básico")).toBe("principiante");
        expect(normalizarNivel("")).toBe("principiante");
        expect(normalizarNivel()).toBe("principiante");
    });
});

describe("planTutoria", () => {
    it("sigue el método de DeepTutor: explicar, comprobar, practicar y resumir", () => {
        const plan = planTutoria({ concepto: "las derivadas" });
        expect(plan.pasos.map((p) => p.id)).toEqual(["explicar", "comprobar", "practicar", "resumir"]);
        expect(plan.concepto).toBe("las derivadas");
        expect(plan.nivel).toBe("principiante");
        expect(plan.pasos.every((p) => p.instruccion.includes("las derivadas"))).toBe(true);
    });

    it("usa los recuerdos del cerebro como base de conocimiento", () => {
        const recuerdos: RecuerdoTutor[] = [
            { titulo: "Clase del martes", contenido: "La derivada mide un cambio instantáneo." },
            { contenido: "  El límite es la base formal.  " },
        ];
        const plan = planTutoria({ concepto: "derivadas", nivel: "avanzado", recuerdos });
        expect(plan.nivel).toBe("avanzado");
        expect(plan.base).toHaveLength(2);
        expect(plan.base[1].contenido).toBe("El límite es la base formal.");
        expect(plan.pasos[0].instruccion).toContain("La derivada mide un cambio instantáneo.");
        expect(plan.pasos[2].instruccion).toContain("El límite es la base formal.");
    });

    it("declara la ausencia de memorias y descarta recuerdos vacíos", () => {
        const plan = planTutoria({ concepto: "  ósmosis  " });
        expect(plan.concepto).toBe("ósmosis");
        expect(plan.base).toEqual([]);
        expect(plan.pasos[0].instruccion).toContain("No hay memorias");

        const muchos = planTutoria({ concepto: "redes", recuerdos: ["", "  ", ...Array.from({ length: 12 }, (_, i) => `Dato ${i}`)] });
        expect(muchos.base.length).toBeLessThanOrEqual(8);
        expect(muchos.base.every((r) => r.contenido.length > 0)).toBe(true);
    });
});

describe("promptTutor", () => {
    const plan = planTutoria({ concepto: "la fotosíntesis", nivel: "intermedio", recuerdos: [{ titulo: "Apunte", contenido: "Ocurre en los cloroplastos." }] });

    it("es un prompt de sistema en español con el plan y las memorias", () => {
        const prompt = promptTutor(plan, false);
        expect(prompt).toContain("tutor");
        expect(prompt).toContain("la fotosíntesis");
        expect(prompt).toContain("Ocurre en los cloroplastos.");
        expect(prompt).toContain("Explicar");
        expect(prompt).toContain("Resumir");
    });

    it("solo pide OpenUI Lang cuando la interfaz viva está activa", () => {
        const conInterfaz = promptTutor(plan, true);
        expect(conInterfaz).toContain("OpenUI Lang");
        expect(conInterfaz).toContain("Cuestionario");
        expect(conInterfaz).toContain("Tarjeta");

        const sinInterfaz = promptTutor(plan, false);
        expect(sinInterfaz).not.toContain("OpenUI");
        expect(sinInterfaz).toContain("Markdown");
    });

    it("por defecto no activa la interfaz viva", () => {
        expect(promptTutor(plan)).not.toContain("OpenUI");
    });
});
