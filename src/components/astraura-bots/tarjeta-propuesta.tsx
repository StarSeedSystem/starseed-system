"use client";

/**
 * Tarjeta de propuesta del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3).
 * Aparece JUNTO A LA ORBE solo cuando el bucle del bot está en «esperando»: qué quiere hacer
 * (en palabras), por qué (`decision.motivo`) y su riesgo. Según `requiere` ofrece
 * «Confirmar»/«Rechazar», «Llevar a votación» (llama a `proponer` de PoliGenesis con la
 * operación que dará BOT1011J1; hasta entonces, «próximamente») o «Dar permiso» (el diálogo
 * de consentimiento de BOT1011E2). Aquí también vive el anillo de `IndicadorSentidos`.
 */
import { useState } from "react";
import type { PosOrbe } from "@/lib/astraura-bots/orbes";
import type { EntidadAmbito, Operacion } from "@/lib/genesis/operaciones";
import { proponer } from "@/lib/genesis/entidades";
import { META_ACCION, type AccionBot, type Riesgo } from "@/lib/astraura-bots/acciones";
import { indicadorVisible, type EstadoBucle } from "@/lib/astraura-bots/bucle";
import type { Bot, Sentido, TipoSesion } from "@/lib/astraura-bots/tipos";
import { DialogoConsentimiento } from "./dialogo-consentimiento";
import type { ResultadoConsentimiento } from "./sentidos-ui";
import { DIAMETRO_ANILLO, IndicadorSentidos } from "./indicador-sentidos";

const RUTAS: Record<string, string> = { "/library": "Biblioteca", "/network": "la Red", "/hub": "el Hub", "/agent": "Agentes", "/explorer": "Explorador" };
const FRASES: Partial<Record<AccionBot["tipo"], string>> = {
  navegar: "Abrir {ruta}", "abrir-app": "Abrir la app {app}", "capa-pantalla": "Poner una capa sobre la pantalla",
  "widget.añadir": "Añadir un widget de {tipo}", "widget.mover": "Mover el widget {id}", "widget.quitar": "Quitar el widget {id}",
  "pizarra.operar": "Trabajar la pizarra {pizarra}", "dashboard.editar": "Editar el tablero {tablero}",
  "escritorio.organizar": "Organizar el escritorio", "pagina.editar": "Editar la página {pagina}",
  "ajuste.proponer": "Cambiar el ajuste «{campo}»", "ui.proponer": "Proponer un elemento de interfaz",
  "protomolecula.operar": "Operar la molécula {molecula}", "xr.intencion": "En XR: {frase}",
  "codigo.proponer": "Proponer código en {destino}", "computadora.ejecutar": "Ejecutar una orden en su computadora",
  "mensaje.enviar": "Enviar un mensaje al canal {canal}", "publicacion.borrador": "Preparar una publicación",
  "tarea.crear": "Crear la tarea {titulo}", "memoria.recordar": "Recordar algo en la memoria {alcance}",
  notificar: "Avisar: {texto}", "imagen.generar": "Generar una imagen", "robot.caminar": "Hacer caminar al robot",
  "robot.girar": "Hacer girar al robot", "robot.emocion": "Mostrar emoción en el robot", "robot.bailar": "Hacer bailar al robot",
  "robot.negacion": "Mostrar que no con el robot", "robot.alto": "Parar al robot",
};

/** La acción EN PALABRAS: «Abrir Biblioteca», «Mover el widget clima». */
export function describirAccion(a: AccionBot): string {
  const valor = (campo: string) => RUTAS[String(a.args[campo])] ?? String(a.args[campo] ?? "…");
  return (FRASES[a.tipo] ?? "").replace(/\{(\w+)\}/g, (_, campo: string) => valor(campo));
}

const PASTILLA: Record<Riesgo, string> = { bajo: "bg-emerald-500/15 text-emerald-200", medio: "bg-amber-500/15 text-amber-200", alto: "bg-red-500/15 text-red-200" };
const RIESGO: Record<Riesgo, string> = { bajo: "Riesgo bajo", medio: "Riesgo medio", alto: "Riesgo alto" };

