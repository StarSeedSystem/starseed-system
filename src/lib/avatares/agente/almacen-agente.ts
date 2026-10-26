"use client";
/**
 * Almacén de la ficha del agente del mundo (Ola 1025U · U2). Contrato: architecture/ficha-agente-mundo.md.
 *
 * Un agente = una clave, en el aparato (nunca sale solo):
 *   · `starseed.mundo.agente.<id>.v1`            → `ConfigAgente`
 *   · `starseed.mundo.agente.<id>.recuerdos.v1`  → `RecuerdoBot[]`
 * Toda lectura sanea y nunca lanza; toda escritura pasa por `safeSet`, que degrada a memoria si el disco está lleno.
 *
 * Qué se APLICA hoy (lo lee ya un motor del OS) y qué queda «guardado en la ficha»:
 *   · aplicado: las cuatro capas de conciencia (`capas-entidad`, ámbito «agente») y el sistema del papel «palabra»
 *     (`primary-system`, ámbito «agente»). El enrutador los lee cuando una petición lleva el id de este agente.
 *   · guardado en la ficha: cerebro, capas propias y «Todo StarSeed OS», percepción, resto de motores y herramientas.
 *     Quien responda por el agente los lee con `promptDeAgente`, `preferenciasReparto` y `habilidadesPermitidas`.
 * Para que la ficha viaje con la cuenta hay que añadir el prefijo `starseed.mundo.agente.` a `SYNCED_PREFIXES`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RecuerdoBot } from "@/lib/astraura-bots/memoria-bot";
import { fijarCapaGuardada } from "@/lib/astraura/use-capas-entidad";
import { setPrimaryChoice } from "@/lib/astraura/primary-system";
import { safeGet, safeRemove, safeSet } from "@/lib/safe-storage";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import {
  ajustesCapasBase, configPorDefecto, eleccionPrimaria, sanearConfig,
  type CampoCapaBase, type ConfigAgente,
} from "./config-agente";
import { agregarRecuerdo, sanearRecuerdos, type NuevoRecuerdo } from "./desarrollo";
import { deshacerEvolucion, evolucionar, type RasgoPercepcion } from "./percepcion";

export const PREFIJO_AGENTE = "starseed.mundo.agente.";
export const EVENTO_AGENTE = "starseed:mundo-agente";

export const claveConfigAgente = (id: string) => `${PREFIJO_AGENTE}${id}.v1`;
export const claveRecuerdosAgente = (id: string) => `${PREFIJO_AGENTE}${id}.recuerdos.v1`;

function leerJSON(clave: string): unknown {
  try {
    const crudo = safeGet(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

function avisar(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_AGENTE, { detail: { id } }));
  } catch { /* sin eventos: solo se pierde el refresco en vivo */ }
}

/* ── Lectura y escritura ─────────────────────────────────────────────────── */

export function leerConfigAgente(agente: AgenteMundoRef): ConfigAgente {
  return sanearConfig(leerJSON(claveConfigAgente(agente.id)), agente);
}

/** Guarda y avisa. Sella `actualizado` con el reloj que le pasen. Devuelve lo guardado (ya saneado). */
export function guardarConfigAgente(agente: AgenteMundoRef, config: ConfigAgente, ahora: number = Date.now()): ConfigAgente {
  const limpio = sanearConfig({ ...config, actualizado: ahora }, agente);
  safeSet(claveConfigAgente(agente.id), JSON.stringify(limpio));
  avisar(agente.id);
  return limpio;
}

export function leerRecuerdosAgente(agente: AgenteMundoRef): RecuerdoBot[] {
  return sanearRecuerdos(leerJSON(claveRecuerdosAgente(agente.id)), agente);
}

export function guardarRecuerdosAgente(agente: AgenteMundoRef, recuerdos: RecuerdoBot[]): RecuerdoBot[] {
  const limpios = sanearRecuerdos(recuerdos, agente);
  safeSet(claveRecuerdosAgente(agente.id), JSON.stringify(limpios));
  avisar(agente.id);
  return limpios;
}

/* ── Efectos: lo que la ficha APLICA en el OS ─────────────────────────────── */

const CAMPOS_CAPA: CampoCapaBase[] = ["local", "mesh", "nube", "colectiva"];

/**
 * Aplica solo lo que CAMBIÓ entre dos configuraciones: así guardar un rasgo no pisa lo que se ajustó en otra parte
 * del OS (el editor de capas por entidad o el del sistema primario).
 */
export function aplicarEfectos(agenteId: string, previo: ConfigAgente, siguiente: ConfigAgente): void {
  const antes = ajustesCapasBase(previo.capas);
  const despues = ajustesCapasBase(siguiente.capas);
  for (const campo of CAMPOS_CAPA) {
    if (antes[campo] !== despues[campo]) fijarCapaGuardada("agente", agenteId, campo, despues[campo]);
  }
  const pAntes = JSON.stringify(eleccionPrimaria(previo.motores));
  const eleccion = eleccionPrimaria(siguiente.motores);
  if (pAntes !== JSON.stringify(eleccion)) setPrimaryChoice("agente", agenteId, eleccion.aplicar ? eleccion.choice : null);
}

