"use client";

/**
 * CONVERSACIÓN EN VIVO con Astraura — un turno de punta a punta (2026-09-22).
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes el orbe esperaba la respuesta ENTERA (hasta 120 s) y después la leía frase a frase
 * con un motor 4 veces más lento que el tiempo real. Ahora, en el mismo turno:
 *
 *   texto del usuario → /api/astraura/conversacion (BitNet local primero, nube en carrera)
 *     → tokens en streaming → frases YA cerradas (`frasesListas` sobre `trocear.ts`)
 *     → cada frase a la voz en tiempo real (`voz-rt.ts`), que suena sin huecos.
 *
 * El motor se elige con lo MEDIDO en esta neurona (`conversacion-fluida.ts`) y
 * el plan de tandas evita huecos; si la persona interrumpe, el corte se mide
 * con el mismo reloj (≤ 100 ms) y el turno queda escuchando.
 *
 * Si el primer token tarda, una muletilla ya calculada («Mmm, a ver…») llena el silencio
 * como lo haría una persona. El historial se guarda con el texto EXACTO de cada respuesta:
 * así el prompt del siguiente turno empieza igual que el anterior y BitNet reutiliza su
 * caché (solo procesa lo nuevo).
 */

import { eventoDeLinea, type TurnoConversacion } from "@/lib/astraura/conversacion-rapida";
import {
    CARACTERES_POR_SEGUNDO,
    INTERRUPCION_MAX_MS,
    ORDEN_CAPAS,
    PRESUPUESTO_PRIMER_SONIDO_MS,
    capaDeMotor,
    crearEstadoVoz,
    elegirMotorVoz,
    estimarDuracionMs,
    frasesListas,
    interrumpirVoz,
    ordenarCadenaPorLatencia,
    planificarTandas,
    resumirMedidas,
    type CandidatoVoz,
    type EstadoVoz,
} from "@/lib/aurora/tts-oss/conversacion-fluida";
import { leerMedidas } from "@/lib/aurora/medidas-voz";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";
import { vozDePersona, vozRT } from "@/lib/aurora/voz-rt";
import { normalizar, registrarDicho, repeticionEnTexto } from "@/lib/aurora/anti-bucle-voz";

const MULETILLA_TRAS_MS = 1200;
const HISTORIAL_TURNOS = 12;
/** Motor que habla la conversación en vivo: la voz F1 de Supertonic de esta neurona. */
const MOTOR_CONVERSACION = "supertonic";
/** El suelo que nunca falla (voz del sistema), solo para razonar por capas. */
const MOTOR_SUELO = "browser";
/**
 * El troceador de frases no parte palabras ni frases a medias: el reproductor
 * (`voz-rt`) vuelve a trocear a 260 caracteres para pedir la síntesis.
 */
const MAX_FRASE = 100_000;

let historial: TurnoConversacion[] = [];
let personaDelHistorial = "";
/** Estado del turno vivo para medir la interrupción con el mismo reloj que la voz. */
let estadoVozConversacion: EstadoVoz = crearEstadoVoz(0, null);

export interface ResultadoTurnoVivo {
    texto: string;
    motor: string;
    local: boolean;
    msPrimerToken: number | null;
    msTotal: number;
    /** Duración estimada de lo hablado según los caracteres (solo orientativo). */
    msAudioEstimado?: number;
}

/**
 * Los motores que pueden hablar este turno, ordenados por CAPA y con lo medido
 * en ESTA neurona: Supertonic (aparato) y la voz del sistema (suelo). No se
 * inventan medidas: si no hay ninguna, el plan no finge que la hay.
 */
function candidatosDeVoz(): CandidatoVoz[] {
    let medidas: ReturnType<typeof resumirMedidas> = {};
    try {
        medidas = resumirMedidas(leerMedidas(neuronDeviceIdActual()));
    } catch {
        /* sin almacenamiento: se decide por capa, nunca por una medida inventada */
    }
    // La cadena se ordena con lo MEDIDO aquí (no con la latencia teórica); el
    // orden de capas manda y, dentro de cada capa, el primer sonido real.
    const cadena = ordenarCadenaPorLatencia([MOTOR_CONVERSACION, MOTOR_SUELO], medidas, {
        modo: "conversacion",
        presupuestoMs: PRESUPUESTO_PRIMER_SONIDO_MS,
    });
    const candidatos: CandidatoVoz[] = [];
    for (const motor of cadena) {
        const capa = capaDeMotor(motor);
        if (!ORDEN_CAPAS.includes(capa)) continue;
        candidatos.push({
            motor,
            capa,
            medida: medidas[motor] ?? null,
            calidad: motor === MOTOR_CONVERSACION ? 1 : 0.2,
            idioma: "es",
        });
    }
    return candidatos;
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
    estadoVozConversacion = crearEstadoVoz(Date.now(), null);
}

