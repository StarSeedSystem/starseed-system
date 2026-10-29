"use client";

/**
 * Protomolécula · GANCHO `useMolecula`. Delgado a propósito: abre la sesión compartida de la molécula
 * (`sesion-molecula.ts`, que crea, registra y guarda el controlador) y la cierra al desmontar. Sin
 * `moleculaId` usa la última abierta, la más reciente guardada o una nueva. El estado se lee con
 * `useSyncExternalStore`: el controlador entrega siempre el MISMO objeto hasta que algo cambia, así
 * que no hay bucles de repintado.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { RelojComun } from "@/lib/estaciones/reloj-comun";
import { almacenNavegador } from "@/lib/protomolecula/almacen-moleculas";
import type { Controlador, EstadoControl } from "@/lib/protomolecula/controlador";
import { abrirSesion, cerrarSesion, type EstadoGuardado, type SesionMolecula } from "@/lib/protomolecula/sesion-molecula";
import type { Sesion } from "@/lib/protomolecula/tipos";
import { crearEnlaceSesion, type EnlaceSesion, type OpcionesEnlaceSesion } from "@/lib/protomolecula/transporte-protomolecula";

const SIN_SESION: EstadoGuardado = { estado: "sin-cambios" };
const nada = (): void => {};

const idSeguro = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `pm-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Estado vivo de un controlador (o `null` si aún no hay). */
export function useEstadoControl(controlador: Controlador | null): EstadoControl | null {
  const suscribir = useCallback((aviso: () => void) => (controlador ? controlador.suscribir(() => aviso()) : nada), [controlador]);
  const leer = useCallback(() => (controlador ? controlador.obtener() : null), [controlador]);
  return useSyncExternalStore(suscribir, leer, () => null);
}

/** De dónde salen los mensajes de la sesión. La UI de «Compartir» (tarea sucesora) lo inyecta. */
export interface TransporteSesion {
  enviar: OpcionesEnlaceSesion["enviar"];
  recibir: OpcionesEnlaceSesion["recibir"];
  dispositivo?: string;
}

export interface OpcionesMolecula {
  moleculaId?: string;
  /** Sin él, la sesión queda «solo en este aparato»: no se inventa ningún enlace. */
  transporte?: TransporteSesion;
}

export interface ResultadoMolecula {
  /** Abriendo la sesión (el almacén del navegador solo se toca en el cliente, tras montar). */
  cargando: boolean;
  /** Por qué no se pudo abrir (molécula inexistente, formato antiguo…), en español. */
  error: string | null;
  controlador: Controlador | null;
  estado: EstadoControl | null;
  guardado: EstadoGuardado;
  /** Enlace P2P de la sesión (creado con el transporte inyectado o local si no lo hay). */
  enlace: EnlaceSesion | null;
}

export function useMolecula(o: OpcionesMolecula = {}): ResultadoMolecula {
  const { moleculaId, transporte } = o;
  const [sesion, setSesion] = useState<SesionMolecula | null>(null);
  const [enlace, setEnlace] = useState<EnlaceSesion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = abrirSesion(moleculaId, { almacen: almacenNavegador(), ahora: Date.now, nuevoId: idSeguro });
    if (!r.ok) {
      setSesion(null);
      setEnlace(null);
      setError(r.motivo);
      return;
    }
    setError(null);
    setSesion(r.sesion);
    // El reloj común es el de la sesión: sin muestras dice «sin muestras» y no inventa precisión.
    const relojComun = new RelojComun();
    const base = r.sesion.controlador.obtener().molecula;
    const dispositivo = transporte?.dispositivo ?? idSeguro();
    const protocolo: Sesion = {
      id: `pm-${r.sesion.id}`, moleculaId: r.sesion.id, ambito: base.ambito, anfitrion: dispositivo,
      miembros: { [dispositivo]: "dueno" }, transporte: "malla-p2p", consentimientos: [], creadaEn: Date.now(),
    };
    const e = crearEnlaceSesion({
      sesion: protocolo, molecula: base, dispositivo,
      reloj: { ahora: () => relojComun.ahora(), estado: () => relojComun.estado() },
      enviar: transporte?.enviar ?? (() => ({ ok: false })),
      recibir: transporte?.recibir ?? (() => () => {}),
    });
    setEnlace(e);
    const alSalir = () => r.sesion.volcar(); // recargar o cerrar la pestaña no pierde el último cambio
    window.addEventListener("pagehide", alSalir);
    return () => {
      e.cerrar();
      setEnlace(null);
      window.removeEventListener("pagehide", alSalir);
      cerrarSesion(r.sesion.id);
    };
  }, [moleculaId, transporte]);

  const controlador = sesion?.controlador ?? null;
  const estado = useEstadoControl(controlador);
  const suscribirGuardado = useCallback((aviso: () => void) => (sesion ? sesion.suscribirGuardado(aviso) : nada), [sesion]);
  const leerGuardado = useCallback(() => (sesion ? sesion.guardado() : SIN_SESION), [sesion]);
  const guardado = useSyncExternalStore(suscribirGuardado, leerGuardado, () => SIN_SESION);

  return { cargando: sesion === null && error === null, error, controlador, estado, guardado, enlace };
}
