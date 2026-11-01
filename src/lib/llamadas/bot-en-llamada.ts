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
import { elegirServidorVoz, type PeticionServidorVoz, type FichaServidorVoz } from "@/lib/network/servidor-voz-sesion";
export type { FichaServidorVoz };

export const SILENCIO_MS = 700;
export const SILENCIO_RESPUESTA_MS = SILENCIO_MS;

export type MensajeLlamada =
    | { tipo: "persona"; de: string; texto: string; en: number }
    | { tipo: "bot-habla"; de: string; texto: string; en: number }
    | { tipo: "bot-callar"; de: string };

export interface EstadoTurnos {
    botHablador: string | null;
    desde: number | null;
    persona: string | null;
    personaTexto: string | null;
    personaEn: number | null;
}

export interface EstadoTurnosTest extends EstadoTurnos {
    bot: { id: string; desde: number } | null;
    frases: FrasePersona[];
    cerebroCallado?: boolean;
}

export const ESTADO_INI: EstadoTurnos = { botHablador: null, desde: null, persona: null, personaTexto: null, personaEn: null };
export const ESTADO_INI_TEST: EstadoTurnosTest = { ...ESTADO_INI, bot: null, frases: [] };

export interface FrasePersona {
    de: string;
    texto: string;
    en: number;
}

export interface PiezasBot {
    botId: string;
    enviar: (m: MensajeLlamada) => void;
    suscribir: (cb: (m: MensajeLlamada) => void) => () => void;
    responder?: (textoPersona: string, persona: string) => string | null;
    pedirServidorVoz?: () => PeticionServidorVoz | null;
    hablar?: (texto: string, servidor: string) => void;
    cortar?: () => void;
    ponerGanancia?: (neurona: string, ganancia: number) => void;
    ahora?: () => number;
}

export function aplicarMensajeLlamada(e: EstadoTurnos, m: MensajeLlamada): EstadoTurnos {
    if (!e || typeof m !== "object" || m === null) return e;
    if (m.tipo === "persona") return { ...e, botHablador: null, desde: null, persona: m.de, personaTexto: m.texto, personaEn: m.en };
    if (m.tipo === "bot-habla") {
        if (e.botHablador !== null && e.botHablador !== m.de) return e;
        return { ...e, botHablador: m.de, desde: m.en };
    }
    if (m.tipo === "bot-callar" && e.botHablador === m.de) return { ...e, botHablador: null, desde: null };
    return e;
}

export function silencioSuficiente(e: EstadoTurnos, ahora: number): boolean {
    return e?.botHablador === null && typeof e?.personaEn === "number" && Number.isFinite(ahora) && ahora - e.personaEn >= SILENCIO_MS;
}

export function tomarTurno(e: EstadoTurnos, idBot: string, ahora: number): EstadoTurnos {
    if (!idBot || !silencioSuficiente(e, ahora)) return e;
    return { ...e, botHablador: idBot, desde: ahora };
}

export function quienSintetiza(p: PeticionServidorVoz | null): { servidor: string | null; motivo: string } {
    try {
        const r = elegirServidorVoz(p ?? { sesion: { miembros: [], tipo: "llamada" }, fichas: [], ahora: 0 });
        return { servidor: typeof r.habla === "string" && r.habla !== "" ? r.habla : null, motivo: r.motivo ?? "" };
    } catch {
        return { servidor: null, motivo: "no se pudo elegir el servidor de voz para la respuesta" };
    }
}

export class BotEnLlamada {
    private e: EstadoTurnos = ESTADO_INI;
    private readonly suelta: (() => void) | null;

    constructor(private readonly p: PiezasBot) {
        try { this.suelta = p.suscribir(this.alLlegar); } catch { this.suelta = null; }
    }

    private readonly alLlegar = (m: MensajeLlamada) => {
        try {
            const yoHablaba = this.e.botHablador === this.p.botId;
            this.e = aplicarMensajeLlamada(this.e, m);
            if (m.tipo === "persona" && yoHablaba) this.p.cortar?.();
        } catch { /* noop */ }
    };

    estado(): EstadoTurnos { return { ...this.e }; }

    revisar(): boolean {
        try {
            if (typeof this.e.personaTexto !== "string" || this.e.personaTexto === "") return false;
            const frase = this.p.responder?.(this.e.personaTexto, this.e.persona ?? "") ?? null;
            if (!frase) return false;
            const e = tomarTurno(this.e, this.p.botId, this.p.ahora?.() ?? Date.now());
            if (e === this.e || e.desde === null) return false;
            this.e = { ...e, persona: null, personaTexto: null, personaEn: null };
            this.p.enviar({ tipo: "bot-habla", de: this.p.botId, texto: frase, en: e.desde });
            this.p.ponerGanancia?.(this.p.botId, 1);
            const voz = quienSintetiza(this.p.pedirServidorVoz?.() ?? null);
            this.p.hablar?.(frase, voz.servidor ?? "");
            return true;
        } catch { return false; }
    }

    callar(): void {
        try {
            if (this.e.botHablador !== this.p.botId) return;
            this.e = { ...this.e, botHablador: null, desde: null };
            this.p.enviar({ tipo: "bot-callar", de: this.p.botId });
            this.p.cortar?.();
        } catch { /* noop */ }
    }