/** Quita la ficha de este agente y lo que aplicó: vuelve a heredar capas y sistema de la personalidad o la cuenta. */
export function restablecerAgente(agente: AgenteMundoRef): ConfigAgente {
  for (const campo of CAMPOS_CAPA) fijarCapaGuardada("agente", agente.id, campo, null);
  setPrimaryChoice("agente", agente.id, null);
  safeRemove(claveConfigAgente(agente.id));
  avisar(agente.id);
  return configPorDefecto(agente);
}

/* ── Quien vive la experiencia escribe aquí (la ficha solo lee y deshace) ──── */

/** Un recuerdo nuevo del agente, con las reglas de alcance y de cuota. No hace nada si no está permitido. */
export function registrarRecuerdo(agente: AgenteMundoRef, nuevo: NuevoRecuerdo, ahora: number = Date.now()) {
  const r = agregarRecuerdo(leerRecuerdosAgente(agente), agente, nuevo, ahora);
  if (r.ok) guardarRecuerdosAgente(agente, r.recuerdos);
  return r;
}

/** La experiencia empuja los rasgos: tope diario, deriva máxima y deshacer, siempre (ver `percepcion.ts`). */
export function registrarExperiencia(
  agente: AgenteMundoRef, empujes: Partial<Record<RasgoPercepcion, number>>, motivo: string, ahora: number = Date.now(),
) {
  const config = leerConfigAgente(agente);
  const r = evolucionar(config.desarrollo, config.percepcion.rasgos, empujes, motivo, ahora);
  if (r.aplicadas.length) guardarConfigAgente(agente, { ...config, desarrollo: r.desarrollo }, config.actualizado);
  return r;
}

/** Deshace un paso de la evolución de este agente (la deriva vuelve; el cupo del día no). */
export function deshacerPasoEvolucion(agente: AgenteMundoRef, idPaso: string): boolean {
  const config = leerConfigAgente(agente);
  const r = deshacerEvolucion(config.desarrollo, idPaso);
  if (r.ok) guardarConfigAgente(agente, { ...config, desarrollo: r.desarrollo }, config.actualizado);
  return r.ok;
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

export interface UsoConfigAgente {
  config: ConfigAgente;
  recuerdos: RecuerdoBot[];
  /** Falso hasta que se ha leído el almacén (el primer pintado usa los valores por defecto). */
  cargado: boolean;
  /** Cambia la configuración, la guarda y aplica lo que corresponda. */
  actualizar: (cambio: (c: ConfigAgente) => ConfigAgente) => void;
  /** Deshace un paso de evolución. */
  deshacer: (idPaso: string) => void;
  restablecer: () => void;
}

export function useConfigAgente(agente: AgenteMundoRef): UsoConfigAgente {
  const [config, setConfig] = useState<ConfigAgente>(() => configPorDefecto(agente));
  const [recuerdos, setRecuerdos] = useState<RecuerdoBot[]>([]);
  const [cargado, setCargado] = useState(false);
  const actual = useRef(config);
  const agenteRef = useRef(agente);
  agenteRef.current = agente;
  const clave = `${agente.id}|${agente.nombre}|${agente.dueno.tipo}|${agente.dueno.id}`;

  useEffect(() => {
    const ag = agenteRef.current;
    const cargar = () => {
      const c = leerConfigAgente(ag);
      actual.current = c;
      setConfig(c);
      setRecuerdos(leerRecuerdosAgente(ag));
      setCargado(true);
    };
    cargar();
    const alAvisar = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (!id || id === ag.id) cargar();
    };
    const alAlmacenar = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith(`${PREFIJO_AGENTE}${ag.id}.`)) cargar();
    };
    window.addEventListener(EVENTO_AGENTE, alAvisar);
    window.addEventListener("storage", alAlmacenar);
    return () => {
      window.removeEventListener(EVENTO_AGENTE, alAvisar);
      window.removeEventListener("storage", alAlmacenar);
    };
  }, [clave]);

  const actualizar = useCallback((cambio: (c: ConfigAgente) => ConfigAgente) => {
    const previo = actual.current;
    const siguiente = cambio(previo);
    if (siguiente === previo) return;
    const ag = agenteRef.current;
    const guardado = guardarConfigAgente(ag, siguiente);
    actual.current = guardado;
    setConfig(guardado);
    aplicarEfectos(ag.id, previo, guardado);
  }, []);

  const deshacer = useCallback((idPaso: string) => {
    const ag = agenteRef.current;
    if (deshacerPasoEvolucion(ag, idPaso)) {
      const c = leerConfigAgente(ag);
      actual.current = c;
      setConfig(c);
    }
  }, []);

  const restablecer = useCallback(() => {
    const c = restablecerAgente(agenteRef.current);
    actual.current = c;
    setConfig(c);
  }, []);

  return { config, recuerdos, cargado, actualizar, deshacer, restablecer };
}
