"use client";

/**
 * Bots/dots de Astraura · HOOK DEL BUCLE (BOT1011H1).
 * Contrato: architecture/astraura-bots.md §5–§6.
 *
 * Separa una clase/funciones puras-testables `crearControlBucle(dep)` de un hook fino
 * `useBucleBot(bot, ctx)`. Mantiene un `EstadoBucle` por bot (`bucleInicial`/`avanzar`);
 * `proponer(bruto, nivel, rol)` = `validarAccion` → `decidirAccion` → evento `proponer`;
 * si queda `actuando` llama a `ejecutarAccion` y emite `aplicada` con su `previo` o `fallo`;
 * `confirmar`/`rechazar`; `deshacer` ejecuta la acción inversa o dice por qué no se puede;
 * `encenderSentido(s)` usa el puente (BOT1011F) y emite `observar`/`soltar`; `pausar`.
 * Persistencia: localStorage `starseed.astraura.bots.registro.<botId>.v1` (últimos 200)
 * y, con sesión, inserción best-effort en `astraura_bots_registro` (BOT1011B).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { avanzar, bucleInicial, type EstadoBucle, type EventoBucle } from "../bucle";
import { deshacer as calcularDeshacer, validarAccion, type AccionBot } from "../acciones";
import { decidirAccion, NIVEL_POR_DEFECTO, type NivelBot } from "../permisos";
import { crearPuenteSentidos, type ContextoPercibir, type DepsPuenteSentidos, type ResultadoPercibir } from "./sentidos-puente";
import { ejecutarAccion, type DepsEjecutor } from "./ejecutor-acciones";
import type { Bot, RolBot, Sentido } from "../tipos";

export const CLAVE_REGISTRO = (botId: string) => `starseed.astraura.bots.registro.${botId}.v1`;
export const MAX_LOCAL = 200;

export interface DepsControlBucle {
  decidirAccion?: typeof decidirAccion;
  validarAccion?: typeof validarAccion;
  ejecutarAccion?: typeof ejecutarAccion;
  crearPuenteSentidos?: typeof crearPuenteSentidos;
  ahora?: () => number;
  /** Inserción best-effort en `astraura_bots_registro` con sesión. */
  registrarSupabase?: (entrada: unknown) => Promise<void> | void;
  /** Deps para el ejecutor de acciones. */
  depsEjecutor?: DepsEjecutor;
  /** Deps para el puente de sentidos. */
  depsPuente?: Partial<DepsPuenteSentidos>;
}

export interface ControlBucle {
  estado: EstadoBucle;
  proponer: (bruto: unknown, nivel?: NivelBot, rol?: RolBot) => { ok: boolean; motivo: string };
  confirmar: (quien: string) => void;
  rechazar: (quien: string) => void;
  deshacer: (quien: string) => { ok: boolean; motivo: string };
  encenderSentido: (sentido: Sentido, ctx: ContextoPercibir) => Promise<ResultadoPercibir>;
  pausar: (quien: string) => void;
}

function guardarRegistroLocal(botId: string, registro: EstadoBucle["registro"]) {
  try {
    if (typeof window === "undefined") return;
    const recortado = registro.slice(-MAX_LOCAL);
    window.localStorage.setItem(CLAVE_REGISTRO(botId), JSON.stringify(recortado));
  } catch {
    /* best-effort */
  }
}

function volcarSupabase(registrarSupabase: ((e: unknown) => Promise<void> | void) | undefined, registro: EstadoBucle["registro"]) {
  if (!registrarSupabase) return;
  const ultimo = registro[registro.length - 1];
  if (!ultimo) return;
  try {
    const r = registrarSupabase(ultimo);
    if (r && typeof r.catch === "function") r.catch(() => undefined);
  } catch {
    /* best-effort */
  }
}

