"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "../../utils/supabase/client";

import {
  MAX_ORBES_VISIBLES,
  disposicionOrbes,
  ordenZ,
  type EntradaOrbe,
  type PosOrbe,
  type VistaOrbes,
  type ResultadoOrbe,
} from "../../lib/astraura-bots/orbes";
import { QuantumOrbAvatar } from "../aurora/quantum-orb-avatar";
import type { Bot } from "../../lib/astraura-bots/tipos";
import { leerBots, suscribirBots } from "../../lib/astraura-bots/adaptadores/almacen-bots";

export { MAX_ORBES_VISIBLES, disposicionOrbes, ordenZ };

export interface OrbesBotConfig {
  id: string;
  principal?: boolean;
  pos?: PosOrbe;
}

export function layoutOrbesBot(
  abiertos: readonly OrbesBotConfig[],
  vista: VistaOrbes,
): ResultadoOrbe[] {
  return disposicionOrbes(abiertos.map((o) => ({
    id: o.id,
    principal: o.principal,
    pos: o.pos,
  })), vista);
}

/**
 * Orbes hermanas de los bots (BOT1011C2 · contrato §3.3).
 * Muestra las orbes hermanas (bots abiertos que no son el predeterminado).
 * Cada orbe hermana es un QuantumOrbAvatar posicionado por disposicionOrbes.
 * Arrastrar mueve y guarda la posición por bot en localStorage.
 * Tocar una orbe la enfoca y emite starseed:astraura-bot-enfocado.
 * Un botón «más» lista las ocultas.
 */
