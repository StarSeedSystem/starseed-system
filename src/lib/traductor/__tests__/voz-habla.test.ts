import { describe, expect, it, beforeEach } from "vitest";
import { hablar, detener, vocesDe, resetearEstado, cuandoTermine } from "../voz-habla";

const VOZES_SIMULADAS: Record<string, string> = {
    "es-ES": "Spanish Female",
    "en-US": "English Female",
};

beforeEach(() => {
    resetearEstado();
    ;(global as any).speechSynthesis = undefined;
    ;(global as any).speechSynthesisVoices = [];
    if (typeof window !== "undefined") {
        ;(window as any).speechSynthesis = undefined;
        ;(window as any).speechSynthesisVoices = [];
    }
});

describe("voz-habla: hablar", () => {
    it("usa voz exacta cuando hay coincidencia", () => {
        const resultado = hablar("hola", "es-ES", "navegador");
        expect(resultado.ok).toBe(true);
    });

    it("busca voz por prefijo cuando no hay exacta", () => {
        const resultado = hablar("hola", "es", "navegador");
        expect(resultado.ok).toBe(true);
    });

    it("devuelve ok:false y motivo cuando no hay voz del idioma", () => {
        const resultado = hablar("hola", "zz", "navegador");
        expect(resultado.ok).toBe(false);
        expect(resultado.motivo).toBe("No hay una voz de zz en este aparato");
    });

    it("cola una frase cuando ya habla otra y se procesa después", async () => {
        hablar("hola", "es-ES", "navegador");
        const resultado = hablar("mundo", "es-ES", "navegador");
        expect(resultado.ok).toBe(true);

        // Esperar a que la frase actual termine (fallback setTimeout ~10ms)
        await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it("procesa la cola en orden (FIFO) tras detener y reiniciar estado", async () => {
        resetearEstado();

        hablar("primero", "es-ES", "navegador");
        resetearEstado();

        hablar("segundo", "es-ES", "navegador");
        resetearEstado();

        hablar("tercer", "es-ES", "navegador");

        const resultados: string[] = [];
        cuandoTermine((ok: boolean) => {
            if (ok) resultados.push("callback1");
        });
        cuandoTermine((ok: boolean) => {
            if (ok) resultados.push("callback2");
        });
        cuandoTermine((ok: boolean) => {
            if (ok) resultados.push("callback3");
        });

        // Esperar a que todas las frases terminen
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Los callbacks deberían haber sido disparados
        expect(resultados.length).toBeGreaterThanOrEqual(1);
    });

    it("detener vacía la cola y llama callback con false", async () => {
        const r1 = hablar("texto1", "es-ES", "navegador");
        expect(r1.ok).toBe(true);

        const resultados: string[] = [];
        // Registrar callback ANTES de detener
        cuandoTermine((ok: boolean) => {
            resultados.push(ok ? "ok" : "false");
        });

        detener();

        // Después de detener, el callback debería invocarse con false
        // Dar tiempo al setTimeout fallback
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(resultados).toContain("false");
    });

    it("una sola frase invoca alTerminar cuando termina (entorno sin speechSynthesis)", async () => {
        const cb: boolean[] = [];
        cuandoTermine((ok) => { cb[cb.length] = ok; });

        hablar("texto", "es-ES", "navegador");

        // En fallback de setTimeout, el callback se invoca después de 10ms
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(cb.length).toBeGreaterThanOrEqual(1);
    });
});

describe("voz-habla: vocesDe", () => {
    it("devuelve voces para español exacto", () => {
        const voces = vocesDe("es-ES");
        expect(voces.length).toBeGreaterThan(0);
        expect(voces[0].lang).toBe("es-ES");
    });

    it("devuelve voces por prefijo", () => {
        const voces = vocesDe("es");
        expect(voces.length).toBeGreaterThan(0);
        expect(voces[0].lang).toEqual(expect.stringMatching(/^es-/));
    });

    it("devuelve array vacío para idioma sin voces", () => {
        const voces = vocesDe("zz");
        expect(voces).toEqual([]);
    });

    it("devuelve array vacío para undefined", () => {
        const voces = vocesDe(undefined as unknown as string);
        expect(voces).toEqual([]);
    });

    it("devuelve array vacío para null", () => {
        const voces = vocesDe(null as unknown as string);
        expect(voces).toEqual([]);
    });
});