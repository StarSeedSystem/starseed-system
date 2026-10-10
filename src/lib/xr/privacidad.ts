/**
 * StarSeed XR · PRIVACIDAD. Qué datos del aparato pueden salir de él, hasta dónde y con qué permiso.
 * Ciberdelia (CLAUDE.md §3): la tecnología nunca es instrumento de vigilancia. Por eso la cámara del
 * passthrough NO sale JAMÁS del visor, y el mapa de la habitación (planos, mallas, anclas) sólo viaja entre
 * las cuentas de la propia persona y con su consentimiento vigente. Una sala pública recibe lo que la persona
 * ES en la sala (pose del avatar, su voz mientras habla), nunca lo que su casa ES. Módulo PURO: el reloj entra.
 */

export const CLASES_DATO = [
    "camara-passthrough", "mapa-sala", "mirada", "manos-articulaciones", "biometria", "ubicacion-fisica",
    "voz-audio", "voz-texto", "pose-avatar", "avatar", "mundo-spec",
] as const;
export type ClaseDato = (typeof CLASES_DATO)[number];

/** De menos a más expuesto. */
export const DESTINOS = ["dispositivo", "mismas-cuentas", "nube-propia", "sala-privada", "sala-grupo", "sala-publica", "nube-terceros"] as const;
export type Destino = (typeof DESTINOS)[number];
const alcance = (d: Destino): number => DESTINOS.indexOf(d);

interface Regla {
    /** Hasta dónde puede llegar sin pedir nada. */
    libre: Destino;
    /** Hasta dónde puede llegar con consentimiento explícito vigente (`null` = nunca más allá de `libre`). */
    conConsentimiento: Destino | null;
    motivo: string;
}

export const POLITICA: Record<ClaseDato, Regla> = {
    "camara-passthrough": { libre: "dispositivo", conConsentimiento: null, motivo: "La imagen de tu cámara no sale del visor. Nunca." },
    "mapa-sala": { libre: "dispositivo", conConsentimiento: "mismas-cuentas", motivo: "El mapa de tu habitación es tu casa: sólo entre tus propios aparatos y si lo permites." },
    mirada: { libre: "dispositivo", conConsentimiento: null, motivo: "Hacia dónde miras no se envía a nadie." },
    "manos-articulaciones": { libre: "dispositivo", conConsentimiento: "mismas-cuentas", motivo: "Las 25 articulaciones por mano identifican tu cuerpo: al exterior sólo va la pose simple del avatar." },
    biometria: { libre: "dispositivo", conConsentimiento: "mismas-cuentas", motivo: "Pulso y datos de salud son tuyos: sólo entre tus aparatos y si los eliges." },
    "ubicacion-fisica": { libre: "dispositivo", conConsentimiento: "mismas-cuentas", motivo: "Dónde estás físicamente no se comparte con la sala." },
    "voz-audio": { libre: "dispositivo", conConsentimiento: "sala-publica", motivo: "Tu voz sale sólo con el micrófono abierto a propósito y a las personas de esa sala." },
    "voz-texto": { libre: "nube-propia", conConsentimiento: "nube-terceros", motivo: "Lo dictado viaja a tus aparatos y a tu nube; a un modelo de terceros, sólo si lo permites." },
    "pose-avatar": { libre: "sala-publica", conConsentimiento: null, motivo: "La pose simple de tu avatar es lo que eres dentro de la sala." },
    avatar: { libre: "sala-publica", conConsentimiento: null, motivo: "El avatar que elegiste es tu identidad en la sala." },
    "mundo-spec": { libre: "nube-propia", conConsentimiento: "sala-publica", motivo: "Publicar un mundo pasa por la tarjeta de confirmación." },
};

export interface Consentimiento { dato: ClaseDato; hasta: Destino; vence: number }
export interface VeredictoSalida { permitido: boolean; requiere: "nada" | "consentimiento" | "nunca"; motivo: string }

/** ¿Puede este dato llegar a este destino ahora? `ahora` en ms; los consentimientos vencidos no cuentan. */
export function evaluarSalida(dato: ClaseDato, destino: Destino, ahora: number, consentimientos: readonly Consentimiento[] = []): VeredictoSalida {
    const r = POLITICA[dato];
    if (alcance(destino) <= alcance(r.libre)) return { permitido: true, requiere: "nada", motivo: r.motivo };
    if (r.conConsentimiento === null || alcance(destino) > alcance(r.conConsentimiento)) return { permitido: false, requiere: "nunca", motivo: r.motivo };
    const vigente = consentimientos.some((c) => c.dato === dato && c.vence > ahora && alcance(c.hasta) >= alcance(destino));
    return vigente
        ? { permitido: true, requiere: "nada", motivo: r.motivo }
        : { permitido: false, requiere: "consentimiento", motivo: `${r.motivo} Pide el permiso a la persona antes de enviarlo.` };
}

/** Consentimiento nuevo: dura una sesión (por defecto 8 h) y nunca es permanente sin que la persona lo pida. */
export function consentimiento(dato: ClaseDato, hasta: Destino, ahora: number, duracionMs = 8 * 3600_000): Consentimiento {
    return { dato, hasta, vence: ahora + Math.max(60_000, duracionMs) };
}

/** Datos que NUNCA deben aparecer en un registro, en la red ni en un informe de errores. */
export const NUNCA_EN_REGISTROS: readonly ClaseDato[] = CLASES_DATO.filter((d) => POLITICA[d].conConsentimiento === null && POLITICA[d].libre === "dispositivo");
