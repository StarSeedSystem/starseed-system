"use client";

/**
 * registro-enlaces-locales — los enlaces P2P emparejados SIN internet que están vivos ahora (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo diminuto y sin dependencias pesadas a propósito: lo leen el transporte universal, la
 * interfaz «Vincular sin internet», las llamadas directas y las señales de la neurona
 * (`senales-medio.ts`), y ninguno de ellos debe arrastrar al resto por leer cuántos hay.
 *
 * Un enlace vive en la PESTAÑA donde se emparejó (su RTCPeerConnection es de esa pestaña): si se
 * cierra la pestaña o se cae el Wi-Fi, se borra de aquí y se dice. Nada se guarda en disco.
 */

import { useSyncExternalStore } from "react";
import type { ClaseRuta } from "@/lib/network/estadisticas-enlace";

/** Lo que el otro aparato dice de sí mismo al abrirse el canal (solo para enrutar y enseñar). */
export interface InfoParLocal {
  nombre: string;
  syncDeviceId?: string;
  neuronDeviceId?: string;
  /** Cuenta que DICE tener: sirve para enrutar «a esta persona», nunca para dar permisos. */
  uid?: string;
  plataforma?: string;
}

/** Un enlace local vivo (lo implementa `emparejar-sin-internet.ts`). */
export interface EnlaceLocalVivo {
  /** «local:<sesión>». */
  id: string;
  par: InfoParLocal;
  /** Epoch ms en que se abrió el canal. */
  desde: number;
  abierto(): boolean;
  /** Ida y vuelta medida por el propio canal (ms); null hasta la primera medida. */
  rttMs(): number | null;
  /** Ruta medida por las estadísticas WebRTC (misma red local, etc.). */
  ruta(): ClaseRuta | null;
  /** Capacidad de salida estimada por el navegador (kbps); null si no la da. */
  capacidadKbps(): number | null;
  enviar(texto: string): boolean;
  enviarBinario(buf: ArrayBuffer): boolean;
  bufferedAmount(): number;
  /** Mensajes de las capas de arriba (los de control del propio enlace no llegan aquí). */
  alMensaje(cb: (data: string | ArrayBuffer) => void): () => void;
  /** Llamada directa: pone (o quita, con null) las pistas de audio/vídeo y renegocia por el canal. */
  ponerPistas(stream: MediaStream | null): Promise<boolean>;
  /** Flujo remoto de audio/vídeo (null cuando el otro lo retira). */
  alFlujoRemoto(cb: (stream: MediaStream | null) => void): () => void;
  cerrar(): void;
}

/** Foto inmutable para la interfaz (cambia solo cuando algo cambia). */
export interface FotoEnlaceLocal {
  id: string;
  nombre: string;
  plataforma?: string;
  uid?: string;
  syncDeviceId?: string;
  desde: number;
  rttMs: number | null;
  ruta: ClaseRuta | null;
  capacidadKbps: number | null;
}

const enlaces = new Map<string, EnlaceLocalVivo>();
const oyentes = new Set<() => void>();
const oyentesAlta = new Set<(e: EnlaceLocalVivo) => void>();
let foto: FotoEnlaceLocal[] = [];
const VACIA: FotoEnlaceLocal[] = [];

function rehacerFoto(): void {
  foto = Array.from(enlaces.values()).map((e) => ({
    id: e.id,
    nombre: e.par.nombre,
    plataforma: e.par.plataforma,
    uid: e.par.uid,
    syncDeviceId: e.par.syncDeviceId,
    desde: e.desde,
    rttMs: e.rttMs(),
    ruta: e.ruta(),
    capacidadKbps: e.capacidadKbps(),
  }));
  for (const f of Array.from(oyentes)) {
    try {
      f();
    } catch {
      /* un oyente roto no tumba a los demás */
    }
  }
}

/** Registra un enlace abierto. Devuelve la baja. */
export function registrarEnlaceLocal(e: EnlaceLocalVivo): () => void {
  enlaces.set(e.id, e);
  rehacerFoto();
  for (const f of Array.from(oyentesAlta)) {
    try {
      f(e);
    } catch {
      /* noop */
    }
  }
  return () => quitarEnlaceLocal(e.id);
}

export function quitarEnlaceLocal(id: string): void {
  if (!enlaces.delete(id)) return;
  rehacerFoto();
}

/** Avisa de que cambió algo medido (rtt, ruta, nombre del par) para refrescar la interfaz. */
export function avisarCambioEnlaceLocal(): void {
  rehacerFoto();
}

export function enlaceLocal(id: string): EnlaceLocalVivo | undefined {
  return enlaces.get(id);
}

export function enlacesLocalesVivos(): EnlaceLocalVivo[] {
  return Array.from(enlaces.values()).filter((e) => {
    try {
      return e.abierto();
    } catch {
      return false;
    }
  });
}

/** Se entera de cada enlace nuevo (y de los que ya había). Devuelve la baja. */
export function alRegistrarEnlaceLocal(cb: (e: EnlaceLocalVivo) => void): () => void {
  oyentesAlta.add(cb);
  for (const e of Array.from(enlaces.values())) {
    try {
      cb(e);
    } catch {
      /* noop */
    }
  }
  return () => {
    oyentesAlta.delete(cb);
  };
}

export function suscribirEnlacesLocales(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

export function fotoEnlacesLocales(): FotoEnlaceLocal[] {
  return foto;
}

/** Lista reactiva de enlaces locales vivos (para la interfaz). */
export function useEnlacesLocales(): FotoEnlaceLocal[] {
  return useSyncExternalStore(suscribirEnlacesLocales, fotoEnlacesLocales, () => VACIA);
}

/** Solo pruebas. */
export function __vaciarRegistroEnlacesLocales(): void {
  enlaces.clear();
  oyentesAlta.clear();
  rehacerFoto();
}
