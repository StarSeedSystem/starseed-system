"use client";
/**
 * Tarjeta de propuesta del bot (BOT1011H2 · contrato §5.3, §6.2). Sale junto a la orbe cuando
 * el bucle está «esperando»: qué quiere hacer, por qué, riesgo y —según `requiere`— Confirmar /
 * Rechazar, «Llevar a votación» o el diálogo de consentimiento (BOT1011E2). Monta el
 * IndicadorSentidos: ningún sentido encendido sin indicador visible.
 */
import { useState } from "react";
import { Check, Vote, X } from "lucide-react";
import { META_ACCION, type AccionBot, type MetaAccion, type Riesgo } from "@/lib/astraura-bots/acciones";
import type { Decision } from "@/lib/astraura-bots/permisos";
import type { EstadoBucle } from "@/lib/astraura-bots/bucle";
import type { Bot, Sentido, TipoSesion } from "@/lib/astraura-bots/tipos";
import { IndicadorSentidos } from "./indicador-sentidos";
import { DialogoConsentimiento, type ResultadoConsentimiento } from "./dialogo-consentimiento";
import { NOMBRE_SENTIDO } from "./sentidos-ui";

/** La acción en palabras; lo que no está en la tabla dice su tipo (nunca se queda en blanco). */
const FRASE_ACCION: Partial<Record<string, string>> = {
  navegar: "Ir a una página",
  "capa-pantalla": "Poner una capa sobre la pantalla",
  "widget.añadir": "Añadir un widget",
  "widget.mover": "Mover un widget",
  "widget.quitar": "Quitar un widget",
  notificar: "Enviarte una notificación",
  "publicacion.borrador": "Preparar un borrador de publicación",
  "pagina.editar": "Editar una página",
};

const CLASE_BOTON = "flex cursor-pointer items-center gap-1 rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-cyan-500";
const CLASE_BOTON_NEUTRO = "flex cursor-pointer items-center gap-1 rounded-md border border-white/20 px-3 py-1.5 text-xs transition-colors duration-200 hover:bg-white/10";

const COLOR_RIESGO: Record<Riesgo, string> = {
  bajo: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
  medio: "bg-amber-500/15 text-amber-300 border-amber-400/40",
  alto: "bg-red-500/15 text-red-300 border-red-400/40",
};

/** Lo que no está en el vocabulario se pinta con prudencia y sin deshacer, nunca revienta. */
const META_SEGURA: MetaAccion = { riesgo: "alto", persistente: true, invitado: false, deshacer: "no",
  campos: {}, obligatorios: [], via: "sin destino: acción fuera del vocabulario" };

export function metaDeAccion(tipo: string): MetaAccion {
  return (META_ACCION as Record<string, MetaAccion | undefined>)[tipo] ?? META_SEGURA;
}

/** Lo que la persona entiende: «Abrir Biblioteca», «Mover el widget Clima». */
export function fraseDeAccion(a: AccionBot): string {
  const id = typeof a.args.id === "string" ? a.args.id : "";
  if (a.tipo === "widget.mover" && id) return `Mover el widget ${id}`;
  if (a.tipo === "widget.añadir" && id) return `Añadir el widget ${id}`;
  const app = typeof a.args.app === "string" ? a.args.app : "";
  if (a.tipo === "abrir-app") return app ? `Abrir ${app.charAt(0).toUpperCase()}${app.slice(1)}` : "Abrir una aplicación";
  return FRASE_ACCION[a.tipo] ?? a.tipo;
}

const pideConsentimiento = (d: Decision): boolean =>
  d.requiere === "consentimiento" || d.requiere === "expreso";

export interface TarjetaPropuestaProps {
  /** Estado del bucle: la tarjeta solo sale si hay una propuesta pendiente esperando. */
  estado: EstadoBucle;
  nombreBot?: string;
  onConfirmar: () => void;
  onRechazar: () => void;
  onApagarSentido: (sentido: Sentido) => void;
  onPausarBot: () => void;
  /** BOT1011J1 pasará aquí la operación de votación; hasta entonces «próximamente». */
  onLlevarAVotacion?: () => void;
  /** Con bot y sentido, «consentimiento»/«expreso» abre el diálogo de BOT1011E2. */
  botConsentimiento?: Bot;
  sentidoConsentimiento?: Sentido;
  sesionConsentimiento?: TipoSesion;
  onConceder?: (r: ResultadoConsentimiento) => void;
}

export function TarjetaPropuesta({
  estado, nombreBot = "Astraura", onConfirmar, onRechazar, onApagarSentido, onPausarBot,
  onLlevarAVotacion, botConsentimiento, sentidoConsentimiento, sesionConsentimiento = "privada", onConceder,
}: TarjetaPropuestaProps) {
  const [consentimientoAbierto, setConsentimientoAbierto] = useState(false);
  const indicador = <IndicadorSentidos estado={estado} nombreBot={nombreBot} onApagarSentido={onApagarSentido} onPausarBot={onPausarBot} />;
  const pendiente = estado.pendiente;
  if (estado.fase !== "esperando" || !pendiente) return indicador;
  const { accion, decision } = pendiente;
  const meta = metaDeAccion(accion.tipo);
  const pideDialogo = pideConsentimiento(decision) && botConsentimiento && sentidoConsentimiento;
  return (
    <>
      {botConsentimiento && sentidoConsentimiento ? (
        <DialogoConsentimiento bot={botConsentimiento} sentido={sentidoConsentimiento} sesion={sesionConsentimiento}
          abierto={consentimientoAbierto}
          onConceder={(r) => { setConsentimientoAbierto(false); onConceder?.(r); onConfirmar(); }}
          onDenegar={() => { setConsentimientoAbierto(false); onRechazar(); }} />
      ) : null}
      {indicador}
      <div role="dialog" aria-label={`Propuesta de ${nombreBot}`}
        className="pointer-events-auto absolute left-1/2 top-full z-50 mt-3 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-950/95 p-4 text-sm text-zinc-100 shadow-xl">
        <p className="font-semibold">{nombreBot} quiere hacer una cosa</p>
        <p className="mt-1">{fraseDeAccion(accion)}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs ${COLOR_RIESGO[meta.riesgo]}`}>Riesgo {meta.riesgo}</span>
          <span className="text-xs text-white/60">{meta.deshacer === "no" ? "No se puede deshacer" : "Se puede deshacer"}</span>
        </div>
        <p className="mt-2 text-xs text-white/70">{decision.motivo}</p>
        <div className="mt-3 flex justify-end gap-2">
          {decision.requiere === "votacion" ? (
            onLlevarAVotacion ? <button onClick={onLlevarAVotacion} className={CLASE_BOTON}><Vote className="h-3.5 w-3.5" aria-hidden="true" /> Llevar a votación</button>
              : <span className="text-xs text-white/50">próximamente: votación de bots</span>
          ) : pideDialogo ? (
            <button onClick={() => setConsentimientoAbierto(true)} className={CLASE_BOTON}><Check className="h-3.5 w-3.5" aria-hidden="true" /> Permitir {NOMBRE_SENTIDO[sentidoConsentimiento]}</button>
          ) : (
            <button onClick={onConfirmar} className={CLASE_BOTON}><Check className="h-3.5 w-3.5" aria-hidden="true" /> Confirmar</button>
          )}
          <button onClick={onRechazar} className={CLASE_BOTON_NEUTRO}><X className="h-3.5 w-3.5" aria-hidden="true" /> Rechazar</button>
        </div>
      </div>
    </>
  );
}
