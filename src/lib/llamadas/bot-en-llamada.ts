/**
 * Bot en llamada grupal — lógica PURA de turnos (SOP `architecture/voz-fusionada-astraura.md` §5
 * «Llamadas grupales con bots»). Cada participante comparte el TEXTO de lo que dice por el canal
 * de datos (nunca audio); el bot invitado lo lee, contesta pasada la pausa y una persona que
 * habla lo corta al instante. `elegirServidorVoz` decide qué neurona de la sesión sintetiza
 * (medido, con histéresis, nunca una ajena). El enganche con `MotorLlamada` es mínimo e
 * inyectable (`EnlaceTextos` y `setNeuronMixGain` del omnivoice-mixer). Nada lanza: un fallo del
 * bot degrada la voz, nunca tumba la llamada (regla de `aurora-voz-motores.md`).
 */

/** Silencio mínimo tras el último texto para que el bot conteste. */
export const SILENCIO_RESPUESTA_MS = 700;

/** Un texto compartido por el canal de datos de la llamada. */
export interface TextoCompartido {
    de: string;
    texto: string;
    en: number;
}

/** Un bot con la palabra (una persona que habla se lo quita). */
export interface TurnoBot {
    de: string;
    desde: number;
}

/** Estado vivo de los turnos (inmutable: cada función devuelve uno nuevo). */
export interface EstadoTurnoBot {
    ultimoTexto: number | null;
    textoPendiente: string;
    bot: TurnoBot | null;
}

export function estadoTurnoInicial(): EstadoTurnoBot {
    return { ultimoTexto: null, textoPendiente: "", bot: null };
}

/** Llega texto de una persona: reinicia el silencio y CORTA al bot si ya contestaba. */
export function registrarTexto(e: EstadoTurnoBot, t: TextoCompartido): EstadoTurnoBot {
    return { ultimoTexto: t.en, textoPendiente: t.texto, bot: e.bot && t.en >= e.bot.desde ? null : e.bot };
}

/** ¿Puede el bot contestar? Silencio suficiente, texto previo y sin turno propio en curso. */
export function preparadoParaContestar(e: EstadoTurnoBot, ahora: number, silencioMs = SILENCIO_RESPUESTA_MS): boolean {
    return e.bot === null && e.ultimoTexto !== null && ahora - e.ultimoTexto >= silencioMs;
}

/** El bot toma la palabra: el silencio arranca de nuevo (no repite lo ya contestado). */
export function tomarTurno(e: EstadoTurnoBot, idBot: string, ahora: number): EstadoTurnoBot {
    return { ...e, bot: { de: idBot, desde: ahora }, ultimoTexto: ahora };
}

/** La síntesis terminó: suelta el turno (con más texto, tras su silencio, contestará). */
export function terminarTurno(e: EstadoTurnoBot): EstadoTurnoBot {
    return { ...e, bot: null };
}

/** Neurona candidata a sintetizar la voz de la sesión (lo MEDIDO, nunca lo declarado): latencia del primer sonido en ms, null sin medida; «propia»/«miembro» son de confianza, «ajena» nunca. */
export interface NeuronaVoz {
    id: string;
    latenciaMs: number | null;
    ramLibreMb: number;
    encendida: boolean;
    confianza: "propia" | "miembro" | "ajena";
}

export interface OpcionesServidorVoz {
    ramMinimaMb?: number;
    margenLatencia?: number;
}

const SIN_MEDIDA = 10_000;

/** Qué neurona sintetiza: encendida y de confianza, con RAM y la mejor latencia; el vigente se conserva salvo mejora clara. */
export function elegirServidorVoz(candidatos: NeuronaVoz[], vigenteId: string | null, opciones: OpcionesServidorVoz = {}): string | null {
    const latencia = (n: NeuronaVoz) => n.latenciaMs ?? SIN_MEDIDA;
    const valen = candidatos.filter((c) => c.encendida && c.confianza !== "ajena" && c.ramLibreMb >= (opciones.ramMinimaMb ?? 300));
    if (!valen.length) return null;
    const mejor = valen.reduce((a, b) => (latencia(b) < latencia(a) ? b : a));
    const vigente = valen.find((c) => c.id === vigenteId);
    if (!vigente || latencia(vigente) > latencia(mejor) * (opciones.margenLatencia ?? 1.5)) return mejor.id;
    return vigenteId;
}

/** Canal mínimo por donde viajan los textos (el cableado real lo saca de la malla de la llamada). */
export interface EnlaceTextos {
    escuchar(cb: (t: TextoCompartido) => void): () => void;
}

export interface OpcionesBotEnLlamada {
    idBot: string;
    escuchar: EnlaceTextos;
    /** Sintetiza la respuesta en el servidor de voz de la sesión (pista de audio). */
    responder(texto: string): void | Promise<void>;
    /** Sustituto de `setNeuronMixGain` del omnivoice-mixer (inyectado: las pruebas no tocan WebAudio). */
    mezclar(neuronaId: string, ganancia: number): void;
    neuronaVoz: string;
    silencioMs?: number;
    tictacMs?: number;
    ahora?: () => number;
}

/** Engancha el bot a la llamada: contesta tras la pausa, y una persona que habla lo corta. */
export function conectarBot(o: OpcionesBotEnLlamada): () => void {
    let e = estadoTurnoInicial();
    let respuesta = false, enVoz = false;
    const apagar = () => {
        if (enVoz) { enVoz = false; o.mezclar(o.neuronaVoz, 0); }
    };
    const tick = () => {
        if (respuesta && !e.bot) apagar(); // una persona lo cortó mientras contestaba
        if (respuesta || !preparadoParaContestar(e, (o.ahora ?? Date.now)(), o.silencioMs)) return;
        respuesta = enVoz = true;
        e = tomarTurno(e, o.idBot, (o.ahora ?? Date.now)());
        o.mezclar(o.neuronaVoz, 1);
        const texto = e.textoPendiente;
        void Promise.resolve()
            .then(() => o.responder(texto))
            .catch(() => undefined).finally(() => (respuesta = false, apagar(), (e = terminarTurno(e))));
    };
    const bajaEscucha = o.escuchar.escuchar((t) => (e = registrarTexto(e, t)));
    const reloj = setInterval(tick, o.tictacMs ?? 250);
    return () => (clearInterval(reloj), bajaEscucha(), apagar());
}
