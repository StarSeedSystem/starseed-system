"use client";

// Tarjeta de una variación pública (Ola 1019V · tarea P · contrato: architecture/variaciones-publicas.md §4).
// Vista previa del adaptador, «Probar» (se aplica en vivo y se deshace al cerrar o al pulsar de
// nuevo), «Aplicar» con deshacer visible, «Guardar en la Biblioteca» (SaveToLibrary),
// «Compartir» (ShareToDialog), «Ver origen» (de qué variación deriva), valoración y licencia.
// Nada se ejecuta sin validar (validador común + validador de la familia) y las variaciones de
// código piden confirmación y corren aisladas. Supabase y adaptador son INYECTABLES.

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Eye, Play, RotateCcw, Share2, Star } from "lucide-react";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
import type { ShareResourceRef } from "@/lib/sharing/share-targets";
import type { AdaptadorFamilia } from "@/lib/variaciones/familias";
import { validarVariacion } from "@/lib/variaciones/validar";
import { recursoDeVariacion } from "@/lib/variaciones/publicar-campos";
import type { Variacion } from "@/lib/variaciones/orden";

/* ───────── Núcleo puro (entrada → salida, sin DOM ni red) ───────── */

/** Estados del ciclo «Probar → Aplicar → Deshacer» de una tarjeta. */
export type EstadoPrueba = "inactiva" | "probando" | "aplicada";

/** Acciones que transitan ese ciclo. */
export type AccionEstado = "probar" | "aplicar" | "deshacer";

export function siguienteEstado(estado: EstadoPrueba, accion: AccionEstado): EstadoPrueba {
  switch (accion) {
    case "probar": // Probar otra vez deshace la prueba en curso (§4) y prueba de nuevo.
      return estado === "inactiva" ? "probando" : estado === "probando" ? "inactiva" : "probando";
    case "aplicar": // Consolida la prueba viva o aplica directo desde inactiva.
      return estado === "inactiva" || estado === "probando" ? "aplicada" : estado;
    case "deshacer":
      return "inactiva";
  }
}

/** Al cerrar la ventana se deshace solo la PRUEBA; lo aplicado queda, con su Deshacer. */
export function deshaceAlCerrar(estado: EstadoPrueba): boolean {
  return estado === "probando";
}

export interface DiagnosticoValidacion {
  ok: boolean;
  motivos: string[];
  aislado: boolean;
}

/** Doble validación (§4: nada se ejecuta sin validar): el validador común pone los límites y el de la familia, su tipo. */
export function diagnosticar(payload: unknown, familiaValida?: (p: unknown) => { ok: true; payload: unknown } | { ok: false; motivos: string[] }): DiagnosticoValidacion {
  if (!familiaValida) return { ok: false, motivos: ["Esta familia de elementos no declara un validador: nada se ejecuta sin validar"], aislado: false };
  if (payload === undefined || payload === null) {
    return { ok: false, motivos: ["La variación no trae payload: no hay nada que probar ni aplicar"], aislado: false };
  }
  const deFamilia = familiaValida(payload);
  const comun = validarVariacion(payload);
  const motivos = [
    ...(deFamilia.ok ? [] : deFamilia.motivos),
    ...(comun.ok ? [] : comun.motivos),
  ];
  // El aislamiento se pide aunque ambas validaciones fallen: ante código, advertir siempre.
  return { ok: motivos.length === 0, motivos: motivos.slice(0, 4), aislado: comun.requiereAislamiento };
}

/** Texto de la vista previa: la del adaptador si la da; si no, el JSON del payload recortado. */
export function vistaPreviaTexto(payload: unknown, vistaPrevia?: (p: unknown) => unknown, invalido = false): string {
  if (invalido) return "Nada se ejecuta sin validar: corrige los motivos para ver la vista previa.";
  if (payload === undefined || payload === null) return "No hay vista previa: la variación no trae payload.";
  let base: unknown = payload;
  if (vistaPrevia) {
    try { base = vistaPrevia(payload); } catch { base = payload; }
  }
  try {
    if (typeof base === "string") return base.length <= 140 ? base : `${base.slice(0, 139)}…`;
    if (typeof base === "number") return String(base);
    const texto = JSON.stringify(base) ?? "null";
    return texto.length <= 140 ? texto : `${texto.slice(0, 139)}…`;
  } catch {
    return "La vista previa no se pudo convertir a texto.";
  }
}

