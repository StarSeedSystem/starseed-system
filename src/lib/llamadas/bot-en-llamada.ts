/**
 * BOTS EN LLAMADAS GRUPALES (Ola 1015V · T) — turno de la plática y servidor de voz.
 * La malla de `motor.ts` lleva el AUDIO; los bots no lo llevan: cada persona comparte el
 * TEXTO de lo que dice por el canal de datos y el bot lee ese texto y contesta cuando hay
 * silencio ≥ 700 ms y nadie más habla (contrato `architecture/voz-fusionada-astraura.md`
 * §5, que este módulo aplica). Todo puro y TODO inyectable —sin red, sin micrófono y sin
 * temporizadores propios— y ninguna función lanza («Aurora SIEMPRE habla»,
 * `architecture/aurora-voz-motores.md` §0). La pista de audio del bot sale por el
 * OmniVoice mixer (`setNeuronMixGain`), inyectada en `EnganchesBot` para las pruebas.
 */

/** Silencio que el bot espera tras el último texto antes de contestar (ms). */
export const SILENCIO_BOT_MS = 700;

/** Lo único que viaja por el canal de datos: el TEXTO de lo que dijo una persona. */
export interface TextoLlamada {
    /** Id de presencia de quien habla (`MetaPresencia.id`). */
    de: string;
    texto: string;
    /** Epoch ms en que lo dijo. */
    t: number;
}

/** El turno del bot: textos aún sin leer y si su turno está ocupado (está sonando). */
export interface EstadoBot {
    pendientes: TextoLlamada[];
    habla: boolean;
}

/** Neurona candidata a SER el servidor de voz de la sesión, con lo MEDIDO en ella. */
export interface CandidatoVoz {
    id: string;
    /** Menor latencia medida (ms) de esta neurona hablando u oyendo. */
    latenciaMs: number;
    /** Memoria LIBRE (MB): el nivel «alta» del motor de voz pide ~600 MB. */
    ramLibreMB: number;
    /** Encendida, con su motor de voz vivo. */
    vivo: boolean;
    /** De confianza: neurona propia o de los miembros de la sesión. */
    deConfianza: boolean;
}

/** RAM que necesita la voz del bot por neurona (nivel «alta» del motor único). */
export const RAM_MIN_VOZ_MB = 600;
/** Histéresis: el vigente se mantiene si está a menos de esto del mejor medido (ms). */
export const TOLERANCIA_RELEVO_VOZ_MS = 150;

export function estadoBotInicial(): EstadoBot {
    return { pendientes: [], habla: false };
}

/** Una persona habla: su texto entra en cola y, si el bot sonaba, LO CORTA (siempre
 * puede). El silencio que el bot espera se reinicia con este texto. */
export function personaDice(estado: EstadoBot, m: TextoLlamada): { estado: EstadoBot; cortaBot: boolean } {
    if (estado.habla) return { estado: { pendientes: [m], habla: false }, cortaBot: true };
    return { estado: { pendientes: [...estado.pendientes, m], habla: false }, cortaBot: false };
}

/** Avance del turno: contesta TODO lo pendiente cuando hay silencio (≥ SILENCIO_BOT_MS
 * desde el ÚLTIMO texto) y el turno libre; mientras el bot habla, nadie más lo retoma
 * (un solo bot a la vez). */
export function ticBot(estado: EstadoBot, ahora: number): { estado: EstadoBot; contestar: string | null } {
    if (estado.habla || !estado.pendientes.length) return { estado, contestar: null };
    const ultimo = estado.pendientes[estado.pendientes.length - 1];
    if (ahora - ultimo.t < SILENCIO_BOT_MS) return { estado, contestar: null };
    const contestar = estado.pendientes.map((p) => p.texto).join(" ");
    return { estado: { pendientes: [], habla: true }, contestar };
}

/** La respuesta del bot terminó de sonar (o fue cortada): libera su turno. */
export function botTermina(estado: EstadoBot): EstadoBot {
    return { ...estado, habla: false };
}

function vozUsable(c: CandidatoVoz): boolean {
    return c.vivo && c.deConfianza && c.ramLibreMB >= RAM_MIN_VOZ_MB;
}

