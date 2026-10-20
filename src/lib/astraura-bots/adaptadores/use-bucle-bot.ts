"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { validarAccion } from "./acciones";
import { decidirAccion, NivelBot, decidirSentido } from "./permisos";
import { bucleInicial, avanzar, type EstadoBucle, type EventoBucle, type EntradaRegistro, type Sentido, type FaseBucle, type Previo } from "./bucle";
import type { Bot } from "./tipos";
import type { Medio, TipoSesion, RolBot, CuentaId, ConsentimientoSentido } from "./tipos";

export interface BucleBotContext {
  bridge: {
    encenderSentido: (sentido: Sentido) => Promise<void>;
    apagarSentido: (sentido: Sentido) => Promise<void>;
  };
  sesion: TipoSesion;
  medio: Medio;
  consentimientos: readonly ConsentimientoSentido[];
  ahora: number;
  ejecutarAccion: (accion: AccionBot) => Promise<{ previo: Previo } | { motivo: string }>;
  insertarRegistro: (registro: EntradaRegistro[]) => Promise<void>;
}

export function crearControlBucle(dep: { bot: Bot }) {
  const getInitialState = (): EstadoBucle => bucleInicial(dep.bot.id);
  
  return {
    getInitialState,
    proposer: (estado: EstadoBucle, bruto: unknown, nivel: NivelBot, rol: RolBot): { newState: EstadoBucle; events: EntradaRegistro[] } => {
      const validacion = validarAccion(bruto);
      if (validacion.problemas.length > 0) {
        return { newState: estado, events: [] };
      }
      const peticionAccion = {
        bot: dep.bot,
        accion: validacion.accion!,
        rol,
        nivel,
        delegado: undefined,
      };
      const decision = decidirAccion(peticionAccion);
      const evento: EventoBucle = {
        tipo: "proponer",
        accion: validacion.accion!,
        decision,
        at: Date.now(),
      };
      const newState = avanzar(estado, evento);
      const events = newState.registro.slice(estado.registro.length);
      return { newState, events };
    },
    confirmar: (estado: EstadoBucle, quien: string): { newState: EstadoBucle; events: EntradaRegistro[] } => {
      const evento: EventoBucle = {
        tipo: "confirmar",
        quien,
        at: Date.now(),
      };
      const newState = avanzar(estado, evento);
      const events = newState.registro.slice(estado.registro.length);
      return { newState, events };
    },
    rechazar: (estado: EstadoBucle, quien: string): { newState: EstadoBucle; events: EntradaRegistro[] } => {
      const evento: EventoBucle = {
        tipo: "rechazar",
        quien,
        at: Date.now(),
      };
      const newState = avanzar(estado, evento);
      const events = newState.registro.slice(estado.registro.length);
      return { newState, events };
    },
    deshacer: (estado: EstadoBucle, quien: string): { newState: EstadoBucle; events: EntradaRegistro[] } => {
      const evento: EventoBucle = {
        tipo: "deshacer",
        quien,
        at: Date.now(),
      };
      const newState = avanzar(estado, evento);
      const events = newState.registro.slice(estado.registro.length);
      return { newState, events };
    },
    observar: (estado: EstadoBucle, sentido: Sentido, cuentaId: string, sesion: TipoSesion, medio: Medio, consentimientos: readonly ConsentimientoSentido[], ahora: number): { newState: EstadoBucle; events: EntradaRegistro[] } => {
      const peticionSentido = {
        bot: dep.bot,
        sentido,
        cuentaId,
        sesion,
        medio,
        consentimientos,
        ahora,
      };
      const decision = decidirSentido(peticionSentido);
      const evento: EventoBucle = {
        tipo: "observar",
        sentido,
        decision,
        at: ahora,
      };
      const newState = avanzar(estado, evento);
      const events = newState.registro.slice(estado.registro.length);
      return { newState, events };
    },
    soltar: (estado: EstadoBucle, sentido: Sentido): { newState: EstadoBucle; events: EntradaRegistro[] } => {
      const evento: EventoBucle = {
        tipo: "soltar",
        sentido,
        at: Date.now(),
      };
      const newState = avanzar(estado, evento);
      const events = newState.registro.slice(estado.registro.length);
      return { newState, events };
    },
    pausar: (estado: EstadoBucle, quien: string): { newState: EstadoBucle; events: EntradaRegistro[] } => {
      const evento: EventoBucle = {
        tipo: "pausar",
        quien,
        at: Date.now(),
      };
      const newState = avanzar(estado, evento);
      const events = newState.registro.slice(estado.registro.length);
      return { newState, events };
    },
  };
}

