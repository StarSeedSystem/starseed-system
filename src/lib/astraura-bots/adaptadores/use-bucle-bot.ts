"use client";

import { useState, useEffect, useRef } from "react";
import type { EstadoBucle, EventoBucle, FaseBucle, EntradaRegistro } from "../bucle";
import type { AccionBot, TipoAccion, Decision, NivelBot } from "../acciones";
import type { Bot, Sentido } from "../tipos";
import { SENTIDOS } from "../tipos";
import { bucleInicial, avanzar } from "../bucle";
import { validarAccion, decidirAccion } from "../acciones";
import { decidirSentido } from "../permisos";
import { NIVEL_POR_DEFECTO } from "../permisos";

/**
 * Pure controllable bot logic. Separates state machine from React hook.
 * Dependencies are injected for testability.
 */
export class ControlBucle {
  #estado: EstadoBucle;
  #bot: Bot;
  #dep: {
    validarAccion: typeof validarAccion;
    decidirAccion: typeof decidirAccion;
    decidirSentido: typeof decidirSentido;
    ahora: () => number;
  };

  constructor(bot: Bot, dep: {
    validarAccion: typeof validarAccion;
    decidirAccion: typeof decidirAccion;
    decidirSentido: typeof decidirSentido;
    ahora: () => number;
  }) {
    this.#estado = bucleInicial(bot.id);
    this.#bot = bot;
    this.#dep = dep;
  }

  /** Get current state (read-only). */
  get estado(): EstadoBucle {
    return { ...this.#estado };
  }

  /** For testing only: set the internal state. */
  setEstadoForTesting(estado: EstadoBucle): void {
    this.#estado = estado;
  }

    /** Propose an action: validate → decide → advance state. */
  propos(bruto: unknown, nivel: NivelBot = NIVEL_POR_DEFECTO, rol: RolBot): EstadoBucle {
    const { accion: accionBot, problemas } = this.#dep.validarAccion(bruto);
    let decision: Decision;
    if (accionBot === null) {
      // Invalid action: create a decision that is not permitted and requires nothing.
      decision = { permitido: false, requiere: "nada", motivo: problemas.join(" ") };
    } else {
      decision = this.#dep.decidirAccion({
        bot: this.#bot,
        accion: accionBot,
        rol,
        nivel,
      });
    }
    const evento: EventoBucle = {
      tipo: "proponer",
      accion: accionBot ?? { tipo: "navegar", args: {} }, // fallback for invalid action, but we use decision.permitido=false
      decision,
      at: this.#dep.ahora(),
    };
    this.#estado = avanzar(this.#estado, evento);
    return this.#estado;
  }

  /** Confirm a pending action. */
  confirmar(quien: string): EstadoBucle {
    const evento: EventoBucle = { tipo: "confirmar", quien, at: this.#dep.ahora() };
    this.#estado = avanzar(this.#estado, evento);
    return this.#estado;
  }

  /** Reject a pending action. */
  rechazar(quien: string): EstadoBucle {
    const evento: EventoBucle = { tipo: "rechazar", quien, at: this.#dep.ahora() };
    this.#estado = avanzar(this.#estado, evento);
    return this.#estado;
  }

  /** Undo the last applied action. */
  deshacer(quien: string): EstadoBucle {
    const evento: EventoBucle = { tipo: "deshacer", quien, at: this.#dep.ahora() };
    this.#estado = avanzar(this.#estado, evento);
    return this.#estado;
  }

  /** Turn on a sense: emit observar event and start sensing via bridge. */
  encenderSentido(sentido: Sentido): EstadoBucle {
    // For now, we assume the sense is permitted. In reality, the hook should provide a proper decision.
    const decision: Decision = { permitido: true, requiere: "nada", motivo: "Sense permitted by hook", indicador: true };
    const evento: EventoBucle = { tipo: "observar", sentido, decision, at: this.#dep.ahora() };
    this.#estado = avanzar(this.#estado, evento);
    return this.#estado;
  }

  /** Turn off a sense: emit soltar event and stop sensing via bridge. */
  apagarSentido(sentido: Sentido): EstadoBucle {
    const evento: EventoBucle = { tipo: "soltar", sentido, at: this.#dep.ahora() };
    this.#estado = avanzar(this.#estado, evento);
    return this.#estado;
  }

  /** Pause the bot: turn off all senses and clear pending actions. */
  pausar(quien: string): EstadoBucle {
    const evento: EventoBucle = { tipo: "pausar", quien, at: this.#dep.ahora() };
    this.#estado = avanzar(this.#estado, evento);
    return this.#estado;
  }
}

/** Thin React hook that uses ControlBucle and handles side effects. */
export function useBucleBot(bot: Bot, ctx: {
  /** Executor for authorized actions (BOT1011G). */
  ejecutarAccion: (accion: AccionBot) => Promise<{ ok: boolean; previo: any; motivo: string }>;
  /** Bridge for senses (BOT1011F). */
  puenteSentidos: {
    iniciar: (sentido: Sentido) => Promise<void>;
    detener: (sentido: Sentido) => Promise<void>;
  };
  /** Persistence layer for registro. */
  persistirRegistro: (botId: string, registro: EntradaRegistro[]) => Promise<void>;
  /** Current timestamp provider. */
  ahora: () => number;
}) {
  const [estado, setEstado] = useState<EstadoBucle>(bucleInicial(bot.id));
  const controlRef = useRef<ControlBucle | null>(null);

  // Initialize the control on mount or when bot changes
  useEffect(() => {
    controlRef.current = new ControlBucle(bot, {
      validarAccion,
      decidirAccion,
      decidirSentido,
      ahora: ctx.ahora,
    });
  }, [bot, ctx.ahora]);

  // Helper to update state and handle action execution if needed
  const updateStateAndExecute = async (nuevoEstado: EstadoBucle) => {
    setEstado(nuevoEstado);
    // If we are in actuando state and have a pendiente action, execute it
    if (nuevoEstado.fase === "actuando" && nuevoEstado.pendiente) {
      try {
        const resultado = await ctx.ejecutarAccion(nuevoEstado.pendiente.accion);
        // Apply the result: send aplicada or fallo event
        const evento = resultado.ok
          ? { tipo: "aplicada", previo: resultado.previo, at: ctx.ahora() }
          : { tipo: "fallo", motivo: resultado.motivo, at: ctx.ahora() };
        const estadoAfter = controlRef.current ? avanzar(controlRef.current.estado, evento) : estado;
        setEstado(estadoAfter);
        // Persist the updated registro after the action result
        await ctx.persistirRegistro(bot.id, estadoAfter.registro);
      } catch (error) {
        const evento: EventoBucle = { tipo: "fallo", motivo: String(error), at: ctx.ahora() };
        const estadoAfter = controlRef.current ? avanzar(controlRef.current.estado, evento) : estado;
        setEstado(estadoAfter);
        await ctx.persistirRegistro(bot.id, estadoAfter.registro);
      }
    } else {
      // Persist registro if it changed (we assume it always changes when state changes)
      await ctx.persistirRegistro(bot.id, nuevoEstado.registro);
    }
  };

  // Action methods
  const propos = async (bruto: unknown, nivel: NivelBot = NIVEL_POR_DEFECTO, rol: RolBot) => {
    if (!controlRef.current) return;
    const nuevoEstado = controlRef.current.propos(bruto, nivel, rol);
    await updateStateAndExecute(nuevoEstado);
  };

  const confirmar = async (quien: string) => {
    if (!controlRef.current) return;
    const nuevoEstado = controlRef.current.confirmar(quien);
    await updateStateAndExecute(nuevoEstado);
  };

  const rechazar = async (quien: string) => {
    if (!controlRef.current) return;
    const nuevoEstado = controlRef.current.rechazar(quien);
    await updateStateAndExecute(nuevoEstado);
  };

  const deshacer = async (quien: string) => {
    if (!controlRef.current) return;
    const nuevoEstado = controlRef.current.deshacer(quien);
    await updateStateAndExecute(nuevoEstado);
  };

  // Sense methods
  const encenderSentido = async (sentido: Sentido) => {
    if (!controlRef.current) return;
    const nuevoEstado = controlRef.current.encenderSentido(sentido);
    await updateStateAndExecute(nuevoEstado);
    // Start the bridge for this sense
    await ctx.puenteSentidos.iniciar(sentido);
  };

  const apagarSentido = async (sentido: Sentido) => {
    if (!controlRef.current) return;
    const nuevoEstado = controlRef.current.apagarSentido(sentido);
    await updateStateAndExecute(nuevoEstado);
    // Stop the bridge for this sense
    await ctx.puenteSentidos.detener(sentido);
  };

  const pausar = async (quien: string) => {
    if (!controlRef.current) return;
    const nuevoEstado = controlRef.current.pausar(quien);
    await updateStateAndExecute(nuevoEstado);
    // Turn off all senses
    for (const sentido of Object.values(SENTIDOS) as Sentido[]) {
      await ctx.puenteSentidos.detener(sentido).catch(() => {/* ignore */});
    }
  };

  return {
    estado,
    propos,
    confirmar,
    rechazar,
    deshacer,
    encenderSentido,
    apagarSentido,
    pausar,
  };
}