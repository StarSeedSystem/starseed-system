/**
 * Envío según el plan de medios (MSJ1107A · 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Envuelve el transporte universal SIN tocarlo (`src/lib/malla/**` es de otro agente): para que
 * un mensaje salga SOLO por los medios permitidos, cada paso del plan se manda forzando su
 * enlace (`destino.enlaceId`, que `alcanzaDestino` respeta por encima de todo). El transporte
 * se importa perezoso: este módulo no pesa en el arranque de ninguna ruta.
 *
 * `recorrerPlan` es la parte con lógica y se prueba sin red (el paso real se inyecta).
 */

import { candidatosDesdeEnlaces, servidorDeMedio, type EnlaceParaMedio } from "./medios";
import type { CandidatoMedio, IntentoVia, PasoEnvio, PlanEnvio, ViaMensaje } from "./tipos";

/** Destino de malla (mismo contrato que `DestinoTransporte`, sin importarlo). */
export interface DestinoMalla {
    neuronDeviceId?: string;
    syncDeviceId?: string;
    uid?: string;
    identidadRele?: string;
    nodoLora?: number;
}

export interface ResultadoPaso {
    ok: boolean;
    /** Llegó con acuse del destino o lo guardó el servidor. */
    confirmado: boolean;
    detalle: string;
    via?: ViaMensaje;
}

export interface ResultadoPlan {
    ok: boolean;
    via: ViaMensaje | null;
    intentos: IntentoVia[];
    /** El paso que se usó (null si ninguno). */
    paso: PasoEnvio | null;
    motivo?: string;
}

/**
 * Prueba los pasos del plan en orden. Se queda con el primero confirmado; si uno sale sin acuse,
 * `seguirSinAcuse` decide si se prueba también el siguiente (el receptor descarta duplicados por id)
 * o se da por enviado. Nunca lanza.
 */
export async function recorrerPlan(
    plan: PlanEnvio,
    enviarPaso: (paso: PasoEnvio) => Promise<ResultadoPaso>,
    opciones: { seguirSinAcuse?: boolean } = {},
): Promise<ResultadoPlan> {
    const intentos: IntentoVia[] = [];
    let sinAcuse: { paso: PasoEnvio; via: ViaMensaje | null } | null = null;
    for (const paso of plan.pasos) {
        let r: ResultadoPaso;
        try {
            r = await enviarPaso(paso);
        } catch {
            r = { ok: false, confirmado: false, detalle: "fallo al enviar" };
        }
        intentos.push({ medio: paso.medio, etiqueta: paso.etiqueta, ok: r.ok, detalle: r.detalle });
        if (!r.ok) continue;
        const via = r.via ?? null;
        if (r.confirmado) {
            return { ok: true, via: via ? { ...via, intentos: [...intentos], descartados: plan.descartados } : null, intentos, paso };
        }
        sinAcuse ??= { paso, via };
        if (!opciones.seguirSinAcuse) break;
    }
    if (sinAcuse) {
        const via = sinAcuse.via ? { ...sinAcuse.via, intentos: [...intentos], descartados: plan.descartados } : null;
        return { ok: true, via, intentos, paso: sinAcuse.paso, motivo: "Enviado, pero sin acuse de recibo." };
    }
    return {
        ok: false,
        via: null,
        intentos,
        paso: null,
        motivo: plan.pasos.length ? "Todos los medios permitidos fallaron." : plan.aviso ?? "No hay ningún medio disponible.",
    };
}

/** Frase de por qué un enlace real no llega a ese destino. */
function motivoNoLlega(e: EnlaceParaMedio, d: DestinoMalla): string {
    if (e.tipo === "rele") return d.identidadRele ? "no llega a este destino" : "el relé necesita la identidad cifrada del destinatario";
    if (e.tipo === "lora") return typeof d.nodoLora === "number" ? "no llega a este destino" : "falta el número de nodo LoRa del destinatario";
    return "ese enlace va a otro aparato";
}

/** Lo que el canal local de la app nativa sabe de una neurona (`prepararEnlaceNativo`). */
export interface EstadoRedNativa {
    estado: string;
    ip?: string;
    motivo: string;
}

/**
 * (MLL1107A) Candidato «Red local (app nativa)» que NO puede llevar el mensaje, con el motivo medido
 * (se ve en los descartes de la vía: por qué fue por el servidor). Puro.
 */
export function candidatoRedNativaSinEnlace(d: EstadoRedNativa): CandidatoMedio {
    return {
        enlaceId: `nativo:${d.ip ?? "sin-ip"}`,
        medio: "local",
        etiqueta: "Red local (app nativa)",
        abierto: false,
        llega: false,
        motivoNoLlega: d.motivo,
        rttMs: null,
        ruta: "misma-red-local",
    };
}

/**
 * (MLL1107A) Junta los candidatos reales con lo que dijo el canal local nativo: si ninguna vía de la red
 * local de la app nativa llega a ese destino y el canal dijo por qué, ese motivo va como descarte. Puro.
 */
