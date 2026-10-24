"use client";

/**
 * Bots/dots de Astraura · Hook/use del bucle con persistencia (BOT1011H1).
 *
 * Separa una clase/funciones puras-testables `crearControlBucle(dep)` de un hook
 * fino `useBucleBot(bot, ctx)`. Mantiene EstadoBucle por bot; proponer usa
 * validarAccion → decidirAccion → evento proponer; si queda actuando llama a
 * ejecutarAccion y emite aplicada/fallo; confirmar/rechazar/deshacer/pausar;
 * encenderSentido usa el puente y emite observar/soltar; persistencia localStorage
 * starseed.astraura.bots.registro.<botId>.v1 (últimos 200) e inserción best-effort
 * en astraura_bots_registro con sesión.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { avanzar, bucleInicial, type EstadoBucle, type EventoBucle } from "../bucle";
import { decidirAccion, decidirSentido, NIVEL_POR_DEFECTO, type Decision } from "../permisos";
import { validarAccion, type AccionBot, type Previo } from "../acciones";
import { crearPuenteSentidos, type ContextoPercibir } from "./sentidos-puente";
import { ejecutarAccion, type DepsEjecutor } from "./ejecutor-acciones";
import { createClient } from "@/utils/supabase/client";
import type { Bot, RolBot } from "../tipos";

const CLAVE_REGISTRO = (botId: string) => `starseed.astraura.bots.registro.${botId}.v1`;
const MAX_REGISTRO_PERSISTIDO = 200;

export interface DepControlBucle {
  nivel?: "nada" | "proponer" | "aplicar-bajo" | "aplicar";
  rol?: RolBot;
  delegado?: "bajo" | "medio";
  ctxPercibir?: ContextoPercibir;
  depsEjecutor?: DepsEjecutor;
  puente?: ReturnType<typeof crearPuenteSentidos>;
  ahora?: () => number;
  guardar?: (botId: string, registro: EstadoBucle["registro"]) => void;
  cargar?: (botId: string) => EstadoBucle["registro"] | null;
  insertarRemoto?: (entrada: { botId: string; at: number; quien: string; tipo: string; accion?: string; motivo: string; deshacer?: unknown }) => Promise<void>;
}

export interface ControlBucle {
  estado: EstadoBucle;
  proponer: (bruto: unknown, nivel?: "nada" | "proponer" | "aplicar-bajo" | "aplicar", rol?: RolBot) => { ok: boolean; motivo?: string };
  confirmar: (quien: string) => void;
  rechazar: (quien: string) => void;
  deshacer: (quien: string) => Promise<void> | void;
  encenderSentido: (s: Parameters<ReturnType<typeof crearPuenteSentidos>["percibir"]>[1]) => Promise<void>;
  pausar: (quien: string) => void;
}

function guardarLocal(botId: string, registro: EstadoBucle["registro"]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_REGISTRO(botId), JSON.stringify(registro.slice(-MAX_REGISTRO_PERSISTIDO)));
  } catch { /* best effort */ }
}

function cargarLocal(botId: string): EstadoBucle["registro"] | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage.getItem(CLAVE_REGISTRO(botId));
    if (!bruto) return null;
    const parsed = JSON.parse(bruto);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

async function insertarRemotoDefecto(entrada: { botId: string; at: number; quien: string; tipo: string; accion?: string; motivo: string; deshacer?: unknown }) {
  try {
    const supabase = createClient();
    // best-effort: obtener sesión; si no hay, no lanzar
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("astraura_bots_registro").insert({
      bot_id: entrada.botId,
      at: new Date(entrada.at).toISOString(),
      quien: entrada.quien,
      tipo: entrada.tipo,
      accion: entrada.accion ?? null,
      motivo: entrada.motivo,
      deshacer: entrada.deshacer ?? null,
    });
  } catch { /* best effort */ }
}