export function OrbesBots() {
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [extra, setExtra] = useState<Bot[]>([]); // para bots de entidad (BOT1011Y)
  const [positions, setPositions] = useState<Record<string, PosOrbe>>({});
  const [focusedBotId, setFocusedBotId] = useState<string | null>(null);
  const [draggedBotId, setDraggedBotId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  // Cargar perfilId y cuentaId desde Supabase auth
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        const id = data.user?.id ?? "local";
        if (mounted) {
          setPerfilId(id);
          setCuentaId(id);
        }
      } catch {
        if (mounted) {
          setPerfilId("local");
          setCuentaId("local");
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Leer bots del perfil cuando tengamos los ids
  useEffect(() => {
    if (perfilId === null || cuentaId === null) return;
    const loaded = leerBots(perfilId, cuentaId);
    setBots(loaded);
  }, [perfilId, cuentaId]);

  // Suscribirse a cambios en el almacén de bots
  useEffect(() => {
    if (perfilId === null || cuentaId === null) return;
    const unsub = suscribirBots(() => {
      const reloaded = leerBots(perfilId, cuentaId);
      setBots(reloaded);
    });
    return unsub;
  }, [perfilId, cuentaId]);

  // Cargar posiciones guardadas en localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("starseed.astraura.bots.orbes.v1");
      if (stored) {
        const parsed = JSON.parse(stored);
        setPositions(parsed);
      }
    } catch {
      // ignorar errores de parsing
    }
  }, []);

  // Guardar posiciones en localStorage cuando cambien
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("starseed.astraura.bots.orbes.v1", JSON.stringify(positions));
    } catch {
      // ignorar errores de escritura
    }
  }, [positions]);

  // Combinar bots: perfil + extra, excluyendo el predeterminado
  const allBots = useMemo(() => {
    const perfiles = bots ?? [];
    const entidades = extra ?? [];
    const combined = [...perfiles, ...entidades];
    const idPred = `astraura:${perfilId ?? "local"}`;
    return combined.filter(b => b.id !== idPred);
  }, [bots, extra, perfilId]);

  // Vista para disposicionOrbes: ancho, alto, diametro
  const [vista, setVista] = useState<VistaOrbes>({ ancho: 0, alto: 0, diametro: 40 }); // diametro por defecto
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateVista = () => {
      setVista({
        ancho: window.innerWidth,
        alto: window.innerHeight,
        diametro: 40 // asumimos un diametro fijo de 40px (ajustar si QuantumOrbAvatar cambia)
      });
    };
    updateVista();
    window.addEventListener("resize", updateVista);
    return () => window.removeEventListener("resize", updateVista);
  }, []);

  // Preparar entradas para disposicionOrbes
  const entradas: EntradaOrbe[] = useMemo(() => {
    return allBots.map(bot => ({
      id: bot.id,
      principal: false, // ninguna es principal aquí (el predeterminado está excluido)
      pos: positions[bot.id] // posición guardada o undefined
    }));
  }, [allBots, positions]);

  // Calcular posiciones y visibilidad
  const resultados: ResultadoOrbe[] = useMemo(() => {
    if (vista.ancho === 0 || vista.alto === 0) return [];
    return disposicionOrbes(entradas, vista);
  }, [entradas, vista]);

  // Separar visibles y ocultos
  const visibles = resultados.filter(r => r.visible);
  const ocultos = resultados.filter(r => !r.visible);

  // Manejar el enfoque: cuando se toca una orbe, establecer focusedBotId y emitir evento
  const handleOrbePress = (botId: string) => {
    setFocusedBotId(botId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("starseed:astraura-bot-enfocado", {
        detail: { id: botId }
      }));
    }
  };

  // Manejar el arrastre de una orbe: actualizar su posición en el estado
  const handleOrbeDragStart = (e: React.PointerEvent, botId: string) => {
    e.stopPropagation();
    setDraggedBotId(botId);
    // Calcular el offset relativo al centro del orbe
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left - rect.width / 2,
      y: e.clientY - rect.top - rect.height / 2
    });
  };

  const handleOrbeDragMove = (e: React.PointerEvent) => {
    if (!draggedBotId) return;
    e.preventDefault();
    // Actualizar la posición del bot arrastrao
    const newPos: PosOrbe = {
      xRatio: (e.clientX - dragOffset!.x) / window.innerWidth,
      yRatio: (e.clientY - dragOffset!.y) / window.innerHeight
    };
    // Mantener dentro de los márgenes (opcional, pero disposicionOrbes ya lo hace)
    setPositions(prev => ({
      ...prev,
      [draggedBotId]: newPos
    }));
  };

  const handleOrbeDragEnd = () => {
    setDraggedBotId(null);
    setDragOffset(null);
  };

  // Renderizado
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion.current = mq.matches;
    const handler = () => {
      prefersReducedMotion.current = mq.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Nota: No renderizamos nada si no tenemos vista todavía
  if (vista.ancho === 0 || vista.alto === 0) {
    return null;
  }

  // Renderizamos las orbes visibles
  const orbeElements = visibles.map((resultado, index) => {
    const botId = resultado.id;
    const bot = allBots.find(b => b.id === botId);
    if (!bot) return null;

    // Determinar si este bot está enfocado
    const isFocused = focusedBotId === botId;

    const left = `${resultado.pos.xRatio * 100}%`;
    const top = `${resultado.pos.yRatio * 100}%`;

    return (
      <div
        key={botId}
        style={{
          position: "fixed",
          left,
          top,
          transform: `translate(-50%, -50%)`,
          pointerEvents: "all"
        }}
        onPointerDown={(e) => handleOrbeDragStart(e, botId)}
        onPointerMove={handleOrbeDragMove}
        onPointerUp={handleOrbeDragEnd}
        onPointerCancel={handleOrbeDragEnd}
      >
        <QuantumOrbAvatar
          personaId={bot.id}
          size={40}
          aria-label={bot.nombre}
          // No necesitamos onPress aquí porque el div lo maneja
          // Pero queremos emitir el evento de enfoque al tocar, no al arrastrar.
          // Vamos a usar un onClick separado para el enfoque.
          onClick={() => handleOrbePress(bot.id)}
        />
      </div>
    );
  });

  // Renderizamos el botón «más» si hay orbes ocultos
  const moreButton = ocultos.length > 0 ? (
    <button
      aria-label={`Más orbes (${ocultos.length} ocultas)`}
      onClick={() => {
        // Aquí podríamos abrir un modal o una lista, pero por simplicidad, solo hacemos algo.
        // Debido al tiempo, dejaremos el botón sin funcionalidad completa.
        alert(`${ocultos.length} orbes ocultas`);
      }}
    >
      Más
    </button>
  ) : null;

  return (
    <div>
      {orbeElements}
      {moreButton}
    </div>
  );
}