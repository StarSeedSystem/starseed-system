/**
 * Negociación WebRTC de las llamadas — lógica PURA (sin RTCPeerConnection).
 *
 * Patrón «perfect negotiation» (W3C/MDN): los dos extremos pueden ofertar cuando lo necesiten
 * (nueva pista, reinicio de ICE…); si las ofertas se cruzan, el par DESCORTÉS ignora la del
 * otro y el CORTÉS cede (rollback implícito) y responde. Quién es cortés se decide sin hablar:
 * el de id lexicográficamente MAYOR.
 */
import { MAX_PARTICIPANTES, type MetaPresencia, type SenalLlamada } from "@/lib/llamadas/tipos";
import { sanearNombre } from "@/lib/llamadas/presencia";

const LARGO_SDP = 64_000;

function idPar(v: unknown): v is string {
    return typeof v === "string" && v.length > 0 && v.length <= 120;
}

function candidato(v: unknown): RTCIceCandidateInit | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.candidate !== "string" || o.candidate.length > 2000) return null;
    const c: RTCIceCandidateInit = { candidate: o.candidate };
    if (typeof o.sdpMid === "string" || o.sdpMid === null) c.sdpMid = o.sdpMid as string | null;
    if (typeof o.sdpMLineIndex === "number" || o.sdpMLineIndex === null) c.sdpMLineIndex = o.sdpMLineIndex as number | null;
    if (typeof o.usernameFragment === "string" || o.usernameFragment === null) c.usernameFragment = o.usernameFragment as string | null;
    return c;
}

/** Valida una señal recibida por broadcast (llega de cualquiera que conozca el canal). */
export function sanearSenal(v: unknown): SenalLlamada | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (!idPar(o.de)) return null;
    if (o.tipo === "colgar") return { tipo: "colgar", de: o.de };
    if (o.tipo === "rechazo") {
        return { tipo: "rechazo", de: o.de, uid: typeof o.uid === "string" ? o.uid : null, nombre: sanearNombre(o.nombre) };
    }
    if (o.tipo !== "senal" || !idPar(o.para)) return null;
    const s: { tipo: "senal"; de: string; para: string; desc?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit[] } = {
        tipo: "senal",
        de: o.de,
        para: o.para,
    };
    if (o.desc && typeof o.desc === "object") {
        const d = o.desc as Record<string, unknown>;
        if ((d.type === "offer" || d.type === "answer") && typeof d.sdp === "string" && d.sdp.length <= LARGO_SDP) {
            s.desc = { type: d.type, sdp: d.sdp };
        } else {
            return null;
        }
    }
    if (Array.isArray(o.ice)) {
        const lista = o.ice.slice(0, 50).map(candidato).filter((c): c is RTCIceCandidateInit => !!c);
        if (lista.length) s.ice = lista;
    }
    if (!s.desc && !s.ice) return null;
    return s;
}

/** ¿Soy el par cortés frente a `otroId`? (id mayor = cortés). */
export function soyCortes(miId: string, otroId: string): boolean {
    return miId > otroId;
}

export interface EstadoNegociacionPar {
    cortes: boolean;
    haciendoOferta: boolean;
    /** true mientras se aplica una respuesta remota (setRemoteDescription(answer) en vuelo). */
    aplicandoRespuesta: boolean;
}

export interface DecisionDescripcion {
    /** Oferta cruzada con la mía (glare). */
    colision: boolean;
    /** El par descortés ignora la oferta cruzada. */
    ignorar: boolean;
}

/**
 * Qué hacer con una descripción remota (paso central de perfect negotiation).
 * `estadoSenal` es `pc.signalingState` en el momento de recibirla.
 */
export function evaluarDescripcion(
    tipo: RTCSdpType | string,
    par: EstadoNegociacionPar,
    estadoSenal: RTCSignalingState | string,
): DecisionDescripcion {
    const listoParaOferta = !par.haciendoOferta && (estadoSenal === "stable" || par.aplicandoRespuesta);
    const colision = tipo === "offer" && !listoParaOferta;
    return { colision, ignorar: !par.cortes && colision };
}

/**
 * ¿Tiene plaza `miId`? Las plazas se dan por orden de llegada (`unido`, y el id para desempatar)
 * a las primeras `max` personas. Devuelve también los ids con plaza, que son los únicos con
 * los que se abre conexión.
 */
export function admision(
    presentes: Pick<MetaPresencia, "id" | "unido">[],
    miId: string,
    max = MAX_PARTICIPANTES,
): { admitido: boolean; conPlaza: string[]; posicion: number } {
    const orden = [...presentes].sort((a, b) => a.unido - b.unido || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const conPlaza = orden.slice(0, Math.max(1, max)).map((p) => p.id);
    const posicion = orden.findIndex((p) => p.id === miId);
    // Si aún no aparezco en la presencia (acabo de entrar), cuento como el último en llegar.
    const admitido = posicion === -1 ? orden.length < max : posicion < max;
    return { admitido, conPlaza, posicion };
}

/** Límite de reinicios de ICE seguidos antes de dar la conexión por fallida (con honestidad). */
export const MAX_REINICIOS_ICE = 3;

/** ¿Toca reiniciar ICE ante este estado? Devuelve la acción a tomar. */
export function reaccionIce(
    estado: RTCIceConnectionState | RTCPeerConnectionState | string,
    reiniciosHechos: number,
): "nada" | "esperar" | "reiniciar" | "fallida" | "conectado" {
    if (estado === "connected" || estado === "completed") return "conectado";
    if (estado === "disconnected") return "esperar";
    if (estado === "failed") return reiniciosHechos < MAX_REINICIOS_ICE ? "reiniciar" : "fallida";
    return "nada";
}
