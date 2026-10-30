"use client";

/**
 * Bot invitado en llamadas grupales (Ola 1015V · T) — turnos PUROS y enganche mínimo con
 * `MotorLlamada` (contrato: architecture/voz-fusionada-astraura.md §5). Cada persona
 * transcribe SU voz en su neurona y comparte TEXTO (no audio) por el canal de datos; el
 * bot —UNO, en una neurona— contesta tras un silencio de ≥ 700 ms, lo corta quien hable, y
 * su respuesta la sintetiza el servidor de voz de la sesión por el OmniVoice Mixer con
 * `setNeuronMixGain`. Regla de la capa (aurora-voz-motores.md §0): nada lanza.
 */
import { mixerPlayBlob, setNeuronMixGain, stopMixer } from "@/lib/aurora/tts-oss/omnivoice-mixer";

/** Silencio exigido antes de contestar: una pausa entre frases no despierta al bot (ms). */
export const SILENCIO_RESPUESTA_MS = 700;
/** Id de la pista del bot en el mixer (su ganancia viaja por `setNeuronMixGain`). */
export const ID_MEZCLA_BOT = "bot-en-llamada";

/** Frase compartida ya como TEXTO por el canal de datos (`t`: epoch ms de llegada). */
export interface FrasePersona { de: string; texto: string; t: number }

/** `bot`: quién responde ahora; `respondidoEn`: frase ya contestada (no se pregunta dos veces). */
export interface EstadoTurnos { frases: FrasePersona[]; bot: { id: string; desde: number } | null; respondidoEn: number | null }

/** cortar = para la pista del bot; responder = sintetiza y suena tras el silencio. */
export type AccionTurno = "nada" | "cortar" | "responder";
export interface DecisionTurno { accion: AccionTurno; texto: string | null; estado: EstadoTurnos }

/** Cerebro del bot, inyectable y puro: frases → respuesta (`null` = no sabe qué decir). */
export interface ParamTurnos { silencioMs?: number; responder(frases: FrasePersona[]): string | null }

export function estadoInicialTurnos(): EstadoTurnos { return { frases: [], bot: null, respondidoEn: null } }
/** Una persona compartió texto: corta al bot si estaba hablando y queda a la espera. Pura. */
export function textoPersona(e: EstadoTurnos, f: FrasePersona): DecisionTurno {
    if (!f.texto.trim()) return { accion: "nada", texto: null, estado: e };
    // Con varios canales la misma frase puede llegar dos veces: se descarta el eco inmediato.
    const ante = e.frases[e.frases.length - 1];
    if (ante && ante.de === f.de && ante.texto === f.texto && f.t - ante.t < 300) return { accion: "nada", texto: null, estado: e };
    const corta = e.bot !== null;
    return { accion: corta ? "cortar" : "nada", texto: null, estado: { frases: [...e.frases, f], bot: null, respondidoEn: e.respondidoEn } };
}

/** Tick del bot: responde solo tras el silencio, con la última frase aún sin contestar. Pura. */
export function evaluarTurno(e: EstadoTurnos, ahora: number, p: ParamTurnos): DecisionTurno {
    if (e.bot) return { accion: "nada", texto: null, estado: e };
    const silencio = p.silencioMs ?? SILENCIO_RESPUESTA_MS;
    const ultima = e.frases[e.frases.length - 1];
    if (!ultima || ahora - ultima.t < silencio) return { accion: "nada", texto: null, estado: e };
    if (e.respondidoEn !== null && e.respondidoEn >= ultima.t) return { accion: "nada", texto: null, estado: e };
    const texto = p.responder(e.frases)?.trim() || null;
    if (!texto) return { accion: "nada", texto: null, estado: { ...e, respondidoEn: ultima.t } };
    return { accion: "responder", texto, estado: { frases: [], bot: null, respondidoEn: ultima.t } };
}

/** Neurona que puede servir la voz de la sesión (datos MEDIDOS, nunca declarados);
 * `ramLibreMB` null = se desconoce (solo basta si no se exige RAM). */
export interface CandidatoVoz { id: string; online: boolean; deConfianza: boolean; latenciaMs: number; ramLibreMB: number | null }