    soltar(): void {
        try { this.suelta?.(); } catch { /* noop */ }
    }
}

export function frasePersona(p: string, t: string, e: number): FrasePersona { return { de: p, texto: t, en: e }; }
export const frase = frasePersona;

export type TextoPersonaMsg = ReturnType<typeof textoPersonaHelper>;
export type TextoPersonaResult = { accion: "cortar" | "nada"; estado: EstadoTurnosTest };

function textoPersonaHelperFn(en: number, texto = "hola, ¿me oís?"): TextoPersonaMsg {
    return { tipo: "persona" as const, de: "u-1", texto, en };
}

function aplicarTextoPersonaFn(estado: EstadoTurnosTest, f: FrasePersona): TextoPersonaResult {
    const fraseVacia = !f.texto || f.texto.trim() === "";
    if (fraseVacia) return { accion: "nada", estado };
    if (estado.bot) {
        return { accion: "cortar", estado: { ...estado, bot: null, frases: [...estado.frases, f] } };
    }
    const ultimaFrase = estado.frases[estado.frases.length - 1];
    if (ultimaFrase && ultimaFrase.de === f.de && ultimaFrase.texto === f.texto) {
        return { accion: "nada", estado };
    }
    return { accion: "nada", estado: { ...estado, frases: [...estado.frases, f] } };
}

export function textoPersona(en: number, texto?: string): TextoPersonaMsg;
export function textoPersona(estado: EstadoTurnosTest, f: FrasePersona): TextoPersonaResult;
export function textoPersona(arg: number | EstadoTurnosTest, txt?: string | FrasePersona): TextoPersonaMsg | TextoPersonaResult {
    if (typeof arg === "number") {
        return textoPersonaHelperFn(arg, txt as string | undefined);
    }
    return aplicarTextoPersonaFn(arg, txt as FrasePersona);
}

export function textoPersonaHelper(en: number, texto = "hola, ¿me oís?") { return { tipo: "persona" as const, de: "u-1", texto, en }; }
export function c(id: string, latenciaMs: number, extra: Partial<FichaServidorVoz> = {}): FichaServidorVoz {
    return { neurona: id, latido: Date.now() - 5_000, latenciaMs, ...extra };
}

export function cerebro(respuesta: string): (textoPersona: string, persona: string) => string { return () => respuesta; }
export function estadoInicialTurnos(): EstadoTurnosTest { return ESTADO_INI_TEST; }

export function evaluarTurno(
    estado: EstadoTurnosTest,
    ahora: number,
    opciones: { responder: (textoPersona: string, persona: string) => string | null }
): { accion: "nada" | "responder"; estado: EstadoTurnosTest; texto: string | null } {
    if (estado.bot) return { accion: "nada", estado, texto: null };
    if (estado.cerebroCallado) return { accion: "nada", estado, texto: null };
    const ultimaFrase = estado.frases[estado.frases.length - 1];
    if (!ultimaFrase) return { accion: "nada", estado, texto: null };
    if (ahora - ultimaFrase.en < SILENCIO_RESPUESTA_MS) return { accion: "nada", estado, texto: null };
    const respuesta = opciones.responder?.(ultimaFrase.texto, ultimaFrase.de) ?? null;
    if (!respuesta) return { accion: "nada", estado: { ...estado, cerebroCallado: true }, texto: null };
    const nuevoEstado: EstadoTurnosTest = { ...estado, bot: { id: "bot", desde: ahora }, frases: [] };
    return { accion: "responder", estado: nuevoEstado, texto: respuesta };
}

export function engancharBot(
    opciones: { onTexto: (cb: (f: FrasePersona) => void) => void },
    pieza: { botId: string; responder: () => string; sintetizar: (texto: string) => Promise<null>; callar: () => void; ahora: () => number; silencioMs: number }
): { pulsar: () => { accion: string; estado: { bot?: { id: string; desde: number } | null } }; estado: () => EstadoTurnosTest; callar: () => void; cerrar: () => void } {
    let _estado: EstadoTurnosTest = ESTADO_INI_TEST;
    let tocado = 0;
    let frasesPendientes: FrasePersona[] = [];

    opciones.onTexto((f) => {
        if (_estado.bot) {
            tocado++;
            _estado = { ..._estado, bot: null, frases: [] };
            pieza.callar();
            return;
        }
        _estado = { ..._estado, frases: [..._estado.frases, f] };
    });

    return {
        pulsar: () => {
            const ahora = pieza.ahora();
            const ultimaFrase = _estado.frases[_estado.frases.length - 1];
            if (!ultimaFrase || _estado.bot) return { accion: "nada", estado: { bot: null } };
            if (ahora - ultimaFrase.en >= pieza.silencioMs) {
                const respuesta = pieza.responder();
                _estado = { ..._estado, bot: { id: pieza.botId, desde: ahora }, frases: [] };
                return { accion: "responder", estado: { bot: { id: pieza.botId, desde: ahora } } };
            }
            return { accion: "nada", estado: { bot: null } };
        },
        estado: () => _estado,
        callar: () => { if (_estado.bot) { tocado++; _estado = { ..._estado, bot: null }; pieza.callar(); } },
        cerrar: () => {},
    };
}