"use client";

/**
 * StarSeed OS — Exocórtex · Sección "Aurora" (cortina superior Zenith)
 * ----------------------------------------------------------------------------
 * TODO el sistema de chats y funciones de Aurora dentro del Exocórtex:
 *
 *   · Chat completo (burbujas, entrada, envío) + registro de acciones en vivo.
 *   · Transporte de voz (reproducir/pausar, interrumpir, saltar adelante/atrás)
 *     y estado hablando/escuchando, con "Voz no disponible · Reintentar"
 *     alimentado por el supervisor del provider (voiceUnavailable/retryVoice).
 *   · Selector de personalidad + toggle "Aurora activa".
 *   · Configuraciones del widget reutilizadas TAL CUAL (importadas, no editadas):
 *     AuroraControlPanel (sentidos) y AuroraMultichatPanel (sesiones paralelas).
 *   · Pestaña "Registro": TODA la conversación (voz y texto) persistida en
 *     localStorage por `aurora-chat-log.ts`, en sesiones por día con resumen,
 *     ver/limpiar/exportar (JSON y Markdown).
 *   · Guía contextual "¿Qué puedo hacer aquí?" según la ruta (usePathname).
 *   · Botones "Abrir sección completa" (/aurora) y "Reactivar orbe"
 *     (setOrbHidden(false) del bus del orbe).
 *
 * FUENTE DE VERDAD: la ZenithCurtain se monta ahora DENTRO de AuroraProvider
 * (layout raíz), así que hablamos con el motor por `useAurora()` — de forma
 * DEFENSIVA: si el contexto no está (montaje excepcional fuera del provider),
 * degradamos al puente global `window.STARSEED_AURORA` (open-aurora.ts) sin
 * romper nada. Nunca instanciamos una segunda Aurora.
 *
 * ESTILO: mismo lenguaje del Exocórtex del Café (cristal líquido: glass fuerte
 * oscuro, filo de luz superior, radios 24-28px, chips mono, animaciones
 * líquidas 150-300ms, reduced-motion) pero con los colores del ORBE Trinity:
 * azul #007FFF → verde #39FF14 → amarillo #FFBF00 → rojo #DC143C.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle, Bot, ChevronDown, Compass, Drama, ExternalLink, FileJson,
  FileText, FolderTree, GitBranch, History, Layers, ListChecks, Maximize2,
  MessageSquare, Mic, MicOff, Orbit, Pause, Play, Plus, Power, RefreshCw,
  ScrollText, Search, Send, SkipBack, SkipForward, SlidersHorizontal, Sparkles,
  Square, Trash2, Volume2, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AuroraMultichatPanel } from "@/components/aurora/aurora-multichat-panel";
import { AuroraControlPanel } from "@/components/aurora/aurora-control-panel";
import { PersonalitiesPanel } from "@/components/aurora/personalities-panel";
import { registerActiveAuroraChat } from "@/lib/aurora/personalities";
import { AuroraAlwaysOn } from "@/components/exocortex/aurora-always-on";
import { AuroraChatView } from "@/components/exocortex/aurora-chat-view";
import { AuroraChatFullscreen } from "@/components/exocortex/aurora-chat-fullscreen";
import { AuroraChatExplorer } from "@/components/exocortex/aurora-chat-explorer";
import { AuroraAvatar } from "@/components/aurora/aurora-avatar";
import type { CatalogChat } from "@/lib/aurora/chat-catalog";
import { useAurora } from "@/components/aurora/aurora-provider";
import {
  getAuroraBridge,
  getAuroraState,
  subscribeAurora,
  sendToAurora,
  speakAurora,
  toggleAuroraVoice,
  setAuroraEnabled,
  auroraTransport,
  isAuroraReady,
  type AuroraStateSnapshot,
} from "@/lib/aurora/open-aurora";
import {
  readOrbHidden,
  setOrbHidden,
  subscribeOrbVisibility,
  subscribeAuroraConversation,
  setAuroraFullChatOpen,
} from "@/lib/aurora/aurora-orb-bus";
import {
  useAuroraChatLog,
  readAuroraChatEntries,
  auroraChatDayOf,
  type AuroraChatLogEntry,
} from "@/lib/aurora/aurora-chat-log";
import { useChatTree } from "@/lib/aurora/chat-tree";

// ── Tipos locales ────────────────────────────────────────────────────────────
type Tab = "folder" | "chat" | "chats" | "voz" | "control" | "personalidad" | "registro";

/** El puente v4 añade voiceUnavailable a la instantánea (aditivo). */
type SnapshotPlus = AuroraStateSnapshot & { voiceUnavailable?: boolean };

// ── Guía contextual por ruta ─────────────────────────────────────────────────
function guideFor(pathname: string | null): { title: string; chips: string[] } {
  const p = pathname || "";
  if (p.startsWith("/escritorios")) {
    return {
      title: "Escritorios",
      chips: [
        "Prepara mi escritorio de estudio",
        "Abre mis pizarras",
        "Crea un escritorio nuevo llamado Proyectos",
        "Ordena las ventanas abiertas",
      ],
    };
  }
  if (p.startsWith("/dashboard")) {
    return {
      title: "Dashboard",
      chips: [
        "Reorganiza mis widgets",
        "Resume mi actividad reciente",
        "Añade un widget de tareas",
        "Pon el tema oscuro",
      ],
    };
  }
  if (p.startsWith("/library")) {
    return {
      title: "Biblioteca",
      chips: [
        "Busca en la biblioteca sobre gobernanza",
        "Guarda esto en mis memorias",
        "Recomiéndame qué leer hoy",
        "Abre mis últimos documentos",
      ],
    };
  }
  if (p.startsWith("/hub")) {
    return {
      title: "Hub",
      chips: [
        "Muéstrame mis comunidades",
        "Crea un evento para mi comunidad",
        "Resume las novedades del hub",
        "Busca comunidades de arte",
      ],
    };
  }
  if (p.startsWith("/profile")) {
    return {
      title: "Perfil",
      chips: [
        "Abre la edición de mi perfil",
        "Muéstrame mis insignias",
        "Cambia a mi faceta artística",
        "Resume mi actividad pública",
      ],
    };
  }
  return {
    title: "StarSeed OS",
    chips: [
      "Abre mis pizarras",
      "Pon el tema oscuro",
      "Lanza un agente por mí",
      "Busca en mis memorias",
    ],
  };
}

