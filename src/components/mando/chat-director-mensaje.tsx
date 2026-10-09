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

function textoEspera(canal: CanalId, estado: EstadoEntrega): string | null {
  if (estado !== "pendiente" && estado !== "entregado") return null;
  const nombre = CANALES.find((c) => c.id === canal)?.nombre ?? canal;
  const canalObj = CANALES.find((c) => c.id === canal);
  const respuesta = canalObj?.respuesta ?? "ninguna";
  if (respuesta === "ninguna") return null;
  if (respuesta === "inmediata") return `${nombre} está respondiendo…`;
  if (respuesta === "en-revision") return `${nombre} lo tiene en su bandeja`;
  if (respuesta === "archivo") return `En la bandeja de ${nombre}: lo verá al abrir su chat`;
  return null;
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
  if (estado === "pendiente") return { texto: `${nombre}: pendiente`, rojo: false };
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

  const esAlex = mensaje.rol === "alex";
  const esSistema = mensaje.rol === "sistema";
  const autorData = esAlex ? "alex" : mensaje.rol ?? mensaje.de;

  // Indicador de espera: solo si es de Alex, ninguna entrega en respondido ni fallo,
  // y al menos una en pendiente o entregado.
  const entregasCanales = (Object.entries(entregas ?? {}) as [CanalId, EstadoEntrega][]) || [];
  const hayRespondido = entregasCanales.some(([, e]) => e === "respondido");
  const hayFallo = entregasCanales.some(([, e]) => e === "fallo");
  const hayPendienteOEntregado = entregasCanales.some(([, e]) => e === "pendiente" || e === "entregado");
  const mostrarEspera = esAlex && !hayRespondido && !hayFallo && hayPendienteOEntregado;
  const frasesEspera = entregasCanales
    .filter(([, e]) => e === "pendiente" || e === "entregado")
    .map(([canal, estado]) => textoEspera(canal, estado))
    .filter((t): t is string => t !== null);

  return (
    <article
      data-testid="mensaje-director"
      data-autor={autorData}
      className={[
        "group rounded-xl border p-3 text-xs transition-colors duration-200",
        esAlex ? "self-end ml-auto max-w-[85%] border-cyan-400/30 bg-cyan-500/10" : (esSistema ? "rounded-md border-amber-500/30 bg-amber-900/30 p-2 text-[11px]" : "bg-zinc-900/70 border-violet-500/20"),
      ].filter(Boolean).join(" ")}
    >
      <header className={[
        "flex flex-wrap items-center gap-2",
        esAlex ? "text-cyan-300" : (esSistema ? "text-amber-400" : "text-zinc-400"),
      ].filter(Boolean).join(" ")}>
        {!esSistema && (
          <span className={[
            "font-semibold",
            esAlex ? "text-cyan-200" : "text-violet-200",
          ].filter(Boolean).join(" ")}>
            {esAlex ? "Tú" : mensaje.de}
          </span>
        )}
        {!esSistema && mensaje.rol !== "alex" && (
          <span className="rounded border border-zinc-700/50 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300">{papel}</span>
        )}
        {!esSistema && (
          <span className="text-[10px]">desde {nombreCanal}</span>
        )}
        <span className={["text-[10px] ml-auto", esAlex ? "text-cyan-500/80" : (esSistema ? "text-amber-500/60" : "")].filter(Boolean).join(" ")}>{horaCorta(mensaje.t)}</span>
        {!esSistema && mensaje.modelo && (
          <span className={[
            "rounded border px-1.5 py-0.5 text-[10px]",
            esAlex ? "border-cyan-400/30 bg-cyan-400/20 text-cyan-200" : "border-violet-500/30 bg-violet-600/20 text-violet-200",
          ].filter(Boolean).join(" ")}>
            {mensaje.modelo}
          </span>
        )}
        {!esSistema && uso && <span className={esAlex ? "text-cyan-600" : "text-zinc-500"}>{uso}</span>}
      </header>

      <p className={["mt-2 whitespace-pre-line", esSistema ? "text-amber-100" : (esAlex ? "text-cyan-50" : "text-zinc-100")].filter(Boolean).join(" ")}>{mensaje.texto}</p>

      {mostrarEspera && frasesEspera.length > 0 && (
        <div role="status" aria-live="polite" className="mt-2 flex flex-wrap items-center gap-2 text-cyan-200">
          <span className="inline-flex items-center gap-1">
            {/* `delay-*` de Tailwind solo retrasa transiciones: el escalonado va en animationDelay. */}
            {[0, 150, 300].map((ms) => (
              <span
                key={ms}
                aria-hidden
                style={{ animationDelay: `${ms}ms` }}
                className="motion-safe:animate-bounce inline-block h-1.5 w-1.5 rounded-full bg-cyan-400"
              />
            ))}
          </span>
          <span className="text-[11px]">
            {frasesEspera.join(" · ")}
          </span>
        </div>
      )}

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

      {!esSistema && (
        // (2026-10-09) Alex: «las posiciones y órdenes de los botones… están feos». Cada mensaje
        // llevaba SIEMPRE su barra entera (modelo, Responder, Canales, Enviar): veinte mensajes
        // eran veinte barras iguales y el chat ocupaba toda la primera pantalla. La barra sigue
        // ahí (teclado, móvil y lectores de pantalla la tienen siempre), pero con ratón aparece
        // al pasar por el mensaje: `mc-acciones-al-pasar` en mando-cristal.css.
        <div className={["mc-acciones-al-pasar mt-2 flex flex-wrap items-center gap-2 border-t pt-2", esAlex ? "border-cyan-400/20" : "border-zinc-800"].filter(Boolean).join(" ")}>
        <select
          value={modelo}
          onChange={(e) => { tocadoRef.current = true; setModelo(e.target.value); }}
          aria-label="Responder con"
          className={["cursor-pointer rounded-lg border bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-2",
            esAlex ? "border-cyan-400/30 focus:ring-cyan-400/60" : "border-violet-500/30 focus:ring-violet-400/60",
          ].filter(Boolean).join(" ")}
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
          className={["cursor-pointer flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-200",
            esAlex ? "bg-cyan-600 text-white hover:bg-cyan-500" : "bg-violet-600 text-white hover:bg-violet-500",
          ].filter(Boolean).join(" ")}
        >
          <Reply className="h-3.5 w-3.5" />
          {esAlex ? "Pedir respuesta" : "Responder"}
        </button>
        <SelectorCanales valor={canales} onCambio={setCanales} excluir={[mensaje.canal]} />
        <button
          type="button"
          onClick={() => onReenviar(mensaje.id, canales)}
          className={["cursor-pointer flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors duration-200",
            esAlex ? "border-cyan-400/40 text-cyan-200 hover:bg-cyan-600/20" : "border-violet-500/40 text-violet-200 hover:bg-violet-600/20",
          ].filter(Boolean).join(" ")}
        >
          <Send className="h-3.5 w-3.5" />
          Enviar
        </button>
      </div>
      )}
    </article>
  );
}
