"use client";

/**
 * CONVERSACIÓN EN VIVO con Astraura — un turno de punta a punta (2026-09-22).
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes el orbe esperaba la respuesta ENTERA (hasta 120 s) y después la leía frase a frase
 * con un motor 4 veces más lento que el tiempo real. Ahora, en el mismo turno:
 *
 *   texto del usuario → /api/astraura/conversacion (BitNet local primero, nube en carrera)
 *     → tokens en streaming → FRASES YA CERRADAS (`planificarTurno` sobre
 *     `trocear.ts` del contrato VZR1011D)
 *     → cada frase a la voz en tiempo real (`voz-rt.ts`), que suena sin huecos.
 *
 * Plática fluida (contrato §2): el motor se elige por lo MEDIDO y la primera
 * frase suena mientras el modelo sigue escribiendo; la siguiente frase se
 * sintetiza mientras suena la anterior (la cadena de `voz-rt`). Si la persona
 * empieza a hablar, el corte se mide con el mismo reloj (`evaluarInterrupcion`,
 * ≤ 100 ms) y el turno queda escuchando; si lo medido de ESTA neurona dice que
 * la primera frase no llega al presupuesto de 0,8 s, una muletilla ya
 * calculada cubre la espera.
 *
 * Si el primer token tarda, una muletilla ya calculada («Mmm, a ver…») llena el silencio
 * como lo haría una persona. El historial se guarda con el texto EXACTO de cada respuesta:
 * así el prompt del siguiente turno empieza igual que el anterior y BitNet reutiliza su
 * caché (solo procesa lo nuevo).
 */

import { eventoDeLinea, type TurnoConversacion } from "@/lib/astraura/conversacion-rapida";
import {
    LIMITE_INTERRUPCION_MS,
    PRESUPUESTO_PRIMER_SONIDO_MS,
    cronograma,
    evaluarInterrupcion,
    medidasPorMotor,
    modoHablaDe,
    planificarTurno,
    type Interrupcion,
} from "@/lib/aurora/tts-oss/conversacion-fluida";
import { getVoiceConfig } from "@/lib/aurora/tts-oss/voice-config";
import { leerMedidas } from "@/lib/aurora/medidas-voz";
import { vozDePersona, vozRT } from "@/lib/aurora/voz-rt";
import { normalizar, registrarDicho, repeticionEnTexto } from "@/lib/aurora/anti-bucle-voz";

const MULETILLA_TRAS_MS = 1200;
const HISTORIAL_TURNOS = 12;

let historial: TurnoConversacion[] = [];
let personaDelHistorial = "";

/** Corta en medido (con `performance.now`); sin reloj, 0 en ambos extremos. Pura. */
function relojMs(): number {
    try { return performance.now(); } catch { return 0; }
}

/** Un turno de conversación, tal y como se contó en la interfaz. */
export interface ResultadoTurnoVivo {
    texto: string;
    motor: string;
    local: boolean;
    msPrimerToken: number | null;
    msTotal: number;
}

/** ¿Se puede conversar en vivo aquí? (servidor de voz en tiempo real listo). */
export async function conversacionEnVivoDisponible(): Promise<boolean> {
    try {
        return await vozRT().disponible();
    } catch {
        return false;
    }
}

/** Olvida la conversación (al cerrar el orbe o cambiar de personalidad). */
export function reiniciarConversacionViva(): void {
    historial = [];
    personaDelHistorial = "";
}

/**
 * La persona empieza a hablar (barge-in): la voz se calla AL INSTANTE y queda
 * escuchando (contrato §2.3). El corte se mide con el mismo reloj de la
 * síntesis (detección → voz callada, `evaluarInterrupcion`); si se pasa del
 * límite de 100 ms queda en el log, con su cifra, para arreglarla. También deja
 * de alimentar el turno en curso (cambia la generación de la voz). NUNCA lanza.
 */
export function interrumpirConversacionViva(): Interrupcion {
    const deteccion = relojMs();
    try {
        vozRT().detener();
    } catch {
        /* sin voz que callar */
    }
    const resultado = evaluarInterrupcion(deteccion, relojMs());
    if (!resultado.rapida) {
        try {
            console.warn(`[conversacion-vivo] corte en ${resultado.msHastaCortar} ms (≥ ${LIMITE_INTERRUPCION_MS} ms)`);
        } catch {
            /* sin consola */
        }
    }
    return resultado;
}