/** Enlace «Ver origen» seguro: solo https. */
export function enlaceSeguroTexto(url?: string): string | null {
  return url && /^https:\/\/\S+$/.test(url) ? url : null;
}

/* ───────── Tarjeta ───────── */

export interface TarjetaVariacionProps {
  variacion: Variacion;
  /** Clave canónica del elemento (`widget:clima`); nombra el TIPO, nunca una instancia. */
  clave: string;
  payload?: unknown;
  adaptador?: AdaptadorFamilia<unknown> | null;
  /** Ventana abierta: al pasar a false se deshace la prueba (no lo aplicado). */
  abierta?: boolean;
  /** Enlace de origen (https) y id de la variación de la que deriva. */
  enlaceOrigen?: string;
  deVariacion?: string;
  miValoracion?: number;
  onValorar?: (puntuacion: number) => void;
  /** Paneles de la cuenta (SaveToLibrary/ShareToDialog) inyectables: false en pruebas. */
  panelesCompartidos?: boolean;
}

export function TarjetaVariacion({
  variacion, clave, payload, adaptador, abierta = true, enlaceOrigen, deVariacion,
  miValoracion, onValorar, panelesCompartidos = true,
}: TarjetaVariacionProps) {
  const diag = useMemo(() => diagnosticar(payload, adaptador?.validar), [payload, adaptador]);
  const familia = clave.split(":")[0] ?? "";
  const [estado, setEstado] = useState<EstadoPrueba>("inactiva");
  const [confirmoAislado, setConfirmoAislado] = useState(false);
  const [compartir, setCompartir] = useState(false);
  const deshacerReal = useRef<(() => void) | null>(null);
  const estadoRef = useRef(estado);

  // Transición real: deshace una prueba/aplicación viva antes de empezar otra y nunca lanza.
  const mover = (accion: AccionEstado) => {
    const previo = estadoRef.current;
    const nuevo = siguienteEstado(previo, accion);
    if (nuevo === previo || (!diag.ok && nuevo !== "inactiva")) return;
    if (diag.aislado && !confirmoAislado && nuevo !== "inactiva") return;
    try {
      // Aplicar sobre una prueba viva solo la consolida: nada se deshace ni se repite.
      if (accion === "aplicar" && previo === "probando") { estadoRef.current = nuevo; setEstado(nuevo); return; }
      const deshacerVivo = deshacerReal.current;
      deshacerReal.current = null;
      if (previo !== "inactiva") deshacerVivo?.();
      if (nuevo !== "inactiva")       deshacerReal.current = adaptador?.aplicar(clave, payload)?.deshacer ?? null;
    } catch {
      estadoRef.current = "inactiva"; setEstado("inactiva"); return;
    }
    estadoRef.current = nuevo; setEstado(nuevo);
  };

  // Al cerrar la ventana se deshace la prueba en curso (no lo aplicado), una sola vez.
  const previaAbierta = useRef(true);
  useEffect(() => {
    if (abierta === previaAbierta.current) return;
    if (!abierta && previaAbierta.current && estadoRef.current === "probando") mover("deshacer");
    previaAbierta.current = abierta;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  const sinValidar = !diag.ok;
  const borroso = diag.aislado && !confirmoAislado;
  const contenido = JSON.stringify({ kind: "starseed-variacion", v: 1, variacion: variacion.id, clave, licencia: variacion.licencia, payload: payload ?? null });
  const recurso: ShareResourceRef = recursoDeVariacion({ clave, titulo: variacion.titulo, descripcion: variacion.descripcion || undefined, id: variacion.id });
  const origen = enlaceSeguroTexto(enlaceOrigen);
  const previa = vistaPreviaTexto(payload, adaptador?.vistaPrevia, sinValidar);

  return (
    <li className="rounded-2xl border border-border/50 bg-card/60 p-3 text-foreground backdrop-blur-xl" data-ss-tarjeta-variacion={variacion.id}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold">{variacion.titulo}</h4>
        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{variacion.licencia}</span>
        <span data-testid="estado-prueba" aria-live="polite" className="font-mono text-[10px] text-muted-foreground">{estado === "inactiva" ? "" : estado === "probando" ? "probando…" : "aplicada"}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Star className="size-3" aria-hidden /> {variacion.valoracionMedia.toFixed(1)} ({variacion.valoracionCount})</span>
      </div>
      {variacion.descripcion && <p className="mt-1 text-xs text-muted-foreground">{variacion.descripcion}</p>}
      {deVariacion && <p className="mt-1 text-[10px] text-muted-foreground">Deriva de la variación <span className="font-mono">{deVariacion}</span></p>}
      <p className="mt-2 rounded-xl border border-dashed border-border/50 bg-background/30 px-2 py-1.5 font-mono text-[10px] text-muted-foreground" data-testid="vista-previa">
        <Eye className="mr-1 inline size-3" aria-hidden /> {previa}
      </p>
      {!diag.ok && (
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[10px] text-destructive">
          {diag.motivos.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      {diag.aislado && (
        <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
          Está hecha con código: pide confirmación y corre aislado de tu cuenta.
          {!confirmoAislado && (
            <button type="button" onClick={() => setConfirmoAislado(true)} className="ml-1 cursor-pointer underline hover:text-foreground">
              Confirmar aislado
            </button>
          )}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" className="cursor-pointer rounded-full border border-border/50 bg-background/30 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background/50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={sinValidar || borroso} onClick={() => mover("probar")} aria-label={estado === "probando" ? "Quitar prueba" : "Probar"}>
          <Play className="mr-1 inline size-3" aria-hidden /> {estado === "probando" ? "Quitar prueba" : "Probar"}
        </button>
        <button type="button" className="cursor-pointer rounded-full border border-primary/50 bg-primary/15 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={sinValidar || borroso} onClick={() => mover("aplicar")}>Aplicar</button>
        {estado === "aplicada" && (
          <button type="button" className="cursor-pointer rounded-full border border-border/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground" onClick={() => mover("deshacer")} aria-label="Deshacer variación aplicada">
            <RotateCcw className="mr-1 inline size-3" aria-hidden /> Deshacer
          </button>
        )}
        {panelesCompartidos && (
          <SaveToLibrary item={{ type: "file", title: variacion.titulo, mime: "application/json", content: contenido, tags: ["starseed-variacion", familia] }} label="Guardar en la Biblioteca" className="gap-1 text-xs" />
        )}
        <button type="button" className="cursor-pointer rounded-full border border-border/50 bg-background/30 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background/50" onClick={() => setCompartir(true)} aria-label="Compartir variación">
          <Share2 className="mr-1 inline size-3" aria-hidden /> Compartir
        </button>
        {origen && (
          <a href={origen} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline">
            Ver origen <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
      {onValorar && (
        <div className="mt-1.5 flex items-center gap-0.5" role="group" aria-label="Valorar esta variación">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`Valorar ${n}`} onClick={() => onValorar(n)}
              className={`cursor-pointer p-0.5 ${miValoracion && n <= miValoracion ? "text-amber-500" : "text-muted-foreground"}`}>
              <Star className="size-3" fill={miValoracion && n <= miValoracion ? "currentColor" : "none"} aria-hidden />
            </button>
          ))}
        </div>
      )}
      {panelesCompartidos && (
        <ShareToDialog open={compartir} onOpenChange={setCompartir} resource={recurso} />
      )}
    </li>
  );
}

export default TarjetaVariacion;
