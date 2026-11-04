import type { CanalesDecision } from "@/lib/llamadas/canales-directos";

export type TipoCanalDirecto = "directo" | "privado" | "ninguno";

export function tipoCanalDirecto(decision: CanalesDecision, hayRedSupabase: boolean): TipoCanalDirecto {
    if (decision.enlaces.length === 0) return "ninguno";
    if (!hayRedSupabase) return "directo";
    return "privado";
}

export function iceParaCanal(decision: CanalesDecision, hayRedSupabase: boolean): RTCIceServer[] {
    if (decision.enlaces.length > 0 && !hayRedSupabase) {
        return [];
    }
    if (decision.enlaces.length > 0) {
        return decision.enlaces.map(() => ({
            urls: "stun:stun.l.google.com:19302",
        }));
    }
    return [];
}