export function useBucleBot(bot: Bot, ctx: BucleBotContext) {
  const [estado, setEstado] = useState(() => crearControlBucle({ bot }).getInitialState());
  const registroLengthRef = useRef(estado.registro.length);
  const controlRef = useRef(crearControlBucle({ bot }));

  const proposer = useCallback((bruto: unknown, nivel: NivelBot, rol: RolBot) => {
    const { newState, events } = controlRef.current.proposer(estado, bruto, nivel, rol);
    setEstado(newState);
    return events;
  }, [estado]);

  const confirmar = useCallback((quien: string) => {
    const { newState, events } = controlRef.current.confirmar(estado, quien);
    setEstado(newState);
    return events;
  }, [estado]);

  const rechazar = useCallback((quien: string) => {
    const { newState, events } = controlRef.current.rechazar(estado, quien);
    setEstado(newState);
    return events;
  }, [estado]);

  const deshacer = useCallback((quien: string) => {
    const { newState, events } = controlRef.current.deshacer(estado, quien);
    setEstado(newState);
    return events;
  }, [estado]);

  const encenderSentido = useCallback((sentido: Sentido) => {
    const { newState, events } = controlRef.current.observar(
      estado,
      sentido,
      bot.dueno.cuentaId,
      ctx.sesion,
      ctx.medio,
      ctx.consentimientos,
      ctx.ahora
    );
    setEstado(newState);
    return events;
  }, [estado, bot.dueno.cuentaId, ctx.sesion, ctx.medio, ctx.consentimientos, ctx.ahora]);

  const pausar = useCallback((quien: string) => {
    const { newState, events } = controlRef.current.pausar(estado, quien);
    setEstado(newState);
    return events;
  }, [estado]);

  useEffect(() => {
    const currentLength = estado.registro.length;
    const newEvents = estado.registro.slice(registroLengthRef.current);
    registroLengthRef.current = currentLength;

    for (const event of newEvents) {
      switch (event.tipo) {
        case "observar": {
          if (event.decision.permitido) {
            ctx.bridge.encenderSentido(event.sentido).catch(console.error);
          }
          break;
        }
        case "soltar": {
          ctx.bridge.apagarSentido(event.sentido).catch(console.error);
          break;
        }
        case "pausar": {
          bot.sentidosHabilitados.forEach(s => {
            ctx.bridge.apagarSentido(s).catch(console.error);
          });
          break;
        }
        default:
          break;
      }
    }
  }, [estado, ctx.bridge, bot.sentidosHabilitados]);

  useEffect(() => {
    if (estado.fase === "actuando" && estado.pendiente) {
      ctx.ejecutarAccion(estado.pendiente.accion)
        .then(result => {
          let event: EventoBucle;
          if ('previo' in result) {
            event = { tipo: "aplicada", previo: result.previo, at: Date.now() };
          } else {
            event = { tipo: "fallo", motivo: result.motivo, at: Date.now() };
          }
          const { newState } = avanzar(estado, event);
          setEstado(newState);
        })
        .catch(err => {
          const event: EventoBucle = { tipo: "fallo", motivo: String(err), at: Date.now() };
          const { newState } = avanzar(estado, event);
          setEstado(newState);
        });
    }
  }, [estado.fase, estado.pendiente, ctx.ejecutarAccion]);

  useEffect(() => {
    const registroKey = `starseed.astraura.bots.registro.${bot.id}.v1`;
    try {
      const registroToStore = estado.registro.slice(-200);
      localStorage.setItem(registroKey, JSON.stringify(registroToStore));
    } catch (e) {
      console.warn('Failed to persist registro to localStorage', e);
    }

    if ('insertarRegistro' in ctx) {
      ctx.insertarRegistro(estado.registro).catch(console.error);
    }
  }, [estado.registro, bot.id, ctx.insertarRegistro]);

  return {
    estado,
    proposer,
    confirmar,
    rechazar,
    deshacer,
    encenderSentido,
    pausar,
  };
}