// ── Estilo cristal-líquido con los colores del orbe (prefijo .axc-) ──────────
const AXC_CSS = `
.axc-root{position:relative;isolation:isolate;display:flex;flex-direction:column;gap:13px;padding:16px 15px 15px;border-radius:26px;color:#eef2ff;
  background:
    radial-gradient(130% 70% at 12% -6%, rgba(0,127,255,.15), transparent 55%),
    radial-gradient(120% 70% at 96% -4%, rgba(220,20,60,.11), transparent 55%),
    radial-gradient(150% 90% at 50% 115%, rgba(57,255,20,.06), transparent 60%),
    linear-gradient(180deg, rgba(9,13,22,.94), rgba(5,8,14,.9));
  border:1px solid rgba(148,163,184,.14);
  box-shadow:0 34px 90px rgba(0,0,0,.55), 0 6px 22px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.10);
  backdrop-filter:blur(28px) saturate(1.3);-webkit-backdrop-filter:blur(28px) saturate(1.3);}
.axc-root::before{content:"";position:absolute;inset:0 0 auto 0;height:2px;border-radius:26px 26px 0 0;z-index:2;pointer-events:none;
  background:linear-gradient(90deg, transparent, #007FFF 18%, #39FF14 42%, #FFBF00 62%, #DC143C 85%, transparent);opacity:.65;}
.axc-orb{width:38px;height:38px;border-radius:50%;flex:none;position:relative;display:grid;place-items:center;overflow:hidden;
  background:
    radial-gradient(circle at 32% 28%, rgba(255,255,255,.28), transparent 45%),
    conic-gradient(from 210deg, #007FFF, #39FF14, #FFBF00, #DC143C, #007FFF);
  box-shadow:0 0 18px rgba(0,127,255,.45), inset 0 0 8px rgba(0,0,0,.35);
  animation:axc-breathe 5.6s ease-in-out infinite;transition:box-shadow .3s ease;}
.axc-orb::after{content:"";position:absolute;inset:5px;border-radius:50%;
  background:radial-gradient(circle at 45% 38%, #101728, #05070d 75%);border:1px solid rgba(255,255,255,.22);}
.axc-orb>svg{position:relative;z-index:1;}
.axc-orb.speaking{animation-duration:1.6s;box-shadow:0 0 26px rgba(255,191,0,.55), inset 0 0 8px rgba(0,0,0,.35);}
.axc-orb.listening{animation-duration:2.6s;box-shadow:0 0 26px rgba(57,255,20,.5), inset 0 0 8px rgba(0,0,0,.35);}
@keyframes axc-breathe{0%,100%{filter:saturate(1) brightness(1);transform:scale(1)}50%{filter:saturate(1.2) brightness(1.1);transform:scale(1.04)}}
.axc-live{display:inline-flex;align-items:center;gap:6px;flex:none;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;
  padding:5px 10px;border-radius:999px;border:1px solid transparent;}
.axc-live .dot{width:6px;height:6px;border-radius:50%;animation:axc-pulse 2.4s ease-in-out infinite;}
.axc-live.on{border-color:rgba(57,255,20,.32);color:#c9f9d3;background:rgba(57,255,20,.08);}
.axc-live.on .dot{background:#39FF14;box-shadow:0 0 8px rgba(57,255,20,.8);}
.axc-live.off{border-color:rgba(148,163,184,.2);color:rgba(226,232,240,.45);background:rgba(148,163,184,.06);}
.axc-live.off .dot{background:rgba(226,232,240,.3);animation:none;}
@keyframes axc-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.axc-card{border-radius:18px;border:1px solid rgba(148,163,184,.12);
  background:linear-gradient(180deg, rgba(148,163,184,.06), rgba(15,23,42,.35));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
.axc-label{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(226,232,240,.42);}
.axc-chips{display:flex;gap:7px;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;padding-bottom:2px;scrollbar-width:none;-webkit-overflow-scrolling:touch;
  mask-image:linear-gradient(90deg, transparent, #000 10px, #000 calc(100% - 14px), transparent);
  -webkit-mask-image:linear-gradient(90deg, transparent, #000 10px, #000 calc(100% - 14px), transparent);}
.axc-chips::-webkit-scrollbar{display:none;}
.axc-chip{flex:none;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  padding:7px 12px;border-radius:999px;background:rgba(148,163,184,.07);border:1px solid rgba(148,163,184,.16);color:rgba(226,232,240,.72);
  transition:transform .18s cubic-bezier(.16,1,.3,1), color .2s, border-color .2s, background .2s, box-shadow .2s;}
.axc-chip:hover{color:#05070d;border-color:transparent;background:linear-gradient(120deg, #007FFF, #39FF14);transform:translateY(-1.5px);
  box-shadow:0 6px 16px rgba(0,127,255,.3);}
.axc-chip:active{transform:scale(.96);}
.axc-chip[data-active="true"]{color:#05070d;border-color:transparent;font-weight:700;
  background:linear-gradient(120deg, #007FFF 0%, #39FF14 70%);box-shadow:0 4px 14px rgba(0,127,255,.35);}
.axc-chip.prompt{text-transform:none;letter-spacing:.02em;font-size:11px;}
.axc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 13px;border-radius:14px;cursor:pointer;
  font-size:11px;font-weight:600;border:1px solid rgba(148,163,184,.18);background:rgba(148,163,184,.07);color:rgba(226,232,240,.85);
  transition:transform .18s cubic-bezier(.16,1,.3,1), background .2s, border-color .2s, color .2s, box-shadow .2s;}
.axc-btn:hover{transform:translateY(-1.5px);}
.axc-btn:active{transform:scale(.97);}
.axc-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none;}
.axc-btn.azure{border-color:rgba(0,127,255,.4);background:rgba(0,127,255,.12);color:#dbeafe;}
.axc-btn.azure:hover{background:rgba(0,127,255,.22);box-shadow:0 6px 16px rgba(0,127,255,.25);}
.axc-btn.lime{border-color:rgba(57,255,20,.35);background:rgba(57,255,20,.1);color:#dcfce7;}
.axc-btn.lime:hover{background:rgba(57,255,20,.18);box-shadow:0 6px 16px rgba(57,255,20,.2);}
.axc-btn.amber{border-color:rgba(255,191,0,.35);background:rgba(255,191,0,.1);color:#fef3c7;}
.axc-btn.amber:hover{background:rgba(255,191,0,.18);box-shadow:0 6px 16px rgba(255,191,0,.18);}
.axc-btn.crimson{border-color:rgba(220,20,60,.4);background:rgba(220,20,60,.12);color:#ffe4e6;}
.axc-btn.crimson:hover{background:rgba(220,20,60,.2);box-shadow:0 6px 16px rgba(220,20,60,.22);}
.axc-msg{max-width:86%;padding:9px 13px;border-radius:18px;font-size:12px;line-height:1.55;word-break:break-word;
  animation:axc-in .28s cubic-bezier(.16,1,.3,1) both;}
.axc-msg.user{align-self:flex-end;border-bottom-right-radius:7px;color:#e8f2ff;
  background:linear-gradient(135deg, rgba(0,127,255,.28), rgba(0,127,255,.12));border:1px solid rgba(0,127,255,.35);
  box-shadow:0 6px 18px rgba(0,127,255,.15), inset 0 1px 0 rgba(255,255,255,.12);}
.axc-msg.aurora{align-self:flex-start;border-bottom-left-radius:7px;color:#ffeef2;
  background:linear-gradient(180deg, rgba(220,20,60,.15), rgba(15,23,42,.5));border:1px solid rgba(220,20,60,.28);
  box-shadow:0 6px 18px rgba(220,20,60,.1), inset 0 1px 0 rgba(255,255,255,.07);}
.axc-msg.interim{opacity:.6;font-style:italic;border-style:dashed;}
.axc-msg.small{font-size:11px;padding:7px 11px;max-width:92%;animation:none;}
.axc-role{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;opacity:.55;margin-bottom:2px;}
@keyframes axc-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
/* ── Línea de "proceso" sutil bajo una respuesta (metadatos por mensaje) ── */
.axc-process{margin-top:5px;}
.axc-process-toggle{display:inline-flex;align-items:center;gap:5px;cursor:pointer;border:0;background:transparent;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;letter-spacing:.06em;color:rgba(255,238,242,.4);
  padding:2px 0;transition:color .18s;}
.axc-process-toggle:hover{color:rgba(255,238,242,.75);}
.axc-process-dot{width:5px;height:5px;border-radius:50%;background:rgba(127,184,255,.6);flex:none;}
.axc-process-detail{margin-top:5px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.07);font-size:10.5px;line-height:1.5;color:rgba(255,238,242,.65);
  display:flex;flex-direction:column;gap:4px;}
.axc-process-tool{display:flex;align-items:flex-start;gap:6px;}
.axc-process-link{margin-top:2px;cursor:pointer;border:0;background:transparent;color:#7fb8ff;font-size:10px;text-align:left;padding:0;}
.axc-process-link:hover{text-decoration:underline;}
.axc-inputrow{display:flex;gap:8px;align-items:center;padding:5px;border-radius:18px;
  background:rgba(2,4,10,.72);border:1px solid rgba(148,163,184,.12);transition:border-color .2s, box-shadow .2s;}
.axc-inputrow:focus-within{border-color:rgba(0,127,255,.55);box-shadow:0 0 0 3px rgba(0,127,255,.14), inset 0 1px 0 rgba(255,255,255,.04);}
.axc-input{flex:1;min-width:0;background:transparent;border:0;outline:none;color:#eef2ff;font-size:12.5px;padding:8px 6px 8px 10px;}
/* ── Barra superior de Aurora: preguntar / buscar en la red + activar voz ── */
.axc-bar{display:flex;gap:8px;align-items:center;padding:6px;border-radius:20px;
  background:radial-gradient(120% 140% at 0% 0%, rgba(0,127,255,.1), transparent 60%), rgba(2,4,10,.78);
  border:1px solid rgba(148,163,184,.16);
  box-shadow:0 10px 30px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06);
  transition:border-color .2s, box-shadow .2s;}
.axc-bar:focus-within{border-color:rgba(0,127,255,.6);box-shadow:0 0 0 3px rgba(0,127,255,.16), 0 10px 30px rgba(0,0,0,.4);}
.axc-bar-ico{flex:none;display:grid;place-items:center;width:30px;height:38px;color:rgba(127,184,255,.7);padding-left:6px;}
.axc-bar-input{flex:1;min-width:0;background:transparent;border:0;outline:none;color:#eef2ff;font-size:13.5px;padding:9px 4px;}
.axc-bar-input::placeholder{color:rgba(148,163,184,.55);}
.axc-mic{position:relative;width:44px;height:44px;border-radius:15px;flex:none;display:grid;place-items:center;cursor:pointer;color:#dcfce7;
  border:1px solid rgba(57,255,20,.4);background:linear-gradient(135deg, rgba(57,255,20,.16), rgba(0,127,255,.1));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.14);
  transition:transform .2s cubic-bezier(.5,1.6,.4,1), background .2s, box-shadow .2s, color .2s, border-color .2s;}
.axc-mic:hover{transform:translateY(-2px) scale(1.04);background:linear-gradient(135deg, rgba(57,255,20,.26), rgba(0,127,255,.16));}
.axc-mic:active{transform:scale(.94);}
.axc-mic:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}
.axc-mic.on{color:#101728;border-color:transparent;background:linear-gradient(135deg, #39FF14, #007FFF);
  box-shadow:0 0 22px rgba(57,255,20,.5), inset 0 1px 0 rgba(255,255,255,.3);}
.axc-mic.on::after{content:"";position:absolute;inset:-4px;border-radius:18px;border:1.5px solid rgba(57,255,20,.5);
  animation:axc-ring 1.8s ease-out infinite;}
.axc-mic.speaking{color:#3a2600;border-color:transparent;background:linear-gradient(135deg, #FFBF00, #DC143C);
  box-shadow:0 0 22px rgba(255,191,0,.5), inset 0 1px 0 rgba(255,255,255,.3);}
@keyframes axc-ring{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.35);opacity:0}}
.axc-input::placeholder{color:rgba(148,163,184,.5);}
.axc-send{width:38px;height:38px;border-radius:14px;flex:none;display:grid;place-items:center;color:#fff;border:0;cursor:pointer;
  background:linear-gradient(135deg, #007FFF, #DC143C);box-shadow:0 7px 18px rgba(0,127,255,.35), inset 0 1px 0 rgba(255,255,255,.25);
  transition:transform .2s cubic-bezier(.5,1.6,.4,1), filter .2s;}
.axc-send:hover{transform:translateY(-2px) scale(1.05);filter:brightness(1.08);}
.axc-send:active{transform:scale(.94);}
.axc-send:disabled{opacity:.45;transform:none;box-shadow:none;cursor:not-allowed;}
.axc-tbtn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:12px;cursor:pointer;
  border:1px solid rgba(148,163,184,.14);background:rgba(148,163,184,.06);color:rgba(226,232,240,.75);
  transition:transform .16s ease, background .2s, color .2s, border-color .2s;}
.axc-tbtn:hover{color:#fff;background:rgba(0,127,255,.18);border-color:rgba(0,127,255,.4);transform:translateY(-1px);}
.axc-tbtn:active{transform:scale(.94);}
.axc-tbtn.primary{width:38px;height:38px;border-radius:13px;color:#dbeafe;
  background:linear-gradient(135deg, rgba(0,127,255,.3), rgba(57,255,20,.14));border-color:rgba(0,127,255,.45);}
.axc-tbtn.danger:hover{background:rgba(220,20,60,.2);border-color:rgba(220,20,60,.5);color:#ffe4e6;}
.axc-switch{position:relative;width:36px;height:20px;border-radius:999px;border:0;cursor:pointer;flex:none;
  background:rgba(148,163,184,.22);transition:background .2s;}
.axc-switch[aria-checked="true"]{background:linear-gradient(120deg, #007FFF, #39FF14);}
.axc-switch .knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.4);transition:transform .2s cubic-bezier(.16,1,.3,1);}
.axc-switch[aria-checked="true"] .knob{transform:translateX(16px);}
.axc-select{width:100%;padding:8px 10px;border-radius:12px;background:rgba(2,4,10,.7);border:1px solid rgba(148,163,184,.16);
  color:#eef2ff;font-size:12px;outline:none;transition:border-color .2s;cursor:pointer;}
.axc-select:focus{border-color:rgba(0,127,255,.55);}
.axc-select:disabled{opacity:.55;cursor:not-allowed;}
.axc-voicewarn{display:flex;align-items:center;gap:10px;border-radius:18px;padding:10px 12px;
  border:1px solid rgba(220,20,60,.4);background:linear-gradient(120deg, rgba(220,20,60,.16), rgba(220,20,60,.05));}
.axc-scroll{scrollbar-width:thin;scrollbar-color:rgba(0,127,255,.35) transparent;}
.axc-scroll::-webkit-scrollbar{width:8px;}
.axc-scroll::-webkit-scrollbar-thumb{background:rgba(0,127,255,.28);border-radius:99px;border:2px solid transparent;background-clip:padding-box;}
.axc-scroll::-webkit-scrollbar-thumb:hover{background:rgba(57,255,20,.35);background-clip:padding-box;}
/* ── Árbol de contextos de conversación (ramificación) ── */
.axc-tree{display:flex;flex-direction:column;min-height:0;gap:8px;padding:11px 12px 10px;}
.axc-tree-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.axc-tree-new{padding:6px 10px;font-size:10.5px;}
.axc-tree-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px;padding-right:2px;}
.axc-tree-empty{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:18px 12px;}
.axc-tree-node{position:relative;}
/* Sangría por nivel + guía visual de rama. */
.axc-tree-row{position:relative;display:flex;align-items:center;gap:4px;border-radius:12px;padding:5px 7px;
  margin-left:calc(var(--tree-depth, 0) * 16px);
  border:1px solid transparent;transition:background .18s, border-color .18s;}
.axc-tree-row:hover{background:rgba(148,163,184,.07);border-color:rgba(148,163,184,.14);}
.axc-tree-row.active{background:linear-gradient(120deg, rgba(0,127,255,.18), rgba(57,255,20,.08));
  border-color:rgba(0,127,255,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);}
.axc-tree-branch{flex:none;display:grid;place-items:center;width:14px;color:rgba(127,184,255,.6);}
.axc-tree-caret{flex:none;display:grid;place-items:center;width:18px;height:18px;border-radius:6px;cursor:pointer;
  border:0;background:transparent;color:rgba(226,232,240,.55);transition:color .18s, background .18s;}
.axc-tree-caret:hover{color:#fff;background:rgba(148,163,184,.14);}
.axc-tree-caret.ghost{cursor:default;}
.axc-tree-dot{width:4px;height:4px;border-radius:50%;background:rgba(148,163,184,.4);}
.axc-tree-title{flex:1;min-width:0;display:flex;align-items:center;gap:6px;cursor:pointer;text-align:left;
  border:0;background:transparent;color:rgba(226,232,240,.9);font-size:12px;padding:2px 2px;transition:color .18s;}
.axc-tree-title:hover{color:#fff;}
.axc-tree-titletext{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.axc-tree-count{flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:8.5px;
  padding:1px 6px;border-radius:999px;background:rgba(148,163,184,.16);color:rgba(226,232,240,.6);}
.axc-tree-edit{flex:1;min-width:0;background:rgba(2,4,10,.8);border:1px solid rgba(0,127,255,.5);border-radius:8px;
  color:#eef2ff;font-size:12px;padding:3px 8px;outline:none;}
.axc-tree-actions{flex:none;display:flex;align-items:center;gap:2px;opacity:0;transition:opacity .18s;}
.axc-tree-row:hover .axc-tree-actions,.axc-tree-row.active .axc-tree-actions{opacity:1;}
.axc-tree-act{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;cursor:pointer;
  border:1px solid rgba(148,163,184,.16);background:rgba(148,163,184,.06);color:rgba(226,232,240,.7);
  transition:transform .16s, background .18s, color .18s, border-color .18s;}
.axc-tree-act:hover{color:#fff;background:rgba(0,127,255,.2);border-color:rgba(0,127,255,.45);transform:translateY(-1px);}
.axc-tree-act:active{transform:scale(.92);}
.axc-tree-act.danger:hover{background:rgba(255,191,0,.2);border-color:rgba(255,191,0,.45);color:#fef3c7;}
/* Línea vertical de rama que agrupa los hijos. */
.axc-tree-children{position:relative;}
.axc-tree-children::before{content:"";position:absolute;top:0;bottom:9px;
  left:calc(var(--tree-depth, 0) * 16px + 14px);width:1px;background:rgba(127,184,255,.22);}
.axc-tree-activechip{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;
  padding:5px 10px;border-radius:999px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:#dbeafe;background:rgba(0,127,255,.12);border:1px solid rgba(0,127,255,.35);}
.axc-tree-archive{margin-top:6px;border-top:1px solid rgba(148,163,184,.1);padding-top:6px;}
.axc-tree-archtoggle{display:flex;align-items:center;gap:6px;width:100%;cursor:pointer;border:0;background:transparent;
  color:rgba(226,232,240,.55);font-size:10.5px;padding:4px 2px;transition:color .18s;}
.axc-tree-archtoggle:hover{color:rgba(226,232,240,.85);}
.axc-tree-archlist{display:flex;flex-direction:column;gap:2px;padding:2px 0 0 4px;}
.axc-tree-archrow{display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(226,232,240,.55);
  padding:3px 6px;border-radius:8px;}
.axc-tree-archrow:hover{background:rgba(148,163,184,.06);}
.axc-tree-foot{font-size:9.5px;line-height:1.5;color:rgba(148,163,184,.5);padding-top:4px;margin-top:2px;
  border-top:1px solid rgba(148,163,184,.08);}
@media (prefers-reduced-motion: reduce){
  .axc-orb,.axc-live .dot,.axc-msg{animation:none !important;}
  .axc-chip,.axc-btn,.axc-send,.axc-tbtn,.axc-switch .knob,.axc-msg,.axc-mic{transition:none !important;}
  .axc-chip:hover,.axc-btn:hover,.axc-send:hover,.axc-tbtn:hover,.axc-mic:hover{transform:none;}
  .axc-mic.on::after{animation:none !important;}
  .axc-tree-act,.axc-tree-caret,.axc-tree-actions,.axc-tree-row,.axc-tree-title{transition:none !important;}
  .axc-tree-act:hover{transform:none;}
  .axc-process-toggle,.axc-process-link{transition:none !important;}
}
`;

