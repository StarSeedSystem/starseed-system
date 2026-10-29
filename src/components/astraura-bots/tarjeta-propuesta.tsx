"use client";

/**
 * Tarjeta de propuesta sobre la orbe (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3/§6.2).
 * Solo se ve cuando el bucle está EN ESPERA de una persona (`pendiente`): qué quiere hacer el bot
 * en palabras, por qué (`decision.motivo`) y su riesgo en pastilla. Según `requiere`:
 * «Confirmar»/«Rechazar» · `votacion` → «Llevar a votación» (la operación exacta la dará
 * BOT1011J1 vía `proponer`, genesis/entidades.ts; sin ella se muestra «próximamente»)
 * · `consentimiento`/`expreso` → abre el diálogo de BOT1011E2. Monta el indicador de sentidos:
 * ningún sentido encendido sin su anillo visible.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { META_ACCION, type AccionBot } from "@/lib/astraura-bots/acciones";
import type { EstadoBucle } from "@/lib/astraura-bots/bucle";
import type { Bot, Sentido, TipoSesion } from "@/lib/astraura-bots/tipos";
import { IndicadorSentidos } from "./indicador-sentidos";
import { DialogoConsentimiento, type ResultadoConsentimiento } from "./dialogo-consentimiento";

export interface TarjetaPropuestaProps {
  /** Estado del bucle del bot (la propuesta que espera a una persona). */
  estado: EstadoBucle;
  bot: Bot;
  onConfirmar: () => void;
  onRechazar: () => void;
  /** La operación la dará BOT1011J1 («Llevar a votación» → `proponer`); sin ella no hay botón. */
  onVotacion?: () => void;
  /** La persona concede un sentido: lo entrega el puente de sentidos (BOT1011F). */
  onConceder?: (r: ResultadoConsentimiento) => void;
  /** Se pasa al diálogo de consentimiento (la sesión pública exige permiso expreso). */
  sesion?: TipoSesion;
  /** Tocar un icono del anillo apaga ese sentido (BOT1011E2). */
  onApagarSentido?: (sentido: Sentido) => void;
  /** Salida siempre: pausar el bot apaga todos los sentidos y suelta la propuesta. */
  onPausarBot?: () => void;
}

/** Lo que el bot quiere, dicho en palabras (nunca el vocabulario crudo de la acción). */
export function accionEnPalabras(a: AccionBot): string {
  const t = (k: string): string => (typeof a.args[k] === "string" ? (a.args[k] as string) : "");
  const bonito = (v: string): string =>
    v.replace(/[-_:.]+/g, " ").split(" ").filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  switch (a.tipo) {
    case "navegar": return `Ir a la página ${t("ruta")}`;
    case "abrir-app": return `Abrir ${bonito(t("app"))}`;
    case "capa-pantalla": return "Poner una capa sobre la pantalla";
    case "widget.añadir": return "Añadir un widget al tablero";
    case "widget.mover": return bonito(t("id")) ? `Mover el widget ${bonito(t("id"))}` : "Mover un widget";
    case "widget.quitar": return "Quitar un widget del tablero";
    case "pizarra.operar": return "Editar una pizarra";
    case "dashboard.editar": return "Editar un tablero";
    case "escritorio.organizar": return "Organizar el escritorio";
    case "pagina.editar": return "Editar una página";
    case "ajuste.proponer": return `Cambiar el ajuste «${t("campo")}»`;
    case "ui.proponer": return "Proponer un cambio de interfaz";
    case "protomolecula.operar": return "Operar la Protomolécula";
    case "xr.intencion": return `Decir en XR: «${t("frase")}»`;
    case "codigo.proponer": return `Proponer código para ${bonito(t("destino"))}`;
    case "computadora.ejecutar": return "Dar una orden en su computadora";
    case "mensaje.enviar": return "Enviar un mensaje";
    case "publicacion.borrador": return "Preparar un borrador de publicación";
    case "tarea.crear": return `Crear su tarea «${t("titulo")}»`;
    case "memoria.recordar": return "Guardar un recuerdo";
    case "notificar": return "Enviar una notificación";
    case "imagen.generar": return "Generar una imagen";
    default:
      return a.tipo.startsWith("robot.")
        ? `Pedir al robot que ${a.tipo.replace("robot.", "").replace("-", " ")}`
        : "Hacer algo en el OS";
  }
}

