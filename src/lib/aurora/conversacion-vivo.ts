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

const MULETILLA_TRAS_MS = 1200;
const HISTORIAL_TURNOS = 12;

let historial: TurnoConversacion[] = [];
let personaDelHistorial = "";

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

    let empezo = false;
    const alHablar = () => {
        if (!empezo) {
            empezo = true;
            opts.onInicioVoz?.();
        }
    };
    const troceador = createStreamingVoice({
        speak: (clausula) => {
            alHablar();
            voz.encolar(clausula, { voz: vozId });
        },
        initialPersonaId: opts.persona.id,
    });

    let primerToken = false;
    const muletilla = setTimeout(() => {
        if (!primerToken && voz.muletilla(vozId)) alHablar();
    }, MULETILLA_TRAS_MS);

    let texto = "";
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
            for (const l of lineas) {
                const e = eventoDeLinea(l);
                if (!e) continue;
                if (e.t === "ruta") {
                    primerToken = true;
                    clearTimeout(muletilla);
                    opts.onPrimerToken?.(e.motor, e.local);
                } else if (e.t === "token") {
                    texto += e.v;
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
    return fin ?? { texto, motor: "desconocido", local: false, msPrimerToken: null, msTotal: Date.now() - inicio };
}
