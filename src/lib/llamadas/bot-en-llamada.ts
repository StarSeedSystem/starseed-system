/**
 * Bot en llamada — lógica de turnos PURA para «llamadas grupales con bots»
 * (contrato `architecture/voz-fusionada-astraura.md` §5 · Ola 1015V). Cada participante
 * comparte el TEXTO de lo que dice (no el audio) por el canal de datos y un bot invitado
 * contesta tras un silencio (≥ 700 ms); un solo bot tiene la palabra y una persona que
 * habla lo corta. La voz la sintetiza el servidor de la sesión (`elegirServidorVoz`) y
 * suena por `omnivoice-mixer` (`setNeuronMixGain`), TODO inyectable; nada lanza (Aurora SIEMPRE habla).
 */
export const SILENCIO_MS = 700;
/** Texto compartido por el canal de datos: una transcripción, nunca audio. */
export interface TextoLlamada { de: string; texto: string; /** Epoch ms del texto final. */ en: number; }
/** Plática del bot: historial corto, quien tiene la palabra y qué quedó contestado. */
export interface EstadoTurnos {
    historial: TextoLlamada[];
    hablando: { botId: string; desde: number } | null;
    /** Epoch del último texto humano ya contestado (para no repetir). */
    respondidoHasta: number;
}
export const estadoInicial = (): EstadoTurnos => ({ historial: [], hablando: null, respondidoHasta: 0 });
/** Pura: añade un texto (persona o bot) con memoria corta (32 textos). */
export const registrarTexto = (e: EstadoTurnos, t: TextoLlamada): EstadoTurnos =>
    ({ ...e, historial: [...e.historial, t].slice(-32) });
export type AccionTurno =
    | { accion: "contestar"; pregunta: string }
    | { accion: "callar"; motivo: string }
    | { accion: "esperar"; motivo: string };
/** Opciones de turno: id de presencia del bot y silencio mínimo antes de contestar (ms). */
export interface OpcionesTurno { botId: string; silencioMs?: number; }
/** Último texto que dijo una persona (no salió del bot); `null` si no hay. */
export const ultimoHumano = (e: EstadoTurnos, botId: string): TextoLlamada | null =>
    [...e.historial].reverse().find((t) => t.de !== botId) ?? null;
/** Pura: 1) persona que habla tras empezar el bot a sonar lo CORTA; 2) palabra libre + texto humano final + silencio ≥ `silencioMs` → contesta; 3) si no, espera. */
export function decidirTurno(e: EstadoTurnos, ahora: number, opciones: OpcionesTurno): AccionTurno {
    const silencio = opciones.silencioMs ?? SILENCIO_MS;
    const humano = ultimoHumano(e, opciones.botId);
    if (humano && e.hablando) {
        return humano.en > e.hablando.desde
            ? { accion: "callar", motivo: "una persona ha cortado al bot" }
            : { accion: "esperar", motivo: "el bot tiene la palabra" };
    }
    if (!humano) return { accion: "esperar", motivo: "nadie ha hablado todavía" };
    const ultimo = e.historial[e.historial.length - 1] ?? null;
    const alFinal = !!ultimo && ultimo.de !== opciones.botId && ultimo.en === humano.en;
    const calma = ahora - humano.en;
    if (!alFinal || calma < silencio || humano.en <= e.respondidoHasta) {
        const motivo = !alFinal ? "aún no ha callado todo el mundo" : calma < silencio ? "no hay silencio aún" : "ya está contestado";
        return { accion: "esperar", motivo };
    }
    return { accion: "contestar", pregunta: humano.texto };
}
/** Pura: el bot toma la palabra (y queda contestado lo que había pendiente). */
export const tomarTurno = (e: EstadoTurnos, botId: string, ahora: number): EstadoTurnos =>
    ({ ...e, hablando: { botId, desde: ahora }, respondidoHasta: ultimoHumano(e, botId)?.en ?? e.respondidoHasta });
/** Pura: el bot deja la palabra. */
export const soltarTurno = (e: EstadoTurnos): EstadoTurnos => ({ ...e, hablando: null });
/** ── Servidor de voz de la sesión ── */
/** Neurona candidata a sintetizar la voz del bot (contrato §5): medido, nunca supuesto. */
export interface NeuronaVoz { id: string; latenciaMs: number; ramLibreGB: number; confianza: boolean; }
/** Pura: la menor latencia MEDIDA de las fiables (RAM y confianza), con histéresis para no saltar en cada frase. */
export function elegirServidorVoz(candidatos: NeuronaVoz[], actualId: string | null, opciones: { ramMinGB?: number; margenMs?: number } = {}): string | null {
    const ramMin = opciones.ramMinGB ?? 0.5, margen = opciones.margenMs ?? 120;
    const validas = candidatos.filter((c) => c.confianza && c.ramLibreGB >= ramMin);
    if (!validas.length) return null;
    const mejor = validas.reduce((a, b) => (b.latenciaMs < a.latenciaMs ? b : a));
    const vigente = validas.find((c) => c.id === actualId);
    return vigente && vigente.latenciaMs <= mejor.latenciaMs + margen ? vigente.id : mejor.id;
}
/** ── Enganche con MotorLlamada (todo inyectado) ── */
/** Servicios del bot, TODOS inyectados; `hablar` va por `mixerPlayBlob` + `setNeuronMixGain`. */
export interface ServiciosBot {
    publicarTexto(t: TextoLlamada): void;
    responder(pregunta: string): Promise<string>;
    hablar(texto: string): Promise<void>;
    callar(): void;
    ganancia(v: number): void;
}
/** Opciones del enganche: los servicios y el volumen inicial de la pista (1). */
export interface OpcionesEnganche extends OpcionesTurno { servicios: ServiciosBot; volumen?: number; }
/** El enganche vivo: `estado`, ingesta `recibir`, tick del reloj `tictac` y `soltar` la palabra. */
export interface EngancheBot { estado(): EstadoTurnos; recibir(t: TextoLlamada): void; tictac(ahora: number): void; soltar(): void; }
/** Crea el enganche del bot con la llamada: nunca lanza y un solo turno a la vez. */
export function engancharBot(opc: OpcionesEnganche): EngancheBot {
    let e = estadoInicial();
    let enVuelo = false;
    const s = opc.servicios;
    const paso = async (ahora: number): Promise<void> => {
        try {
            const d = decidirTurno(e, ahora, opc);
            if (d.accion === "callar" && e.hablando) { s.callar(); e = soltarTurno(e); return; }
            if (d.accion !== "contestar" || enVuelo) return;
            enVuelo = true;
            e = tomarTurno(e, opc.botId, ahora);
            s.ganancia(opc.volumen ?? 1);
            const texto = (await s.responder(d.pregunta).catch(() => "")).trim();
            if (!texto) return;
            const t = { de: opc.botId, texto, en: ahora };
            e = registrarTexto(e, t);
            s.publicarTexto(t);
            await s.hablar(texto);
        } catch {
            /* un fallo del modelo o del mixer no tumba la llamada: el bot queda en silencio */
        } finally {
            enVuelo = false;
            if (e.hablando) e = soltarTurno(e);
        }
    };
    return {
        estado: () => e,
        recibir(t) {
            e = registrarTexto(e, t);
            // Una persona que habla corta al bot al momento, sin esperar al tick.
            if (t.de !== opc.botId) void paso(t.en);
        },
        tictac: (ahora: number) => { void paso(ahora); },
        soltar: () => { if (e.hablando) e = soltarTurno(e); },
    };
}
