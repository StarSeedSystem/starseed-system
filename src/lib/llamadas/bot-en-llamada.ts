/**
 * bot-en-llamada.ts — turno del bot invitado en una llamada grupal (Ola 1015V · VZF1015T).
 * Contrato: architecture/voz-fusionada-astraura.md §5 «Llamadas grupales con bots».
 *
 * Cada participante transcribe su voz en su NEURONA y comparte el TEXTO por el canal de
 * datos de la llamada (nunca el audio). El bot invitado lee ese texto y contesta cuando
 * han pasado SILENCIO_MS de silencio y nadie más habla («contesta cuando hay silencio»):
 * UN solo bot a la vez y una persona que comparte texto lo corta al instante. Quién
 * SINTETIZA la respuesta lo decide `elegirServidorVoz`, el servidor de voz de la sesión.
 *
 * La lógica de turnos es PURA (funciones con estado inyectado). El enganche con
 * `MotorLlamada` vive solo en la clase `BotEnLlamada`, con transporte, cerebro, síntesis,
 * mixer y reloj INYECTABLES, así que las pruebas no tocan red, micrófono ni procesos.
 * «Aurora SIEMPRE habla»: ninguna función de esta capa lanza (aurora-voz-motores.md §0).
 */
import { elegirServidorVoz, type PeticionServidorVoz } from "@/lib/network/servidor-voz-sesion";

/** Silencio compartido mínimo para que el bot tome el turno (ms). */
export const SILENCIO_MS = 700;

/** Lo que viaja por el canal de datos de la llamada. */
export type MensajeLlamada =
    | { tipo: "persona"; de: string; texto: string; en: number }
    | { tipo: "bot-habla"; de: string; texto: string; en: number }
    | { tipo: "bot-callar"; de: string };

/** Estado de los turnos (puro, sin efectos): oído de la persona y bot en curso. */
export interface EstadoTurnos {
    /** Bot con el turno ahora (uno a la vez); null si ninguno. */
    botHablador: string | null;
    /** Epoch ms desde que tiene el turno. */
    desde: number | null;
    persona: string | null;
    personaTexto: string | null;
    personaEn: number | null;
}

/** Estado inicial: nadie habla y el bot no ha oído nada todavía. */
export const ESTADO_INI: EstadoTurnos = { botHablador: null, desde: null, persona: null, personaTexto: null, personaEn: null };

/** Frase de persona para pruebas — puede ampliarse cuando el bot tenga estado completo. */
export interface FrasePersona {
    de: string;
    texto: string;
    en: number;
}

/**
 * Piezas del enganche con `MotorLlamada` — TODO inyectable, así que aquí no hay red,
 * micrófono ni procesos. El cableado le pasa las piezas (canal de datos,
 * síntesis y mixer) y esta clase guarda el estado de turnos entre mensajes: llega el
 * texto de una persona → corta al bot y anota el oído; con `revisar()` (cada latido del
 * reloj) el bot toma el turno si ya hubo SILENCIO_MS y contesta. Nunca lanza.
 */
export interface PiezasBot {
    botId: string;
    enviar: (m: MensajeLlamada) => void;
    suscribir: (cb: (m: MensajeLlamada) => void) => () => void;
    /** Cerebro del bot (fuera de este módulo): frase que contesta a la persona, o null. */
    responder?: (textoPersona: string, persona: string) => string | null;
    /** Fichas medidas de la malla para elegir el servidor de voz de la sesión. */
    pedirServidorVoz?: () => PeticionServidorVoz | null;
    hablar?: (texto: string, servidor: string) => void;
    cortar?: () => void;
    ponerGanancia?: (neurona: string, ganancia: number) => void;
    ahora?: () => number;
}

/**
 * Aplica un mensaje de la llamada al estado de turnos. Pura, sin reloj (los mensajes ya
 * traen su `en`): el texto de una PERSONA corta al bot al instante y fija el oído para la
 * próxima respuesta; el anuncio de un bot toma el turno solo si estaba libre (uno a la
 * vez); `bot-callar` libera el turno de quien lo anuncia.
 */