export async function turnoEnVivo(opts: {
    texto: string;
    persona: { id: string; nombre: string };
    onInicioVoz?: () => void;
    onPrimerToken?: (motor: string, local: boolean) => void;
    senal?: AbortSignal;
}): Promise<ResultadoTurnoVivo | null> {
    const voz = vozRT();
    const vozId = vozDePersona(opts.persona.id);
    if (personaDelHistorial && personaDelHistorial !== opts.persona.id) historial = [];
    personaDelHistorial = opts.persona.id;
    voz.iniciarConversacion("orbe", vozId);
    // Si alguien cortó la voz mientras este turno escribía, deja de alimentarlo
    // (la generación de la voz cambió): el corte manda sobre el turno.
    const genTurno = voz.generacion();

    // Plática fluida (contrato §2): en CONVERSACIÓN la primera frase suena antes
    // del presupuesto de 0,8 s con el motor elegido por lo MEDIDO; en LECTURA es
    // el colchón de 'voz-rt' el que decide cuándo empezar (calidad antes que
    // prisa) y aquí no se inventa ninguna espera extra.
    const conversacion = modoHablaDe(getVoiceConfig()) === "conversacion";

    let empezo = false;
    const alHablar = () => {
        if (!empezo) {
            empezo = true;
            opts.onInicioVoz?.();
        }
    };
    // (2026-09-27) Una frase ya dicha en este turno no se repite: BitNet 2B
    // sin penalización a veces encadena la misma frase y la voz la leía en bucle.
    const clausulasDichas = new Set<string>();
    const decir = (frase: string) => {
        const clave = normalizar(frase).join(" ");
        if (!clave || clausulasDichas.has(clave)) return;
        clausulasDichas.add(clave);
        try {
            registrarDicho(frase, Date.now());
        } catch {
            /* */
        }
        // Pronóstico con lo MEDIDO en ESTA neurona (contrato §2.4): si el primer
        // sonido de la primera frase va a llegar al turno tarde (lo medido de
        // "supertonic" lo dice), una muletilla ya calculada cubre la espera — el
        // mismo cálculo puro del contrato, `cronograma`, con el presupuesto de
        // 0,8 s. Solo CASO PRIMERO: si la voz todavía no suena nada.
        const previo = typeof voz.hablando === "function" ? voz.hablando() : false;
        if (conversacion && !previo) {
            try {
                const regla = medidasPorMotor(leerMedidas()).find((m) => m.motor === "supertonic" && typeof m.primerSonidoMs === "number");
                if (regla?.primerSonidoMs != null) {
                    const audioMs = (frase.length * Math.max(voz.diagnostico().medidas.segPorCaracter, 0.01)) * 1000;
                    const espera = Math.max(0, regla.primerSonidoMs - PRESUPUESTO_PRIMER_SONIDO_MS);
                    const plan = cronograma([Math.round(audioMs)], espera, PRESUPUESTO_PRIMER_SONIDO_MS);
                    if (!plan.dentroDelPresupuesto) {
                        clearTimeout(muletilla);
                        if (voz.muletilla(vozId)) alHablar();
                    }
                }
            } catch {
                /* sin medidas o sin pronóstico: la espera habitual */
            }
        }
        alHablar();
        voz.encolar(frase, { voz: vozId });
    };
    // Frases YA CERRADAS con `planificarTurno` (contrato VZR1011D: trocea por
    // calma, no por prisa). Los criterios de trocea son prefijo-estables: solo
    // el ÚLTIMO trozo puede crecer con los tokens siguientes — lo cerrado se
    // dice YA, y el creciente solo cuando cierra la frase (§2.2: el orden se
    // mantiene, no se parte una frase en pieces solo por prisa).
    const TERMINA_FRASE = /[.!?;:…]\s*$/;
    const decirPlan = (plan: { trozos: string[] }, todo: boolean) => {
        const trozos = plan.trozos;
        const cerrados = todo ? trozos.length : Math.max(trozos.length - 1, 0);
        for (let i = 0; i < cerrados; i++) decir(trozos[i]);
        if (!todo && trozos.length > 0) {
            const ultimo = trozos[trozos.length - 1];
            if (TERMINA_FRASE.test(ultimo.trim())) decir(ultimo);
        }
    };

    const muletilla = setTimeout(() => {
        if (!primerToken && voz.muletilla(vozId)) alHablar();
    }, MULETILLA_TRAS_MS);

    let primerToken = false;
    let texto = "";
    let degenerado = false;
    let fin: ResultadoTurnoVivo | null = null;
    const inicio = Date.now();
    try {
        const r = await fetch("/api/astraura/conversacion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texto: opts.texto, historial, persona: opts.persona }),
            signal: opts.senal,
        });
        if (!r.ok || !r.body) return null;
        const lector = r.body.getReader();
        const dec = new TextDecoder();
        let resto = "";
        for (;;) {
            const { value, done } = await lector.read();
            if (done) break;
            resto += dec.decode(value, { stream: true });
            const lineas = resto.split("\n");
            resto = lineas.pop() ?? "";
            if (degenerado) break;
            for (const l of lineas) {
                const e = eventoDeLinea(l);
                if (!e) continue;
                if (e.t === "ruta") {
                    primerToken = true;
                    clearTimeout(muletilla);
                    opts.onPrimerToken?.(e.motor, e.local);
                } else if (e.t === "token") {
                    texto += e.v;
                    // Generación degenerada (un tramo repetido 3+ veces): se corta
                    // aquí, se lee lo que ya estaba bien y no se pide más al motor.
                    if (repeticionEnTexto(texto)) {
                        degenerado = true;
                        break;
                    }
                    if (voz.generacion() !== genTurno) break; // alguien cortó la voz
                    decirPlan(planificarTurno(texto), false);
                } else if (e.t === "fin") {
                    fin = {
                        texto,
                        motor: e.motor,
                        local: e.local,
                        msPrimerToken: e.msPrimerToken,
                        msTotal: e.msTotal,
                    };
                } else if (e.t === "error") {
                    return null;
                }
            }
        }
        if (degenerado) {
            try {
                await lector.cancel();
            } catch {
                /* */
            }
        }
        decirPlan(planificarTurno(texto), true);
    } catch {
        return null;
    } finally {
        clearTimeout(muletilla);
    }
    if (!texto.trim()) return null;
    historial = [...historial, { rol: "usuario" as const, texto: opts.texto }, { rol: "astraura" as const, texto }].slice(
        -HISTORIAL_TURNOS,
    );
    return fin ?? { texto, motor: "desconocido", local: false, msPrimerToken: null, msTotal: Date.now() - inicio };
}
