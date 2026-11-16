/* src/lib/traductor/__tests__/conversacion.test.ts */
import { describe, it, expect } from "vitest";
import {
    inicial,
    pulsarHablar,
    resultadoParcial,
    resultadoFinal,
    traducionLista,
    finDeVoz,
    error,
    Speaker,
} from "../../conversacion";

declare const global: any;

describe("máquina de conversación", () => {
    it("debe seguir la secuencia A→B→A", () => {
        const m = { ...inicial };
        pulsarHablar(m, "A");
        expect(m.estado).toBe("ESCUCHANDO_A");
        resultadoParcial(m, "Hola");
        expect(m.turno?.texto).toBe("Hola");
        resultadoFinal(m, "Hola");
        expect(m.estado).toBe("TRADUCIR_A");
        traducionLista(m, "Hi");
        expect(m.estado).toBe("HABLANDO_B");
        finDeVoz(m);
        expect(m.estado).toBe("ESCUCHANDO_B");
        // Next turn A again
        pulsarHablar(m, "A");
        expect(m.estado).toBe("ESCUCHANDO_A");
    });

    it("maneja error durante traducción", () => {
        const m = { ...inicial };
        pulsarHablar(m, "A");
        resultadoParcial(m, "Hola");
        resultadoFinal(m, "Hola");
        // Simulate error before speaking
        error(m, "traducción falló");
        expect(m.estado).toBe("ESCUCHANDO_B");
    });

    it("secuencia sin voz de destino pasa directamente", () => {
        const m = { ...inicial };
        pulsarHablar(m, "A");
        resultadoParcial(m, "Hola");
        resultadoFinal(m, "Hola");
        // No traducionLista, fin de voz encolado, salto a B
        finDeVoz(m);
        expect(m.estado).toBe("ESCUCHANDO_B");
    });

    it("puede encolar turnos que llegan durante habla", () => {
        const m = { ...inicial };
        pulsarHablar(m, "A");
        resultadoParcial(m, "HolaA");
        resultadoFinal(m, "HolaA");
        traducionLista(m, "HiA");
        // A is speaking now
        pulsarHablar(m, "B"); // encolado
        expect(m.encolados.length).toBe(1);
        finDeVoz(m); // finish A
        // B turn starts
        expect(m.estado).toBe("ESCUCHANDO_B");
        expect(m.encolados.length).toBe(0);
        expect(m.turno?.quien).toBe("B");
    });
});
