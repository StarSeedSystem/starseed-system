/**
 * Bucle por bot · control puro (BOT1011H1). Contrato: architecture/astraura-bots.md §5.
 * Mantiene un `EstadoBucle` por bot y garantiza el orden validar → decidir → avanzar.
 * Sin React, sin red y sin `node:*`: las dependencias entran inyectadas; el hook
 * (`use-bucle-bot.ts`) cablea el ejecutor (BOT1011G) y el puente de sentidos (BOT1011F).
 */
import { validarAccion, type AccionBot } from "../acciones";
import {
  MAX_REGISTRO, avanzar, bucleInicial,
  type EntradaRegistro, type EstadoBucle, type EventoBucle,
} from "../bucle";
import { NIVEL_POR_DEFECTO, decidirAccion, type NivelBot } from "../permisos";
import type { Bot, RolBot, Sentido } from "../tipos";
import type { ResultadoEjecucion } from "./ejecutor-acciones";
import type { ResultadoPercibir } from "./sentidos-puente";

export const MAX_PERSISTIDO = 200;

export interface DepsControlBucle {
  bot: Bot;
  ejecutar: (accion: AccionBot) => Promise<ResultadoEjecucion>;
  percibir?: (sentido: Sentido, alEvento: (ev: EventoBucle) => void) => Promise<ResultadoPercibir>;
  guardar?: (botId: string, registro: readonly EntradaRegistro[]) => void;
  ahora?: () => number;
  alCambiar?: (estado: EstadoBucle) => void;
  registroInicial?: readonly EntradaRegistro[];
}

export interface ControlBucle {
  estado(): EstadoBucle;
  problemas(): readonly string[];
  proponer(bruto: unknown, nivel?: NivelBot, rol?: RolBot, delegado?: "bajo" | "medio"): Promise<EstadoBucle>;
  confirmar(quien: string): Promise<EstadoBucle>;
  rechazar(quien: string): EstadoBucle;
  deshacer(quien: string): Promise<{ estado: EstadoBucle; motivo: string }>;
  encenderSentido(sentido: Sentido): Promise<EstadoBucle>;
  soltarSentido(sentido: Sentido): EstadoBucle;
  pausar(quien: string): EstadoBucle;
}

export function crearControlBucle(dep: DepsControlBucle): ControlBucle {
  const ahora = dep.ahora ?? (() => Date.now());
  let estado: EstadoBucle = {
    ...bucleInicial(dep.bot.id),
    registro: [...(dep.registroInicial ?? [])].slice(-MAX_REGISTRO),
  };
  let ultimos: string[] = [];

  const paso = (ev: EventoBucle): EstadoBucle => {
    const siguiente = avanzar(estado, ev);
    if (siguiente === estado) return estado;
    estado = siguiente;
    dep.guardar?.(estado.botId, estado.registro.slice(-MAX_PERSISTIDO));
    dep.alCambiar?.({ ...estado });
    return estado;
  };

  const actuar = async (): Promise<EstadoBucle> => {
    const pendiente = estado.pendiente;
    if (estado.fase !== "actuando" || !pendiente) return estado;
    const r = await dep.ejecutar(pendiente.accion);
    return paso(r.ok
      ? { tipo: "aplicada", previo: r.previo, at: ahora() }
      : { tipo: "fallo", motivo: r.motivo, at: ahora() });
  };

  return {
    estado: () => estado,
    problemas: () => ultimos,
    async proponer(bruto, nivel = NIVEL_POR_DEFECTO, rol: RolBot = "dueno", delegado) {
      const { accion, problemas } = validarAccion(bruto);
      ultimos = problemas;
      if (!accion) return estado;
      const decision = decidirAccion({ bot: dep.bot, accion, rol, nivel, delegado });
      paso({ tipo: "proponer", accion, decision, at: ahora() });
      return estado.fase === "actuando" ? actuar() : estado;
    },
    async confirmar(quien) {
      paso({ tipo: "confirmar", quien, at: ahora() });
      return estado.fase === "actuando" ? actuar() : estado;
    },
    rechazar(quien) {
      return paso({ tipo: "rechazar", quien, at: ahora() });
    },
    async deshacer(quien) {
      const ultima = estado.ultimaAplicada;
      if (!ultima) return { estado, motivo: "No hay ninguna acción aplicada que deshacer." };
      const d = ultima.deshacer;
      if ("irreversible" in d) return { estado, motivo: d.irreversible };
      if ("retirar" in d) return { estado, motivo: `próximamente: retirar «${d.retirar}» desde su canal.` };
      if ("accion" in d) {
        const r = await dep.ejecutar(d.accion);
        if (!r.ok) return { estado, motivo: `No pude deshacer: ${r.motivo}` };
      }
      paso({ tipo: "deshacer", quien, at: ahora() });
      return { estado, motivo: "Deshecho." };
    },
    async encenderSentido(sentido) {
      if (!dep.percibir) return estado;
      try {
        await dep.percibir(sentido, (ev) => paso(ev));
      } catch {
        /* la fuente del sentido no tumba el bucle */
      }
      return estado;
    },
    soltarSentido(sentido) {
      return paso({ tipo: "soltar", sentido, at: ahora() });
    },
    pausar(quien) {
      return paso({ tipo: "pausar", quien, at: ahora() });
    },
  };
}
