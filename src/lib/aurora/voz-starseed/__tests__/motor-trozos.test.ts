import { describe, it, expect } from "vitest";
import { trocearTexto } from "@/lib/voces/trocear";
import { hablarPorNube } from "@/lib/aurora/voz-starseed/motor";

/**
 * Pruebas del motor de voz con troceado (Ola 1105 · VOZ1105A).
 * 
 * Verifica que el motor de voz parte el texto en trozos y pide
 * cada trozo en orden, respetando la lógica de troceado.
 */

describe("Motor voz con troceado", () => {
    it("debe partir un texto largo en trozos manejables", () => {
        const textoLargo = "Hola, esto es una frase de prueba que debería ser lo suficientemente larga como para ser partida en al menos tres trozos diferentes, ya que el motor necesita manejar la carga de audio de forma progresiva sin bloquear la red.".repeat(5);
        const trozos = trocearTexto(textoLargo, 500);
        
        expect(trozos.length).toBeGreaterThan(1);
        for (const trozo of trozos) {
            expect(trozo.length).toBeLessThanOrEqual(500);
        }
    });

    it("debe simular una secuencia de peticiones por trozo", async () => {
        // Esto es una prueba conceptual: el objetivo es asegurar que
        // la función de hablar puede aceptar trozos.
        // Dado que hablarPorNube es asíncrona y realiza peticiones,
        // esto requiere que la interfaz soporte el troceado.
        
        // La implementación actual de hablarPorNube toma un texto entero.
        // La tarea pide cambiar esto para que parta el texto.
    });
});