export function crearControlBucle(bot: Bot, dep: DepControlBucle = {}): ControlBucle {
  const ahora = dep.ahora ?? Date.now;
  let estado: EstadoBucle = bucleInicial(bot.id);
  const cargado = dep.cargar ? dep.cargar(bot.id) : cargarLocal(bot.id);
  if (cargado) {
    estado = { ...estado, registro: cargado.slice(-MAX_REGISTRO_PERSISTIDO) };
  }
  if (estado.registro.length > MAX_REGISTRO_PERSISTIDO) {
    estado = { ...estado, registro: estado.registro.slice(-MAX_REGISTRO_PERSISTIDO) };
  }

  const recortar = () => {
    if (estado.registro.length > MAX_REGISTRO_PERSISTIDO) {
      estado = { ...estado, registro: estado.registro.slice(-MAX_REGISTRO_PERSISTIDO) };
    }
  };

  const guardar = () => {
    recortar();
    const g = dep.guardar ?? guardarLocal;
    try { g(bot.id, estado.registro); } catch { /* best effort */ }
    // insertar best-effort la última entrada
    const ultima = estado.registro[estado.registro.length - 1];
    if (ultima) {
      const ins = dep.insertarRemoto ?? insertarRemotoDefecto;
      void ins({
        botId: bot.id,
        at: ultima.at,
        quien: ultima.quien,
        tipo: ultima.tipo,
        accion: ultima.accion,
        motivo: ultima.motivo,
        deshacer: ultima.deshacer,
      }).catch(() => {});
    }
  };

  const ejecutarPendiente = () => {
    if (estado.fase === "actuando" && estado.pendiente) {
      const accion = estado.pendiente.accion;
      const dEj = dep.depsEjecutor;
      if (dEj) {
        void ejecutarAccion(accion, dEj).then((res) => {
          if (res.ok) {
            const previoArg: Previo = res.previo ?? {};
            aplicarEvento({ tipo: "aplicada", previo: previoArg, at: ahora() });
          } else {
            aplicarEvento({ tipo: "fallo", motivo: res.motivo, at: ahora() });
          }
        }).catch(() => {
          aplicarEvento({ tipo: "fallo", motivo: "Error al ejecutar la acción.", at: ahora() });
        });
      }
    }
  };

  const aplicarEvento = (ev: EventoBucle) => {
    estado = avanzar(estado, ev);
    recortar();
    guardar();
    // si quedó actuando tras proponer permitido o tras confirmar, ejecutar
    if ((ev.tipo === "proponer" && ev.decision.permitido && estado.fase === "actuando" && estado.pendiente) ||
        (ev.tipo === "confirmar" && estado.fase === "actuando" && estado.pendiente)) {
      ejecutarPendiente();
    } else if (estado.fase === "actuando" && estado.pendiente && ev.tipo !== "aplicada" && ev.tipo !== "fallo") {
      ejecutarPendiente();
    }
  };

  return {
    get estado() { return estado; },
    proponer: (bruto: unknown, nivelArg?: "nada" | "proponer" | "aplicar-bajo" | "aplicar", rolArg?: RolBot) => {
      const validado = validarAccion(bruto);
      if (!validado.accion) {
        return { ok: false, motivo: validado.problemas[0] ?? "Acción inválida." };
      }
      const accion = validado.accion as AccionBot;
      const nivel = nivelArg ?? dep.nivel ?? NIVEL_POR_DEFECTO;
      const rol = rolArg ?? dep.rol ?? "dueno";
      const decision = decidirAccion({ bot, accion, rol, nivel, delegado: dep.delegado });
      aplicarEvento({ tipo: "proponer", accion, decision, at: ahora() });
      return { ok: true };
    },
    confirmar: (quien: string) => {
      aplicarEvento({ tipo: "confirmar", quien, at: ahora() });
    },
    rechazar: (quien: string) => {
      aplicarEvento({ tipo: "rechazar", quien, at: ahora() });
    },
    deshacer: (quien: string) => {
      const ultimaAntes = estado.ultimaAplicada;
      aplicarEvento({ tipo: "deshacer", quien, at: ahora() });
      if (ultimaAntes && dep.depsEjecutor) {
        const inv = ultimaAntes.deshacer;
        if (inv && "accion" in inv && (inv as any).accion) {
          return ejecutarAccion((inv as any).accion, dep.depsEjecutor).then(() => {}).catch(() => {});
        }
      }
    },
    encenderSentido: async (s: Parameters<ReturnType<typeof crearPuenteSentidos>["percibir"]>[1]) => {
      const puente = dep.puente ?? crearPuenteSentidos({
        consentimientos: { vigentes: () => [] },
        ahora: ahora,
        alEvento: (ev: EventoBucle) => {
          // aplicar solo eventos relevantes
          if (ev.tipo === "observar" || ev.tipo === "soltar") {
            const st = estado;
            const ns = avanzar(st, ev);
            estado = ns;
            guardar();
          }
        },
      });
      const ctx = dep.ctxPercibir ?? { cuentaId: bot.dueno.cuentaId, sesion: "privada", medio: "web" };
      // decidir primero para emitir evento coherente
      const decision = decidirSentido({ bot, sentido: s, cuentaId: ctx.cuentaId, sesion: ctx.sesion, medio: ctx.medio, consentimientos: [], ahora: ahora() });
      // si permitido, el puente emitirá; si no, aplicar aquí
      if (!decision.permitido) {
        aplicarEvento({ tipo: "observar", sentido: s, decision, at: ahora() });
        return;
      }
      await puente.percibir(bot, s, ctx);
    },
    pausar: (quien: string) => {
      aplicarEvento({ tipo: "pausar", quien, at: ahora() });
    },
  };
}

export function useBucleBot(bot: Bot, ctx: ContextoPercibir, dep: Omit<DepControlBucle, "ctxPercibir"> = {}) {
  const ctrlRef = useRef<ControlBucle>();
  if (!ctrlRef.current) {
    ctrlRef.current = crearControlBucle(bot, { ...dep, ctxPercibir: ctx });
  }
  const [estado, setEstado] = useState<EstadoBucle>(ctrlRef.current.estado);

  useEffect(() => {
    const id = setInterval(() => {
      // poll ligero para reflejar cambios internos
      setEstado({ ...ctrlRef.current!.estado });
    }, 50);
    return () => clearInterval(id);
  }, []);

  const proponer = useCallback((bruto: unknown, nivel?: "nada" | "proponer" | "aplicar-bajo" | "aplicar", rol?: RolBot) => {
    const r = ctrlRef.current!.proponer(bruto, nivel, rol);
    setEstado({ ...ctrlRef.current!.estado });
    return r;
  }, []);

  const confirmar = useCallback((quien: string) => { ctrlRef.current!.confirmar(quien); setEstado({ ...ctrlRef.current!.estado }); }, []);
  const rechazar = useCallback((quien: string) => { ctrlRef.current!.rechazar(quien); setEstado({ ...ctrlRef.current!.estado }); }, []);
  const deshacer = useCallback(async (quien: string) => { await ctrlRef.current!.deshacer(quien); setEstado({ ...ctrlRef.current!.estado }); }, []);
  const encenderSentido = useCallback(async (s: Parameters<ReturnType<typeof crearPuenteSentidos>["percibir"]>[1]) => { await ctrlRef.current!.encenderSentido(s); setEstado({ ...ctrlRef.current!.estado }); }, []);
  const pausar = useCallback((quien: string) => { ctrlRef.current!.pausar(quien); setEstado({ ...ctrlRef.current!.estado }); }, []);

  return { estado, proponer, confirmar, rechazar, deshacer, encenderSentido, pausar };
}
