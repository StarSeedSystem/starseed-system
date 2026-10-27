"use client";
/**
 * Tarjeta de propuesta del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3, §6.2).
 *
 * Aparece junto a la orbe cuando el bucle está en «esperando»: qué quiere hacer el bot (en
 * palabras), por qué (`decision.motivo`), riesgo en pastilla y, según `requiere`: Confirmar /
 * Rechazar («confirmacion»), «Llevar a votación» («votacion», mientras BOT1011J1 no dé la
 * operación se muestra «próximamente») o el diálogo de consentimiento (BOT1011E2). También
 * monta el IndicadorSentidos: ningún sentido encendido sin indicador visible.
 */
import { useState } from "react";
import { Check, RotateCcw, Vote, X } from "lucide-react";
import { META_ACCION, type AccionBot, type Riesgo } from "@/lib/astraura-bots/acciones";
import type { Decision } from "@/lib/astraura-bots/permisos";
import type { EstadoBucle } from "@/lib/astraura-bots/bucle";
import type { Bot, TipoSesion } from "@/lib/astraura-bots/tipos";
import { IndicadorSentidos } from "./indicador-sentidos";
import { DialogoConsentimiento, type ResultadoConsentimiento } from "./dialogo-consentimiento";
import { NOMBRE_SENTIDO } from "./sentidos-ui";
import type { Sentido } from "@/lib/astraura-bots/tipos";

/** La acción en palabras (texto visible), configurable; lo que no está, dice su tipo. */
const FRASE_ACCION: Partial<Record<string, string>> = {
  "abrir-app": "Abrir una aplicación",
  navegar: "Ir a una página",
  "widget.mover": "Mover un widget",
  "widget.añadir": "Añadir un widget",
  "widget.quitar": "Quitar un widget",
  "capa-pantalla": "Poner una capa sobre la pantalla",
  notificar: "Enviarte una notificación",
  "publicacion.borrador": "Preparar un borrador de publicación",
  "pagina.editar": "Editar una página",
};

const COLOR_RIESGO: Record<Riesgo, string> = {
  bajo: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
  medio: "bg-amber-500/15 text-amber-300 border-amber-400/40",
  alto: "bg-red-500/15 text-red-300 border-red-400/40",
};

export interface TarjetaPropuestaProps {
  /** Estado del bucle: la tarjeta solo sale si hay una propuesta pendiente esperando. */
  estado: EstadoBucle;
  nombreBot?: string;
  onConfirmar: () => void;
  onRechazar: () => void;
  /** Callbacks del indicador de sentidos (siempre visibles mientras haya un sentido encendido). */
  onApagarSentido: (sentido: Sentido) => void;
  onPausarBot: () => void;
  /** Cuándo BOT1011J1 dé la operación de votación, se pasa aquí; hasta entonces «próximamente». */
  onLlevarAVotacion?: () => void;
  /** Si llega el bot y el sentido, «consentimiento»/«expreso» abre el diálogo de BOT1011E2. */
  botConsentimiento?: Bot;
  sentidoConsentimiento?: Sentido;
  sesionConsentimiento?: TipoSesion;
  onConceder?: (r: ResultadoConsentimiento) => void;
}

/** Palabras de la acción: el texto que la persona entiende («Mover el widget Clima»). */
export function fraseDeAccion(a: AccionBot): string {
  const base = FRASE_ACCION[a.tipo] ?? a.tipo;
  const widget = typeof a.args.id === "string" ? a.args.id : "";
  return a.tipo === "widget.mover" && widget ? `Mover el widget ${widget}` : base;
}

export function TarjetaPropuesta({
  estado, nombreBot = "Astraura", onConfirmar, onRechazar, onApagarSentido, onPausarBot,
  onLlevarAVotacion, botConsentimiento, sentidoConsentimiento, sesionConsentimiento = "privada",
  onConceder,
}: TarjetaPropuestaProps) {
  const [consentimientoAbierto, setConsentimientoAbierto] = useState(false);
  const pendiente = estado.pendiente;
  // Solo cuando el bucle ESPERA a una persona: sin pendiente no se pinta nada.
  if (estado.fase !== "esperando" || !pendiente) return <IndicadorSentidos estado={estado} nombreBot={nombreBot} onApagarSentido={onApagarSentido} onPausarBot={onPausarBot} />;
  const { accion, decision } = pendiente;
  const meta = META_ACCION[accion.tipo];
  const consentido = (decision.requiere === "consentimiento" || decision.requiere === "expreso") && botConsentimiento && sentidoConsentimiento;
  return (
    <>
      {botConsentimiento && sentidoConsentimiento ? (
        <DialogoConsentimiento
          bot={botConsentimiento} sentido={sentidoConsentimiento} sesion={sesionConsentimiento}
          abierto={consentimientoAbierto}
          onConceder={(r) => { setConsentimientoAbierto(false); onConceder?.(r); onConfirmar(); }}
          onDenegar={() => { setConsentimientoAbierto(false); onRechazar(); }}
        />
      ) : null}
      <IndicadorSentidos estado={estado} nombreBot={nombreBot} onApagarSentido={onApagarSentido} onPausarBot={onPausarBot} />
      <div
        role="dialog" aria-label={`Propuesta de ${nombreBot}`}
        className="pointer-events-auto absolute left-1/2 top-full z-50 mt-3 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-950/95 p-4 text-sm text-zinc-100 shadow-xl"
      >
        <p className="font-semibold">{nombreBot} quiere hacer una cosa</p>
        <p className="mt-1">{fraseDeAccion(accion)}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs ${COLOR_RIESGO[meta.riesgo]}`}>Riesgo {meta.riesgo}</span>
          <span className="text-xs text-white/60">{meta.deshacer === "no" ? "No se puede deshacer" : "Se puede deshacer"}</span>
        </div>
        <p className="mt-2 text-xs text-white/70">{decision.motivo}</p>
        <div className="mt-3 flex justify-end gap-2">
          {decision.requiere === "votacion" ? (
            onLlevarAVotacion ? (
              <button onClick={onLlevarAVotacion} className="flex cursor-pointer items-center gap-1 rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-cyan-500">
                <Vote className="h-3.5 w-3.5" aria-hidden="true" /> Llevar a votación
              </button>
            ) : (
              <span className="text-xs text-white/50">próximamente: votación de bots</span>
            )
          ) : consentido ? (
            <button onClick={() => setConsentimientoAbierto(true)} className="flex cursor-pointer items-center gap-1 rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-cyan-500">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Permitir {NOMBRE_SENTIDO[sentidoConsentimiento]}
            </button>
          ) : (
            <button onClick={onConfirmar} className="flex cursor-pointer items-center gap-1 rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-cyan-500">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Confirmar
            </button>
          )}
          <button onClick={onRechazar} className="flex cursor-pointer items-center gap-1 rounded-md border border-white/20 px-3 py-1.5 text-xs transition-colors duration-200 hover:bg-white/10">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Rechazar
          </button>
        </div>
      </div>
    </>
  );
}
