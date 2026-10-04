"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Reply } from "lucide-react";
import {
  CANALES,
  MODELO_DIRECTOR_DEFECTO,
  type CanalId,
  type EstadoEntrega,
  type MensajeDirector,
  type UsoMensaje,
} from "@/lib/mando/chat-director-tipos";
import { rolDeDirector } from "@/lib/mando/chat-director-feed";
import { SelectorCanales } from "./selector-canales";

export interface MensajeDelDirectorProps {
  mensaje: MensajeDirector;
  entregas?: Partial<Record<CanalId, EstadoEntrega>>;
  modelos: { id: string; nombre: string }[];
  /** Último modelo del director preseleccionado (lo que Alex usó por última vez). */
  modeloPorDefecto?: string;
  onResponder: (id: string, modelo: string) => void;
  onReenviar: (id: string, canales: CanalId[]) => void;
}

function horaCorta(t: string): string {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function textoUso(uso: UsoMensaje): string {
  const partes: string[] = [];
  if (typeof uso.tokensEntrada === "number" || typeof uso.tokensSalida === "number") {
    partes.push(`${uso.tokensEntrada ?? 0}→${uso.tokensSalida ?? 0} tokens`);
  }
  if (typeof uso.segundos === "number") partes.push(`${uso.segundos}s`);
  if (typeof uso.coste === "number") partes.push(`${uso.coste.toFixed(4)} $`);
  return partes.join(" · ");
}

function lineaEntrega(canal: CanalId, estado: EstadoEntrega): { texto: string; rojo: boolean } {
  const nombre = CANALES.find((c) => c.id === canal)?.nombre ?? canal;
  if (estado === "pendiente") {
    const espera = canal === "claude-cowork" ? "en la próxima revisión de Claude" : "esperando";
    return { texto: `${nombre}: ${espera}`, rojo: false };
  }
  if (estado === "entregado") return { texto: `${nombre}: entregado`, rojo: false };
  if (estado === "respondido") return { texto: `${nombre}: respondido`, rojo: false };
  return { texto: `${nombre}: fallo en la entrega`, rojo: true };
}

/** Tarjeta de un mensaje del Chat Director con sus acciones y entregas. */
export function MensajeDelDirector({ mensaje, entregas, modelos, modeloPorDefecto, onResponder, onReenviar }: MensajeDelDirectorProps) {
  const inicial = modeloPorDefecto && modeloPorDefecto.trim() !== "" ? modeloPorDefecto : MODELO_DIRECTOR_DEFECTO;
  const [modelo, setModelo] = useState(inicial);
  // Mientras Alex no haya tocado el selector, el valor sigue al `modeloPorDefecto`
  // (el catálogo y el último modelo llegan después del montaje).
  const tocadoRef = useRef(false);
  useEffect(() => {
    if (!tocadoRef.current && modeloPorDefecto && modeloPorDefecto.trim() !== "") {
      setModelo(modeloPorDefecto);
    }
  }, [modeloPorDefecto]);
  const [canales, setCanales] = useState<CanalId[]>(mensaje.canales ?? []);
  const papel = rolDeDirector(mensaje.de, mensaje.tipo);
  const nombreCanal = CANALES.find((c) => c.id === mensaje.canal)?.nombre ?? mensaje.canal;
  const uso = mensaje.uso ? textoUso(mensaje.uso) : "";
  const estados = (Object.entries(entregas ?? {}) as [CanalId, EstadoEntrega][]).filter(([, e]) => Boolean(e));

  return (
    <article data-testid="mensaje-director" className="rounded-xl border border-violet-500/20 bg-zinc-900/70 p-3 text-xs transition-colors duration-200">
      <header className="flex flex-wrap items-center gap-2 text-zinc-400">
        <span className="font-semibold text-violet-200">{mensaje.de}</span>
        <span className="rounded border border-zinc-700/50 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300">{papel}</span>
        <span className="text-[10px]">desde {nombreCanal}</span>
        <span className="ml-auto text-[10px]">{horaCorta(mensaje.t)}</span>
        {mensaje.modelo && (
          <span className="rounded border border-violet-500/30 bg-violet-600/20 px-1.5 py-0.5 text-[10px] text-violet-200">
            {mensaje.modelo}
          </span>
        )}
        {uso && <span className="text-[10px] text-zinc-500">{uso}</span>}
      </header>

      <p className="mt-2 whitespace-pre-line text-zinc-100">{mensaje.texto}</p>

      {estados.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
          {estados.map(([canal, estado]) => {
            const { texto, rojo } = lineaEntrega(canal, estado);
            return (
              <li key={canal} className={rojo ? "text-rose-400" : "text-zinc-500"}>
                {texto}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-2">
        <select
          value={modelo}
          onChange={(e) => { tocadoRef.current = true; setModelo(e.target.value); }}
          aria-label="Responder con"
          className="cursor-pointer rounded-lg border border-violet-500/30 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-400/60"
        >
          {modelo && !modelos.some((m) => m.id === modelo) ? (
            <option value={modelo}>{modelo}</option>
          ) : null}
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { if (modelo && modelo.trim() !== "") onResponder(mensaje.id, modelo); }}
          className="cursor-pointer flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs text-white transition-colors duration-200 hover:bg-violet-500"
        >
          <Reply className="h-3.5 w-3.5" />
          Responder
        </button>
        <SelectorCanales valor={canales} onCambio={setCanales} excluir={[mensaje.canal]} />
        <button
          type="button"
          onClick={() => onReenviar(mensaje.id, canales)}
          className="cursor-pointer flex items-center gap-1 rounded-lg border border-violet-500/40 px-2.5 py-1.5 text-xs text-violet-200 transition-colors duration-200 hover:bg-violet-600/20"
        >
          <Send className="h-3.5 w-3.5" />
          Enviar
        </button>
      </div>
    </article>
  );
}
