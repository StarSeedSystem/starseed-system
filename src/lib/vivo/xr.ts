"use client";

/**
 * App en vivo «Sala XR» (L5 · 2026-09-28) — la MISMA escena 3D compartida, entrada en realidad
 * virtual o aumentada por WebXR cuando el dispositivo lo permite; sin WebXR se abre como escena
 * 3D con una nota clara.
 *
 * Rutas:
 *   · `/sala-xr/<id>[?modo=vr|ar][&sesion=<id>]` — una escena guardada (`os_spaces`, kind 'escena').
 *   · `/sala-xr?sesion=<sesionId>&modo=vr|ar` — la sala EFÍMERA de una llamada «sala VR/AR»: los
 *     mismos parámetros que hoy manda la llamada a `/xr`, así que basta cambiar `/xr` por
 *     `/sala-xr` en `ventana-llamada.tsx` para que la llamada abra la sala compartida.
 *
 * Qué hace WebXR de verdad (y qué no), dicho sin adornos en `describirSoporteXR`.
 */

import type { PermisoVivo } from "@/lib/mensajeria/formato-tipos";
import { docVacio } from "@/lib/vivo/espacial/modelo";
import { crearFilaEscena, listarEscenasPropias, MENSAJES_ERROR } from "@/lib/vivo/espacial/persistencia";

export type ModoXR = "vr" | "ar";

export function modoXRDe(v: string | null | undefined): ModoXR | null {
    return v === "vr" || v === "ar" ? v : null;
}

export function rutaSalaXr(id: string, modo?: ModoXR | null): string {
    const base = `/sala-xr/${encodeURIComponent(id)}`;
    return modo ? `${base}?modo=${modo}` : base;
}

/** Sala efímera de una llamada (mismos parámetros que la llamada manda hoy a `/xr`). */
export function rutaSalaLlamada(sesionId: string, modo: ModoXR = "vr"): string {
    return `/sala-xr?sesion=${encodeURIComponent(sesionId)}&modo=${modo}`;
}

export const INFO_VIVO_XR = {
    etiqueta: "Sala XR",
    descripcion: "La escena 3D compartida en realidad virtual o aumentada, con el avatar de cada persona.",
    icono: "Glasses",
    color: "#DC143C",
    nota: "Entra en VR/AR con un visor (Quest, Pico, Vision Pro) o un Android con ARCore. En iPhone y en ordenadores sin visor se abre como escena 3D.",
    permisos: ["ver", "editar"] as PermisoVivo[],
    edicionPorEnlacePublico: false,
} as const;

export async function crearVivoXr(titulo: string): Promise<{ refId: string; ruta: string }> {
    const r = await crearFilaEscena(titulo || "Sala XR", docVacio());
    if (!r.fila) throw new Error(MENSAJES_ERROR[r.error]);
    return { refId: r.fila.id, ruta: rutaSalaXr(r.fila.id) };
}

export async function listarMiosXr(): Promise<{ refId: string; titulo: string; ruta: string }[]> {
    const propias = await listarEscenasPropias();
    return propias.map((e) => ({ refId: e.id, titulo: e.titulo, ruta: rutaSalaXr(e.id) }));
}

// ───────────────────────────── Soporte honesto por dispositivo ─────────────────────────────

export type PlataformaXR = "quest" | "visionos" | "android" | "ios" | "escritorio";

export function plataformaDe(ua: string, tactil = false): PlataformaXR {
    const u = ua.toLowerCase();
    if (/oculusbrowser|quest|pico/.test(u)) return "quest";
    if (/visionos|apple vision/.test(u)) return "visionos";
    if (/android/.test(u)) return "android";
    if (/iphone|ipad|ipod/.test(u) || (/macintosh/.test(u) && tactil)) return "ios";
    return "escritorio";
}

export interface SoporteXR {
    vr: boolean | null;
    ar: boolean | null;
    /** Contexto seguro (https o localhost): sin él no hay WebXR. */
    seguro: boolean;
    plataforma: PlataformaXR;
}

/** Frase honesta sobre lo que este dispositivo puede hacer con la sala. */
export function describirSoporteXR(s: SoporteXR, pedido: ModoXR | null): { titulo: string; detalle: string; puede: boolean } {
    if (s.vr === null || s.ar === null) {
        return { titulo: "Comprobando realidad virtual y aumentada…", detalle: "Un momento: el navegador está mirando qué admite este dispositivo.", puede: false };
    }
    if (!s.seguro) {
        return {
            titulo: "VR/AR necesitan una conexión segura",
            detalle: "El navegador solo abre WebXR en https o en localhost. Aquí verás la escena en 3D.",
            puede: false,
        };
    }
    const quiere = pedido ?? (s.vr ? "vr" : s.ar ? "ar" : null);
    if (quiere === "vr" && s.vr) {
        return { titulo: "Listo para entrar en VR", detalle: "Pulsa «Entrar en VR» y ponte el visor. Los demás verán tu avatar moverse contigo.", puede: true };
    }
    if (quiere === "ar" && s.ar) {
        return {
            titulo: "Listo para entrar en AR",
            detalle: "La escena aparecerá donde estés al empezar. Cada persona la ancla en su propio espacio: no hay un punto físico común entre dispositivos.",
            puede: true,
        };
    }
    const alternativa = quiere === "vr" && s.ar ? " Este dispositivo sí admite AR." : quiere === "ar" && s.vr ? " Este dispositivo sí admite VR." : "";
    const porPlataforma: Record<PlataformaXR, string> = {
        ios: "iPhone y iPad no traen WebXR en Safari: aquí la sala se abre en 3D (tocar y arrastrar para mirar).",
        android: "Para AR hace falta Chrome con los Servicios de Google Play para AR (ARCore); para VR, un visor.",
        quest: "Abre la sala desde el navegador del visor y acepta el permiso de VR.",
        visionos: "En Vision Pro, activa WebXR en los ajustes avanzados de Safari si no aparece.",
        escritorio: "Con un visor conectado al ordenador (OpenXR/SteamVR) Chrome y Edge pueden entrar en VR. Sin visor, se ve en 3D.",
    };
    const nombre = quiere === "ar" ? "AR" : "VR";
    return {
        titulo: quiere ? `${nombre} no está disponible en este dispositivo` : "Este dispositivo no tiene VR ni AR",
        detalle: `${porPlataforma[s.plataforma]}${alternativa} Estás en la misma sala que los demás, con tu avatar y los mismos objetos.`,
        puede: false,
    };
}