export function crearControlBucle(bot: Bot, ctx: ContextoPercibir, dep: DepsControlBucle = {}): ControlBucle {
  const da = dep.decidirAccion ?? decidirAccion;
  const va = dep.validarAccion ?? validarAccion;
  const ea = dep.ejecutarAccion ?? ejecutarAccion;
  const cps = dep.crearPuenteSentidos ?? crearPuenteSentidos;
  const ahora = dep.ahora ?? Date.now;

  let estado: EstadoBucle = bucleInicial(bot.id);

  const puente = cps({
    consentimientos: dep.depsPuente?.consentimientos ?? { vigentes: () => [] },
    leerPantalla: dep.depsPuente?.leerPantalla,
    ver: dep.depsPuente?.ver,
    carpeta: dep.depsPuente?.carpeta,
    red: dep.depsPuente?.red,
    alEvento: (ev) => {
      estado = avanzar(estado, ev);
      guardarRegistroLocal(bot.id, estado.registro);
      volcarSupabase(dep.registrarSupabase, estado.registro);
    },
    ahora: dep.depsPuente?.ahora ?? ahora,
  });

  const aplicar = async () => {
    if (estado.fase !== "actuando" || !estado.pendiente) return;
    const accion = estado.pendiente.accion;
    try {
      const res = await ea(accion, dep.depsEjecutor ?? {});
      if (res.ok) {
        estado = avanzar(estado, { tipo: "aplicada", previo: res.previo, at: ahora() });
      } else {
        estado = avanzar(estado, { tipo: "fallo", motivo: res.motivo, at: ahora() });
      }
    } catch {
      estado = avanzar(estado, { tipo: "fallo", motivo: "Fallo inesperado al ejecutar la acción.", at: ahora() });
    }
    guardarRegistroLocal(bot.id, estado.registro);
    volcarSupabase(dep.registrarSupabase, estado.registro);
  };

  const control: ControlBucle = {
    get estado() {
      return estado;
    },
    proponer(bruto: unknown, nivel: NivelBot = NIVEL_POR_DEFECTO, rol: RolBot = "miembro") {
      const v = va(bruto);
      if (!v.accion) {
        return { ok: false, motivo: v.problemas[0] ?? "Acción inválida." };
      }
      const decision = da({ bot, accion: v.accion, rol, nivel, delegado: bot.gobierno === "democratico" ? undefined : undefined });
      const ev: EventoBucle = { tipo: "proponer", accion: v.accion, decision, at: ahora() };
      const antes = estado.fase;
      estado = avanzar(estado, ev);
      guardarRegistroLocal(bot.id, estado.registro);
      volcarSupabase(dep.registrarSupabase, estado.registro);
      if (estado.fase === "actuando" && antes !== "actuando") {
        void aplicar();
      }
      return { ok: decision.permitido || ["confirmacion", "votacion", "consentimiento", "expreso"].includes(decision.requiere), motivo: decision.motivo };
    },
    confirmar(quien: string) {
      estado = avanzar(estado, { tipo: "confirmar", quien, at: ahora() });
      guardarRegistroLocal(bot.id, estado.registro);
      volcarSupabase(dep.registrarSupabase, estado.registro);
      void aplicar();
    },
    rechazar(quien: string) {
      estado = avanzar(estado, { tipo: "rechazar", quien, at: ahora() });
      guardarRegistroLocal(bot.id, estado.registro);
      volcarSupabase(dep.registrarSupabase, estado.registro);
    },
    deshacer(quien: string) {
      if (!estado.ultimaAplicada) {
        return { ok: false, motivo: "No hay nada que deshacer." };
      }
      const accion = estado.ultimaAplicada.accion;
      const desh = calcularDeshacer(accion, {});
      if ("nada" in desh) {
        return { ok: false, motivo: "Esta acción no deja rastro que deshacer." };
      }
      if ("irrevocable" in desh || "irreversible" in desh) {
        return { ok: false, motivo: ("irreversible" in desh ? desh.irreversible : (desh as any).irrevocable) as string };
      }
      if ("retirar" in desh) {
        return { ok: false, motivo: "No consta qué se envió para retirarlo." };
      }
      if ("accion" in desh && desh.accion) {
        const v = va(desh.accion);
        if (!v.accion) return { ok: false, motivo: v.problemas[0] ?? "No se puede deshacer." };
        const decision = da({ bot, accion: v.accion, rol: "dueno", nivel: "aplicar", delegado: undefined });
        estado = avanzar(estado, { tipo: "proponer", accion: v.accion, decision, at: ahora() });
        guardarRegistroLocal(bot.id, estado.registro);
        volcarSupabase(dep.registrarSupabase, estado.registro);
        void aplicar();
        estado = avanzar(estado, { tipo: "deshacer", quien, at: ahora() });
        guardarRegistroLocal(bot.id, estado.registro);
        volcarSupabase(dep.registrarSupabase, estado.registro);
        return { ok: true, motivo: "Acción inversa ejecutada." };
      }
      return { ok: false, motivo: "No se puede deshacer." };
    },
    async encenderSentido(sentido: Sentido, ctx2: ContextoPercibir) {
      return puente.percibir(bot, sentido, ctx2);
    },
    pausar(quien: string) {
      estado = avanzar(estado, { tipo: "pausar", quien, at: ahora() });
      guardarRegistroLocal(bot.id, estado.registro);
      volcarSupabase(dep.registrarSupabase, estado.registro);
    },
  };

  return control;
}

export function useBucleBot(bot: Bot, ctx: ContextoPercibir, dep: DepsControlBucle = {}) {
  const ctrlRef = useRef<ControlBucle | null>(null);
  if (!ctrlRef.current) {
    ctrlRef.current = crearControlBucle(bot, ctx, dep);
  }
  const [estado, setEstado] = useState<EstadoBucle>(ctrlRef.current.estado);

  const sync = useCallback(() => {
    if (!ctrlRef.current) return;
    setEstado(ctrlRef.current.estado);
  }, []);

  const proponer = useCallback((bruto: unknown, nivel?: NivelBot, rol?: RolBot) => {
    const r = ctrlRef.current!.proponer(bruto, nivel, rol);
    sync();
    return r;
  }, [sync]);

  const confirmar = useCallback((quien: string) => {
    ctrlRef.current!.confirmar(quien);
    sync();
  }, [sync]);

  const rechazar = useCallback((quien: string) => {
    ctrlRef.current!.rechazar(quien);
    sync();
  }, [sync]);

  const deshacer = useCallback((quien: string) => {
    const r = ctrlRef.current!.deshacer(quien);
    sync();
    return r;
  }, [sync]);

  const encenderSentido = useCallback(async (sentido: Sentido, ctx2?: ContextoPercibir) => {
    const r = await ctrlRef.current!.encenderSentido(sentido, ctx2 ?? ctx);
    sync();
    return r;
  }, [ctx, sync]);

  const pausar = useCallback((quien: string) => {
    ctrlRef.current!.pausar(quien);
    sync();
  }, [sync]);

  useEffect(() => {
    sync();
  }, [sync]);

  return {
    estado,
    proponer,
    confirmar,
    rechazar,
    deshacer,
    encenderSentido,
    pausar,
  };
}
