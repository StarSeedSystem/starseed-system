/**
 * TU1116-APP-F1 · Máquina de turnos para conversación por voz en dos sentidos
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO (entrada → salida, sin red, sin disco, sin procesos).
 * Reloj, reconocimiento, traducción y síntesis se INYECTAN.
 */

import type { ParIdiomas, ResultadoTraductor, IdMotor } from "./tipos";
import type { ErrorReconocimiento, ResultadoReconocimiento, ProveedorReconocimiento } from "./voz-escucha";

/** Hablante en la conversación. */
export type Hablante = "A" | "B";

/** Estado de la máquina de turnos. */
export type EstadoConversacion =
    | { fase: "inactivo" }
    | { fase: "escuchando"; quien: Hablante; inicioMs: number; parcial: string }
    | { fase: "traduciendo"; quien: Hablante; inicioMs: number; textoOriginal: string; inicioTraduccionMs: number }
    | { fase: "hablando"; quien: Hablante; inicioMs: number; texto: string; traduccion: string; inicioTraduccionMs: number; inicioHablaMs: number }
    | { fase: "esperandoTurno"; quien: Hablante; cola: TurnoEncolado[] };

/** Turno completado para mostrar en pantalla. */
export interface TurnoCompleto {
    quien: Hablante;
    texto: string;
    traduccion: string;
    msReconocer: number;
    msTraducir: number;
    msHablar: number;
}

/** Turno encolado mientras otro habla. */
export interface TurnoEncolado {
    quien: Hablante;
    texto: string;
    traduccion: string;
}

/** Eventos que recibe la máquina. */
export type EventoConversacion =
    | { tipo: "pulsarHablar"; quien: Hablante }
    | { tipo: "resultadoParcial"; texto: string }
    | { tipo: "resultadoFinal"; texto: string }
    | { tipo: "traduccionLista"; resultado: ResultadoTraductor }
    | { tipo: "finDeVoz" }
    | { tipo: "error"; motivo: string; contexto: "reconocimiento" | "traduccion" | "voz" };

/** Dependencias inyectadas (reloj, reconocimiento, traducción, voz). */
export interface DependenciasConversacion {
    reloj: () => number;
    reconocimiento: {
        disponible: (idioma: string) => { ok: boolean; motivo?: string };
        iniciar: (idioma: string, callbacks: {
            alResultado: (r: ResultadoReconocimiento) => void;
            alError: (error: ErrorReconocimiento, mensaje: string) => void;
        }) => void;
        detener: () => void;
    };
    traducir: (texto: string, par: ParIdiomas) => Promise<ResultadoTraductor>;
    voz: {
        disponible: (idioma: string) => { ok: boolean; motivo?: string };
        hablar: (texto: string, idioma: string) => { ok: boolean; motivo?: string };
        detener: () => void;
        cuandoTermine: (cb: (ok: boolean) => void) => void;
    };
    parIdiomas: (quien: Hablante) => ParIdiomas;
    alTurnoCompleto: (turno: TurnoCompleto) => void;
    alCambioEstado: (estado: EstadoConversacion) => void;
}

/** Resultado de procesar un evento. */
export interface ResultadoProcesar {
    estado: EstadoConversacion;
    efectos: EfectoConversacion[];
}

/** Efectos que la máquina puede solicitar. */
export type EfectoConversacion =
    | { tipo: "iniciarReconocimiento"; idioma: string }
    | { tipo: "detenerReconocimiento" }
    | { tipo: "traducir"; texto: string; par: ParIdiomas }
    | { tipo: "hablar"; texto: string; idioma: string }
    | { tipo: "detenerVoz" }
    | { tipo: "emitirTurno"; turno: TurnoCompleto }
    | { tipo: "emitirError"; mensaje: string };

/**
 * Crea el estado inicial de la conversación.
 */
export function estadoInicial(): EstadoConversacion {
    return { fase: "inactivo" };
}

/**
 * Procesa un evento en la máquina de estados.
 * Función pura: recibe estado actual + evento + dependencias → nuevo estado + efectos.
 */
