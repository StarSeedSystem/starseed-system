"use client";

/**
 * Tarjeta de propuesta del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3).
 *
 * Aparece junto a la orbe cuando el bucle está en `esperando`: qué quiere hacer en palabras
 * («Abrir Biblioteca», «Mover el widget Clima»), por qué (`decision.motivo`), la pastilla de
 * riesgo y, según `requiere`: «Confirmar»/«Rechazar»; `votacion` → «Llevar a votación» (la
 * operación la dará BOT1011J1; mientras tanto «próximamente»); `consentimiento`/`expreso` →
 * el diálogo de BOT1011E2. Monta también el IndicadorSentidos. Nada se ejecuta aquí.
 */
import { useState } from "react";
import { DialogoConsentimiento } from "./dialogo-consentimiento";
import { DIAMETRO_ANILLO, IndicadorSentidos } from "./indicador-sentidos";
import type { ResultadoConsentimiento } from "./sentidos-ui";
import type { EstadoBucle } from "@/lib/astraura-bots/bucle";
import { META_ACCION, type AccionBot, type Riesgo } from "@/lib/astraura-bots/acciones";
import type { Bot, Sentido, TipoSesion } from "@/lib/astraura-bots/tipos";

const txt = (a: AccionBot, k: string): string => (typeof a.args[k] === "string" ? (a.args[k] as string) : "");

/** Qué quiere hacer el bot, en palabras, a partir de su acción tipada. */
export function palabras(a: AccionBot): string {
  switch (a.tipo) {
    case "navegar": return txt(a, "ruta") ? `Ir a ${txt(a, "ruta")}` : "Ir a una página del OS";
    case "abrir-app": return txt(a, "app") ? `Abrir ${txt(a, "app")}` : "Abrir una app";
    case "widget.añadir": return txt(a, "tipo") ? `Añadir el widget ${txt(a, "tipo")}` : "Añadir un widget";
    case "widget.mover": return txt(a, "id") ? `Mover el widget ${txt(a, "id")}` : "Mover un widget";
    case "widget.quitar": return txt(a, "id") ? `Quitar el widget ${txt(a, "id")}` : "Quitar un widget";
    case "mensaje.enviar": return txt(a, "canal") ? `Enviar un mensaje en ${txt(a, "canal")}` : "Enviar un mensaje";
    case "notificar": return txt(a, "texto") ? `Avisarte: ${txt(a, "texto")}` : "Avisarte";
    default: return txt(a, "texto") || `Acción «${a.tipo}»`;
  }
}

const ETIQUETA_RIESGO: Record<Riesgo, string> = { bajo: "Riesgo bajo", medio: "Riesgo medio", alto: "Riesgo alto" };
const CLASE_RIESGO: Record<Riesgo, string> = {
  bajo: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200", medio: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  alto: "border-red-400/40 bg-red-400/10 text-red-200",
};

export interface TarjetaPropuestaProps {
  estado: EstadoBucle;
  /** Confirmar (o, en `consentimiento`/`expreso` sin diálogo inyectado, conformar igualmente). */
  onConfirmar: () => void;
  /** Rechazar: soltar la propuesta. */
  onRechazar: () => void;
  /** «Llevar a votación»: llega de BOT1011J1 con `proponer` de `genesis/entidades.ts`. */
  onVotacion?: () => void;
  /** Bot y sesión para abrir el diálogo de consentimiento (BOT1011E2). */
  consentimiento?: { bot: Bot; sesion: TipoSesion };
  onConcederConsentimiento?: (r: ResultadoConsentimiento) => void;
  /** El indicador de sentidos se monta aquí (BOT1011E2). */
  onApagarSentido?: (s: Sentido) => void;
  onPausarBot?: () => void;
}

export function TarjetaPropuesta({ estado, onConfirmar, onRechazar, onVotacion, consentimiento, onConcederConsentimiento, onApagarSentido, onPausarBot }: TarjetaPropuestaProps) {
  const [dialogo, setDialogo] = useState(false);
  const pendiente = estado.pendiente;
  const conSentidos = estado.sentidosActivos.length > 0 && Boolean(onApagarSentido) && Boolean(onPausarBot);
  if (!pendiente && !conSentidos) return null;
  const requiere = pendiente?.decision.requiere;
  const meta = pendiente ? META_ACCION[pendiente.accion.tipo] : null;
  // El diálogo necesita el sentido real: lo da la meta de la acción pendiente.
  const enConsentimiento = requiere === "consentimiento" || requiere === "expreso";
  const hayDialogo = Boolean(consentimiento && meta?.sentido);
  return (
    <>
      {conSentidos && (
        <div className="relative" style={{ width: DIAMETRO_ANILLO, height: DIAMETRO_ANILLO }}>
          <IndicadorSentidos estado={estado} onApagarSentido={onApagarSentido!} onPausarBot={onPausarBot!} />
        </div>
      )}
      {pendiente && (
        <div data-testid="tarjeta-propuesta" role="region" aria-label="Propuesta del bot"
          className="w-64 space-y-2 rounded-xl border border-cyan-200/30 bg-zinc-950/90 p-4 text-zinc-100 shadow-xl">
          <p data-testid="propuesta-que" className="text-sm font-semibold">{palabras(pendiente.accion)}</p>
          <p className="text-xs text-white/60">{pendiente.decision.motivo}</p>
          {meta && (
            <span data-testid="propuesta-riesgo"
              className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${CLASE_RIESGO[meta.riesgo]}`}>
              {ETIQUETA_RIESGO[meta.riesgo]}
            </span>
          )}
          <div className="flex flex-col gap-2 pt-1">
            {requiere === "votacion" ? (
              onVotacion ? (
                <button type="button" data-testid="boton-votacion" onClick={onVotacion}
                  className="cursor-pointer rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium transition-colors duration-200 hover:bg-cyan-500">
                  Llevar a votación
                </button>
              ) : (
                <span data-testid="propuesta-proximamente"
                  className="cursor-not-allowed rounded-md border border-white/15 px-3 py-2 text-center text-xs text-white/50">
                  Próximamente: votación de bots
                </span>
              )
            ) : (
              <button type="button" data-testid="boton-confirmar"
                onClick={enConsentimiento && hayDialogo ? () => setDialogo(true) : onConfirmar}
                className="cursor-pointer rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium transition-colors duration-200 hover:bg-cyan-500">
                Confirmar
              </button>
            )}
            <button type="button" data-testid="boton-rechazar" onClick={onRechazar}
              className="cursor-pointer rounded-md border border-white/20 px-3 py-2 text-sm transition-colors duration-200 hover:bg-white/10">
              Rechazar
            </button>
          </div>
          {dialogo && hayDialogo && consentimiento && (
            <DialogoConsentimiento bot={consentimiento.bot} sentido={meta!.sentido!} sesion={consentimiento.sesion}
              abierto onDenegar={() => setDialogo(false)}
              onConceder={(r: ResultadoConsentimiento) => { setDialogo(false); onConcederConsentimiento?.(r); }} />
          )}
        </div>
      )}
    </>
  );
}