// ── Utilidades de presentación ───────────────────────────────────────────────
function fmtTime(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return "";
  try {
    return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function dayLabel(day: string): string {
  try {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const label = new Date(`${day}T12:00:00`).toLocaleDateString("es-ES", {
      weekday: "long", day: "numeric", month: "long",
    });
    return day === todayStr ? `Hoy · ${label}` : label;
  } catch {
    return day;
  }
}

// ── Sección ──────────────────────────────────────────────────────────────────
export function AuroraChatSection({ className }: { className?: string }) {
  // Motor por CONTEXTO (la cortina Zenith vive dentro de AuroraProvider) —
  // defensivo: si el contexto faltara, degradamos al puente global.
  const aurora = useAurora();
  const hasCtx = !!aurora;
  const pathname = usePathname();
  const chatLog = useAuroraChatLog();
  // Árbol de contextos/temas de conversación (ramificación) — persistido aparte.
  const tree = useChatTree();

  const [tab, setTab] = useState<Tab>("folder");
  const [snap, setSnap] = useState<SnapshotPlus | null>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [barDraft, setBarDraft] = useState("");
  const [orbHidden, setOrbHiddenState] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  // Overlay a pantalla completa de la vista de chat (2 columnas en escritorio).
  const [fullscreen, setFullscreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // "Nuevo chat": marca temporal a partir de la cual se muestra la conversación
  // en vivo (reinicio VISUAL del contexto; el motor mantiene su ring interno).
  const [sessionStartTs, setSessionStartTs] = useState<number>(0);
  // Contexto cargado desde el registro: al entrar a una sesión pasada, sus
  // mensajes se muestran en la vista de chat (solo lectura de ese contexto).
  // `label` opcional para contextos del árbol (si no, se usa el día).
  const [loadedSession, setLoadedSession] = useState<
    { day: string; entries: AuroraChatLogEntry[]; label?: string } | null
  >(null);

  // Fallback: suscripción al puente SOLO cuando no hay contexto de provider.
  useEffect(() => {
    if (hasCtx) return;
    const refresh = () => {
      setSnap(getAuroraState() as SnapshotPlus | null);
      setBridgeReady(isAuroraReady());
    };
    const unsub = subscribeAurora(refresh);
    refresh();
    return unsub;
  }, [hasCtx]);

  // Visibilidad del orbe (para el botón "Reactivar orbe").
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOrbHiddenState(readOrbHidden());
    return subscribeOrbVisibility((h) => setOrbHiddenState(h));
  }, []);

  // UNA SOLA SUPERFICIE DE CHAT: mientras ESTA sección (el chat COMPLETO, con
  // todas sus pestañas) esté montada, el orbe calla sus superficies
  // conversacionales (reproductor resumido, globo y mini-popover). Antes se
  // veían los dos a la vez: el chat principal y, debajo, otro más simple con la
  // MISMA conversación. Registro/baja en pareja (contador en el bus).
  useEffect(() => {
    setAuroraFullChatOpen(true);
    return () => { setAuroraFullChatOpen(false); };
  }, []);

  // Personalidad POR CHAT (Adenda 63 §11): registra el contexto de conversación
  // activo (árbol) como "chat actual" para que la pestaña Personalidades y
  // Astraura resuelvan la personalidad de ESTE chat (prioridad chat > cerebro >
  // sección > global). Registro efímero: se limpia al desmontar la sección.
  useEffect(() => {
    try { registerActiveAuroraChat(tree.activeId ?? null); } catch { /* defensivo */ }
    return () => { try { registerActiveAuroraChat(null); } catch { /* defensivo */ } };
  }, [tree.activeId]);

  // Asocia cada mensaje (voz o texto, usuario o Aurora) al contexto ACTIVO del
  // árbol, si lo hay (índice paralelo en chat-tree; no toca el registro). Así la
  // ramificación captura la conversación de cada contexto sin duplicar datos.
  useEffect(() => {
    if (typeof window === "undefined") return;
    return subscribeAuroraConversation((d) => {
      try { tree.tagMessage(d.ts); } catch { /* defensivo */ }
    });
    // `tree.tagMessage` es estable (useCallback sin deps); el índice lee el
    // contexto activo en el momento de cada mensaje, así que no re-suscribimos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Vista unificada del estado (contexto primero, puente después) ──────────
  const ready = hasCtx ? true : bridgeReady;
  const supported = aurora?.supported ?? snap?.supported ?? false;
  const enabled = aurora?.enabled ?? snap?.enabled ?? false;
  const listening = aurora?.listening ?? snap?.listening ?? false;
  const speaking = aurora?.speaking ?? snap?.speaking ?? false;
  const paused = aurora?.paused ?? snap?.paused ?? false;
  const interim = aurora?.interim ?? snap?.interim ?? "";
  const lastReply = aurora?.lastReply ?? snap?.lastReply ?? "";
  const actionStatus = aurora?.actionStatus ?? snap?.actionStatus ?? "";
  const conversation = aurora?.conversation ?? snap?.conversation ?? [];
  const actionLog = aurora?.actionLog ?? snap?.actionLog ?? [];
  const activePersonality = aurora?.activePersonality ?? snap?.activePersonality ?? { name: "Aurora" };
  const voiceUnavailable = aurora?.voiceUnavailable ?? !!snap?.voiceUnavailable;
  const auroraName = activePersonality?.name || "Aurora";

  // ── Acciones unificadas ────────────────────────────────────────────────────
  // `opts.forceSource` (Adenda "Aurora siempre responde") solo lo soporta el
  // motor real (`aurora.send`); el puente global degrada enviando normal.
  const doSend = useCallback(async (text: string, opts?: { forceSource?: { sourceId: string; modelId: string } }) => {
    const t = (text ?? "").trim();
    if (!t) return;
    try {
      if (aurora) await aurora.send(t, opts);
      else await sendToAurora(t);
    } catch { /* defensivo */ }
  }, [aurora]);

  const submitDraft = useCallback(async () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    await doSend(t);
  }, [draft, doSend]);

  // Subida universal de archivos (Adenda 64 §9): Aurora solo maneja texto — el
  // picker ya insertó la(s) URL(s) en `draft` (ver AuroraChatView); aquí solo
  // dejamos un punto de extensión honesto (sin acción adicional por ahora).
  const handleAttachFile = useCallback(() => { /* URL ya insertada en el draft por AuroraChatView */ }, []);

  // Barra superior: preguntar a Aurora / buscar en la red. Envía a send()
  // (genera o continúa el contexto de chat) y aterriza en la vista de chat.
  const submitBar = useCallback(async () => {
    const t = barDraft.trim();
    if (!t) return;
    setBarDraft("");
    setLoadedSession(null); // salimos de cualquier contexto pasado cargado
    setTab("chat");
    await doSend(t);
  }, [barDraft, doSend]);

  // "Nuevo chat": reinicio VISUAL del contexto en vivo (el motor conserva su
  // ring interno; el registro persistente por día no se toca). Marca la frontera
  // temporal a partir de la cual se muestra la conversación.
  const newChat = useCallback(() => {
    setSessionStartTs(Date.now());
    setLoadedSession(null);
    setDraft("");
    setTab("chat");
    try { scrollRef.current && (scrollRef.current.scrollTop = 0); } catch { /* */ }
  }, []);

  // Entrar a un contexto pasado del registro: carga sus mensajes en la vista de
  // chat (solo lectura de ese día). Escribir abajo continúa en el chat en vivo.
  const openSessionInChat = useCallback((day: string, entries: AuroraChatLogEntry[]) => {
    setLoadedSession({ day, entries });
    setTab("chat");
  }, []);

  const exitLoadedSession = useCallback(() => setLoadedSession(null), []);

  // Abrir un CONTEXTO del árbol: reconstruye su conversación cruzando los
  // timestamps asociados (índice paralelo) con las entradas del registro. Lo fija
  // como contexto activo (los mensajes nuevos caerán en él) y lo carga en la vista.
  const openContext = useCallback((id: string) => {
    tree.setActive(id);
    const ctx = tree.contextById(id);
    const tsSet = new Set(tree.timestampsOf(id));
    // Cruzamos con el registro (dedup + orden temporal). Si el contexto aún no
    // tiene mensajes asociados, mostramos una vista vacía (pero editable en vivo).
    const all = readAuroraChatEntries();
    const entries = all
      .filter((e) => tsSet.has(e.ts))
      .sort((a, b) => a.ts - b.ts);
    setSessionStartTs(0);
    setLoadedSession({
      day: entries[0] ? auroraChatDayOf(entries[0].ts) : "",
      entries,
      label: ctx?.title ?? "Contexto",
    });
    setTab("chat");
  }, [tree]);

  // Abrir un chat del catálogo (explorador) en la conversación. Un chat de tipo
  // "context" se fija como activo en el árbol (los mensajes nuevos caerán en él);
  // uno de tipo "day" se carga en solo-lectura. En ambos casos reutilizamos la
  // vista de chat (AuroraChatView) — no se duplica la lógica de conversación.
  const openCatalogChat = useCallback((chat: CatalogChat) => {
    setSessionStartTs(0);
    if (chat.source === "context" && chat.contextId) {
      openContext(chat.contextId);
      return;
    }
    setLoadedSession({
      day: chat.day,
      entries: chat.entries,
      label: chat.title,
    });
    setTab("chat");
  }, [openContext]);

  // ── Menú contextual de mensajes (Adenda "Aurora siempre responde") ─────────
  // "Ramificar chat desde aquí": crea un contexto nuevo (hijo del activo si lo
  // hay; si no, raíz) y le asocia TODO el historial hasta el mensaje elegido
  // (índice paralelo de chat-tree.ts — no duplica datos del registro), luego
  // lo abre. Reutiliza `openContext`, que ya sabe reconstruir la conversación
  // cruzando timestamps con el registro.
  const branchFromMessage = useCallback((
    history: { role: "user" | "aurora"; text: string; ts: number }[],
    label: string,
  ) => {
    const parentId = tree.activeId;
    const newId = parentId ? tree.branchFrom(parentId, label) : tree.create(label);
    for (const m of history) {
      try { tree.tagMessage(m.ts, newId); } catch { /* defensivo */ }
    }
    openContext(newId);
  }, [tree, openContext]);

  // "Reintentar": reenvía el mensaje de usuario anterior a la respuesta
  // elegida — APÉNDICE al chat en vivo (no muta el historial existente, ver
  // architecture/astraura-inteligencia.md §17.4). Sale de cualquier sesión
  // cargada para que la nueva respuesta sea visible de inmediato.
  const retryMessage = useCallback((userText: string, forceSource?: { sourceId: string; modelId: string }) => {
    setLoadedSession(null);
    setTab("chat");
    void doSend(userText, forceSource ? { forceSource } : undefined);
  }, [doSend]);

  const doToggleVoice = useCallback(() => {
    try { if (aurora) aurora.toggle(); else toggleAuroraVoice(); } catch { /* */ }
  }, [aurora]);

  const doSetEnabled = useCallback((v: boolean) => {
    try { if (aurora) aurora.setEnabled(v); else setAuroraEnabled(v); } catch { /* */ }
  }, [aurora]);

  const doSpeak = useCallback((t: string) => {
    try { if (aurora) aurora.speak(t); else speakAurora(t); } catch { /* */ }
  }, [aurora]);

  const doRetryVoice = useCallback(() => {
    try {
      if (aurora) aurora.retryVoice();
      else getAuroraBridge()?.start?.(); // el arranque supervisado limpia el estado
    } catch { /* */ }
  }, [aurora]);

  const tPause = useCallback(() => { try { if (aurora) aurora.pauseSpeech(); else auroraTransport.pause(); } catch { /* */ } }, [aurora]);
  const tResume = useCallback(() => { try { if (aurora) aurora.resumeSpeech(); else auroraTransport.resume(); } catch { /* */ } }, [aurora]);
  const tSkipF = useCallback(() => { try { if (aurora) aurora.skipForward(); else auroraTransport.skipForward(); } catch { /* */ } }, [aurora]);
  const tSkipB = useCallback(() => { try { if (aurora) aurora.skipBack(); else auroraTransport.skipBack(); } catch { /* */ } }, [aurora]);
  const tInterrupt = useCallback(() => { try { if (aurora) aurora.interrupt(); else auroraTransport.interrupt(); } catch { /* */ } }, [aurora]);

  const pickPersonality = useCallback((value: string) => {
    if (!aurora) return; // el puente no expone el setter: selector solo con contexto
    try {
      const p = aurora.personalities.find((x) => (x.id ?? x.name) === value);
      if (p) aurora.setActivePersonality(p);
    } catch { /* */ }
  }, [aurora]);

  // Conversación EN VIVO visible: si el usuario pulsó "Nuevo chat", solo desde
  // esa frontera temporal (reinicio visual). ConversationEntry lleva `.at`.
  const visibleConvo = useMemo(() => {
    if (!sessionStartTs) return conversation;
    try {
      return conversation.filter((m) => {
        const at = (m as { at?: number })?.at;
        return typeof at !== "number" || at >= sessionStartTs;
      });
    } catch {
      return conversation;
    }
  }, [conversation, sessionStartTs]);

  // Auto-scroll del historial al fondo cuando llegan mensajes (solo en vivo).
  const convoLen = visibleConvo.length;
  useEffect(() => {
    if (tab === "chat" && !loadedSession && scrollRef.current) {
      try { scrollRef.current.scrollTop = scrollRef.current.scrollHeight; } catch { /* */ }
    }
  }, [convoLen, tab, interim, loadedSession]);

  const guide = useMemo(() => guideFor(pathname), [pathname]);

  const statusLine = speaking
    ? (paused ? "En pausa" : "Hablando…")
    : listening
      ? "Escuchando…"
      : voiceUnavailable
        ? "Voz no disponible · usa Reintentar"
        : "La voz de Astraura · control total del OS";

  const onClearLog = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.confirm("¿Borrar TODO el registro local de conversaciones con Aurora?")) {
        chatLog.clear();
        setOpenDay(null);
      }
    } catch { /* */ }
  }, [chatLog]);

  // ── Transporte de voz (reproducir/pausar · interrumpir · saltar) ───────────
  const Transport = () => (
    <div className="relative z-[1] flex items-center justify-center gap-1.5 rounded-[16px] border border-white/10 bg-white/[0.03] px-2 py-2">
      <button onClick={tSkipB} title="Retroceder a la respuesta anterior" className="axc-tbtn">
        <SkipBack className="h-4 w-4" />
      </button>
      {paused ? (
        <button onClick={tResume} title="Reanudar la voz" className="axc-tbtn primary">
          <Play className="h-4 w-4" />
        </button>
      ) : (
        <button onClick={tPause} title="Pausar la voz" className="axc-tbtn primary">
          <Pause className="h-4 w-4" />
        </button>
      )}
      <button onClick={tInterrupt} title="Interrumpir a Aurora" className="axc-tbtn danger">
        <Square className="h-4 w-4" />
      </button>
      <button onClick={tSkipF} title="Adelantar a la respuesta siguiente" className="axc-tbtn">
        <SkipForward className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className={cn("axc-root", className)}>
      <style>{AXC_CSS}</style>

      {/* ── Cabecera: orbe + estado hablando/escuchando + conexión ── */}
      <div className="relative z-[1] flex items-center gap-3">
        <div
          className={cn(
            "axc-orb",
            speaking && !paused && "speaking",
            !speaking && listening && "listening",
          )}
        >
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight text-white">
            Aurora · Exocórtex
          </h3>
          <p className="truncate text-[11px] text-white/45">{statusLine}</p>
        </div>
        <span className={cn("axc-live", ready ? "on" : "off")}>
          <span className="dot" />
          {ready ? "Conectada" : "En espera"}
        </span>
      </div>

      {/* ── Barra de Aurora: preguntar / buscar en la red + activar la voz ── */}
      <div className="axc-bar relative z-[1]">
        <span className="axc-bar-ico" aria-hidden>
          <Search className="h-4 w-4" />
        </span>
        <input
          value={barDraft}
          onChange={(e) => setBarDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submitBar(); } }}
          placeholder="Pregunta a Aurora o busca recursos en la red…"
          className="axc-bar-input"
          aria-label="Preguntar a Aurora o buscar en la red"
        />
        {barDraft.trim() && (
          <button
            onClick={() => void submitBar()}
            title="Enviar a Aurora"
            className="axc-send"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={doToggleVoice}
          disabled={!supported || !ready}
          className={cn(
            "axc-mic",
            speaking && !paused && "speaking",
            !speaking && listening && "on",
          )}
          title={
            !supported
              ? "Tu navegador no soporta voz"
              : speaking
                ? "Aurora está hablando · toca para interrumpir"
                : listening
                  ? "Escuchando · toca para desactivar la voz"
                  : "Activar la voz de Aurora (empezar a escuchar)"
          }
          aria-label={listening ? "Desactivar la voz de Aurora" : "Activar la voz de Aurora"}
          aria-pressed={listening}
        >
          {supported ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
      </div>

      {/* ── Accesos: nuevo chat · orbe flotante · Aurora activa ── */}
      <div className="relative z-[1] flex flex-wrap items-center gap-2">
        <button
          onClick={newChat}
          className="axc-btn azure"
          title="Empezar un chat nuevo (limpia la vista en vivo; el registro se conserva)"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo chat
        </button>
        <button
          onClick={() => setTab("registro")}
          className={cn("axc-btn", tab === "registro" ? "lime" : undefined)}
          title="Ver tus chats guardados (sesiones por día) y entrar a cualquiera"
        >
          <History className="h-3.5 w-3.5" /> Ver chats
          {chatLog.sessions.length > 0 && (
            <span className="ml-0.5 rounded-full bg-white/15 px-1.5 py-0.5 font-mono text-[9px] leading-none">
              {chatLog.sessions.length}
            </span>
          )}
        </button>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-white/70" title="Mostrar u ocultar el orbe flotante de Aurora">
            <Orbit className="h-3.5 w-3.5 text-[#7fb8ff]" />
            <span className="hidden sm:inline">Orbe flotante</span>
            <button
              role="switch"
              aria-checked={!orbHidden}
              onClick={() => setOrbHidden(!orbHidden)}
              className="axc-switch"
              title={orbHidden ? "Mostrar el orbe flotante" : "Ocultar el orbe flotante"}
            >
              <span className="knob" />
            </button>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-white/70" title="Encender o apagar Aurora globalmente">
            <Power className="h-3.5 w-3.5 text-[#39FF14]" />
            <span className="hidden sm:inline">Aurora</span>
            <button
              role="switch"
              aria-checked={enabled}
              onClick={() => doSetEnabled(!enabled)}
              className="axc-switch"
              title={enabled ? "Apagar Aurora" : "Encender Aurora"}
            >
              <span className="knob" />
            </button>
          </label>
        </div>
      </div>

      {/* ── Voz no disponible · Reintentar (supervisor del provider) ── */}
      {voiceUnavailable && (
        <div className="axc-voicewarn relative z-[1]">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-rose-100">Voz no disponible</p>
            <p className="text-[10px] leading-relaxed text-rose-200/60">
              La escucha se cayó varias veces seguidas y se pausó para no entrar en bucle.
              El chat por texto sigue funcionando.
            </p>
          </div>
          <button onClick={doRetryVoice} className="axc-btn crimson shrink-0" title="Reintentar la voz">
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      )}

      {/* ── Acciones: sección completa + reactivar orbe ── */}
      <div className="relative z-[1] flex flex-wrap items-center gap-2">
        <a href="/aurora" className="axc-btn azure" title="Abrir la sección completa de Aurora (personalidades, voz, memoria)">
          <ExternalLink className="h-3.5 w-3.5" /> Abrir sección completa
        </a>
        <button
          onClick={() => setOrbHidden(false)}
          disabled={!orbHidden}
          className={cn("axc-btn", orbHidden ? "lime" : undefined)}
          title={orbHidden
            ? "Volver a mostrar el orbe flotante de Aurora en todas las rutas"
            : "El orbe ya está visible en pantalla"}
        >
          <Orbit className="h-3.5 w-3.5" /> {orbHidden ? "Reactivar orbe" : "Orbe activo"}
        </button>
      </div>

      {/* ── Guía contextual según la ruta ── */}
      <div className="axc-card relative z-[1] px-3.5 py-3">
        <div className="axc-label mb-2 flex items-center gap-1.5">
          <Compass className="h-3 w-3 text-[#7fb8ff]" />
          ¿Qué puedo hacer aquí? · {guide.title}
        </div>
        <div className="axc-chips">
          {guide.chips.map((c) => (
            <button
              key={c}
              className="axc-chip prompt"
              title="Enviar esta petición a Aurora"
              onClick={() => { setTab("chat"); void doSend(c); }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ── Puente/motor no disponible: guía para activarlo ── */}
      {!ready && (
        <div className="axc-card relative z-[1] flex items-start gap-2 px-3.5 py-2.5">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
          <p className="text-[11px] leading-relaxed text-white/50">
            Aurora aún no está disponible en este contexto. Se activa desde su orbe
            flotante (visible en las secciones del OS). El chat multiagente de la
            pestaña «Chats» funciona igualmente.
          </p>
        </div>
      )}

      {/* ── Pestañas ── */}
      <div className="axc-chips relative z-[1]">
        {([
          { id: "folder", label: "Folder", Icon: FolderTree },
          { id: "chat", label: "Chat", Icon: MessageSquare },
          { id: "chats", label: "Chats", Icon: Layers },
          { id: "voz", label: "Voz", Icon: Volume2 },
          { id: "control", label: "Control", Icon: SlidersHorizontal },
          { id: "personalidad", label: "Personalidades", Icon: Drama },
          { id: "registro", label: "Registro", Icon: ScrollText },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            data-active={tab === id}
            onClick={() => setTab(id)}
            className="axc-chip"
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
      </div>

      {/* ── Feedback de acción en vivo ── */}
      {actionStatus && (
        <div className="relative z-[1] flex items-center gap-2 rounded-[14px] border border-[#007FFF]/35 bg-[#007FFF]/10 px-3 py-2">
          <Wand2 className="h-3.5 w-3.5 shrink-0 animate-pulse text-[#7fb8ff]" />
          <span className="text-xs text-blue-50">{actionStatus}</span>
        </div>
      )}

      {tab === "folder" ? (
        /* Explorador de folder: TODOS los chats por fecha + tema, barra única
           buscar⇄chatear (fusión), categorización automática, guardar-en-
           memorias/duplicar/interconectar. Reutiliza la vista de chat al abrir. */
        <div className="relative z-[1]">
          <AuroraChatExplorer
            auroraName={auroraName}
            tree={tree}
            onAskAurora={(t) => doSend(t)}
            onOpenChat={openCatalogChat}
          />
        </div>
      ) : tab === "control" ? (
        /* Sentidos de Aurora (panel real) + modo "siempre encendida" (wake-word). */
        <div className="relative z-[1] flex flex-col gap-3">
          <AuroraAlwaysOn />
          <AuroraControlPanel enabled={enabled} onSetEnabled={doSetEnabled} />
        </div>
      ) : tab === "personalidad" ? (
        /* Personalidades como ARCHIVOS de configuración (Adenda 63 §11): galería
           con activar/editar/duplicar/exportar/eliminar, asignación por contexto
           (global · secciones · este chat), editor con niveladores, Biblioteca
           (compartir/instalar) e importar/exportar JSON. Scroll propio con tope
           de altura para que la cortina siga siendo usable en móvil. */
        <div className="axc-scroll relative z-[1] max-h-[62vh] overflow-y-auto overscroll-contain pr-1">
          <PersonalitiesPanel />
        </div>
      ) : tab === "chats" ? (
        /* Sesiones paralelas multi-proveedor — panel real, importado tal cual. */
        <div className="relative z-[1]">
          <AuroraMultichatPanel />
        </div>
      ) : tab === "chat" ? (
        /* Cuando el overlay a pantalla completa está abierto, la vista compacta
           se OCULTA: antes quedaba visible detrás y se veían dos chats
           superpuestos (el completo delante, el simple al fondo). Se mantiene
           montada para conservar el estado de la conversación. (Adenda 63) */
        <div className={cn("relative z-[1]", fullscreen && "hidden")}>
          {/* Acceso a pantalla completa (overlay 2 columnas en escritorio) */}
          <div className="mb-2.5 flex items-center justify-end">
            <button
              onClick={() => setFullscreen(true)}
              className="axc-btn azure"
              title="Abrir el chat de Aurora a pantalla completa (árbol de contextos + conversación)"
            >
              <Maximize2 className="h-3.5 w-3.5" /> Pantalla completa
            </button>
          </div>

          {/* Avatar de Aurora (opcional): orbe animado mejorado por defecto,
              Live2D si el usuario configuró un modelo propio, o nada si el
              modo es "none". Nunca desplaza el orbe flotante existente. */}
          <div className="mb-2.5 flex justify-center">
            <AuroraAvatar className="pointer-events-auto" />
          </div>

          {/* Vista COMPARTIDA (compacta): árbol desplegable + conversación */}
          <AuroraChatView
            auroraName={auroraName}
            visibleConvo={visibleConvo}
            interim={interim}
            loadedSession={loadedSession}
            actionLog={actionLog}
            paused={paused}
            draft={draft}
            setDraft={setDraft}
            onSubmitDraft={() => { void submitDraft(); }}
            onExitLoadedSession={exitLoadedSession}
            onAttachFile={handleAttachFile}
            onPause={tPause}
            onResume={tResume}
            onSkipBack={tSkipB}
            onSkipForward={tSkipF}
            onInterrupt={tInterrupt}
            tree={tree}
            onOpenContext={openContext}
            fmtTime={fmtTime}
            dayLabel={dayLabel}
            onBranchFromMessage={branchFromMessage}
            onRetryMessage={retryMessage}
          />

          {!supported && ready && (
            <div className="mt-2 text-center text-[10px] text-amber-300/70">
              Tu navegador no soporta voz. Aún puedes escribirle aquí y gestionar sus sentidos en «Control».
            </div>
          )}
        </div>
      ) : tab === "voz" ? (
        <>
          <Transport />

          {/* Toggle Aurora activa */}
          <div className="axc-card relative z-[1] flex items-center justify-between px-3.5 py-2.5">
            <span className="inline-flex items-center gap-2 text-xs text-white/75">
              <Power className="h-3.5 w-3.5 text-[#7fb8ff]" /> Aurora activa
            </span>
            <button
              role="switch"
              aria-checked={enabled}
              onClick={() => doSetEnabled(!enabled)}
              className="axc-switch"
              title={enabled ? "Apagar Aurora" : "Encender Aurora"}
            >
              <span className="knob" />
            </button>
          </div>

          {/* Selector de personalidad */}
          <div className="axc-card relative z-[1] px-3.5 py-3">
            <div className="axc-label mb-1.5">Personalidad activa</div>
            <select
              className="axc-select"
              value={activePersonality.id ?? activePersonality.name}
              onChange={(e) => pickPersonality(e.target.value)}
              disabled={!hasCtx || (aurora?.personalities.length ?? 0) === 0}
              title="Cambiar la personalidad activa de Aurora"
            >
              {(aurora?.personalities.length
                ? aurora.personalities
                : (snap?.personalities?.length ? snap.personalities : [activePersonality])
              ).map((p) => (
                <option key={p.id ?? p.name} value={p.id ?? p.name}>{p.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[10px] leading-relaxed text-white/40">
              La personalidad define voz, carácter y parámetros. Editor completo
              (niveladores, contextos, Biblioteca) en la pestaña{" "}
              <button
                onClick={() => setTab("personalidad")}
                className="cursor-pointer text-[#7fb8ff] hover:underline"
                title="Abrir la pestaña Personalidades"
              >
                Personalidades
              </button>{" "}
              o en <a href="/aurora" className="text-[#7fb8ff] hover:underline">Configurar Aurora</a>.
            </p>
          </div>

          {/* Último intercambio */}
          {(interim || lastReply) && (
            <div className="relative z-[1] space-y-2">
              {interim && (
                <div className="rounded-[14px] border border-[#007FFF]/25 bg-black/40 px-3 py-2">
                  <div className="axc-role text-[#7fb8ff]">Tú</div>
                  <div className="text-xs text-white/80">{interim}</div>
                </div>
              )}
              {lastReply && (
                <div className="rounded-[14px] border border-[#DC143C]/25 bg-[#DC143C]/10 px-3 py-2">
                  <div className="axc-role text-rose-300/70">{auroraName}</div>
                  <div className="text-xs text-rose-50/90">{lastReply}</div>
                </div>
              )}
            </div>
          )}

          {/* Qué puede hacer */}
          <div className="axc-card relative z-[1] px-3.5 py-2.5">
            <div className="axc-label mb-1">Aurora puede actuar</div>
            <div className="text-[11px] leading-relaxed text-white/55">
              «Abre mis pizarras», «pon el tema oscuro», «lanza un agente», «busca en mis
              memorias»… y sigue activa en segundo plano mientras lo hace.
            </div>
          </div>

          {/* Controles de voz */}
          <div className="relative z-[1] flex items-center gap-2">
            <button
              onClick={doToggleVoice}
              disabled={!supported || !ready}
              className="axc-btn lime flex-1"
              title={listening ? "Parar de escuchar" : "Empezar a escuchar"}
            >
              <Volume2 className="h-3.5 w-3.5" /> {listening ? "Parar escucha" : "Activar voz"}
            </button>
            <button
              onClick={() => doSpeak(`Hola, soy ${auroraName}. Estoy aquí para ayudarte en StarSeed.`)}
              disabled={!supported || !ready}
              className="axc-btn amber flex-1"
              title="Escuchar la voz actual"
            >
              <Sparkles className="h-3.5 w-3.5" /> Probar voz
            </button>
          </div>

          {!supported && ready && (
            <div className="text-center text-[10px] text-amber-300/70">
              Tu navegador no soporta voz. Aún puedes activar Aurora y gestionar sus sentidos en «Control».
            </div>
          )}
        </>
      ) : (
        /* ── Pestaña Registro: sesiones por día + resumen + exportar/limpiar ── */
        <>
          <div className="relative z-[1] flex flex-wrap items-center justify-between gap-2">
            <div className="axc-label flex items-center gap-1.5">
              <ScrollText className="h-3 w-3 text-[#7fb8ff]" />
              Registro local · {chatLog.total} mensajes
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { chatLog.exportJson(); }}
                disabled={chatLog.total === 0}
                className="axc-btn azure"
                title="Descargar todo el registro en JSON"
              >
                <FileJson className="h-3.5 w-3.5" /> JSON
              </button>
              <button
                onClick={() => { chatLog.exportMarkdown(); }}
                disabled={chatLog.total === 0}
                className="axc-btn amber"
                title="Descargar todo el registro en Markdown"
              >
                <FileText className="h-3.5 w-3.5" /> MD
              </button>
              <button
                onClick={onClearLog}
                disabled={chatLog.total === 0}
                className="axc-btn crimson"
                title="Borrar todo el registro local"
              >
                <Trash2 className="h-3.5 w-3.5" /> Limpiar
              </button>
            </div>
          </div>

          <p className="relative z-[1] text-[10px] leading-relaxed text-white/35">
            Cada mensaje con Aurora (voz o texto) se guarda solo en este dispositivo
            (localStorage, últimos 500), agrupado en sesiones por día.
          </p>

          {chatLog.sessions.length === 0 ? (
            <div className="axc-card relative z-[1] flex flex-col items-center gap-1.5 px-4 py-8 text-center">
              <ScrollText className="h-5 w-5 text-white/25" />
              <p className="text-[11px] leading-relaxed text-white/40">
                Aún no hay conversaciones registradas. Todo lo que hables o escribas con
                {" "}{auroraName} quedará guardado aquí automáticamente.
              </p>
            </div>
          ) : (
            <div className="axc-scroll relative z-[1] max-h-80 space-y-2 overflow-y-auto pr-1">
              {chatLog.sessions.map((s) => {
                const sum = chatLog.summaryOf(s.day);
                const isOpen = openDay === s.day;
                return (
                  <div key={s.day} className="axc-card overflow-hidden">
                    <button
                      onClick={() => setOpenDay(isOpen ? null : s.day)}
                      className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2.5 text-left"
                      title={isOpen ? "Ocultar esta sesión" : "Ver esta sesión"}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-white/85 first-letter:uppercase">
                          {dayLabel(s.day)}{" "}
                          <span className="font-normal text-white/35">
                            · {sum?.total ?? s.entries.length} mensajes
                            {sum ? ` (${sum.user} tú · ${sum.aurora} Aurora)` : ""}
                          </span>
                        </div>
                        {sum && (
                          <div className="truncate text-[10px] text-white/40">
                            «{sum.firstText}» → «{sum.lastText}»
                          </div>
                        )}
                      </div>
                      {sum && (
                        <span className="shrink-0 font-mono text-[9px] text-white/30">
                          {fmtTime(sum.startTs)}–{fmtTime(sum.endTs)}
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-white/40 transition-transform duration-200",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div className="border-t border-white/5">
                        <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
                          <span className="axc-label">Sesión del {dayLabel(s.day)}</span>
                          <button
                            onClick={() => openSessionInChat(s.day, s.entries)}
                            className="axc-btn azure"
                            title="Abrir este contexto en la vista de chat"
                          >
                            <MessageSquare className="h-3.5 w-3.5" /> Abrir en chat
                          </button>
                        </div>
                        <div className="axc-scroll flex max-h-56 flex-col gap-1.5 overflow-y-auto px-3.5 py-2.5">
                          {s.entries.map((m, i) => (
                            <div key={`${m.ts}-${i}`} className={cn("axc-msg small", m.role === "user" ? "user" : "aurora")}>
                              <div className="axc-role">
                                {m.role === "user" ? "Tú" : auroraName} · {fmtTime(m.ts)}
                              </div>
                              {m.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Overlay a pantalla completa (2 columnas en escritorio) ── */}
      <AuroraChatFullscreen
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        speaking={speaking && !paused}
        listening={listening}
        statusLine={statusLine}
        auroraName={auroraName}
        visibleConvo={visibleConvo}
        interim={interim}
        loadedSession={loadedSession}
        actionLog={actionLog}
        paused={paused}
        draft={draft}
        setDraft={setDraft}
        onSubmitDraft={() => { void submitDraft(); }}
        onExitLoadedSession={exitLoadedSession}
        onAttachFile={handleAttachFile}
        onPause={tPause}
        onResume={tResume}
        onSkipBack={tSkipB}
        onSkipForward={tSkipF}
        onInterrupt={tInterrupt}
        tree={tree}
        onOpenContext={openContext}
        fmtTime={fmtTime}
        dayLabel={dayLabel}
        onBranchFromMessage={branchFromMessage}
        onRetryMessage={retryMessage}
      />
    </div>
  );
}

export default AuroraChatSection;