/** Quién sintetiza la respuesta del bot: vivo, de confianza y con RAM; gana la menor
 * latencia MEDIDA. Histéresis: el vigente solo cede cuando pesa más que el mejor por
 * encima de la tolerancia; si se apaga, la siguiente toma el relevo sola. Pura. */
export function elegirServidorVoz(candidatos: CandidatoVoz[], vigenteId: string | null): CandidatoVoz | null {
    const usables = candidatos.filter(vozUsable);
    if (!usables.length) return null;
    const mejor = usables.reduce((a, b) => (b.latenciaMs < a.latenciaMs ? b : a));
    const actual = vigenteId ? usables.find((c) => c.id === vigenteId) ?? null : null;
    if (actual && actual.latenciaMs <= mejor.latenciaMs + TOLERANCIA_RELEVO_VOZ_MS) return actual;
    return mejor;
}

/** Enganche mínimo con la llamada y el mixer, TODO inyectado (aquí no hay navegador):
 * el canal de texto lo abre MotorLlamada por su canal de señalización; `ajustarMixBot`
 * envuelve el `setNeuronMixGain` del OmniVoice mixer y `modular`/`silenciar` son la
 * síntesis, con el corte en cuanto una persona habla. */
export interface EnganchesBot {
    /** Suscribe el texto de las personas (canal de datos de la llamada). */
    onTexto(cb: (m: TextoLlamada) => void): () => void;
    /** Manda el texto del bot a la llamada (mismo canal, dirección contraria). */
    enviarTexto(texto: string): void;
    /** Sintetiza un texto y lo entra como pista de audio en la llamada. */
    modular(texto: string): void;
    /** Corta la síntesis en curso (una persona habló). */
    silenciar?(): void;
    /** Ganancia 0..1 de la pista de audio del bot en el mixer. */
    ajustarMixBot?(gain: number): void;
    /** Reloj de la llamada; por defecto `Date.now`. */
    ahora?(): number;
}

export class BotEnLlamada {
    private turno = estadoBotInicial();
    private readonly alCaer: (() => void) | null;

    constructor(private readonly eng: EnganchesBot) {
        try { this.alCaer = eng.onTexto((m) => this.vieneTexto(m)); } catch { this.alCaer = null; }
    }

    /* Corta la pista del bot y le da silencio en el mixer (setNeuronMixGain → 0). */
    private cortar() {
        try { this.eng.silenciar?.(); this.eng.ajustarMixBot?.(0); } catch { /* nada que cortar */ }
    }

    private vieneTexto(m: TextoLlamada): void {
        try {
            const r = personaDice(this.turno, m);
            this.turno = r.estado;
            if (r.cortaBot) this.cortar();
            this.paso();
        } catch { /* un texto roto no tumba el turno */ }
    }

    /* El bot entra: su texto viaja como el de cualquier persona y su audio engancha el mixer. */
    private responder(texto: string): void {
        try { this.eng.enviarTexto(texto); } catch { /* sin canal, aún puede sonar aquí */ }
        try {
            this.eng.ajustarMixBot?.(1);
            this.eng.modular(texto);
        } catch { /* una síntesis rota degrada la voz, nunca su existencia */ }
    }

    /** Recorre el turno: contesta lo pendiente si ya hay silencio. Devuelve si contestó. */
    paso(): boolean {
        try {
            const r = ticBot(this.turno, this.eng.ahora?.() ?? Date.now());
            this.turno = r.estado;
            if (r.contestar) this.responder(r.contestar);
            return r.contestar !== null;
        } catch { return false; }
    }

    /** La síntesis terminó (lo avisa quien la lleva): suelta el turno y repasa lo nuevo. */
    turnoLibre(): void {
        this.turno = botTermina(this.turno);
        try { this.eng.ajustarMixBot?.(0); } catch { /* noop */ }
        this.paso();
    }

    /** Suelta la suscripción al texto. */
    soltar(): void {
        try { this.alCaer?.(); } catch { /* ya estaba suelta */ }
    }
}