export function aplicarMensajeLlamada(e: EstadoTurnos, m: MensajeLlamada): EstadoTurnos {
    if (!e || typeof m !== "object" || m === null) return e;
    if (m.tipo === "persona") {
        return { ...e, botHablador: null, desde: null, persona: m.de, personaTexto: m.texto, personaEn: m.en };
    }
    if (m.tipo === "bot-habla") {
        if (e.botHablador !== null && e.botHablador !== m.de) return e;
        return { ...e, botHablador: m.de, desde: m.en };
    }
    if (m.tipo === "bot-callar" && e.botHablador === m.de) return { ...e, botHablador: null, desde: null };
    return e;
}

/** ¿Ya pasaron SILENCIO_MS desde lo último que compartió una persona, con nadie hablando? */
export function silencioSuficiente(e: EstadoTurnos, ahora: number): boolean {
    return (
        e?.botHablador === null && typeof e?.personaEn === "number" && Number.isFinite(ahora) && ahora - e.personaEn >= SILENCIO_MS
    );
}

/** Toma el turno si hay silencio y nadie más habla; si no, lo deja igual. Pura. */
export function tomarTurno(e: EstadoTurnos, idBot: string, ahora: number): EstadoTurnos {
    if (!idBot || !silencioSuficiente(e, ahora)) return e;
    return { ...e, botHablador: idBot, desde: ahora };
}

/** Quién SINTETIZA la respuesta del bot: el servidor de habla de la sesión (contrato §5). Pura. */
export function quienSintetiza(p: PeticionServidorVoz | null): { servidor: string | null; motivo: string } {
    try {
        const r = elegirServidorVoz(p ?? { sesion: { miembros: [], tipo: "llamada" }, fichas: [], ahora: 0 });
        return { servidor: typeof r.habla === "string" && r.habla !== "" ? r.habla : null, motivo: r.motivo ?? "" };
    } catch (err) {
        return { servidor: null, motivo: "no se pudo elegir el servidor de voz para la respuesta" };
    }
}

/** Ganancia por defecto de la pista del bot, sobre el omnivoice-mixer (setNeuronMixGain). */
function gananciaMixer(): (neurona: string, ganancia: number) => void {
    return (neurona, ganancia) =>
        void import("@/lib/aurora/tts-oss/omnivoice-mixer")
            .then((m) => m.setNeuronMixGain(neurona, ganancia))
            .catch(() => undefined);
}

/**
 * El enganche MÍNIMO con `MotorLlamada`. El cableado le pasa las piezas (canal de datos,
 * síntesis y mixer) y esta clase guarda el estado de turnos entre mensajes: llega el
 * texto de una persona → corta al bot y anota el oído; con `revisar()` (cada latido del
 * reloj) el bot toma el turno si ya hubo SILENCIO_MS y contesta. Nunca lanza.
 */
export class BotEnLlamada {
    private e: EstadoTurnos = ESTADO_INI;
    private readonly ponerGanancia: (neurona: string, ganancia: number) => void;
    private readonly suelta: (() => void) | null;

    constructor(private readonly p: PiezasBot) {
        this.ponerGanancia = p.ponerGanancia ?? gananciaMixer();
        try {
            this.suelta = p.suscribir(this.alLlegar);
        } catch {
            this.suelta = null;
        }
    }

    private readonly alLlegar = (m: MensajeLlamada) => {
        try {
            const yoHablaba = this.e.botHablador === this.p.botId;
            this.e = aplicarMensajeLlamada(this.e, m);
            if (m.tipo === "persona" && yoHablaba) this.p.cortar?.();
        } catch {
            /* un mensaje roto no tumba la plática */
        }
    };

    estado(): EstadoTurnos {
        return { ...this.e };
    }

    /** Revisa el silencio (llamarlo con cada latido): contesta si toca, o false si espera. */
    revisar(): boolean {
        try {
            if (typeof this.e.personaTexto !== "string" || this.e.personaTexto === "") return false;
            const frase = this.p.responder?.(this.e.personaTexto, this.e.persona ?? "") ?? null;
            if (!frase) return false;
            const e = tomarTurno(this.e, this.p.botId, this.p.ahora?.() ?? Date.now());
            if (e === this.e || e.desde === null) return false;
            this.e = { ...e, persona: null, personaTexto: null, personaEn: null };
            this.p.enviar({ tipo: "bot-habla", de: this.p.botId, texto: frase, en: e.desde });
            this.ponerGanancia(this.p.botId, 1);
            const voz = quienSintetiza(this.p.pedirServidorVoz?.() ?? null);
            this.p.hablar?.(frase, voz.servidor ?? "");
            return true;
        } catch {
            return false;
        }
    }

