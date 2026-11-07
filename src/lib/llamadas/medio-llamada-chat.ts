/**
 * Por dónde va una llamada de un chat de personas o de grupo (NEU1107A · 2026-11-07) — PURO.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Cierra el pendiente §6 de `architecture/transporte-universal-sin-internet.md`: las llamadas del
 * chat respetan el «Medio de transmisión» del chat y usan los enlaces locales cuando existen.
 *
 *  · «sistema-llamadas» (con internet y si el chat permite servidor, P2P por internet o TURN): la
 *    llamada de siempre (sesión en el servidor, WebRTC) y, como canal DIRECTO añadido, los enlaces
 *    sin internet con aparatos de este chat (o de tu cuenta), si el chat permite «local»;
 *  · «enlace-local» (sin internet, o si el chat no permite el servidor): llamada directa 1:1 por
 *    el enlace emparejado sin internet con el aparato de la otra persona. Sin servidores;
 *  · «malla-grupo» (GRP1107A; sin servidor en un grupo): malla completa de WebRTC, cada par por su
 *    enlace sin internet, con tope de aparatos y solo voz si son muchos (`grupo-malla.ts`);
 *  · null: no hay cómo, con el motivo honesto (sin enlaces, medios que no llevan voz…).
 * Un enlace cuyo aparato DICE ser de alguien que no está en el chat no recibe nada de la llamada
 * (ni la presencia ni las señales). `par.uid` sirve para enrutar, nunca para dar permisos.
 * Módulo PURO: sin red, sin DOM, sin `node:*`.
 */

import { normalizarPreferencias } from "@/lib/mensajeria/medios/medios";
import type { DescarteMedio, MedioTransmision, PreferenciasMedio } from "@/lib/mensajeria/medios/tipos";
import { motivoNoLleva } from "@/lib/mensajeria/neuronas/datos-neurona";
import { planGrupoMalla, type PlanGrupoMalla } from "./grupo-malla";

/** Como `MAX_DIRECTOS` del motor: más enlaces directos no se abren. */
export const MAX_DIRECTOS_CHAT = 7;

/** Lo mínimo de un `EnlaceLocalVivo` para decidir (sin funciones: así se prueba sin navegador). */
export interface EnlaceLlamadaChat {
    id: string;
    nombre: string;
    abierto: boolean;
    /** Cuenta que DICE tener el otro aparato (solo para enrutar). */
    uid?: string;
    /** (GRP1107A) Medidas del enlace (para el vídeo de un grupo sin servidor); sin medir = null. */
    capacidadKbps?: number | null;
    rttMs?: number | null;
}

/** «malla-grupo» (GRP1107A): grupo sin servidor, malla completa por los enlaces de cada par. */
export type ViaLlamadaChat = "sistema-llamadas" | "enlace-local" | "malla-grupo";

export interface PlanLlamadaChat {
    via: ViaLlamadaChat | null;
    /** Enlaces locales que se abren como canal directo de la llamada («sistema-llamadas») o a los que suena («malla-grupo»). */
    directos: string[];
    /** (GRP1107A) Solo «malla-grupo»: invitados, quién queda fuera y si va con vídeo. */
    grupo?: PlanGrupoMalla;
    /** Enlace de la llamada directa 1:1 (solo «enlace-local»). */
    enlaceId?: string;
    /** La otra persona de la llamada directa. */
    otroUid?: string;
    /** Frase corta de por dónde va («por el servidor y por enlace directo (misma red)»). */
    texto: string;
    descartados: DescarteMedio[];
    /** Frase honesta cuando no hay cómo llamar. */
    aviso?: string;
}

/** Tipos de llamada que puede llevar el enlace directo (las salas VR/AR necesitan el servidor). */
const DIRECTA_ADMITE = new Set(["audio", "video"]);

/** Enlaces que pueden llevar algo de esta llamada: abiertos y de este chat, de tu cuenta o sin cuenta dicha. Pura. */
export function enlacesDelChat(
    enlaces: EnlaceLlamadaChat[],
    miembros: string[],
    miUid: string | null,
): { utiles: EnlaceLlamadaChat[]; descartados: DescarteMedio[] } {
    const del = new Set(miembros.filter(Boolean));
    if (miUid) del.add(miUid);
    const utiles: EnlaceLlamadaChat[] = [];
    const descartados: DescarteMedio[] = [];
    const vistos = new Set<string>();
    for (const e of enlaces) {
        if (vistos.has(e.id)) continue;
        vistos.add(e.id);
        if (!e.abierto) {
            descartados.push({ medio: "local", enlaceId: e.id, etiqueta: e.nombre, motivo: "el enlace ya no está abierto" });
            continue;
        }
        if (e.uid && !del.has(e.uid)) {
            descartados.push({ medio: "local", enlaceId: e.id, etiqueta: e.nombre, motivo: "ese aparato es de alguien que no está en este chat" });
            continue;
        }
        utiles.push(e);
    }
    return { utiles, descartados };
}

/**
 * planLlamadaChat — cómo se llama en un chat 1:1 o de grupo con sus ajustes de medio. Pura y
 * determinista: mismas entradas, mismo plan.
 */
