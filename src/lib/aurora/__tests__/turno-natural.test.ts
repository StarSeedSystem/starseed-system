import { describe, expect, it } from "vitest";

import {
    ESPERA_ABIERTO_MS,
    ESPERA_CERRADO_MS,
    ESPERA_CORTO_MS,
    ESPERA_PREGUNTA_MS,
    TURNO_MAX_MS,
    crearTurnoNatural,
    esPregunta,
    esperaParaCerrar,
    pareceIncompleto,
} from "../turno-natural";

describe("turno natural · ¿terminó de explicar?", () => {
    it("un conector, una coma o una muletilla al final dicen que sigue", () => {
        expect(pareceIncompleto("quiero que abras la librería y")).toBe(true);
        expect(pareceIncompleto("esto pasa porque")).toBe(true);
        expect(pareceIncompleto("primero,")).toBe(true);
        expect(pareceIncompleto("lo que necesito es, eh")).toBe(true);
        expect(pareceIncompleto("y entonces o sea")).toBe(true);
        expect(pareceIncompleto("déjame pensar…")).toBe(true);
    });

    it("una frase cerrada o una pregunta no", () => {
        expect(pareceIncompleto("abre la librería de StarSeed")).toBe(false);
        expect(pareceIncompleto("¿qué hora es?")).toBe(false);
        expect(esPregunta("qué tiempo hace hoy en Madrid")).toBe(true);
        expect(esPregunta("abre el café")).toBe(false);
    });

    it("la espera depende de lo dicho", () => {
        expect(esperaParaCerrar("quiero contarte algo y")).toBe(ESPERA_ABIERTO_MS);
        expect(esperaParaCerrar("Astraura")).toBe(ESPERA_CORTO_MS);
        expect(esperaParaCerrar("¿me lees las notificaciones?")).toBe(ESPERA_PREGUNTA_MS);
        expect(esperaParaCerrar("abre la librería de StarSeed por favor")).toBe(ESPERA_CERRADO_MS);
        expect(ESPERA_PREGUNTA_MS).toBeLessThan(ESPERA_CERRADO_MS);
        expect(ESPERA_CERRADO_MS).toBeLessThan(ESPERA_ABIERTO_MS);
    });
});

describe("turno natural · una explicación larga con pausas es UN turno", () => {
    it("junta los trozos y no cierra en la pausa de un conector", () => {
        const t = crearTurnoNatural();
        t.agregar("te quería explicar que la voz", 0);
        t.agregar("funciona al principio pero", 1500);
        // 1,5 s después de «pero»: sigue esperando.
        expect(t.debeCerrar(3000)).toBe(false);
        t.agregar("después se degrada la calidad", 3800);
        expect(t.debeCerrar(3800 + ESPERA_CERRADO_MS - 1)).toBe(false);
        expect(t.debeCerrar(3800 + ESPERA_CERRADO_MS)).toBe(true);
        expect(t.texto()).toBe("te quería explicar que la voz funciona al principio pero después se degrada la calidad");
    });

    it("la actividad (voz o parcial) aplaza el cierre", () => {
        const t = crearTurnoNatural();
        t.agregar("abre la librería", 0);
        t.actividad(800);
        expect(t.debeCerrar(1000)).toBe(false);
        expect(t.debeCerrar(800 + ESPERA_CERRADO_MS)).toBe(true);
    });

    it("no duplica el trozo repetido al reengancharse y tiene tope", () => {
        const t = crearTurnoNatural();
        t.agregar("hola", 0);
        t.agregar("hola", 10);
        expect(t.texto()).toBe("hola");
        for (let ms = 0; ms < TURNO_MAX_MS; ms += 1000) t.agregar("sigo hablando y " + ms, ms);
        expect(t.debeCerrar(TURNO_MAX_MS)).toBe(true);
    });

    it("vacío nunca cierra; faltaMs nunca es negativo; reiniciar limpia", () => {
        const t = crearTurnoNatural();
        expect(t.debeCerrar(99999)).toBe(false);
        t.agregar("abre la librería ahora mismo", 0);
        expect(t.faltaMs(10_000)).toBe(50);
        t.reiniciar();
        expect(t.vacio()).toBe(true);
    });
});
