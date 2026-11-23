import { describe, expect, it } from "vitest";

import {
    HISTORIAL_MAX_CHARS,
    clausulasCompletas,
    eventoDeLinea,
    mensajesConversacion,
    paramsDeClausula,
    recortarHistorial,
    sistemaConversacion,
    trozoDeLineaSSE,
    type TurnoConversacion,
} from "@/lib/astraura/conversacion-rapida";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

// (2026-09-22) Alex: «que responda inmediatamente con la voz en tiempo real». El sistema
// primario local tardaba ~95 s en su primer token por un prompt enorme procesado a ~15 tok/s.
// El carril de conversación manda un prompt corto y ESTABLE, y un historial que solo crece
// por el final: así la caché de BitNet reutiliza lo anterior y solo procesa la frase nueva.

const persona = { id: "aurora", nombre: "Aurora" };

describe("sistemaConversacion", () => {
    it("es corto, hablado y siempre igual para la misma persona", () => {
        const a = sistemaConversacion(persona);
        expect(a).toBe(sistemaConversacion({ ...persona }));
        expect(a).toContain("Aurora");
        expect(a.length).toBeLessThan(400);
        expect(a).toMatch(/sin|Nunca uses listas/);
    });
});

describe("recortarHistorial", () => {
    it("mientras cabe, se manda entero (el prefijo cacheado sigue valiendo)", () => {
        const h: TurnoConversacion[] = [
            { rol: "usuario", texto: "hola" },
            { rol: "astraura", texto: "hola, ¿qué tal?" },
        ];
        expect(recortarHistorial(h)).toEqual(h);
    });

    it("al pasarse, se queda con los dos últimos turnos de una vez", () => {
        const largo = "x".repeat(HISTORIAL_MAX_CHARS);
        const h: TurnoConversacion[] = [
            { rol: "usuario", texto: largo },
            { rol: "astraura", texto: "a" },
            { rol: "usuario", texto: "b" },
            { rol: "astraura", texto: "c" },
        ];
        expect(recortarHistorial(h).map((t) => t.texto)).toEqual(["b", "c"]);
    });

    it("descarta turnos vacíos", () => {
        expect(recortarHistorial([{ rol: "usuario", texto: "  " }])).toEqual([]);
    });
});

describe("mensajesConversacion", () => {
    it("sistema + historial + frase nueva, con los roles de OpenAI", () => {
        const m = mensajesConversacion(persona, [{ rol: "usuario", texto: "hola" }, { rol: "astraura", texto: "¡hola!" }], "¿qué tal?");
        expect(m.map((x) => x.role)).toEqual(["system", "user", "assistant", "user"]);
        expect(m[3].content).toBe("¿qué tal?");
    });

    it("el prompt del turno siguiente EMPIEZA igual que el del anterior (caché)", () => {
        const t1 = mensajesConversacion(persona, [], "hola");
        const t2 = mensajesConversacion(persona, [{ rol: "usuario", texto: "hola" }, { rol: "astraura", texto: "¡hola!" }], "sigue");
        expect(t2.slice(0, 2)).toEqual(t1.slice(0, 2));
    });
});

describe("trozoDeLineaSSE", () => {
    it("saca el texto de un delta de OpenAI", () => {
        expect(trozoDeLineaSSE('data: {"choices":[{"delta":{"content":"Hola"}}]}')).toBe("Hola");
    });
    it("marca el final", () => {
        expect(trozoDeLineaSSE("data: [DONE]")).toBe("[FIN]");
    });
    it("ignora lo que no es texto", () => {
        expect(trozoDeLineaSSE('data: {"choices":[{"delta":{"role":"assistant"}}]}')).toBeNull();
        expect(trozoDeLineaSSE(": ping")).toBeNull();
        expect(trozoDeLineaSSE("data: {roto")).toBeNull();
    });
});

describe("eventoDeLinea", () => {
    it("lee los eventos propios del stream", () => {
        expect(eventoDeLinea('data: {"t":"token","v":"hola"}')).toEqual({ t: "token", v: "hola" });
        expect(eventoDeLinea('data: {"t":"ruta","motor":"bitnet-b1.58-local","local":true}')).toEqual({
            t: "ruta",
            motor: "bitnet-b1.58-local",
            local: true,
        });
        expect(eventoDeLinea("data: {}")).toBeNull();
        expect(eventoDeLinea("nada")).toBeNull();
    });

    it("lee el vector visual que BitNet publica por cláusula", () => {
        const v: Partial<QuantumOrbParams> = {
            turbulence: 0.7,
            spikiness: 0.45,
            symmetry: 0.5,
            hueShift: 0.4,
            breath: 0.5,
        };
        expect(eventoDeLinea(`data: ${JSON.stringify({ t: "params", v })}`)).toEqual({ t: "params", v });
    });
});

describe("paramsDeClausula — vector visual que publica BitNet", () => {
    it("devuelve las cinco claves en 0..1", () => {
        const v = paramsDeClausula("Aurora te saluda con calma.");
        expect(Object.keys(v).sort()).toEqual(["breath", "hueShift", "spikiness", "symmetry", "turbulence"]);
        for (const n of Object.values(v)) {
            expect(typeof n).toBe("number");
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(1);
        }
    });

    it("una cláusula vacía no expresa nada", () => {
        expect(paramsDeClausula("")).toEqual({});
        expect(paramsDeClausula("   \n\t ")).toEqual({});
    });

    it("una pregunta agita más y simetriza menos que una declaración", () => {
        const pregunta = paramsDeClausula("¿Qué quieres explorar hoy?");
        const declaracion = paramsDeClausula("Vamos a explorarlo hoy.");
        expect(pregunta.turbulence).toBeGreaterThan(declaracion.turbulence as number);
        expect(pregunta.symmetry).toBeLessThan(declaracion.symmetry as number);
    });

    it("una exclamación afila más que una declaración", () => {
        const exclama = paramsDeClausula("¡Aquí está el resultado!");
        const declaracion = paramsDeClausula("Aquí está el resultado.");
        expect(exclama.spikiness).toBeGreaterThan(declaracion.spikiness as number);
    });

    it("una cláusula más larga respira más que una breve", () => {
        const breve = paramsDeClausula("Sí.");
        const larga = paramsDeClausula(
            "Voy a repasar contigo cada una de las catorce palabras de este mensaje largo.",
        );
        expect(larga.breath).toBeGreaterThan(breve.breath as number);
    });
});

describe("clausulasCompletas — troceo del flujo de BitNet", () => {
    it("separa las cláusulas cerradas y deja el resto sin cerrar", () => {
        expect(clausulasCompletas("Hola. ¿Qué tal? Estoy bie")).toEqual({
            clausulas: ["Hola.", "¿Qué tal?"],
            resto: " Estoy bie",
        });
    });

    it("una cláusula sin puntuación final sigue pendiente", () => {
        expect(clausulasCompletas("Voy a repasar")).toEqual({ clausulas: [], resto: "Voy a repasar" });
    });

    it("no parte un número decimal por su punto", () => {
        expect(clausulasCompletas("El valor es 3.14 y sube.")).toEqual({
            clausulas: ["El valor es 3.14 y sube."],
            resto: "",
        });
    });

    it("el salto de línea también cierra la cláusula", () => {
        expect(clausulasCompletas("Primera\nSegunda.")).toEqual({
            clausulas: ["Primera", "Segunda."],
            resto: "",
        });
    });
});
