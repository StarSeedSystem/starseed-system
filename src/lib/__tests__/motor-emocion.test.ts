/**
 * Tests de la Tarea G2 (Ola 264 · 2026-09-06): emoción e intensidad en el
 * motor único «Voz StarSeed» y en el chat.
 *
 * Se prueban las funciones PURAS:
 *   · `resolverEmocion(texto, opciones, timbre)` — precedencia:
 *     etiqueta `[emocion]` del texto > opciones > timbre > neutra.
 *   · `emocionChatAVoz(emocion)` — mapa chato chat/personalidad → catálogo
 *     de la Forja; lo desconocido devuelve undefined.
 */

import { describe, expect, it } from "vitest";
import {
    emocionChatAVoz,
    resolverEmocion,
} from "@/lib/aurora/voz-starseed/motor";
import type { Timbre } from "@/lib/aurora/timbres";

/** Timbre mínimo de prueba (no se usa el catálogo real: el test es estable). */
const timbre: Timbre = {
    id: "t-prueba",
    nombre: "Prueba",
    genero: "neutra",
    desc: "Timbre de test",
    local: { voz: "em_alex", speed: 1, instruct: "young adult, moderate pitch" },
    sistema: { bases: ["Paulina"], pitch: 1, rate: 1 },
    expr: { arco: 0.1, vivacidad: 0.1, calidez: 0.1 },
    emocionBase: "serena",
    intensidad: 0.7,
};

describe("resolverEmocion: la etiqueta del texto manda", () => {
    it("la etiqueta gana a la opción, y la etiqueta se quita del texto", () => {
        const r = resolverEmocion("[triste 1.5] Hola mundo.", { emocion: "alegre", intensidad: 0.4 }, timbre);
        expect(r.emocion).toBe("triste");
        expect(r.intensidad).toBe(1.5);
        expect(r.texto).toBe("Hola mundo.");
    });

    it("la etiqueta sin intensidad respeta la intensidad de las opciones", () => {
        const r = resolverEmocion("[Susurro] Ven aquí.", { intensidad: 1.8 }, timbre);
        expect(r.emocion).toBe("susurro");
        expect(r.intensidad).toBe(1.8);
        expect(r.texto).toBe("Ven aquí.");
    });

    it("acepta la etiqueta con mayúsculas y tildes (normaliza)", () => {
        const r = resolverEmocion("[  Asómbro  ] Mira esto", {}, timbre);
        expect(r.emocion).toBe("asombro");
        // Sin intensidad en etiqueta ni opciones → se usa la del timbre.
        expect(r.intensidad).toBe(0.7);
    });

    it("una etiqueta que NO es una emoción no se recorta del texto", () => {
        const r = resolverEmocion("[importante] Lee esto", {}, timbre);
        expect(r.texto).toBe("[importante] Lee esto");
        expect(r.emocion).toBe("serena"); // cae a la base del timbre
    });
});

describe("resolverEmocion: sin etiqueta", () => {
    it("la opción válida manda sobre la base del timbre", () => {
        const r = resolverEmocion("Hola", { emocion: "jugueton", intensidad: 2 }, timbre);
        expect(r.emocion).toBe("jugueton");
        expect(r.intensidad).toBe(2);
    });

    it("una opción desconocida cae a la emoción base del timbre", () => {
        const r = resolverEmocion("Hola", { emocion: "brillante" }, timbre);
        expect(r.emocion).toBe("serena");
    });

    it("sin nada: emoción base del timbre y su intensidad", () => {
        const r = resolverEmocion("Hola", {}, timbre);
        expect(r.emocion).toBe("serena");
        expect(r.intensidad).toBe(0.7);
        expect(r.texto).toBe("Hola");
    });

    it("sin timbre ni nada: neutra con intensidad 1", () => {
        const r = resolverEmocion("Hola");
        expect(r.emocion).toBe("neutra");
        expect(r.intensidad).toBe(1);
    });
});

describe("emocionChatAVoz: mapa del chat al catálogo de la Forja", () => {
    it("mapea las emociones del estilo vivo de `starseed.aurora.voice.v1`", () => {
        expect(emocionChatAVoz("alegre")).toBe("alegre");
        expect(emocionChatAVoz("entusiasta")).toBe("alegre");
        expect(emocionChatAVoz("juguetona")).toBe("jugueton");
        expect(emocionChatAVoz("seria")).toBe("solemne");
        expect(emocionChatAVoz("misteriosa")).toBe("susurro");
    });

    it("mapea sinónimos de la personalidad y normaliza tildes/mayúsculas", () => {
        expect(emocionChatAVoz("calma")).toBe("serena");
        expect(emocionChatAVoz("Empática")).toBe("serena");
        expect(emocionChatAVoz("prisa")).toBe("urgente");
        expect(emocionChatAVoz("tristeza")).toBe("triste");
        expect(emocionChatAVoz("sorpresa")).toBe("asombro");
    });

    it("lo desconocido o vacío → undefined (mejor neutra que adivinar)", () => {
        expect(emocionChatAVoz("brillante")).toBeUndefined();
        expect(emocionChatAVoz("")).toBeUndefined();
        expect(emocionChatAVoz(undefined)).toBeUndefined();
        expect(emocionChatAVoz(null)).toBeUndefined();
    });
});
