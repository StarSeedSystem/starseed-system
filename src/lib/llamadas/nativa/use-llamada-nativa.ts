"use client";

/*
 * useLlamadaNativa — lo que la interfaz de la llamada necesita saber del teléfono (LLA1108D, 2026-11-08):
 * las rutas de audio (auricular, altavoz, cable, Bluetooth), la ruta de ahora, si el sensor de proximidad
 * tiene la pantalla apagada y las capacidades (para explicar lo que falta: Telecom, pantalla completa…).
 * En la web normal devuelve «sin nativa» y todas las funciones no hacen nada. Contrato:
 * architecture/llamadas-telefonia.md § «Integración nativa».
 *
 * Lo consume la interfaz de las llamadas (LLA1108C); este archivo no pinta nada.
 */

import { useCallback, useEffect, useState } from "react";
import { puenteLlamadaNativa } from "./puente-llamada-nativa";
import { esRuta, pantallaCompletaLista, SIN_CAPACIDADES, type CapacidadesLlamadaNativa, type CargaEvento, type EventoNativo, type RutaAudio } from "./mapeo-llamada-nativa";

export interface VistaNativa {
  capacidades: CapacidadesLlamadaNativa;
  ruta: RutaAudio | "";
  /** El sensor de proximidad mantiene la pantalla apagada (junto a la cara). */
  proximidad: boolean;
}

export const VISTA_INICIAL: VistaNativa = { capacidades: SIN_CAPACIDADES, ruta: "", proximidad: false };

/** Aplica un evento del teléfono a lo que enseña el hook. Pura. */
export function vistaTrasEvento(v: VistaNativa, e: EventoNativo, c: CargaEvento): VistaNativa {
  if (e === "ruta" && esRuta(c.valor)) return { ...v, ruta: c.valor, capacidades: { ...v.capacidades, ruta: c.valor } };
  if (e === "proximidad" && typeof c.valor === "boolean") return { ...v, proximidad: c.valor };
  return v;
}

export interface LlamadaNativaHook {
  /** Hay integración nativa de llamadas en este aparato. */
  disponible: boolean;
  capacidades: CapacidadesLlamadaNativa;
  rutas: RutaAudio[];
  ruta: RutaAudio | "";
  proximidad: boolean;
  /** La pantalla completa sobre el bloqueo está bien (o no hace falta): si no, hay que explicarlo. */
  pantallaCompletaLista: boolean;
  /** Pasa el audio a otra ruta. Devuelve si el teléfono lo aceptó. */
  fijarRuta(ruta: RutaAudio): Promise<boolean>;
  /** Deja o quita que el sensor de proximidad apague la pantalla (se quita con el altavoz o el vídeo). */
  permitirProximidad(activa: boolean): Promise<boolean>;
  /** Abre el ajuste de «Notificaciones a pantalla completa» (Android 14+). */
  pedirPantallaCompleta(): Promise<void>;
}

export function useLlamadaNativa(): LlamadaNativaHook {
  const [vista, setVista] = useState<VistaNativa>(VISTA_INICIAL);

  useEffect(() => {
    const p = puenteLlamadaNativa();
    if (!p.disponible) return;
    let vivo = true;
    let baja: (() => void) | null = null;
    void p.capacidades().then((c) => {
      if (vivo) setVista((v) => ({ ...v, capacidades: c, ruta: c.ruta }));
    });
    void p.alEvento((e, c) => {
      if (vivo) setVista((v) => vistaTrasEvento(v, e, c));
    }).then((b) => {
      if (vivo) baja = b;
      else b();
    });
    return () => {
      vivo = false;
      baja?.();
    };
  }, []);

  const fijarRuta = useCallback(async (ruta: RutaAudio) => puenteLlamadaNativa().rutaAudio(ruta), []);
  const permitirProximidad = useCallback(async (activa: boolean) => puenteLlamadaNativa().proximidad(activa), []);
  const pedirPantallaCompleta = useCallback(async () => {
    const c = await puenteLlamadaNativa().permiso();
    setVista((v) => ({ ...v, capacidades: c }));
  }, []);

  return {
    disponible: vista.capacidades.nativa,
    capacidades: vista.capacidades,
    rutas: vista.capacidades.rutas,
    ruta: vista.ruta,
    proximidad: vista.proximidad,
    pantallaCompletaLista: pantallaCompletaLista(vista.capacidades),
    fijarRuta,
    permitirProximidad,
    pedirPantallaCompleta,
  };
}