export interface ParamServidorVoz { ramMinimaMB?: number; margenHist?: number }

/** Elige el servidor de voz (online, de confianza, RAM suficiente) el de MENOR latencia medida,
 * con histéresis a favor del vigente; si cae o deja de cumplir, el siguiente toma el relevo. Pura. */
export function elegirServidorVoz(candidatos: CandidatoVoz[], vigente: CandidatoVoz | null, p: ParamServidorVoz = {}): CandidatoVoz | null {
    const ramMin = p.ramMinimaMB ?? 0;
    const margen = p.margenHist ?? 1.2;
    const vale = (c: CandidatoVoz) => c.online && c.deConfianza && c.latenciaMs >= 0 && (c.ramLibreMB == null ? ramMin <= 0 : c.ramLibreMB >= ramMin);
    const elegibles = candidatos.filter(vale);
    if (!elegibles.length) return null;
    const mejor = [...elegibles].sort((a, b) => a.latenciaMs - b.latenciaMs || (a.id < b.id ? -1 : 1))[0];
    const vivoV = vigente ? elegibles.find((c) => c.id === vigente.id) ?? null : null;
    if (vivoV && mejor.latenciaMs >= vivoV.latenciaMs / margen) return vivoV;
    return mejor;
}

/** Canal de la llamada acotado al TEXTO compartido (todo inyectable, p. ej. desde `MotorLlamada`). */
export interface EnlaceBot { onTexto(cb: (f: FrasePersona) => void): void }

/** Opciones del bot: cerebro, síntesis en el SERVIDOR DE VOZ DE LA SESIÓN (el de `elegirServidorVoz`), ganancia del mixer, relé y `callar` (corte a mitad). */
export interface OpcionesBot {
    botId: string;
    responder(frases: FrasePersona[]): string | null;
    sintetizar(texto: string): Promise<Blob | null>;
    ganancia?: number;
    silencioMs?: number;
    ahora?: () => number;
    callar?(): void;
}

export interface BotEnLlamada { estado(): EstadoTurnos; pulsar(): DecisionTurno; cerrar(): void }

/** Engancha el bot a la llamada: entra al texto compartido, corta su pista en cuanto una persona habla, responde tras el silencio y suena por el OmniVoice Mixer. NUNCA lanza. */
export function engancharBot(enlace: EnlaceBot, opc: OpcionesBot): BotEnLlamada {
    const ahora = opc.ahora ?? (() => Date.now());
    let estado = estadoInicialTurnos();
    let vivo = true;
    let pendiente: ReturnType<typeof setTimeout> | null = null;
    const soltarBot = () => { try { (opc.callar ?? stopMixer)(); } catch { /* nunca lanza */ } };
    const sonar = (texto: string) => {
        estado = { ...estado, bot: { id: opc.botId, desde: ahora() } };
        void Promise.resolve().then(() => opc.sintetizar(texto)).catch(() => null).then((blob) => {
            if (!vivo || !blob) return;
            try { setNeuronMixGain(ID_MEZCLA_BOT, Math.max(0, Math.min(1, opc.ganancia ?? 1))); } catch { /* sin mixer */ }
            void mixerPlayBlob(blob, { neuronId: ID_MEZCLA_BOT }).catch(() => false);
        });
    };
    const aplicar = (d: DecisionTurno) => { estado = d.estado; if (d.accion === "cortar") soltarBot(); };
    const pulsar = (): DecisionTurno => {
        const d = evaluarTurno(estado, ahora(), { silencioMs: opc.silencioMs, responder: opc.responder });
        aplicar(d);
        if (d.accion === "responder" && d.texto) sonar(d.texto);
        return d;
    };
    enlace.onTexto((f) => {
        if (!vivo) return;
        aplicar(textoPersona(estado, f));
        if (pendiente) clearTimeout(pendiente);
        pendiente = setTimeout(() => { pendiente = null; if (vivo) pulsar(); }, (opc.silencioMs ?? SILENCIO_RESPUESTA_MS) + 80);
    });
    const cerrar = () => { vivo = false; if (pendiente) clearTimeout(pendiente); estado = { ...estado, bot: null }; };
    return { estado: () => estado, pulsar, cerrar };
}
