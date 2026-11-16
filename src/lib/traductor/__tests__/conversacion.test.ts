/**
 * Tests para la máquina de turnos de conversación (TU1116-APP-F1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests de funciones puras: reloj inyectado, dependencias mockeadas.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    procesarEvento,
    estadoInicial,
    type EstadoConversacion,
    type EventoConversacion,
    type DependenciasConversacion,
    type TurnoCompleto,
    type Hablante,
    type ResultadoTraductor,
    type ParIdiomas,
    type ErrorReconocimiento,
    type ResultadoReconocimiento,
} from "../conversacion";

function crearDepsMock(overrides: Partial<DependenciasConversacion> = {}): DependenciasConversacion {
    const turnosCompletos: TurnoCompleto[] = [];
    const cambiosEstado: EstadoConversacion[] = [];

    return {
        reloj: () => 0,
        reconocimiento: {
            disponible: () => ({ ok: true }),
            iniciar: vi.fn(),
            detener: vi.fn(),
        },
        traducir: vi.fn().mockResolvedValue({
            texto: "translated",
            origenDetectado: "es",
            motor: "paquete-local",
            local: true,
            ms: 100,
        }),
        voz: {
            disponible: () => ({ ok: true }),
            hablar: vi.fn().mockReturnValue({ ok: true }),
            detener: vi.fn(),
            cuandoTermine: vi.fn((cb) => cb(true)),
        },
        parIdiomas: (quien: Hablante) => ({ origen: quien === "A" ? "es" : "en", destino: quien === "A" ? "en" : "es" }),
        alTurnoCompleto: (turno: TurnoCompleto) => turnosCompletos.push(turno),
        alCambioEstado: (estado: EstadoConversacion) => cambiosEstado.push(estado),
        ...overrides,
    };
}

function crearEstadoInicial(): EstadoConversacion {
    return estadoInicial();
}

describe("Máquina de turnos - conversación por voz", () => {
    let deps: DependenciasConversacion;
    let relojMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        relojMock = vi.fn().mockReturnValue(0);
        deps = crearDepsMock({ reloj: relojMock });
    });

    describe("Estado inicial", () => {
        it("empieza en inactivo", () => {
            const estado = estadoInicial();
            expect(estado.fase).toBe("inactivo");
        });
    });

    describe("Secuencia completa A → B → A", () => {
        it("procesa pulsarHablar(A) → escuchando(A)", () => {
            const estado = crearEstadoInicial();
            const evento: EventoConversacion = { tipo: "pulsarHablar", quien: "A" };
            const resultado = procesarEvento(estado, evento, deps);
            expect(resultado.estado.fase).toBe("escuchando");
            expect((resultado.estado as any).quien).toBe("A");
        });

        it("procesa resultadoFinal en escuchando → traduciendo", () => {
            let estado: EstadoConversacion = { fase: "escuchando", quien: "A", inicioMs: 0, parcial: "" };
            const evento: EventoConversacion = { tipo: "resultadoFinal", texto: "hola" };
            const resultado = procesarEvento(estado, evento, deps);
            expect(resultado.estado.fase).toBe("traduciendo");
        });

        it("procesa traduccionLista en traduciendo → hablando", () => {
            let estado: EstadoConversacion = { fase: "traduciendo", quien: "A", inicioMs: 0, textoOriginal: "hola", inicioTraduccionMs: 100 };
            const evento: EventoConversacion = { tipo: "traduccionLista", resultado: { texto: "hello", origenDetectado: "es", motor: "paquete-local", local: true, ms: 50 } };
            const resultado = procesarEvento(estado, evento, deps);
            expect(resultado.estado.fase).toBe("hablando");
        });

        it("procesa finDeVoz en hablando → escuchando(B)", () => {
            let estado: EstadoConversacion = {
                fase: "hablando",
                quien: "A",
                inicioMs: 0,
                texto: "hola",
                traduccion: "hello",
                inicioHablaMs: 200,
            };
            const evento: EventoConversacion = { tipo: "finDeVoz" };
            const resultado = procesarEvento(estado, evento, deps);
            expect(resultado.estado.fase).toBe("escuchando");
            expect((resultado.estado as any).quien).toBe("B");
        });

        it("emite turno completo con msReconocer, msTraducir, msHablar", () => {
            const turnos: TurnoCompleto[] = [];
            const depsConTurnos = crearDepsMock({
                alTurnoCompleto: (t) => turnos.push(t),
                reloj: vi.fn()
                    .mockReturnValueOnce(0)    // pulsarHablar: inicio escuchar A
                    .mockReturnValueOnce(100)  // resultadoFinal: fin reconocer A, inicio traducir A
                    .mockReturnValueOnce(150)  // traduccionLista: fin traducir A, inicio hablar A
                    .mockReturnValueOnce(300), // finDeVoz: fin hablar A
            });

            // Simular secuencia completa A
            let estado = procesarEvento(estadoInicial(), { tipo: "pulsarHablar", quien: "A" }, depsConTurnos);
            estado = procesarEvento(estado.estado, { tipo: "resultadoFinal", texto: "hola" }, depsConTurnos);
            estado = procesarEvento(estado.estado, { tipo: "traduccionLista", resultado: { texto: "hello", origenDetectado: "es", motor: "paquete-local", local: true, ms: 50 } }, depsConTurnos);
            estado = procesarEvento(estado.estado, { tipo: "finDeVoz" }, depsConTurnos);

            expect(turnos.length).toBe(1);
            expect(turnos[0].quien).toBe("A");
            expect(turnos[0].texto).toBe("hola");
            expect(turnos[0].traduccion).toBe("hello");
            expect(turnos[0].msReconocer).toBe(100);
            expect(turnos[0].msTraducir).toBe(50);
            expect(turnos[0].msHablar).toBe(150);
        });
    });

    describe("Error en traducir", () => {
        it("si traducir falla, emite error y vuelve a escuchando del mismo hablante", () => {
            const errores: string[] = [];
            const depsError = crearDepsMock({
                traducir: vi.fn().mockRejectedValue(new Error("falló traducción")),
                alTurnoCompleto: () => {},
                alCambioEstado: () => {},
            });

            let estado: EstadoConversacion = { fase: "traduciendo", quien: "A", inicioMs: 0, textoOriginal: "hola", inicioTraduccionMs: 100 };
            const evento: EventoConversacion = { tipo: "error", motivo: "falló traducción", contexto: "traduccion" };
            const resultado = procesarEvento(estado, evento, depsError);
            expect(resultado.estado.fase).toBe("escuchando");
            expect((resultado.estado as any).quien).toBe("A");
        });
    });

    describe("Sin voz de destino", () => {
        it("si voz.disponible devuelve false, el turno sigue como texto y lo dice (usa texto como traducción)", () => {
            const depsSinVoz = crearDepsMock({
                voz: {
                    disponible: () => ({ ok: false, motivo: "no hay voz en" }),
                    hablar: vi.fn().mockReturnValue({ ok: false, motivo: "no hay voz" }),
                    detener: vi.fn(),
                    cuandoTermine: vi.fn((cb) => cb(true)),
                },
            });

            let estado: EstadoConversacion = { fase: "traduciendo", quien: "A", inicioMs: 0, textoOriginal: "hola", inicioTraduccionMs: 100 };
            const evento: EventoConversacion = { tipo: "traduccionLista", resultado: { texto: "hello", origenDetectado: "es", motor: "paquete-local", local: true, ms: 50 } };
            const resultado = procesarEvento(estado, evento, depsSinVoz);
            // Debe pasar a hablando aunque no haya voz (usa texto)
            expect(resultado.estado.fase).toBe("hablando");
        });
    });

    describe("Pulsar durante 'hablando' se encola", () => {
        it("si se pulsa hablar mientras otro habla, el turno se encola", () => {
            const depsConCola = crearDepsMock({});

            let estado: EstadoConversacion = { fase: "hablando", quien: "A", inicioMs: 0, texto: "hola", traduccion: "hello", inicioTraduccionMs: 100, inicioHablaMs: 200 };
            const evento: EventoConversacion = { tipo: "pulsarHablar", quien: "B" };
            const resultado = procesarEvento(estado, evento, depsConCola);
            expect(resultado.estado.fase).toBe("esperandoTurno");
            expect((resultado.estado as any).cola.length).toBe(1);
        });

        it("al terminar de hablar, procesa el turno encolado", () => {
            const depsConCola = crearDepsMock({});

            let estado: EstadoConversacion = {
                fase: "esperandoTurno",
                quien: "A",
                cola: [{ quien: "B", texto: "hello", traduccion: "hola" }],
            };
            const evento: EventoConversacion = { tipo: "finDeVoz" };
            const resultado = procesarEvento(estado, evento, depsConCola);
            expect(resultado.estado.fase).toBe("hablando");
            expect((resultado.estado as any).quien).toBe("B");
        });
    });

    describe("Resultado parcial durante escuchando", () => {
        it("actualiza el texto parcial sin cambiar de estado", () => {
            let estado: EstadoConversacion = { fase: "escuchando", quien: "A", inicioMs: 0, parcial: "" };
            const evento: EventoConversacion = { tipo: "resultadoParcial", texto: "hola" };
            const resultado = procesarEvento(estado, evento, deps);
            expect(resultado.estado.fase).toBe("escuchando");
            expect((resultado.estado as any).parcial).toBe("hola");
        });
    });

    describe("Error en reconocimiento", () => {
        it("emite error y vuelve a inactivo", () => {
            let estado: EstadoConversacion = { fase: "escuchando", quien: "A", inicioMs: 0, parcial: "hola" };
            const evento: EventoConversacion = { tipo: "error", motivo: "no-speech", contexto: "reconocimiento" };
            const resultado = procesarEvento(estado, evento, deps);
            expect(resultado.estado.fase).toBe("inactivo");
        });
    });
});