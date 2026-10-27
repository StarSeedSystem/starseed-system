"use client";

/**
 * StarSeed OS · Ventana/widget «Estudio de vídeo» (ola 1018K, HyperFrames).
 * Contrato: architecture/video-hyperframes.md §4.2 y §5 (Superficies · K).
 * Clips desde los atributos data-*; panel que emite órdenes de operaciones-sdk;
 * vista previa con <hyperframes-player> del servicio local; GSAP: reproducir sí,
 * editar no (adaptadores.ts). Sondeo inyectable: sin red en pruebas.
 */
import * as React from "react";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
import { operacionASdkOrder, type SdkOrder } from "@/lib/video-html/operaciones-sdk";
import {
  sondearServicio,
  SERVICIOS_CONOCIDOS,
  type FetchLocal,
} from "@/lib/protomolecula/servicio-local";
import type { Operacion, ValorParametro } from "@/lib/protomolecula/tipos";

export const SERVICIO_HYPERFRAMES =
  SERVICIOS_CONOCIDOS.find((s) => s.id === "hyperframes") ?? null;

export interface Clip {
  id: string;
  empieza: number;
  duracion: number;
  pista: number;
}

/** Atributo de una etiqueta entera («<div class="clip" data-start="0">»). */
function atributo(tag: string, nombre: string): string | null {
  const m = tag.match(new RegExp(`${nombre}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Clips (clase `clip`) de la composición, con sus atributos de tiempo. */
export function extraerClips(html: string): Clip[] {
  const clips: Clip[] = [];
  for (const tag of html.match(/<[a-zA-Z][^>]*>/g) ?? []) {
    if (!/class="[^"]*\bclip\b/.test(tag)) continue;
    const id = atributo(tag, "id") ?? atributo(tag, "data-id") ?? `clip-${clips.length + 1}`;
    clips.push({
      id,
      empieza: Number(atributo(tag, "data-start") ?? "0"),
      duracion: Number(atributo(tag, "data-duration") ?? "0"),
      pista: Number(atributo(tag, "data-track-index") ?? "0"),
    });
  }
  return clips;
}

/** ¿Trae la composición GSAP? Si sí: se reproduce, pero no se edita (§2). */
export function traeGsap(html: string): boolean {
  return detectarAdaptadores(html).usados.includes("gsap");
}

/** Orden del SDK a partir de una Operación de la Protomolécula. */
export function ordenDe(
  atomoId: string,
  propiedad: string,
  valor: ValorParametro,
  t: number,
): SdkOrder {
  const operacion: Operacion = {
    id: `op-${t}-${propiedad}`,
    objetivo: { atomoId, parametroId: `${atomoId}::${propiedad}` },
    accion: { tipo: "exacta", valor },
    autor: { tipo: "persona", id: "usuario" },
    origen: "mano",
    t,
  };
  return operacionASdkOrder(operacion);
}

export interface EstudioVideoVentanaProps {
  /** HTML de la composición (átomo «video-html», adaptadores.ts la analiza). */
  codigo?: string;
  compacto?: boolean;
  /** Sondeo inyectable: en pruebas no hay red. */
  comprobar?: FetchLocal;
  /** Salida de la ventana hacia el editor (malla, salas). */
  emitirOrden?: (orden: SdkOrder) => void;
}

export function EstudioVideoVentana({
  codigo = "",
  compacto = false,
  comprobar: quiensondea,
  emitirOrden,
}: EstudioVideoVentanaProps) {
  const f: FetchLocal = quiensondea ?? ((url, init) => fetch(url, init));
  const [salud, setSalud] = React.useState<"cargando" | "vivo" | "caido">("cargando");
  const [clipId, setClipId] = React.useState<string | null>(null);
  const [texto, setTexto] = React.useState("");
  const [duracionStr, setDuracionStr] = React.useState("");
  const [opacidad, setOpacidad] = React.useState("");
  const [ordenes, setOrdenes] = React.useState<SdkOrder[]>([]);

  React.useEffect(() => {
    let cancelado = false;
    if (!SERVICIO_HYPERFRAMES) {
      setSalud("caido");
      return;
    }
    sondearServicio(SERVICIO_HYPERFRAMES, f).then((r) => {
      if (!cancelado) setSalud(r.vivo ? "vivo" : "caido");
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiensondea]);

  const clips = extraerClips(codigo);
  const clip = clips.find((c) => c.id === clipId) ?? null;
  const gsap = traeGsap(codigo);

  React.useEffect(() => {
    if (clip) {
      setDuracionStr(String(clip.duracion));
      setOpacidad("1");
      setTexto("");
    }
  }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const emitir = (propiedad: string, valor: ValorParametro) => {
    if (!clip) return;
    const orden = ordenDe(clip.id, propiedad, valor, Date.now());
    setOrdenes((o) => [...o, orden]);
    emitirOrden?.(orden);
  };

  if (salud !== "vivo") {
    return (
      <section data-testid="estudio-video" className="flex h-full flex-col gap-3 p-3 text-sm">
        <p className="text-muted-foreground">
          {salud === "cargando"
            ? "Comprobando el servicio HyperFrames de esta neurona…"
            : "Sin servicio HyperFrames en esta neurona."}
        </p>
        {salud === "caido" && (
          <a href="https://starseed-os.vercel.app" className="cursor-pointer text-sky-400 underline" data-testid="abrir-otra-neurona">
            Abrir en otra neurona
          </a>
        )}
      </section>
    );
  }

  const reproductor = React.createElement("hyperframes-player", {
    src: `http://localhost:${SERVICIO_HYPERFRAMES?.puerto ?? 4490}/composicion/actual`,
    key: "vista-previa",
  });
  const bloqueado = gsap;

  return (
    <section data-testid="estudio-video" className="flex h-full flex-col gap-2 rounded-xl border border-border/60 p-3 text-sm">
      {gsap && (
        <p role="alert" data-testid="aviso-gsap" className="rounded-md bg-amber-500/15 p-2 text-amber-600 dark:text-amber-300">
          Esta composición usa GSAP: se reproduce, pero no se edita aquí (licencia GSAP Standard). Se sugiere convertirla a WAAPI.
        </p>
      )}
      {!compacto && <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Estudio de vídeo</h2>}
      {/* Línea de tiempo simple: un bloque por clip, su ancho crece con la duración */}
      <div data-testid="linea-tiempo" className="flex flex-wrap gap-1">
        {clips.map((c) => (
          <button
            key={c.id}
            onClick={() => setClipId(c.id)}
            className={`cursor-pointer rounded-md border px-2 py-1 text-xs ${clipId === c.id ? "border-sky-400 bg-sky-500/15" : "border-border/60"}`}
            style={{ minWidth: `${Math.max(c.duracion, 1) * 8}px` }}
          >
            {c.id} · pista {c.pista}
          </button>
        ))}
      </div>
      <div className="flex flex-1 gap-3 overflow-auto">
        <div className="min-h-24 flex-1 overflow-hidden rounded-md bg-black/60" data-testid="visor">{reproductor}</div>
        <div className="flex w-44 flex-col gap-2 text-xs">
          <p className="uppercase text-muted-foreground">Propiedades</p>
          <input data-testid="prop-texto" aria-label="Texto del clip" value={texto} onChange={(e) => setTexto(e.target.value)} className="rounded-md border border-border/60 bg-transparent px-2 py-1" />
          <button data-testid="aplicar-texto" disabled={bloqueado} onClick={() => emitir("textContent", texto)} className="cursor-pointer rounded-md border border-border/60 px-2 py-1 disabled:opacity-40">
            Aplicar texto
          </button>
          <input data-testid="prop-duracion" aria-label="Duración del clip" inputMode="numeric" value={duracionStr} onChange={(e) => setDuracionStr(e.target.value)} className="rounded-md border border-border/60 bg-transparent px-2 py-1" />
          <button data-testid="aplicar-duracion" disabled={bloqueado} onClick={() => emitir("data-duration", Number(duracionStr) || 0)} className="cursor-pointer rounded-md border border-border/60 px-2 py-1 disabled:opacity-40">
            Aplicar duración
          </button>
          <input data-testid="prop-opacidad" aria-label="Opacidad del clip" inputMode="decimal" value={opacidad} onChange={(e) => setOpacidad(e.target.value)} className="rounded-md border border-border/60 bg-transparent px-2 py-1" />
          <button data-testid="aplicar-opacidad" disabled={bloqueado} onClick={() => emitir("style.opacity", opacidad)} className="cursor-pointer rounded-md border border-border/60 px-2 py-1 disabled:opacity-40">
            Aplicar opacidad
          </button>
          <p data-testid="ordenes" className="text-muted-foreground">{ordenes.length > 0 ? `Última orden: ${ordenes[ordenes.length - 1].type}` : "Sin órdenes aún"}</p>
        </div>
      </div>
    </section>
  );
}