    /** Calla y suelta el turno (el mío, si lo era): avisa a la llamada y corta la síntesis. */
    callar(): void {
        try {
            if (this.e.botHablador !== this.p.botId) return;
            this.e = { ...this.e, botHablador: null, desde: null };
            this.p.enviar({ tipo: "bot-callar", de: this.p.botId });
            this.p.cortar?.();
        } catch {
            /* noop */
        }
    }

    /** Suelta la suscripción al canal de datos de la llamada. */
    soltar(): void {
        try {
            this.suelta?.();
        } catch {
            /* noop */
        }
    }
}

/** Funciones auxiliares PÚASAS para pruebas del turno del bot en llamada.
 * Esto permite probar la lógica del bot sin red, mixer ni procesos.
 */
export function frasePersona(p: string, t: string, e: number): FrasePersona {
    return { de: p, texto: t, en: e };
}

/** Helper para crear frase persona (alias de frasePersona). */
export function frase(p: string, t: string, e: number): FrasePersona {
    return { de: p, texto: t, en: e };
}

/** Helper para crear texto de persona desde un test case. */
export function textoPersonaHelper(en: number, texto = "hola, ¿me oís?") {
    return { tipo: "persona" as const, de: "u-1", texto, en };
}

/** Helper para pruebas — crea un servidor de voz falso. */
export function c(id: string, latenciaMs: number, extra: Partial<FichaServidorVoz> = {}): FichaServidorVoz {
    return { neurona: id, latido: Date.now() - 5_000, latenciaMs, ...extra };
}

/** Helper para crear cerebro de bot — devuelve respuesta o null. */
export function cerebro(respuesta: string): (textoPersona: string, persona: string) => string {
    return () => respuesta;
}

/** Estado inicial para pruebas (alias de ESTADO_INI). */
export function estadoInicialTurnos(): EstadoTurnos {
    return ESTADO_INI;
}

/** Funciones auxiliares PÚASAS para pruebas del turno del bot en llamada.
 * Esto permite probar la lógica del bot sin red, mixer ni procesos.
 */
export function evaluarTurno(estado: EstadoTurnos, ahora: number, opciones: { responder?: (textoPersona: string, persona: string) => string | null }): { accion: string; estado: EstadoTurnos; texto: string | null } {
    const { estado: nuevoEstado } = textoPersonaHelper(estado.personaEn ?? ahora);
    const respuesta = opciones.responder?.(nuevoEstado.texto ?? "", nuevoEstado.de ?? "") ?? null;
    const estadoConTurno = respuesta ? tomarTurno(estado, "bot", ahora) : estado;
    const accion = estadoConTurno.botHablador === null ? "nada" : "responder";
    return { accion, estado: estadoConTurno, texto: respuesta };
}

export function engancharBot(
    opciones: { onTexto: (cb: (f: FrasePersona) => void) => void },
    pieza: PiezasBot
): {
    pulsar: () => { accion: string; estado: { bot?: { id: string; desde: number } | null } },
    estado: () => EstadoTurnos,
    callar: () => void,
    cerrar: () => void,
} {
    const bot = new BotEnLlamada(pieza);
    const llegada: Array<(f: FrasePersona) => void> = [];
    opciones.onTexto((f) => {
        llegada.forEach((cb) => cb(f));
    });

    return {
        pulsar: () => {
            const nuevoEstado = bot.revisar() ? { bot: { id: pieza.botId, desde: pieza.ahora?.() ?? Date.now() } } : { bot: null };
            return { accion: nuevoEstado.bot ? "responder" : "nada", estado: nuevoEstado };
        },
        estado: () => bot.estado(),
        callar: () => bot.callar(),
        cerrar: () => bot.soltar(),
    };
}