export function planLlamadaChat(e: {
    preferencias: PreferenciasMedio;
    /** Hay red hacia el servidor (internet). */
    internet: boolean;
    /** Hay sesión iniciada. */
    sesion: boolean;
    miembros: string[];
    miUid: string | null;
    enlaces: EnlaceLlamadaChat[];
    /** «audio», «video», «sala-vr», «sala-ar». */
    tipoLlamada: string;
}): PlanLlamadaChat {
    const prefs = normalizarPreferencias(e.preferencias);
    const permitido = (m: MedioTransmision) => prefs.modo === "auto" || prefs.elegidos.includes(m);
    const descartados: DescarteMedio[] = [];
    if (prefs.modo === "elegidos") {
        for (const m of prefs.elegidos) {
            if (m === "local" || m === "servidor" || m === "p2p-internet" || m === "turn") continue;
            const no = motivoNoLleva(m, "llamada");
            if (no) descartados.push({ medio: m, motivo: no });
        }
    }
    const { utiles, descartados: fuera } = enlacesDelChat(e.enlaces, e.miembros, e.miUid);
    const localOk = permitido("local");
    if (!localOk) {
        for (const u of utiles) {
            descartados.push({ medio: "local", enlaceId: u.id, etiqueta: u.nombre, motivo: "el enlace sin internet no está entre los medios elegidos de este chat" });
        }
    }
    descartados.push(...fuera);

    const internetOk = permitido("servidor") || permitido("p2p-internet") || permitido("turn");
    if (internetOk && e.internet && e.sesion) {
        const directos = localOk ? utiles.slice(0, MAX_DIRECTOS_CHAT).map((u) => u.id) : [];
        return {
            via: "sistema-llamadas",
            directos,
            texto: directos.length ? "por el servidor y por enlace directo (misma red)" : "por el servidor (WebRTC)",
            descartados,
        };
    }
    if (!internetOk) descartados.push({ medio: "servidor", motivo: "ni el servidor ni el P2P por internet están entre los medios elegidos de este chat" });
    else if (!e.internet) descartados.push({ medio: "servidor", motivo: "no hay internet ahora" });
    else descartados.push({ medio: "servidor", motivo: "inicia sesión para llamar por internet" });

    // Sin servidor: llamada directa 1:1 por el enlace emparejado sin internet.
    const otros = Array.from(new Set(e.miembros.filter((u) => !!u && u !== e.miUid)));
    const sinQue = !internetOk ? "sin el servidor en los medios de este chat" : !e.internet ? "sin internet" : "sin sesión";
    let aviso: string;
    if (!localOk) {
        aviso = `No hay cómo llamar ${sinQue}: añade «Enlace directo sin internet» o el servidor en los ajustes de medio de este chat.`;
    } else if (!DIRECTA_ADMITE.has(e.tipoLlamada)) {
        aviso = `Las salas VR y AR necesitan el servidor; ${sinQue}, solo hay llamada de voz o de vídeo por el enlace sin internet.`;
    } else if (otros.length > 1) {
        // (GRP1107A) Grupo sin servidor: malla completa por los enlaces sin internet de cada par.
        const grupo = planGrupoMalla({
            miembros: e.miembros,
            miUid: e.miUid,
            enlaces: e.enlaces,
            pedido: e.tipoLlamada === "video" ? "video" : "audio",
        });
        // Los enlaces cerrados o ajenos ya están descartados arriba (`enlacesDelChat`): no se repiten.
        const yaDichos = new Set(descartados.map((d) => d.enlaceId).filter(Boolean));
        descartados.push(
            ...grupo.fuera.filter((f) => !f.enlaceId || !yaDichos.has(f.enlaceId)).map((f) => ({
                medio: "local" as const,
                ...(f.enlaceId ? { enlaceId: f.enlaceId } : {}),
                ...(f.nombre ? { etiqueta: f.nombre } : {}),
                motivo: f.motivo,
            })),
        );
        if (grupo.ok) {
            return { via: "malla-grupo", directos: grupo.invitados.map((i) => i.enlaceId), texto: grupo.texto, descartados, grupo };
        }
        aviso = `${sinQue[0].toUpperCase()}${sinQue.slice(1)}: ${grupo.aviso ?? "no hay enlaces sin internet con los aparatos de este grupo."}`;
    } else if (otros.length !== 1) {
        aviso = `${sinQue[0].toUpperCase()}${sinQue.slice(1)}, la llamada va por un enlace sin internet y en este chat no hay nadie más.`;
    } else {
        const enlace = utiles.find((u) => u.uid === otros[0]);
        if (enlace) {
            return {
                via: "enlace-local",
                directos: [],
                enlaceId: enlace.id,
                otroUid: otros[0],
                texto: "llamada directa por el enlace sin internet (sin servidores)",
                descartados,
            };
        }
        descartados.push({ medio: "local", motivo: "no hay enlace sin internet con el aparato de esta persona" });
        aviso = `No hay cómo llamar ${sinQue}: hace falta un enlace sin internet con su aparato (vinculadlos con «Vincular sin internet»).`;
    }
    return { via: null, directos: [], texto: "", descartados, aviso };
}