/** Pastilla de riesgo de la acción (colores sobrios del OS). */
const RIESGO_CLASE = {
  bajo: "border-emerald-300/40 bg-emerald-500/10 text-emerald-200",
  medio: "border-amber-300/40 bg-amber-500/10 text-amber-200",
  alto: "border-red-300/40 bg-red-500/10 text-red-200",
} as const;

export function TarjetaPropuesta({
  estado, bot, onConfirmar, onRechazar, onVotacion, onConceder, sesion = "privada", onApagarSentido, onPausarBot,
}: TarjetaPropuestaProps) {
  const [pidePermiso, setPidePermiso] = useState(false);
  const pendiente = estado.fase === "esperando" ? estado.pendiente : undefined;
  if (!pendiente) return null;
  const { accion, decision } = pendiente;
  const meta = META_ACCION[accion.tipo];
  const requiere = decision.requiere;
  const conSentido = requiere === "consentimiento" || requiere === "expreso";
  const pideUnSentido = conSentido && Boolean(meta.sentido);
  const indicador = estado.sentidosActivos.length > 0 &&
    typeof onApagarSentido === "function" && typeof onPausarBot === "function";
  return (
    <>
      <div role="status" aria-label={`Propuesta de ${bot.nombre}`} data-testid="tarjeta-propuesta"
        className="z-50 w-72 space-y-2 rounded-xl border border-white/15 bg-zinc-950/90 p-3 text-zinc-100 shadow-xl">
        <p className="text-sm font-medium leading-snug">{accionEnPalabras(accion)}</p>
        <p className="text-xs leading-snug text-zinc-400">{decision.motivo}</p>
        <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide", RIESGO_CLASE[meta.riesgo])}>
          riesgo {meta.riesgo}
        </span>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {requiere === "votacion" ? (
            typeof onVotacion === "function" ? (
              <button type="button" onClick={onVotacion} aria-label="Llevar la propuesta a votación"
                title="PoliGenesis: lo deciden quienes forman la entidad"
                className="cursor-pointer rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-cyan-500">
                Llevar a votación
              </button>
            ) : (
              <p className="text-[11px] italic text-zinc-500">próximamente: votación de bots</p>
            )
          ) : null}
          {pideUnSentido ? (
            <button type="button" onClick={() => setPidePermiso(true)} aria-label="Dar permiso al bot"
              title="Qué verá y para qué: tú decides cuánto dura"
              className="cursor-pointer rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-cyan-500">
              Dar permiso
            </button>
          ) : !pideUnSentido && requiere !== "votacion" ? (
            <button type="button" onClick={onConfirmar} aria-label="Confirmar la propuesta del bot"
              title="El bot aplica y queda en el registro con su deshacer"
              className="cursor-pointer rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-cyan-500">
              Confirmar
            </button>
          ) : null}
          <button type="button" onClick={onRechazar} aria-label="Rechazar la propuesta del bot"
            title="La propuesta se suelta y queda en el registro"
            className="cursor-pointer rounded-md border border-white/20 px-3 py-1.5 text-xs transition-colors duration-200 hover:bg-white/10">
            Rechazar
          </button>
        </div>
      </div>
      {indicador ? (
        <div className="relative">
          <IndicadorSentidos estado={estado} nombreBot={bot.nombre}
            onApagarSentido={onApagarSentido} onPausarBot={onPausarBot} />
        </div>
      ) : null}
      {pideUnSentido && pidePermiso && meta.sentido ? (
        <DialogoConsentimiento bot={bot} sentido={meta.sentido} sesion={sesion} abierto={pidePermiso}
          onConceder={(r) => { setPidePermiso(false); onConceder?.(r); }}
          onDenegar={() => setPidePermiso(false)} />
      ) : null}
    </>
  );
}
