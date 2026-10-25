"use client";

/**
 * Tarjeta de propuesta junto a la orbe (BOT1011H2 · contrato astraura-bots §5.3 y §6).
 *
 * Cuando el bucle del bot queda en `esperando`, hay una propuesta que una persona debe
 * resolver: la tarjeta dice QUÉ quiere hacer (en palabras), POR QUÉ (motivo de la decisión,
 * §6.2) y su riesgo en una pastilla, y ofrece según lo que `requiere` la decisión:
 * «Confirmar» / «Rechazar», «Llevar a votación» (se conectará a `proponer` de PoliGenesis,
 * BOT1011J1; hasta entonces «próximamente: votación de bots») o dar permiso (diálogo de
 * consentimiento de BOT1011E2). También monta aquí el `IndicadorSentidos` (§5.2).
 */
import { indicadorVisible, type EstadoBucle } from "@/lib/astraura-bots/bucle";
import { META_ACCION, type AccionBot, type Riesgo, type TipoAccion } from "@/lib/astraura-bots/acciones";
import { IndicadorSentidos } from "./indicador-sentidos";
import type { Sentido } from "@/lib/astraura-bots/tipos";

/** El vocabulario cerrado (§6.1), dicho en palabras. */
export const NOMBRE_ACCION: Record<TipoAccion, string> = {
  navegar: "Ir a una página", "abrir-app": "Abrir una app", "capa-pantalla": "Anotar algo sobre la pantalla",
  "widget.añadir": "Añadir un widget", "widget.mover": "Mover un widget", "widget.quitar": "Quitar un widget",
  "pizarra.operar": "Editar una pizarra", "dashboard.editar": "Editar un tablero", "escritorio.organizar": "Organizar el escritorio",
  "pagina.editar": "Editar una página", "ajuste.proponer": "Proponer un ajuste", "ui.proponer": "Proponer una pieza de interfaz",
  "protomolecula.operar": "Operar la Protomolécula", "xr.intencion": "Actuar en el espacio XR",
  "codigo.proponer": "Proponer código (candidato)", "computadora.ejecutar": "Ejecutar una orden en su computadora",
  "mensaje.enviar": "Enviar un mensaje", "publicacion.borrador": "Preparar una publicación", "tarea.crear": "Crear una tarea",
  "memoria.recordar": "Guardar un recuerdo", notificar: "Avisarte", "imagen.generar": "Generar una imagen",
  "robot.caminar": "Hacer caminar al robot", "robot.girar": "Hacer girar al robot", "robot.emocion": "Dar una emoción al robot",
  "robot.bailar": "Hacer bailar al robot", "robot.negacion": "Decir que no con el robot", "robot.alto": "Parar al robot",
};

/** La acción dicha en palabras, con su argumento cuando lo aclara: «Abrir la app «Biblioteca»». */
export function describirAccion(a: AccionBot): string {
  const id = String(a.args.app ?? a.args.id ?? a.args.ruta ?? "");
  if (a.tipo === "abrir-app") return `Abrir la app «${id}»`;
  if (a.tipo === "navegar") return `Ir a «${id}»`;
  if (a.tipo === "widget.mover") return `Mover el widget «${id}»`;
  if (a.tipo === "widget.añadir") return `Añadir el widget «${id}»`;
  if (a.tipo === "widget.quitar") return `Quitar el widget «${id}»`;
  return NOMBRE_ACCION[a.tipo];
}

/** El riesgo en pastilla (§6.1): siempre a la vista. */
export const TEXTO_RIESGO: Record<Riesgo, string> = {
  bajo: "Riesgo bajo", medio: "Riesgo medio", alto: "Riesgo alto",
};
export const CLASE_RIESGO: Record<Riesgo, string> = {
  bajo: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  medio: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  alto: "border-red-400/40 bg-red-500/10 text-red-200",
};

export interface AccionesTarjetaPropuesta {
  confirmar: () => void;
  rechazar: () => void;
  abrirConsentimiento: () => void;
  apagarSentido: (sentido: Sentido) => void;
  pausarBot: () => void;
  votacion?: () => void;
}

export interface TarjetaPropuestaProps {
  estado: EstadoBucle;
  nombreBot: string;
  acciones: AccionesTarjetaPropuesta;
  mostrarIndicador?: boolean;
}

export function TarjetaPropuesta({ estado, nombreBot, acciones, mostrarIndicador = true }: TarjetaPropuestaProps) {
  const pendiente = estado.fase === "esperando" && estado.pendiente ? estado.pendiente : null;
  if (!pendiente) return null;
  const { accion, decision } = pendiente;
  const riesgo = META_ACCION[accion.tipo].riesgo;
  return (
    <div className="pointer-events-none absolute left-1/2 top-[calc(50%+44px)] z-40 w-64 -translate-x-1/2">
      {mostrarIndicador && indicadorVisible(estado) ? (
        <IndicadorSentidos estado={estado} nombreBot={nombreBot} onApagarSentido={acciones.apagarSentido} onPausarBot={acciones.pausarBot} />
      ) : null}
      <aside data-testid="tarjeta-propuesta" role="status"
        className="pointer-events-auto mt-1 space-y-2 rounded-xl border border-white/10 bg-zinc-950/90 p-3 text-zinc-100 shadow-lg transition-opacity duration-200">
        <p className="text-xs text-white/50">{nombreBot} espera tu respuesta</p>
        <h3 className="text-sm font-medium leading-snug">{describirAccion(accion)}</h3>
        <p className="text-xs text-white/70">Por qué: {decision.motivo}</p>
        <span data-testid="riesgo-pastilla"
          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] ${CLASE_RIESGO[riesgo]}`}>
          {TEXTO_RIESGO[riesgo]}
        </span>
        <div className="flex flex-wrap gap-2 pt-1">
          {decision.requiere === "confirmacion" ? (
            <button type="button" onClick={acciones.confirmar} title="Confirmar la acción del bot"
              className="cursor-pointer rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-cyan-500">
              Confirmar
            </button>
          ) : null}
          {decision.requiere === "votacion" ? (
            acciones.votacion ? (
              <button type="button" onClick={acciones.votacion} title="Lo somete a votación de la entidad"
                className="cursor-pointer rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-cyan-500">
                Llevar a votación
              </button>
            ) : (
              <p data-testid="votacion-proximamente" className="text-xs text-white/60">próximamente: votación de bots</p>
            )
          ) : null}
          {decision.requiere === "consentimiento" || decision.requiere === "expreso" ? (
            <button type="button" onClick={acciones.abrirConsentimiento} title="Abre el diálogo de permisos de sentido"
              className="cursor-pointer rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-cyan-500">
              Conceder permiso
            </button>
          ) : null}
          <button type="button" onClick={acciones.rechazar} title="Rechazar la propuesta del bot"
            className="cursor-pointer rounded-md border border-white/20 px-3 py-1.5 text-xs transition-colors duration-200 hover:bg-white/10">
            Rechazar
          </button>
        </div>
      </aside>
    </div>
  );
}
