"use client";

/**
 * Hook fino del bucle por bot (BOT1011H1). La lógica vive en `control-bucle.ts`;
 * aquí se mantiene el `EstadoBucle` de React y se persiste el registro:
 * localStorage (últimos 200) y, con sesión, `astraura_bots_registro` (BOT1011B).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bucleInicial, type EntradaRegistro, type EstadoBucle, type EventoBucle } from "../bucle";
import type { AccionBot } from "../acciones";
import type { Bot, Sentido } from "../tipos";
import { MAX_PERSISTIDO, crearControlBucle } from "./control-bucle";
import { crearPuenteSentidos, type ContextoPercibir, type DepsPuenteSentidos } from "./sentidos-puente";
import type { DepsEjecutor } from "./ejecutor-acciones";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";

export { MAX_PERSISTIDO, crearControlBucle };
export const claveRegistro = (botId: string) => `starseed.astraura.bots.registro.${botId}.v1`;

export function leerRegistroLocal(botId: string): EntradaRegistro[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(claveRegistro(botId));
    const lista: unknown = bruto === null ? [] : JSON.parse(bruto);
    return Array.isArray(lista) ? (lista as EntradaRegistro[]).slice(-MAX_PERSISTIDO) : [];
  } catch {
    return [];
  }
}
function guardarRegistroLocal(botId: string, registro: readonly EntradaRegistro[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(claveRegistro(botId), JSON.stringify(registro.slice(-MAX_PERSISTIDO)));
  } catch {
    /* almacenamiento lleno o bloqueado: el bucle sigue en memoria */
  }
}
export interface IoRegistroRemoto {
  sesion?: () => Promise<{ cuentaId: string } | null>; insertar?: (fila: Record<string, unknown>) => Promise<unknown>;
}
export async function anotarRegistroRemoto(
  botId: string, e: EntradaRegistro, io: IoRegistroRemoto,
): Promise<boolean> {
  try {
    const s = await io.sesion?.();
    if (!s?.cuentaId || !io.insertar) return false;
    await io.insertar({
      bot_id: botId, at: new Date(e.at).toISOString(), quien: e.quien, tipo: e.tipo,
      accion: e.accion ?? null, motivo: e.motivo, deshacer: e.deshacer ?? null,
    });
    return true;
  } catch {
    return false;
  }
}
export type ContextoBucle = ContextoPercibir & {
  consentimientos: DepsPuenteSentidos["consentimientos"]; red?: DepsPuenteSentidos["red"]; ejecutor?: DepsEjecutor;
};

export function useBucleBot(bot: Bot, ctx: ContextoBucle, deps?: DepsEjecutor) {
  const [estado, setEstado] = useState<EstadoBucle>(() => bucleInicial(bot.id));
  const depsRef = useRef<DepsEjecutor | undefined>(deps ?? ctx.ejecutor);
  depsRef.current = deps ?? ctx.ejecutor;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const botRef = useRef(bot);
  botRef.current = bot;
  const sink = useRef<((ev: EventoBucle) => void) | null>(null);
  const consentimientos = useMemo(
    () => ({ vigentes: (ahora: number) => ctxRef.current.consentimientos.vigentes(ahora) }),
    [],
  );
  const tieneRed = Boolean(ctx.red);
  const puente = useMemo(
    () => crearPuenteSentidos({
      consentimientos,
      ...(ctxRef.current.red ? { red: () => ctxRef.current.red!() } : {}),
      alEvento: (ev) => sink.current?.(ev),
    }),
    [consentimientos, tieneRed],
  );
  const ejecutar = useCallback(async (accion: AccionBot) => {
    const actual = depsRef.current;
    if (!actual) return { ok: false, previo: {}, motivo: "próximamente: falta el enrutador para ejecutar acciones." };
    const { ejecutarAccion } = await import("./ejecutor-acciones");
    // (Ola 1025U · U3) Quién actúa, para que lo que publique en la red lleve su marca «Bot de IA».
    const b = botRef.current;
    const agente = actual.agente ?? crearAgenteMundoRef({
      origen: "bot", idOrigen: b.id, nombre: b.nombre, dueno: { tipo: b.dueno.tipo, id: b.dueno.id },
    });
    return ejecutarAccion(accion, { ...actual, agente });
  }, []);
  const percibir = useCallback(async (sentido: Sentido, alEvento: (ev: EventoBucle) => void) => {
    sink.current = alEvento;
    try {
      const { cuentaId, sesion, medio } = ctxRef.current;
      return await puente.percibir(botRef.current, sentido, { cuentaId, sesion, medio });
    } finally {
      sink.current = null;
    }
  }, [puente]);
  const guardar = useCallback((botId: string, registro: readonly EntradaRegistro[]) => {
    guardarRegistroLocal(botId, registro);
    const ultima = registro.at(-1);
    if (!ultima) return;
    void anotarRegistroRemoto(botId, ultima, {
      sesion: async () => {
        const { createClient } = await import("@/utils/supabase/client");
        const { data } = await createClient().auth.getUser();
        return data.user ? { cuentaId: data.user.id } : null;
      },
      insertar: async (fila) => {
        const { createClient } = await import("@/utils/supabase/client");
        await createClient().from("astraura_bots_registro").insert(fila);
      },
    });
  }, []);
  const firma = [bot.id, bot.nombre, bot.activo, bot.origen, bot.gobierno, bot.dueno.tipo,
    bot.dueno.id, bot.dueno.cuentaId, bot.sentidosHabilitados.join("|")].join("|");
  const control = useMemo(() => crearControlBucle({
    bot, ejecutar, percibir, guardar, alCambiar: setEstado,
    registroInicial: leerRegistroLocal(bot.id),
  }), [firma, ejecutar, percibir, guardar]);
  useEffect(() => { setEstado(control.estado()); }, [control]);
  return { estado, control };
}
