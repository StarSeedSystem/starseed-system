/**
 * Bot en la llamada grupal (voz fusionada de Astraura, contrato §5). Lógica de turnos
 * PURA para el TEXTO compartido por el canal de datos: el bot contesta tras un silencio
 * de ≥ 700 ms sin nadie más hablando, una persona habla lo corta y hay un solo bot a la
 * vez (TurnosBot); elegirServidorVoz da el servidor de la sesión; la pista del bot entra
 * por omnivoice-mixer con la ganancia de su neurona. Nada lanza; todo inyectable.
 */
// Silencio exigido · RAM mínima (MB) para servir la voz · histéresis del salto.
export const SILENCIO_MS = 700;
export const RAM_MINIMA_MB = 300;
export const MARGEN_HISTERESIS = 0.25;
/** Mensaje compartido por el canal de datos (nunca audio): rol persona = texto parcial/
 *  final; bots con evento empieza/termina para el turno único; en = epoch ms; de = id. */
export interface MensajeTextoLlamada {
    de: string;
    rol: "persona" | "bot";
    texto?: string;
    /** Tramo a medias del oído: reinicia el silencio, no cierra la intervención. */
    parcial?: boolean;
    evento?: "empieza" | "termina";
    en: number;
}
/** Mensaje sano y no vacío (los mal formados se ignoran en silencio). */
export function esMensajeTextoLlamada(v: unknown): v is MensajeTextoLlamada {
    const o = v as Partial<MensajeTextoLlamada> | null;
    return !!o && typeof o.de === "string" && o.de.length > 0 && (o.rol === "persona" || o.rol === "bot") &&
        (o.texto === undefined || (typeof o.texto === "string" && o.texto.trim().length > 0));
}

/** Piezas que el bot puede tocar (inyectables: el canal de datos, la voz y la mezcla). */
export interface EnlacesTurnos {
    responder: (texto: string) => void;
    cortar: () => void;
    programar: (cb: () => void, ms: number) => () => void;
}
export type EstadoTurnos = { esperando: boolean; activo: boolean; otroBotActivo: boolean };
/** Cerebro de turnos de UN bot; mensajes mal formados se descartan en silencio. */
export class TurnosBot {
    private readonly botId: string;
    private pendiente: string[] = [];
    private cancelador: (() => void) | null = null;
    private activo = false;
    private otroBot = false;
    constructor(botId: string, private readonly enlaces: EnlacesTurnos, private readonly silencioMs = SILENCIO_MS) {
        this.botId = botId;
    }
    estado(): EstadoTurnos {
        return { esperando: this.cancelador !== null, activo: this.activo, otroBotActivo: this.otroBot };
    }
    texto(m: MensajeTextoLlamada): void {
        if (!esMensajeTextoLlamada(m)) return;
        if (m.rol === "bot") {
            if (m.de === this.botId) this.activo = m.evento === "empieza";
            else this.otroBot = m.evento === "empieza";
            return;
        }
        if (this.activo) {
            this.activo = false; // una persona que habla lo corta.
            this.enlaces.cortar();
        }
        // Un parcial todavía es alguien hablando: reinicia el silencio sin cerrar la intervención.
        if (m.parcial) {
            this.reprogramar();
        } else {
            this.pendiente.push((m.texto ?? "").trim());
            this.reprogramar();
        }
    }
    private reprogramar() {
        this.cancelador?.();
        this.cancelador = this.enlaces.programar(() => this.ejecutar(), this.silencioMs);
    }
    private ejecutar() {
        this.cancelador = null;
        if (this.activo || this.otroBot) return; // un solo bot a la vez
        const frase = this.pendiente.filter((t) => t.length > 0).join(" ").trim();
        this.pendiente = [];
        if (frase.length > 0) {
            this.activo = true;
            this.enlaces.responder(frase);
        }
    }
}
/** Neurona candidata a servir la voz con lo MEDIDO en ella (latencia = primer sonido). */
export interface CandidatoVoz { id: string; latenciaMs: number | null; ramLibreMb: number | null; encendida: boolean; deConfianza: boolean }
/** Elige el servidor de voz de la sesión: válidas primero, menor latencia, histéresis. */
export function elegirServidorVoz(
    candidatos: CandidatoVoz[],
    actual: string | null,
    ahora: number,
): { id: string | null; motivo: string } {
    const vale = (c: CandidatoVoz): boolean => c.encendida && c.deConfianza && c.latenciaMs !== null && (c.ramLibreMb ?? Infinity) >= RAM_MINIMA_MB;
    const validas = candidatos.filter(vale);
    if (validas.length === 0) {
        return { id: null, motivo: "Ninguna neurona vale: apagada, sin confianza, sin RAM o sin latencia medida." };
    }
    validas.sort((a, b) => (a.latenciaMs ?? Infinity) - (b.latenciaMs ?? Infinity) || a.id.localeCompare(b.id));
    const mejor = validas[0];
    const sigo = actual !== null && actual !== mejor.id ? validas.find((c) => c.id === actual) : mejor;
    if (sigo && sigo.id !== mejor.id) {
        const mejora = 1 - (mejor.latenciaMs ?? 0) / (sigo.latenciaMs ?? Infinity);
        if (mejora <= MARGEN_HISTERESIS) return { id: sigo.id, motivo: `Sin margen para saltar (mide ${ahora} ms).` };
    }
    return { id: mejor.id, motivo: `Latencia mínima medida (${mejor.latenciaMs} ms) entre ${validas.length} válidas.` };
}
/** Entrega la pista del bot a la llamada (MotorLlamada) por omnivoice-mixer con la
 *  ganancia de su neurona. Nunca lanza; devuelve si sonó la entrega. */
export function entregarPistaBot(
    pista: MediaStreamTrack | null,
    o: { neurona: string; nivel: number; motor: { ponerPistaAudio: (p: MediaStreamTrack) => void } | null; mezcla: { setNeuronMixGain: (id: string, gain: number) => void } | null },
): boolean {
    if (!pista || !o.motor || !o.mezcla) return false;
    try {
        o.mezcla.setNeuronMixGain(o.neurona, Math.max(0, Math.min(1, o.nivel)));
        o.motor.ponerPistaAudio(pista);
        return true;
    } catch {
        return false;
    }
}