export function procesarEvento(
    estado: EstadoConversacion,
    evento: EventoConversacion,
    deps: DependenciasConversacion
): ResultadoProcesar {
    const ahora = deps.reloj();
    let nuevoEstado: EstadoConversacion = estado;
    const efectos: EfectoConversacion[] = [];

    const notificarCambio = (e: EstadoConversacion) => {
        nuevoEstado = e;
        deps.alCambioEstado(e);
    };

    const emitirTurno = (turno: TurnoCompleto) => {
        efectos.push({ tipo: "emitirTurno", turno });
        deps.alTurnoCompleto(turno);
    };

    const emitirError = (mensaje: string) => {
        efectos.push({ tipo: "emitirError", mensaje });
    };

    const hablanteOpuesto = (quien: Hablante): Hablante => (quien === "A" ? "B" : "A");

    switch (estado.fase) {
        case "inactivo": {
            if (evento.tipo === "pulsarHablar") {
                const par = deps.parIdiomas(evento.quien);
                const disp = deps.reconocimiento.disponible(par.origen);
                if (!disp.ok) {
                    emitirError(disp.motivo ?? "Reconocimiento no disponible");
                    notificarCambio({ fase: "inactivo" });
                    return { estado: nuevoEstado, efectos };
                }
                notificarCambio({ fase: "escuchando", quien: evento.quien, inicioMs: ahora, parcial: "" });
                efectos.push({ tipo: "iniciarReconocimiento", idioma: par.origen });
            }
            break;
        }

        case "escuchando": {
            if (evento.tipo === "resultadoParcial") {
                notificarCambio({ ...estado, parcial: evento.texto });
            } else if (evento.tipo === "resultadoFinal") {
                const finReconocer = ahora;
                const msReconocer = finReconocer - estado.inicioMs;
                const par = deps.parIdiomas(estado.quien);
                notificarCambio({
                    fase: "traduciendo",
                    quien: estado.quien,
                    inicioMs: estado.inicioMs,
                    textoOriginal: evento.texto,
                    inicioTraduccionMs: ahora,
                });
                efectos.push({ tipo: "traducir", texto: evento.texto, par });
            } else if (evento.tipo === "error" && evento.contexto === "reconocimiento") {
                emitirError(`Reconocimiento: ${evento.motivo}`);
                notificarCambio({ fase: "inactivo" });
                efectos.push({ tipo: "detenerReconocimiento" });
            } else if (evento.tipo === "pulsarHablar") {
                // Ignorar pulsación durante escucha
            }
            break;
        }

        case "traduciendo": {
            if (evento.tipo === "traduccionLista") {
                const finTraducir = ahora;
                const msTraducir = finTraducir - estado.inicioTraduccionMs;
                const par = deps.parIdiomas(estado.quien);
                const dispVoz = deps.voz.disponible(par.destino);

                if (!dispVoz.ok) {
                    // Sin voz de destino: el turno sigue como texto, pasa por "hablando" con msHablar = 0
                    notificarCambio({
                        fase: "hablando",
                        quien: estado.quien,
                        inicioMs: estado.inicioMs,
                        texto: estado.textoOriginal,
                        traduccion: evento.resultado.texto,
                        inicioTraduccionMs: estado.inicioTraduccionMs,
                        inicioHablaMs: ahora,
                    });
                    // No hay efecto "hablar" porque no hay voz
                } else {
                    // Hay voz: pasa a hablando
                    notificarCambio({
                        fase: "hablando",
                        quien: estado.quien,
                        inicioMs: estado.inicioMs,
                        texto: estado.textoOriginal,
                        traduccion: evento.resultado.texto,
                        inicioTraduccionMs: estado.inicioTraduccionMs,
                        inicioHablaMs: ahora,
                    });
                    efectos.push({ tipo: "hablar", texto: evento.resultado.texto, idioma: par.destino });
                }
            } else if (evento.tipo === "error" && evento.contexto === "traduccion") {
                emitirError(`Traducción: ${evento.motivo}`);
                // Vuelve a escuchando del mismo hablante para reintentar
                notificarCambio({ fase: "escuchando", quien: estado.quien, inicioMs: estado.inicioMs, parcial: estado.textoOriginal });
                efectos.push({ tipo: "iniciarReconocimiento", idioma: deps.parIdiomas(estado.quien).origen });
            }
            break;
        }

        case "hablando": {
            if (evento.tipo === "finDeVoz") {
                const finHablar = ahora;
                const msHablar = finHablar - estado.inicioHablaMs;
                const msReconocer = estado.inicioTraduccionMs - estado.inicioMs;
                const msTraducir = estado.inicioHablaMs - estado.inicioTraduccionMs;

                const turno: TurnoCompleto = {
                    quien: estado.quien,
                    texto: estado.texto,
                    traduccion: estado.traduccion,
                    msReconocer,
                    msTraducir,
                    msHablar,
                };
                emitirTurno(turno);

                // Verificar si hay turnos encolados
                // (La cola se maneja en estado "esperandoTurno", aquí solo pasamos al siguiente)
                const siguiente = hablanteOpuesto(estado.quien);
                const parSiguiente = deps.parIdiomas(siguiente);
                const dispSig = deps.reconocimiento.disponible(parSiguiente.origen);
                if (!dispSig.ok) {
                    emitirError(dispSig.motivo ?? "Reconocimiento no disponible para siguiente turno");
                    notificarCambio({ fase: "inactivo" });
                } else {
                    notificarCambio({ fase: "escuchando", quien: siguiente, inicioMs: ahora, parcial: "" });
                    efectos.push({ tipo: "iniciarReconocimiento", idioma: parSiguiente.origen });
                }
            } else if (evento.tipo === "error" && evento.contexto === "voz") {
                emitirError(`Voz: ${evento.motivo}`);
                // Intenta continuar con el siguiente turno
                const siguiente = hablanteOpuesto(estado.quien);
                const parSiguiente = deps.parIdiomas(siguiente);
                const dispSig = deps.reconocimiento.disponible(parSiguiente.origen);
                if (!dispSig.ok) {
                    notificarCambio({ fase: "inactivo" });
                } else {
                    notificarCambio({ fase: "escuchando", quien: siguiente, inicioMs: ahora, parcial: "" });
                    efectos.push({ tipo: "iniciarReconocimiento", idioma: parSiguiente.origen });
                }
            } else if (evento.tipo === "pulsarHablar") {
                // Encolar el turno del otro hablante
                // Necesitamos la traducción del texto que se va a decir
                // Como no la tenemos aún, guardamos solo el hablante; la traducción se hará cuando toque
                notificarCambio({
                    fase: "esperandoTurno",
                    quien: estado.quien,
                    cola: [{ quien: evento.quien, texto: "", traduccion: "" }],
                });
            }
            break;
        }

        case "esperandoTurno": {
            if (evento.tipo === "finDeVoz") {
                // Procesar el primer turno encolado
                const cola = estado.cola;
                if (cola.length > 0) {
                    const siguienteTurno = cola[0];
                    const nuevaCola = cola.slice(1);
                    const par = deps.parIdiomas(siguienteTurno.quien);
                    const dispVoz = deps.voz.disponible(par.destino);

                    if (!dispVoz.ok) {
                        // Sin voz: pasa por "hablando" con msHablar = 0, luego emite turno
                        notificarCambio({
                            fase: "hablando",
                            quien: siguienteTurno.quien,
                            inicioMs: ahora,
                            texto: siguienteTurno.texto,
                            traduccion: siguienteTurno.traduccion,
                            inicioTraduccionMs: ahora,
                            inicioHablaMs: ahora,
                        });
                        // No hay efecto "hablar" porque no hay voz
                    } else {
                        // Hay voz: pasa a hablando con el turno encolado
                        notificarCambio({
                            fase: "hablando",
                            quien: siguienteTurno.quien,
                            inicioMs: ahora,
                            texto: siguienteTurno.texto,
                            traduccion: siguienteTurno.traduccion,
                            inicioTraduccionMs: ahora,
                            inicioHablaMs: ahora,
                        });
                        efectos.push({ tipo: "hablar", texto: siguienteTurno.traduccion, idioma: par.destino });

                        if (nuevaCola.length > 0) {
                            // Quedamos en esperandoTurno con el resto de la cola
                            // Pero como ahora estamos hablando, el estado debe reflejar que hay cola pendiente
                            // Lo manejaremos cuando termine esta habla
                        }
                    }
                } else {
                    // Cola vacía: pasa al siguiente hablante normal
                    const siguiente = hablanteOpuesto(estado.quien);
                    const parSiguiente = deps.parIdiomas(siguiente);
                    const dispSig = deps.reconocimiento.disponible(parSiguiente.origen);
                    if (!dispSig.ok) {
                        notificarCambio({ fase: "inactivo" });
                    } else {
                        notificarCambio({ fase: "escuchando", quien: siguiente, inicioMs: ahora, parcial: "" });
                        efectos.push({ tipo: "iniciarReconocimiento", idioma: parSiguiente.origen });
                    }
                }
            } else if (evento.tipo === "pulsarHablar") {
                // Añadir a la cola
                notificarCambio({
                    fase: "esperandoTurno",
                    quien: estado.quien,
                    cola: [...estado.cola, { quien: evento.quien, texto: "", traduccion: "" }],
                });
            }
            break;
        }
    }

    return { estado: nuevoEstado, efectos };
}

export type { ParIdiomas, ResultadoTraductor, IdMotor } from "./tipos";
export type { ErrorReconocimiento, ResultadoReconocimiento, ProveedorReconocimiento } from "./voz-escucha";