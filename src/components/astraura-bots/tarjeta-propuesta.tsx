"use client";

/**
 * Tarjeta de propuesta del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3).
 * Junto a la orbe del bot mientras su bucle está en `esperando`: el Exocórtex propone y la
 * persona decide. Dice QUÉ va a hacer en palabras, POR QUÉ (`decision.motivo`) y de qué
 * riesgo, y según `requiere` ofrece «Confirmar»/«Rechazar», «Llevar a votación» (la
 * operación la dará BOT1011J1) o el diálogo de permiso de BOT1011E2. Aquí se monta también
 * el `IndicadorSentidos` (BOT1011E2): ningún sentido encendido sin indicador visible.
 */
import { useState } from "react";
import { Check, ShieldCheck, Vote, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { META_ACCION, type AccionBot, type Riesgo } from "@/lib/astraura-bots/acciones";
import type { EstadoBucle } from "@/lib/astraura-bots/bucle";
import type { PosOrbe } from "@/lib/astraura-bots/orbes";
import type { Bot, Sentido, TipoSesion } from "@/lib/astraura-bots/tipos";
import { DialogoConsentimiento } from "./dialogo-consentimiento";
import type { ResultadoConsentimiento } from "./sentidos-ui";
import { IndicadorSentidos } from "./indicador-sentidos";

/** Lo que hace falta para abrir el diálogo de consentimiento (BOT1011E2) que la decisión exija. */
export interface PermisoPendiente {
  bot: Bot;
  sentido: Sentido;
  sesion: TipoSesion;
  /** La persona concede: el diálogo ya pidió el permiso real del aparato (si lo pedía). */
  onConceder: (r: ResultadoConsentimiento) => void;
}

export interface TarjetaPropuestaProps {
  /** Estado del bucle del bot: solo se pinta con propuesta pendiente en `esperando`. */
  estado: EstadoBucle;
  nombreBot: string;
  onConfirmar: () => void;
  onRechazar: () => void;
  /** La operación de votación la dará BOT1011J1; sin él: «próximamente: votación de bots». */
  onVotacion?: () => void;
  /** Si `requiere` es `consentimiento` o `expreso`, los datos del diálogo de permiso. */
  permiso?: PermisoPendiente;
  /** El indicador se monta aquí: apagar un sentido o pausar el bot es la salida siempre. */
  onApagarSentido: (sentido: Sentido) => void;
  onPausarBot: () => void;
  /** Posición de la orbe del bot (ratios) para aparecer junto a ella; sin ella, esquina fija. */
  pos?: PosOrbe;
}

/** La acción en palabras, como el contrato §6.1: «Abrir Biblioteca», «Mover el widget Clima». */
export function fraseAccion(a: AccionBot): string {
  const args: Record<string, unknown> = a.args;
  const texto = (k: string) => (typeof args[k] === "string" ? (args[k] as string).slice(0, 60) : "");
  const con = (verbo: string, campo: string) => (texto(campo) ? `${verbo} «${texto(campo)}»` : verbo);
  switch (a.tipo) {
    case "navegar": return con("Abrir", "ruta");
    case "abrir-app": return con("Abrir la aplicación", "app");
    case "capa-pantalla": return "Poner una capa sobre la pantalla";
    case "widget.añadir": return con("Añadir un widget en", "tablero");
    case "widget.mover": return con("Mover el widget", "id");
    case "widget.quitar": return con("Quitar el widget", "id");
    case "mensaje.enviar": return con("Enviar un mensaje en", "canal");
    case "tarea.crear": return con("Crear la tarea", "titulo");
    case "codigo.proponer": return con("Proponer código en", "destino");
    default: return a.tipo;
  }
}

const COLOR_RIESGO: Record<Riesgo, string> = {
  bajo: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  medio: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  alto: "border-red-400/40 bg-red-500/10 text-red-200",
};

export function TarjetaPropuesta({
  estado, nombreBot, onConfirmar, onRechazar, onVotacion, permiso, onApagarSentido, onPausarBot, pos,
}: TarjetaPropuestaProps) {
  const [abierto, setAbierto] = useState(false);
  const p = estado.fase === "esperando" ? estado.pendiente : undefined;
  if (!p) return null;
  const requiere = p.decision.requiere;
  const conPermiso = requiere === "consentimiento" || requiere === "expreso";
  const donde = pos && { left: `calc(${Math.round(pos.xRatio * 10000) / 100}vw - 24px)`, top: `calc(${Math.round(pos.yRatio * 10000) / 100}vh - 40px)` };
  const frase = fraseAccion(p.accion);
  return (
    <aside data-testid="tarjeta-propuesta" aria-label={`Propuesta del bot: ${frase}`} style={donde}
      className={cn("fixed z-[60] w-64 space-y-2 rounded-xl border border-white/10 bg-zinc-950/95 p-3 text-xs text-zinc-100 shadow-xl", !pos && "bottom-20 right-4")}>
      <p className="text-sm font-medium">{frase}</p>
      <p className="text-white/70">{p.decision.motivo}</p>
      <span data-testid="riesgo" className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors duration-200", COLOR_RIESGO[META_ACCION[p.accion.tipo].riesgo])}>Riesgo: {META_ACCION[p.accion.tipo].riesgo}</span>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {requiere === "confirmacion" && (
          <button type="button" onClick={onConfirmar} className="flex cursor-pointer items-center gap-1 rounded-md bg-cyan-600 px-3 py-1.5 font-medium text-white transition-colors duration-200 hover:bg-cyan-500"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Confirmar</button>
        )}
        {requiere === "votacion" && (onVotacion ? (
          <button type="button" onClick={onVotacion} className="flex cursor-pointer items-center gap-1 rounded-md border border-cyan-400/50 px-3 py-1.5 font-medium text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/10"><Vote className="h-3.5 w-3.5" aria-hidden="true" /> Llevar a votación</button>
        ) : (
          <p className="text-white/60">próximamente: votación de bots</p>
        ))}
        {conPermiso && (permiso ? (
          <button type="button" onClick={() => setAbierto(true)} className="flex cursor-pointer items-center gap-1 rounded-md border border-cyan-400/50 px-3 py-1.5 font-medium text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/10"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Dar permiso</button>
        ) : (
          <p className="text-white/60">próximamente: pedir permiso del sentido</p>
        ))}
        <button type="button" onClick={onRechazar} className="flex cursor-pointer items-center gap-1 rounded-md border border-white/20 px-3 py-1.5 transition-colors duration-200 hover:bg-white/10"><X className="h-3.5 w-3.5" aria-hidden="true" /> Rechazar</button>
      </div>
      {conPermiso && permiso && (
        <DialogoConsentimiento bot={permiso.bot} sentido={permiso.sentido} sesion={permiso.sesion} abierto={abierto} onConceder={(r) => { setAbierto(false); permiso.onConceder(r); }} onDenegar={() => setAbierto(false)} />
      )}
      <div className="relative h-16 w-16" data-testid="indicador-en-tarjeta">
        <IndicadorSentidos estado={estado} nombreBot={nombreBot} onApagarSentido={onApagarSentido} onPausarBot={onPausarBot} />
      </div>
    </aside>
  );
}
