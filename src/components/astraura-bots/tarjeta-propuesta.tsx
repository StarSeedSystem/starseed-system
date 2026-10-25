"use client";

/**
 * Tarjeta de propuesta del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3 y §6).
 *
 * Aparece JUNTO A LA ORBE cuando el bucle del bot está en «esperando»: qué quiere hacer (en
 * palabras), por qué (`decision.motivo`), el riesgo en una pastilla, y según lo que pide la
 * decisión: «Confirmar / Rechazar», «Llevar a votación» (llama a `proponer` de
 * `genesis/entidades.ts` con la operación que dará BOT1011J1; hasta entonces dice
 * «próximamente: votación de bots») o el diálogo de consentimiento de BOT1011E2.
 * También monta aquí el `IndicadorSentidos`: mientras haya un sentido encendido, se ve.
 */
import { useState } from "react";
import { DialogoConsentimiento } from "./dialogo-consentimiento";
import { IndicadorSentidos } from "./indicador-sentidos";
import { META_ACCION, type AccionBot, type Riesgo, type TipoAccion } from "@/lib/astraura-bots/acciones";
import type { EstadoBucle } from "@/lib/astraura-bots/bucle";
import type { Bot, Sentido, TipoSesion } from "@/lib/astraura-bots/tipos";
import { cn } from "@/lib/utils";

/** Cómo se lee cada acción en palabras (con `@campo` = trozo de sus args). */
const ETIQUETA: Partial<Record<TipoAccion, string>> = {
  navegar: "Ir a @ruta",
  "abrir-app": "Abrir @app",
  "capa-pantalla": "Poner una capa sobre la pantalla",
  "widget.añadir": "Añadir un widget",
  "widget.mover": "Mover el widget @id",
  "widget.quitar": "Quitar el widget @id",
  "pizarra.operar": "Editar la pizarra",
  "dashboard.editar": "Editar el tablero",
  "escritorio.organizar": "Organizar el escritorio",
  "pagina.editar": "Editar la página",
  "ajuste.proponer": "Cambiar un ajuste",
  "ui.proponer": "Cambiar la interfaz",
  "protomolecula.operar": "Operar la Protomolécula",
};

/** La propuesta en palabras: qué quiere hacer el bot, como lo leería una persona. */
export function enPalabras(a: AccionBot): string {
  let frase = ETIQUETA[a.tipo] ?? `Hacer ${a.tipo.replace(/\./g, " ")}`;
  const tema = [a.args.ruta, a.args.app, a.args.id, a.args.titulo].find(
    (x): x is string | number => typeof x === "string" || typeof x === "number",
  );
  if (frase.includes("@") && tema !== undefined) frase = frase.replace(/@[a-z]+/, String(tema));
  return frase.replace(/@[a-z]+/, "").trim();
}

/** Pastilla del riesgo, con su color. */
const RIESGO: Record<Riesgo, { texto: string; clase: string }> = {
  bajo: { texto: "Riesgo bajo", clase: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" },
  medio: { texto: "Riesgo medio", clase: "border-amber-400/40 bg-amber-500/10 text-amber-200" },
  alto: { texto: "Riesgo alto", clase: "border-red-400/40 bg-red-500/10 text-red-200" },
};

export interface TarjetaPropuestaProps {
  /** Estado del bucle del bot: la tarjeta solo aparece con propuesta pendiente (fase «esperando»). */
  estado: EstadoBucle;
  /** El bot que propone (el diálogo de consentimiento necesita su ficha entera). */
  bot: Bot;
  /** Dónde se está; en sesión pública el permiso hace falta expreso. */
  sesion?: TipoSesion;
  /** El sentido del permiso a pedir, si la propuesta lo requiere y viene de un sentido. */
  sentido?: Sentido;
  /** La persona confirma (una vez otorgado el permiso, si hacía falta). */
  onConfirmar: () => void;
  /** La persona rechaza. */
  onRechazar: () => void;
  /** Tocar un icono del anillo apaga ese sentido. */
  onApagarSentido: (sentido: Sentido) => void;
  /** Salida siempre: pausar el bot. */
  onPausarBot: () => void;
  /** Lo dará el cableado de BOT1011J1: llama a `proponer` de `genesis/entidades.ts`. */
  onVotacion?: () => void;
}

export function TarjetaPropuesta({
  estado, bot, sesion = "privada", sentido,
  onConfirmar, onRechazar, onApagarSentido, onPausarBot, onVotacion,
}: TarjetaPropuestaProps) {
  const [abrirPermiso, setAbrirPermiso] = useState(false);
  const [avisoVoto, setAvisoVoto] = useState("");
  const pendiente = estado.fase === "esperando" ? estado.pendiente : undefined;
  const requiere = pendiente?.decision.requiere;
  const riesgo = pendiente ? META_ACCION[pendiente.accion.tipo].riesgo : undefined;
  const sentidoPermiso = sentido ?? (pendiente ? META_ACCION[pendiente.accion.tipo].sentido : undefined);
  const pidePermiso = requiere === "consentimiento" || requiere === "expreso";
  const llevarAVotacion = () => {
    if (onVotacion) { setAvisoVoto(""); onVotacion(); return; }
    setAvisoVoto("próximamente: votación de bots");
  };
  return (
    <div className="pointer-events-none relative" data-marco-tarjeta>
      <IndicadorSentidos estado={estado} nombreBot={bot.nombre} onApagarSentido={onApagarSentido} onPausarBot={onPausarBot} />
      {pendiente ? (
        <div data-testid="tarjeta-propuesta"
          className="pointer-events-auto absolute left-1/2 top-full z-50 mt-2 w-60 -translate-x-1/2 space-y-2 rounded-xl border border-cyan-200/30 bg-zinc-950/95 p-3 text-zinc-100 shadow-xl transition-opacity duration-200">
          <p className="text-xs text-white/50">{bot.nombre} propone</p>
          <p className="text-sm font-medium leading-snug">{enPalabras(pendiente.accion)}</p>
          <p className="text-xs text-white/60">{pendiente.decision.motivo}</p>
          {riesgo ? (
            <span data-testid="riesgo" className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px]", RIESGO[riesgo].clase)}>
              {RIESGO[riesgo].texto}
            </span>
          ) : null}
          {requiere === "confirmacion" ? (
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onConfirmar}
                className="flex-1 cursor-pointer rounded-md bg-cyan-600 px-2 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-cyan-500">
                Confirmar
              </button>
              <button type="button" onClick={onRechazar}
                className="flex-1 cursor-pointer rounded-md border border-white/20 px-2 py-1.5 text-xs transition-colors duration-200 hover:bg-white/10">
                Rechazar
              </button>
            </div>
          ) : null}
          {requiere === "votacion" ? (
            <button type="button" onClick={llevarAVotacion}
              className="w-full cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-500/10 px-2 py-1.5 text-xs font-medium text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/20">
              Llevar a votación
            </button>
          ) : null}
          {pidePermiso && sentidoPermiso ? (
            <button type="button" onClick={() => setAbrirPermiso(true)}
              className="w-full cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-500/10 px-2 py-1.5 text-xs font-medium text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/20">
              Dar el permiso
            </button>
          ) : null}
          {avisoVoto ? <p role="status" className="text-xs text-amber-200">{avisoVoto}</p> : null}
          {sentidoPermiso ? (
            <DialogoConsentimiento bot={bot} sentido={sentidoPermiso} sesion={sesion} abierto={abrirPermiso && pidePermiso}
              onConceder={() => { setAbrirPermiso(false); onConfirmar(); }} onDenegar={() => setAbrirPermiso(false)} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


