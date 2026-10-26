"use client";

/**
 * Los sueños del mundo en la interfaz (Ola 1025U · U4): quién sueña ahora, la lista guardada de este escenario, el
 * interruptor de sueños automáticos (apagado por defecto) y los topes a la vista.
 *
 * Reglas:
 *  · Un solo sueño a la vez. Cancelar corta incluso una llamada en vuelo.
 *  · Cambiar de escenario o cerrar el mundo CANCELA el sueño que corre (sus agentes eran de aquel mundo); lo que
 *    llevaba queda guardado como cancelado en SU escenario.
 *  · Los sueños automáticos solo nacen de un encuentro NUEVO entre dos agentes que ya se conocen, con el mundo en marcha
 *    (sin pausa y con la pestaña visible), y pasan por los mismos topes y, además, por el suyo propio.
 *  · Se guardan los últimos N por escenario en este aparato; el sueño que corre se guarda «en curso» y, si la pestaña se
 *    cierra a medias, al volver aparece «interrumpido».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { leerConfigAgente } from "@/lib/avatares/agente/almacen-agente";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import type { CreacionMundo, EstadoMundo } from "@/lib/avatares/mundo/simulacion";
import { guardarSuenos, guardarUso, leerSuenos, leerUso } from "@/lib/avatares/suenos/almacen-suenos";
import { ejecutarSueno, type GeneradorIA } from "@/lib/avatares/suenos/ejecutor";
import { crearGeneradorRouter } from "@/lib/avatares/suenos/generador-router";
import {
  TOPES_SUENO, candidatoAutomatico, comprobarTopes, enLaUltimaHora, nuevoSueno, planSueno, registrarInicio,
  resultadoACreacion, type OrigenSueno, type Sueno,
} from "@/lib/avatares/suenos/sueno";

export type ResultadoInicio = { ok: true; sueno: Sueno } | { ok: false; motivo: string };

export interface OpcionesSuenos {
  escenarioId: string;
  /** Quién vive en este escenario (los que se ven). */
  agentes: readonly AgenteMundoRef[];
  /** El mundo vivo: de él salen los encuentros que pueden despertar un sueño automático. */
  estado: EstadoMundo | null;
  /** El mundo corre (sin pausa y con la pestaña visible). Solo entonces nacen sueños automáticos. */
  activo: boolean;
  /** Pasa al mundo la creación de un sueño completo para su crónica. */
  alCrearObras?: (crear: (tick: number) => CreacionMundo[]) => void;
  /** La IA que habla en cada turno; por defecto, el enrutador económico. Sustituible en pruebas. */
  generar?: GeneradorIA;
  ahora?: () => number;
}

export interface TopesVistos {
  suenosEstaHora: number;
  automaticosEstaHora: number;
}

export interface ControlSuenos {
  /** El que sueña ahora, si lo hay. */
  enCurso: Sueno | null;
  /** Del más reciente al más antiguo; el que corre va el primero. */
  suenos: Sueno[];
  automaticos: boolean;
  ponerAutomaticos: (v: boolean) => void;
  iniciar: (agentes: readonly AgenteMundoRef[], tema: string, origen?: OrigenSueno) => ResultadoInicio;
  cancelar: () => void;
  olvidar: (id: string) => void;
  topes: TopesVistos;
  /** Última frase honesta (tope alcanzado, sueño automático omitido…). */
  aviso: string | null;
  limpiarAviso: () => void;
  /** `false` si lo último no cupo en el disco. */
  guardado: boolean;
}

interface Vista {
  escenarioId: string;
  /** Terminados, interrumpidos o cancelados; del más antiguo al más reciente. */
  lista: Sueno[];
  automaticos: boolean;
  enCurso: Sueno | null;
}

function cargarVista(escenarioId: string): Vista {
  const d = leerSuenos(escenarioId);
  return { escenarioId, lista: d.suenos, automaticos: d.automaticos, enCurso: null };
}