/**
 * La persona empieza a hablar (o pide cortar): la voz se calla al instante y el
 * turno queda «escuchando». Devuelve cuánto tardó el corte para no fingir
 * fluidez cuando el tope de 100 ms no se cumple. NUNCA lanza.
 */
export function interrumpirConversacionViva(ahora = Date.now()): {
    latenciaMs: number;
    dentroDelPresupuesto: boolean;
} {
    const corte = interrumpirVoz(estadoVozConversacion, ahora);
    estadoVozConversacion = corte.estado;
    if (corte.efectos.includes("cortar-audio")) {
        try { vozRT().detener(); } catch { /* la voz ya estaba parada */ }
    }
    if (!corte.dentroDelPresupuesto || corte.latenciaMs > INTERRUPCION_MAX_MS) {
        try {
            console.info(`[voz] interrupción en ${corte.latenciaMs} ms (tope ${INTERRUPCION_MAX_MS} ms)`);
        } catch { /* sin consola */ }
    }
    return { latenciaMs: corte.latenciaMs, dentroDelPresupuesto: corte.dentroDelPresupuesto };
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

    // Lo MEDIDO en esta neurona decide si se puede planificar el turno; la voz
    // sigue siendo siempre la misma (Supertonic F1), nunca se cambia a mitad.
    const candidatos = candidatosDeVoz();
    const eleccion = elegirMotorVoz(candidatos, {
        modo: "conversacion",
        presupuestoMs: PRESUPUESTO_PRIMER_SONIDO_MS,
        idioma: "es",
    });
    const planificarConMedidas = eleccion.medido && eleccion.motor === MOTOR_CONVERSACION;
    estadoVozConversacion = crearEstadoVoz(Date.now(), null);

    let empezo = false;
    const alHablar = () => {
        if (!empezo) {
            empezo = true;
            estadoVozConversacion = { ...crearEstadoVoz(Date.now(), MOTOR_CONVERSACION), fase: "hablando" };
            opts.onInicioVoz?.();
        }
    };
    // (2026-09-27) Una cláusula ya dicha en este turno no se repite: BitNet 2B
    // sin penalización a veces encadena la misma frase y la voz la leía en bucle.
    const clausulasDichas = new Set<string>();
    let frasesHabladas = 0;
    let msAudioEstimado = 0;
    const decir = (frase: string): void => {
        const limpia = (frase || "").trim();
        if (!limpia) return;
        const clave = normalizar(limpia).join(" ");
        if (clave && clausulasDichas.has(clave)) return;
        if (clave) clausulasDichas.add(clave);
        try {
            registrarDicho(limpia, Date.now());
        } catch {
            /* */
        }
        alHablar();
        voz.encolar(limpia, { voz: vozId });
        msAudioEstimado += estimarDuracionMs(limpia, CARACTERES_POR_SEGUNDO);
    };
    // Habla en cuanto el modelo CIERRA una frase (mientras sigue escribiendo).
    // Con medidas, `planificarTandas` simula los huecos y ajusta el orden; sin
    // medida no se inventa un plan y se habla igual, sin cambiar de voz.
    const hablarNuevas = (completas: readonly string[]): void => {
        const nuevas = completas.slice(frasesHabladas);
        frasesHabladas = completas.length;
        if (!nuevas.length) return;
        let aHablar: readonly string[] = nuevas;
        if (planificarConMedidas) {
            const plan = planificarTandas(nuevas, candidatos, {
                modo: "conversacion",
                presupuestoMs: PRESUPUESTO_PRIMER_SONIDO_MS,
                caracteresPorSegundo: CARACTERES_POR_SEGUNDO,
            });
            if (plan.tandas.length) aHablar = plan.tandas.map((t) => t.texto);
        }
        for (const frase of aHablar) decir(frase);
    };
    const alAbortar = (): void => {
        const corte = interrumpirVoz(estadoVozConversacion, Date.now());
        estadoVozConversacion = corte.estado;
        try { voz.detener(); } catch { /* ya estaba parada */ }
    };
    opts.senal?.addEventListener("abort", alAbortar, { once: true });

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
                    // Solo las frases YA cerradas: la primera suena mientras el
                    // modelo sigue escribiendo el resto.
                    hablarNuevas(frasesListas(texto, MAX_FRASE).frases);
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
        // Cierre del turno: lo que quedó sin puntuación final también se dice.
        const final = frasesListas(texto, MAX_FRASE);
        hablarNuevas(final.frases);
        if (final.resto) decir(final.resto);
    } catch {
        alAbortar();
        return null;
    } finally {
        opts.senal?.removeEventListener("abort", alAbortar);
        clearTimeout(muletilla);
    }
    if (!texto.trim()) return null;
    historial = [...historial, { rol: "usuario" as const, texto: opts.texto }, { rol: "astraura" as const, texto }].slice(
        -HISTORIAL_TURNOS,
    );
    return {
        ...(fin ?? { texto, motor: "desconocido", local: false, msPrimerToken: null, msTotal: Date.now() - inicio }),
        msAudioEstimado,
    };
}
