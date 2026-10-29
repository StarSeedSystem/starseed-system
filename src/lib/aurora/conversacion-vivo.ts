"use client";

/**
 * CONVERSACIÓN EN VIVO con Astraura — un turno de punta a punta (2026-09-22).
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes el orbe esperaba la respuesta ENTERA (hasta 120 s) y después la leía frase a frase
 * con un motor 4 veces más lento que el tiempo real. Ahora, en el mismo turno:
 *
 *   texto del usuario → /api/astraura/conversacion (BitNet local primero, nube en carrera)
 *     → tokens en streaming → troceador de cláusulas (`streaming-voice.ts`)
 *     → cada cláusula a la voz en tiempo real (`voz-rt.ts`), que suena sin huecos.
 *
 * Si el primer token tarda, una muletilla ya calculada («Mmm, a ver…») llena el silencio
 * como lo haría una persona. El historial se guarda con el texto EXACTO de cada respuesta:
 * así el prompt del siguiente turno empieza igual que el anterior y BitNet reutiliza su
 * caché (solo procesa lo nuevo).
 */

import { eventoDeLinea, type TurnoConversacion } from "@/lib/astraura/conversacion-rapida";
import { createStreamingVoice } from "@/lib/aurora/streaming-voice";
import { vozDePersona, vozRT } from "@/lib/aurora/voz-rt";
import {
    PRESUPUESTO_PRIMER_SONIDO_MS,
    TROZO_CONVERSACION_MAX,
    medidasPorMotor,
    planificarCharla,
    trozosDeConversacion,
    type MedidaMotor,
    type TrozoVoz,
} from "@/lib/aurora/tts-oss/conversacion-fluida";
import { leerMedidas } from "@/lib/aurora/medidas-voz";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";
import { normalizar, registrarDicho, repeticionEnTexto } from "@/lib/aurora/anti-bucle-voz";

const MULETILLA_TRAS_MS = 1200;
const HISTORIAL_TURNOS = 12;
/** Motor del servicio de voz en vivo: la voz F1 de Supertonic en esta neurona. */
const MOTOR_VIVO = "supertonic";

let historial: TurnoConversacion[] = [];
let personaDelHistorial = "";

export interface ResultadoTurnoVivo {
    texto: string;
    motor: string;
    local: boolean;
    msPrimerToken: number | null;
    msTotal: number;
    /** Audio estimado del turno (medido por carácter del propio motor). */
    msAudioEstimado?: number;
    /** ¿El plan medido cabe en el presupuesto de conversación (sin silencios)? */
    dentroPresupuestoVoz?: boolean;
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

    // Lo MEDIDO en esta neurona (primer sonido y factor de tiempo real) decide
    // si el plan del turno cabe; nunca se inventa una latencia de ficha.
    const medidasPorId = medidasPorMotor(
        leerMedidas(neuronDeviceIdActual()).map((m) => ({ motor: m.motor, tipo: m.tipo, valor: m.valor })),
    );
    const diagnosticoVoz = voz.diagnostico().medidas;
    const medidaGuardada = medidasPorId[MOTOR_VIVO];
    // Si la medida guardada no trae factor de tiempo real, se usa el que el
    // propio reproductor acaba de medir en esta neurona (nunca una ficha).
    const medidaViva: MedidaMotor | null = medidaGuardada
        ? { ...medidaGuardada, factorTiempoReal: medidaGuardada.factorTiempoReal ?? diagnosticoVoz.rtf }
        : null;
    // Duración real por carácter aprendida por el reproductor de esta neurona.
    const segPorCaracter = diagnosticoVoz.segPorCaracter;
    const trozosDelTurno: TrozoVoz[] = [];
    let planDelTurno: ReturnType<typeof planificarCharla> | null = null;

    let empezo = false;
    const alHablar = () => {
        if (!empezo) {
            empezo = true;
            opts.onInicioVoz?.();
        }
    };
    // (2026-09-27) Una cláusula ya dicha en este turno no se repite: BitNet 2B
    // sin penalización a veces encadena la misma frase y la voz la leía en bucle.
    const clausulasDichas = new Set<string>();
    const troceador = createStreamingVoice({
        speak: (clausula) => {
            // Troceado del OS (`voces/trocear.ts`): la frase se habla YA y, si es
            // larga, sus trozos se encolan en orden mientras suena el anterior.
            const trozos = clausula.length > TROZO_CONVERSACION_MAX
                ? trozosDeConversacion(clausula)
                : [clausula];
            for (const trozo of trozos) {
                const clave = normalizar(trozo).join(" ");
                if (clave && clausulasDichas.has(clave)) continue;
                if (clave) clausulasDichas.add(clave);
                try {
                    registrarDicho(trozo, Date.now());
                } catch {
                    /* */
                }
                alHablar();
                voz.encolar(trozo, { voz: vozId });
                trozosDelTurno.push({
                    texto: trozo,
                    duracionAudioMs: Math.max(1, Math.round(trozo.length * segPorCaracter * 1000)),
                });
            }
            // VZR1011D: se planifica el turno con lo medido para no fingir que
            // no hay silencios cuando el motor no llega al presupuesto.
            if (medidaViva && trozosDelTurno.length) {
                planDelTurno = planificarCharla(trozosDelTurno, medidaViva, {
                    presupuestoMs: PRESUPUESTO_PRIMER_SONIDO_MS,
                });
                if (!planDelTurno.dentroPresupuesto) {
                    try {
                        console.info(
                            `[voz] ${MOTOR_VIVO}: silencio ${Math.round(planDelTurno.silencioMaximoMs)} ms ` +
                            `(presupuesto ${PRESUPUESTO_PRIMER_SONIDO_MS} ms)`,
                        );
                    } catch { /* sin consola */ }
                }
            }
        },
        initialPersonaId: opts.persona.id,
    });

    let primerToken = false;
    const muletilla = setTimeout(() => {
        if (!primerToken && voz.muletilla(vozId)) alHablar();
    }, MULETILLA_TRAS_MS);

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
                    troceador.feed(e.v);
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
        troceador.flush();
    } catch {
        troceador.stop();
        return null;
    } finally {
        clearTimeout(muletilla);
    }
    if (!texto.trim()) return null;
    historial = [...historial, { rol: "usuario" as const, texto: opts.texto }, { rol: "astraura" as const, texto }].slice(
        -HISTORIAL_TURNOS,
    );
    const base = fin ?? { texto, motor: "desconocido", local: false, msPrimerToken: null, msTotal: Date.now() - inicio };
    const msAudioEstimado = trozosDelTurno.reduce((suma, t) => suma + t.duracionAudioMs, 0);
    const planFinal = planDelTurno as ReturnType<typeof planificarCharla> | null;
    return planFinal
        ? { ...base, msAudioEstimado, dentroPresupuestoVoz: planFinal.dentroPresupuesto }
        : { ...base, msAudioEstimado };
}
