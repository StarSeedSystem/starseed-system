/*
 * servidor-voz-sesion — elección del servidor de voz de la sesión (Ola 1015V · S).
 * Contrato: architecture/voz-fusionada-astraura.md §5. Módulo PURO: entrada → salida,
 * sin red, sin disco, sin procesos. Decide la neurona que mejor OYE y la que mejor
 * HABLA entre las fichas medidas (§5: latencia medida, RAM libre, viva y de
 * confianza), con histéresis para no saltar en cada frase y relevo si la actual
 * dejó de latir. El Oracle A1 (24/7) es candidata normal cuando está en las fichas.
 */

/** Ficha medida de una neurona candidata a servir voz en la sesión. */
export interface FichaServidorVoz {
    id: string;
    /** Cuenta propietaria de la neurona. */
    dueno: string;
    /** Último latido visto, en ms desde época. */
    ultimoLatido: number;
    /** RAM libre medida en la neurona, en MB. */
    ramLibreMB: number;
    /** ¿Es una neurona de la cuenta propia (p. ej. el A1 en 24/7)? */
    esPropia?: boolean;
    /** ¿Es el Oracle A1, servidor permanente? Info, no cambia las reglas. */
    veinticuatroSiete?: boolean;
    /** Capacidad de oído medida (Parakeet/Phonon/VibeASR). */
    oido?: { latenciaMs: number; ramMB?: number };
    /** Capacidad de habla medida (voz F1/Supertonic/OmniVoice…). */
    habla?: { latenciaMs: number; ramMB?: number };
}

export interface SesionVoz {
    /** Cuentas de los miembros de la sesión (grupo, llamada o uno mismo). */
    miembros: string[];
    tipo?: "individual" | "grupo" | "llamada";
}

export interface EleccionServidorVoz {
    oido?: { id: string; latenciaMs: number };
    habla?: { id: string; latenciaMs: number };
    motivo: string;
}

/* ── Reglas (todas inyectadas por parámetro, nada de reloj ni red) ── */

/** La ficha está viva si latenó en los últimos 2 minutos (contrato §5). */
export const LATIDO_VIVO_MS = 2 * 60 * 1000;
/** Histéresis: para cambiar a otra viva, la nueva debe ser un 30 % mejor. */
export const UMBRAL_HISTERESIS = 0.7;
/** RAM que exigimos por defecto si la ficha no declara cuánta necesita. */
export const RAM_OIDO_DEFECTO_MB = 400;
export const RAM_HABLA_DEFECTO_MB = 300;

export function estaViva(ficha: FichaServidorVoz, ahora: number): boolean {
    return ahora - ficha.ultimoLatido < LATIDO_VIVO_MS;
}

/** Confianza: neuronas propias o de los miembros de la sesión (§5). */
export function esDeConfianza(ficha: FichaServidorVoz, sesion: SesionVoz): boolean {
    return Boolean(ficha.esPropia) || sesion.miembros.includes(ficha.dueno);
}

/** ¿Le cabe el motor de ese sentido en la RAM libre declarada? */
export function cabeRam(instr: { latenciaMs: number; ramMB?: number }, ficha: FichaServidorVoz): boolean {
    const necesaria = instr.ramMB ?? (ficha.oido === instr ? RAM_OIDO_DEFECTO_MB : RAM_HABLA_DEFECTO_MB);
    return ficha.ramLibreMB >= necesaria;
}

/* ── Elección ── */

export interface EntradaElegirServidorVoz {
    sesion: SesionVoz;
    fichas: FichaServidorVoz[];
    /** Ahora mismo, en ms desde época (inyectado: los tests no miran el reloj). */
    ahora: number;
    /** El servidor elegido en la decisión anterior, para la histéresis. */
    actual?: string;
}

/**
 * Elige, por sentido, la ficha válida de menor latencia medida. Válida = viva
 * (latido < 2 min), de confianza (propia o de los miembros) y con RAM libre
 * suficiente. Histéresis: si la ficha `actual` sigue válida, solo se cambia
 * cuando la nueva es un 30 % mejor o cuando la actual dejó de valer (relevo).
 * Nunca lanza: ante una entrada rota responde con el motivo del fallo.
 */