export function conDiagnosticoNativo(candidatos: CandidatoMedio[], d: EstadoRedNativa | null): CandidatoMedio[] {
    if (!d || d.estado === "ligada") return candidatos;
    if (candidatos.some((c) => c.enlaceId.startsWith("nativo:") && c.llega)) return candidatos;
    // «No se oye» solo se dice si es la app nativa (d existe): en el navegador no hay faro.
    return [...candidatos, candidatoRedNativaSinEnlace(d)];
}

/**
 * Candidatos de MALLA reales hacia `destino` (enlaces del transporte universal). Nunca lanza.
 * (MLL1107A) A una neurona concreta, en la app nativa, primero se asegura el canal local: si su faro se
 * oye y aún no hay enlace `nativo:<ip>`, se la saluda y se espera hasta `esperarNativoMs` (una vez por
 * saludo; si no contestó hace poco, no se espera). Así un mensaje con internet también va por la red
 * local cuando la otra neurona de tu cuenta está al lado, y si no, la vía dice por qué.
 */
export async function candidatosMalla(destino: DestinoMalla, opciones: { esperarNativoMs?: number } = {}): Promise<CandidatoMedio[]> {
    try {
        const [transporte, eleccion] = await Promise.all([
            import("@/lib/malla/transporte-universal"),
            import("@/lib/malla/eleccion-enlace"),
        ]);
        let diag: EstadoRedNativa | null = null;
        if (destino.neuronDeviceId) {
            try {
                diag = await transporte.prepararEnlaceNativo(destino.neuronDeviceId, opciones.esperarNativoMs);
            } catch {
                diag = null;
            }
        }
        const enlaces = await transporte.enlacesDisponibles();
        const candidatos = candidatosDesdeEnlaces(
            enlaces,
            (e) => eleccion.alcanzaDestino(e as Parameters<typeof eleccion.alcanzaDestino>[0], destino),
            (e) => motivoNoLlega(e, destino),
        );
        return conDiagnosticoNativo(candidatos, diag);
    } catch {
        return [];
    }
}

/** El candidato «Servidor StarSeed» (abierto si hay internet). */
export function candidatoServidor(llega = true, motivo?: string): CandidatoMedio {
    const enLinea = typeof navigator === "undefined" ? true : navigator.onLine !== false;
    return {
        enlaceId: "servidor",
        medio: "servidor",
        etiqueta: "Servidor StarSeed",
        abierto: enLinea,
        llega,
        ...(llega ? {} : { motivoNoLlega: motivo }),
        rttMs: null,
        ruta: null,
    };
}

function ahora(): number {
    try {
        return performance.now();
    } catch {
        return Date.now();
    }
}

/**
 * Manda por UN paso de malla (forzando su enlace) por el transporte universal y dice por dónde fue,
 * con lo medido: la latencia es el tiempo hasta el acuse del otro aparato (si lo hubo) o, si no, la
 * ida y vuelta medida del propio enlace. Nada se inventa.
 */
export async function enviarPorPasoMalla(
    paso: PasoEnvio,
    destino: DestinoMalla,
    canal: string,
    cuerpo: unknown,
    esperarAcuseMs = 2500,
): Promise<ResultadoPaso> {
    try {
        const { enviarMensaje } = await import("@/lib/malla/transporte-universal");
        const t0 = ahora();
        const r = await enviarMensaje({ ...destino, enlaceId: paso.enlaceId }, canal, cuerpo, { esperarAcuseMs });
        const dt = ahora() - t0;
        const ultimo = r.intentos[r.intentos.length - 1];
        const detalle = ultimo?.detalle ?? r.motivo ?? (r.ok ? "enviado" : "no salió");
        if (!r.ok) return { ok: false, confirmado: false, detalle };
        const rtt = typeof paso.rttMs === "number" && Number.isFinite(paso.rttMs) ? paso.rttMs : null;
        const via: ViaMensaje = {
            medio: paso.medio,
            direccion: "sale",
            enlace: r.enlace?.etiqueta ?? paso.etiqueta,
            enlaceId: r.enlace?.id ?? paso.enlaceId,
            servidor: servidorDeMedio(paso.medio),
            // (WFD1108A) Por la red Wi-Fi directa entre las dos neuronas, la vía lo guarda («Wi-Fi directo (sin router)»).
            ruta: (await import("@/lib/malla/enlace-wifi-orquestacion")).rutaConWifi(r.enlace?.id ?? paso.enlaceId, paso.ruta ?? null),
            latenciaMs: r.confirmado ? dt : rtt,
            latenciaFuente: r.confirmado ? "acuse" : rtt !== null ? "enlace" : null,
            confirmado: r.confirmado,
            confirmadoPor: r.confirmado ? "destino" : null,
            motivo: r.confirmado ? "entregado y confirmado" : r.motivo ?? detalle,
            en: Date.now(),
        };
        return { ok: true, confirmado: r.confirmado, detalle, via };
    } catch {
        return { ok: false, confirmado: false, detalle: "el transporte de la malla no está disponible" };
    }
}
