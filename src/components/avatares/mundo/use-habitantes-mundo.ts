"use client";

/**
 * Quién vive en el mundo (Ola 1025U · U1). Tres caminos, en este orden:
 *  1. `habitantes` (lista ya hecha por quien monta el mundo, p. ej. las pruebas);
 *  2. `personalidades` (el camino histórico: se vuelven `AgenteMundoRef` de origen «personalidad»);
 *  3. la cuenta, con `leerHabitantesDeCuenta` (personalidades + bots de las entidades + agentes de grupo).
 *
 * Mientras la cuenta se lee, `cargando` es `true` y `agentes` es `null`: el mundo no decide nada con una lista
 * a medias (reconciliar con una lista vacía borraría el mundo guardado).
 */
import { useEffect, useMemo, useState } from "react";
import { crearAgenteMundoRef, type AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { leerHabitantesDeCuenta, type EntidadMundo, type HabitantesLeidos } from "@/lib/avatares/mundo/habitantes-cuenta";
import type { EstadoMundo } from "@/lib/avatares/mundo/simulacion";
import { registrarFallo } from "@/lib/avatares/movimiento/daemon";

export interface OrigenHabitantes {
  habitantes?: readonly AgenteMundoRef[];
  personalidades?: ReadonlyArray<{ id: string; name: string }>;
  /** Mundo heredado (`estadoInicial`): quien vive en él se queda como habitante, con su mismo id. */
  estadoInicial?: EstadoMundo;
}

export interface HabitantesDelMundo {
  /** `null` mientras se leen las fuentes. */
  agentes: readonly AgenteMundoRef[] | null;
  entidades: readonly EntidadMundo[];
  avisos: readonly string[];
  sinSesion: boolean;
  cargando: boolean;
  /** `false` si alguna fuente falló: la lista puede estar incompleta y no se debe pisar lo guardado con ella. */
  completa: boolean;
}

const VACIO: readonly never[] = [];

export function personalidadesComoAgentes(lista: ReadonlyArray<{ id: string; name: string }>): AgenteMundoRef[] {
  return lista
    .filter((p) => p.id && p.name)
    .map((p) => crearAgenteMundoRef({ origen: "personalidad", idOrigen: p.id, nombre: p.name, dueno: { tipo: "cuenta", id: "local" } }));
}

/** Los habitantes de un mundo heredado como agentes, conservando el id que ya tenían en ese mundo. */
export function agentesDeEstado(estado: EstadoMundo): AgenteMundoRef[] {
  return estado.habitantes.map((h) => ({
    ...crearAgenteMundoRef({ origen: "personalidad", idOrigen: h.personalidadId, nombre: h.nombre, dueno: { tipo: "cuenta", id: "local" } }),
    id: h.id,
  }));
}

export function useHabitantesMundo(origen: OrigenHabitantes, leer: () => Promise<HabitantesLeidos> = leerHabitantesDeCuenta): HabitantesDelMundo {
  const { habitantes, personalidades, estadoInicial } = origen;
  const fijos = useMemo<readonly AgenteMundoRef[] | null>(() => {
    if (habitantes) return habitantes;
    if (personalidades && personalidades.length > 0) return personalidadesComoAgentes(personalidades);
    if (estadoInicial) return agentesDeEstado(estadoInicial);
    return null;
    // El mundo heredado solo manda al abrir: sus habitantes no se recalculan con cada tick del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitantes, personalidades]);

  const [leido, setLeido] = useState<HabitantesLeidos | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (fijos) return;
    let vivo = true;
    leer().then(
      (r) => {
        if (vivo) setLeido(r);
      },
      (error) => {
        registrarFallo("mundo-avatares.habitantes", error);
        if (vivo) setFallo(true);
      },
    );
    return () => {
      vivo = false;
    };
    // `leer` es inyectable para pruebas y no cambia de identidad en uso normal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fijos]);

  if (fijos) return { agentes: fijos, entidades: VACIO, avisos: VACIO, sinSesion: false, cargando: false, completa: true };
  if (fallo) {
    return {
      agentes: VACIO,
      entidades: VACIO,
      avisos: ["No se pudieron leer los agentes de tu cuenta."],
      sinSesion: false,
      cargando: false,
      completa: false,
    };
  }
  if (!leido) return { agentes: null, entidades: VACIO, avisos: VACIO, sinSesion: false, cargando: true, completa: true };
  return {
    agentes: leido.agentes,
    entidades: leido.entidades,
    avisos: leido.avisos,
    sinSesion: leido.sinSesion,
    cargando: false,
    // Los avisos de «sin sesión» no hacen incompleta la lista local; un fallo de una fuente sí.
    completa: leido.avisos.every((a) => a.startsWith("Sin sesión")),
  };
}