const ordenar = (l: Sueno[]) => [...l].sort((a, b) => a.creadoEn - b.creadoEn).slice(-TOPES_SUENO.guardadosPorEscenario);

function persistir(v: Vista): boolean {
  const todos = v.enCurso ? [...v.lista.filter((s) => s.id !== v.enCurso!.id), v.enCurso] : v.lista;
  return guardarSuenos(v.escenarioId, { automaticos: v.automaticos, suenos: ordenar(todos) });
}

/** Escribe un sueño en el almacén de OTRO escenario (el usuario se fue del suyo mientras acababa de cancelarse). */
function fusionarEnAlmacen(escenarioId: string, s: Sueno): void {
  const d = leerSuenos(escenarioId);
  guardarSuenos(escenarioId, { automaticos: d.automaticos, suenos: ordenar([...d.suenos.filter((x) => x.id !== s.id), s]) });
}

export function useSuenos(o: OpcionesSuenos): ControlSuenos {
  const { escenarioId, agentes, estado, activo } = o;
  const [vista, setVista] = useState<Vista>(() => cargarVista(escenarioId));
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(true);

  // Estado derivado del escenario: al cambiar de mundo se carga el suyo.
  let actual = vista;
  if (vista.escenarioId !== escenarioId) {
    actual = cargarVista(escenarioId);
    setVista(actual);
  }
  const ref = useRef(actual);
  ref.current = actual;

  const ajustes = useRef(o);
  ajustes.current = o;
  const montado = useRef(false);
  const control = useRef<AbortController | null>(null);
  const generador = useRef<GeneradorIA | null>(null);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Cambiar de escenario o cerrar el mundo corta el sueño que corre.
  useEffect(() => () => control.current?.abort(), [escenarioId]);

  const poner = useCallback((v: Vista) => {
    ref.current = v;
    setVista(v);
    setGuardado(persistir(v));
  }, []);

  const terminarSueno = useCallback(
    (esc: string, s: Sueno) => {
      const v = ref.current;
      if (esc !== v.escenarioId || !montado.current) {
        fusionarEnAlmacen(esc, s);
        return;
      }
      poner({ ...v, lista: ordenar([...v.lista.filter((x) => x.id !== s.id), s]), enCurso: v.enCurso?.id === s.id ? null : v.enCurso });
      if (s.estado === "completo") ajustes.current.alCrearObras?.((tick) => resultadoACreacion(s, tick));
    },
    [poner],
  );

  const alAvanzar = useCallback(
    (esc: string, s: Sueno) => {
      if (s.estado !== "en-curso") {
        terminarSueno(esc, s);
        return;
      }
      const v = ref.current;
      if (esc === v.escenarioId && montado.current) poner({ ...v, enCurso: s });
      else fusionarEnAlmacen(esc, s);
    },
    [poner, terminarSueno],
  );

  const iniciar = useCallback(
    (refs: readonly AgenteMundoRef[], tema: string, origen: OrigenSueno = "manual"): ResultadoInicio => {
      const v = ref.current;
      if (v.enCurso) return { ok: false, motivo: "Ya hay un sueño en curso. Espera a que termine o cancélalo." };
      const plan = planSueno(refs, tema);
      if (!plan.ok) return plan;

      const reloj = ajustes.current.ahora ?? Date.now;
      const t = reloj();
      const uso = leerUso(t);
      const automatico = origen === "encuentro";
      const topes = comprobarTopes({
        uso, participantes: plan.plan.participantes, orden: plan.plan.orden, configDe: leerConfigAgente, ahora: t, automatico,
      });
      if (!topes.ok) return { ok: false, motivo: topes.motivo };

      guardarUso(registrarInicio(uso, plan.plan.participantes, automatico, t), t);
      const sueno = nuevoSueno(plan.plan, v.escenarioId, origen, t, new Set(v.lista.map((s) => s.id)));
      poner({ ...v, enCurso: sueno });

      const ctl = new AbortController();
      control.current = ctl;
      const generar = ajustes.current.generar ?? (generador.current ??= crearGeneradorRouter());
      const esc = v.escenarioId;
      void ejecutarSueno(sueno, { generar, ahora: reloj, alAvanzar: (s) => alAvanzar(esc, s) }, ctl.signal)
        .then((fin) => {
          // Cinturón y tirantes: el ejecutor ya avisó del final; si no llegó, se cierra aquí.
          if (ref.current.escenarioId === esc && ref.current.enCurso?.id === fin.id) terminarSueno(esc, fin);
        })
        .finally(() => {
          if (control.current === ctl) control.current = null;
        });
      return { ok: true, sueno };
    },
    [poner, alAvanzar, terminarSueno],
  );

  const cancelar = useCallback(() => control.current?.abort(), []);

  const olvidar = useCallback(
    (id: string) => {
      const v = ref.current;
      if (v.enCurso?.id === id) return;
      poner({ ...v, lista: v.lista.filter((s) => s.id !== id) });
    },
    [poner],
  );

  const ponerAutomaticos = useCallback(
    (valor: boolean) => {
      poner({ ...ref.current, automaticos: valor });
      setAviso(null);
    },
    [poner],
  );

  /* ── Sueños automáticos: nacen de un encuentro NUEVO entre dos que ya se conocen ── */
  const desdeTick = useRef<number | null>(null);
  useEffect(() => {
    desdeTick.current = null;
  }, [escenarioId, actual.automaticos]);

  const porId = useMemo(() => new Map(agentes.map((a) => [a.id, a] as const)), [agentes]);
  useEffect(() => {
    if (!estado || !actual.automaticos || !activo) return;
    const maxTick = estado.encuentros.reduce((m, e) => Math.max(m, e.tick), -1);
    // La primera mirada solo fija el punto de partida: los encuentros de antes no despiertan nada.
    if (desdeTick.current === null) {
      desdeTick.current = maxTick;
      return;
    }
    if (maxTick <= desdeTick.current || ref.current.enCurso) return;
    const reloj = ajustes.current.ahora ?? Date.now;
    const candidato = candidatoAutomatico({
      encuentros: estado.encuentros,
      desdeTick: desdeTick.current,
      tickActual: estado.tick,
      habitantes: estado.habitantes,
      agentes: porId,
      recientes: ref.current.lista,
      ahora: reloj(),
    });
    desdeTick.current = maxTick;
    if (!candidato) return;
    const r = iniciar([candidato.a, candidato.b], candidato.tema, "encuentro");
    if (!r.ok) setAviso(`Sueño automático omitido: ${r.motivo}`);
  }, [estado, actual.automaticos, activo, porId, iniciar]);

  // Los topes a la vista se releen cuando cambia algo (un sueño empieza, un turno suena, uno acaba).
  const topes = useMemo<TopesVistos>(() => {
    const t = (ajustes.current.ahora ?? Date.now)();
    const uso = leerUso(t);
    return { suenosEstaHora: enLaUltimaHora(uso.inicios, t), automaticosEstaHora: enLaUltimaHora(uso.automaticos, t) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual]);

  const limpiarAviso = useCallback(() => setAviso(null), []);

  const suenos = useMemo(() => {
    const resto = [...actual.lista].sort((a, b) => b.creadoEn - a.creadoEn).filter((s) => s.id !== actual.enCurso?.id);
    return actual.enCurso ? [actual.enCurso, ...resto] : resto;
  }, [actual]);

  return {
    enCurso: actual.enCurso,
    suenos,
    automaticos: actual.automaticos,
    ponerAutomaticos,
    iniciar,
    cancelar,
    olvidar,
    topes,
    aviso,
    limpiarAviso,
    guardado,
  };
}