export function elegirServidorVoz(entrada: EntradaElegirServidorVoz): EleccionServidorVoz {
    try {
        return elegirInterna(entrada.ahora, entrada.sesion, entrada.fichas ?? [], entrada.actual);
    } catch {
        return { motivo: "Error al elegir el servidor de voz de la sesión." };
    }
}

function elegirInterna(
    ahora: number,
    sesion: SesionVoz,
    fichas: FichaServidorVoz[],
    actual?: string,
): EleccionServidorVoz {
    const validas = fichas.filter(
        (f) => !!f && estaViva(f, ahora) && esDeConfianza(f, sesion),
    );
    const oido = elegirSentido("oido", validas, fichas.find((f) => f.id === actual), ahora, sesion);
    const habla = elegirSentido("habla", validas, fichas.find((f) => f.id === actual), ahora, sesion);
    if (!oido && !habla) {
        return { motivo: "Ninguna neurona de confianza y viva sirve de oído ni de voz en la sesión." };
    }
    return {
        oido: oido ? { id: oido.ficha.id, latenciaMs: oido.latencia } : undefined,
        habla: habla ? { id: habla.ficha.id, latenciaMs: habla.latencia } : undefined,
        motivo: motivoDe(oido, habla),
    };
}

/** Una candidata de un sentido con su latencia y su motivo del cambio. */
interface Sentido {
    ficha: FichaServidorVoz;
    latencia: number;
    razon: "histéresis" | "mejora" | "relevo" | "elegida";
}

function elegirSentido(
    sentido: "oido" | "habla",
    validas: FichaServidorVoz[],
    actualFicha: FichaServidorVoz | undefined,
    ahora: number,
    sesion: SesionVoz,
): Sentido | null {
    const deSentido = validas.filter((f) => {
        const instr = f[sentido];
        return !!instr && typeof instr.latenciaMs === "number" && instr.latenciaMs >= 0 && cabeRam(instr, f);
    });
    if (!deSentido.length) return null;
    const [mejor] = deSentido.sort((a, b) => (a[sentido] as { latenciaMs: number }).latenciaMs - (b[sentido] as { latenciaMs: number }).latenciaMs);
    const latenciaDe = (f: FichaServidorVoz) => (f[sentido] as { latenciaMs: number }).latenciaMs;

    const actualVivaYValida =
        !!actualFicha &&
        estaViva(actualFicha, ahora) &&
        esDeConfianza(actualFicha, sesion) &&
        !!actualFicha[sentido] &&
        cabeRam(actualFicha[sentido] as { latenciaMs: number }, actualFicha);
    if (actualVivaYValida && actualFicha) {
        const latActual = latenciaDe(actualFicha);
        if (latenciaDe(mejor) >= latActual * UMBRAL_HISTERESIS) {
            return { ficha: actualFicha, latencia: latActual, razon: latenciaDe(mejor) === latActual ? "elegida" : "histéresis" };
        }
        return { ficha: mejor, latencia: latenciaDe(mejor), razon: "mejora" };
    }
    if (actualFicha) return { ficha: mejor, latencia: latenciaDe(mejor), razon: "relevo" };
    return { ficha: mejor, latencia: latenciaDe(mejor), razon: "elegida" };
}

function motivoDe(oido: Sentido | null, habla: Sentido | null): string {
    const razon = oido && habla
        ? (oido.razon === habla.razon ? oido.razon : "relevo")
        : oido?.razon ?? habla?.razon ?? "sin candidatas";
    const quienes = [oido && `${oido.ficha.id} (oído)`, habla && `${habla.ficha.id} (habla)`].filter(Boolean).join(" · ");
    if (razon === "sin candidatas") return razon;
    return `Servidor de la sesión: ${quienes} — ${razon}.`;
}
