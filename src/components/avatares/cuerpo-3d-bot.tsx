"use client";

/**
 * CUERPO 3D DE UN BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2, §6 y §9-C.
 *
 * La orbe del bot puede ser su avatar 3D: carga el ADN de `cuerpo.avatarRef` (o crea el de partida con
 * su tono), lo viste con la emoción expresada del bot y, al hablar, mueve la boca con visemas y el
 * cuerpo con el motor único de movimiento (`adn.movimiento` mediante). Es un widget flotante pequeño:
 * se pausa al ocultarse, no dibuja fuera de pantalla y con `prefers-reduced-motion` no anima nada.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AdnAvatar } from "@/lib/avatares/adn/adn";
import { adnConEmocion, expresionDeVisema, visemaEnProgreso, type VisemaHabla } from "@/lib/avatares/adn/emocion-bot";
import { adnDeBot, estiloDeClip, gestoDeBot, usaAvatar3d } from "@/lib/avatares/adaptadores/adn-de-bot";
import { estimarDuracionAudioMs } from "@/lib/avatares/movimiento/sincronia-voz";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";
import { cn } from "@/lib/utils";
import { AvatarVivo } from "./avatar-vivo";
import { useMovimiento } from "./usar-movimiento";

export interface Cuerpo3dBotProps {
  bot: Bot;
  /** Emoción EXPRESADA del bot (`EstadoEmocional`); sin ella, calma serena. */
  estado?: EstadoEmocional | null;
  /** `true` mientras el bot habla: visemas y gestos. */
  hablando?: boolean;
  /** Lo que está diciendo (para los visemas y el gesto). */
  texto?: string;
  /** Tamaño del widget flotante, en píxeles. */
  tamano?: number;
  /** `false` lo pausa (chat cerrado, otro turno). */
  activo?: boolean;
  className?: string;
}

const ESTADO_CALMA: EstadoEmocional = { emocion: "calma", valencia: 0.1, activacion: 0.25 };
const CADA_VISEMA_MS = 100;