export interface TarjetaPropuestaProps {
  bot: Bot; /** Estado del bucle donde vive este bot: nada se pinta sin propuesta pendiente. */ estado: EstadoBucle;
  /** Cuenta de quien confirma o rechaza; va al registro. */ quien: string;
  onConfirmar: (quien: string) => void;
  onRechazar: (quien: string) => void;
  onApagarSentido: (sentido: Sentido) => void;
  onPausarBot: () => void;
  /** Dónde está la orbe con los sentidos encendidos; por defecto, sobre la tarjeta. */
  pos?: PosOrbe;
  /** La operación de la votación la dará BOT1011J1; sin ella, «próximamente». */
  votacion?: { entidad: EntidadAmbito; operacion: Operacion };
  /** Para `requiere: consentimiento` o `expreso`: abre el diálogo de BOT1011E2. */
  consentimiento?: { sentido: Sentido; sesion: TipoSesion;
    onConceder: (r: ResultadoConsentimiento) => void; onDenegar: () => void };
  /** Inyectable en pruebas; por defecto `proponer` de `genesis/entidades`. */
  crearPropuesta?: typeof proponer;
}

const PEDIR = "cursor-pointer rounded-md bg-cyan-600 px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-cyan-500";
const QUITAR = "cursor-pointer rounded-md border border-white/20 px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-white/10";

export function TarjetaPropuesta({
  bot, estado, quien, onConfirmar, onRechazar, onApagarSentido, onPausarBot, pos,
  votacion, consentimiento, crearPropuesta = proponer,
}: TarjetaPropuestaProps) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [aviso, setAviso] = useState("");
  const pendiente = estado.pendiente;
  if (estado.fase !== "esperando" || !pendiente) return null;
  const { accion, decision } = pendiente;
  const meta = META_ACCION[accion.tipo];
  const puedeVotar = decision.requiere === "votacion";
  const pedirConsentimiento = decision.requiere === "consentimiento" || decision.requiere === "expreso";
  const llevarAVotacion = async () => {
    setAviso("Creando la propuesta…");
    if (!votacion) { setAviso("próximamente: votación de bots"); return; }
    const r = await crearPropuesta(votacion.entidad, votacion.operacion);
    setAviso(r.ok ? "La propuesta está en votación del grupo." : `No se pudo llevar a votación: ${r.motivo}`);
  };
  return (
    <>
      {indicadorVisible(estado) && (
        <div className={pos ? "pointer-events-none fixed z-50" : "pointer-events-none fixed bottom-32 left-1/2 z-50 -translate-x-1/2"}
          style={pos ? { left: `${pos.xRatio * 100}vw`, top: `${pos.yRatio * 100}vh`, width: DIAMETRO_ANILLO, height: DIAMETRO_ANILLO, transform: "translate(-50%, -50%)" } : undefined}>
          <IndicadorSentidos estado={estado} nombreBot={bot.nombre} onApagarSentido={onApagarSentido} onPausarBot={onPausarBot} />
        </div>
      )}
      <div data-testid="tarjeta-propuesta" className="fixed bottom-6 left-1/2 z-50 w-80 -translate-x-1/2 space-y-2
        rounded-xl border border-white/10 bg-zinc-950/95 p-3 text-zinc-100 shadow-xl">
        <p className="text-xs text-white/60">{bot.nombre} quiere:</p>
        <p className="text-sm">{describirAccion(accion)}</p>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs ${PASTILLA[meta.riesgo]}`}>{RIESGO[meta.riesgo]}</span>
          <span className="text-xs text-white/60">{decision.motivo}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {decision.requiere === "confirmacion" && <button type="button" onClick={() => onConfirmar(quien)} className={PEDIR}>Confirmar</button>}
          {puedeVotar && <button type="button" onClick={llevarAVotacion} className={PEDIR}>Llevar a votación</button>}
          {pedirConsentimiento && (consentimiento
            ? <button type="button" onClick={() => setDialogoAbierto(true)} className={PEDIR}>Dar permiso</button>
            : <p className="text-xs text-white/60">próximamente: pedir permiso</p>)}
          {(decision.requiere === "confirmacion" || puedeVotar) && <button type="button" onClick={() => onRechazar(quien)} className={QUITAR}>Rechazar</button>}
        </div>
        {aviso && <p role="status" className="text-xs text-cyan-200">{aviso}</p>}
      </div>
      {consentimiento && (
        <DialogoConsentimiento bot={bot} sentido={consentimiento.sentido} sesion={consentimiento.sesion} abierto={dialogoAbierto}
          onConceder={(r) => { setDialogoAbierto(false); consentimiento.onConceder(r); }}
          onDenegar={() => { setDialogoAbierto(false); consentimiento.onDenegar(); }} />
      )}
    </>
  );
}
