"use client";

/**
 * Protomolécula · MARCO AISLADO (F1B). Pinta la vista de cada herramienta según su
 * `definicion.vista` y la conecta al puente `postMessage` de `puente-herramientas.ts`.
 * Contrato: architecture/protomolecula.md §8.1 y §11.1.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";

import { VISTAS_COMPONENTE } from "@/lib/protomolecula/atomos";
import {
  MENSAJES_POR_SEGUNDO,
  crearToken,
  destinoDe,
  esUrlEmbebible,
  mensajeParaMarco,
  procesarMensaje,
  type EstadoLimite,
  type Marco,
} from "@/lib/protomolecula/puente-herramientas";
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { EstadoValores, Parametro } from "@/lib/protomolecula/tipos";

/** Lo que una herramienta declara con un `hola` (solo informa; no cambia la estructura). */
export interface Declaracion {
  nombre?: string;
  parametros: Parametro[];
}

export interface MarcoAisladoProps {
  definicion: DefinicionAtomo;
  atomoId: string;
  /** Valores de ESTE átomo, por `parametroId` (los extrae `valoresDeAtomo`). */
  valores: EstadoValores;
  alCambio: (parametroId: string, valor: unknown) => void;
  alExportar?: (formato: string, datos: unknown) => void;
  alDeclarar?: (d: Declaracion) => void;
}

/** Valores de la molécula restringidos a UN átomo, por `parametroId`. */
export function valoresDeAtomo(m: EstadoValores, atomoId: string): EstadoValores {
  const prefijo = `${atomoId}::`;
  return Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith(prefijo)).map(([k, v]) => [k.slice(prefijo.length), v]));
}

const TIPO_ARCHIVO: Record<string, string> = {
  json: "application/json", csv: "text/csv", txt: "text/plain", html: "text/html",
  svg: "image/svg+xml", png: "image/png", wav: "audio/wav", mp3: "audio/mpeg",
  mp4: "video/mp4", mid: "audio/midi", glb: "model/gltf-binary",
};

/** Enlace real de descarga para un `exportar`: Blob del tipo del formato, URL revocada al cambiar o desmontar. */
export function useDescarga(): { url: string | null; nombre: string | null; anunciar: (formato: string, datos: unknown) => void } {
  const [url, setUrl] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const previa = useRef<string | null>(null);
  useEffect(() => () => { if (previa.current) URL.revokeObjectURL(previa.current); }, []);
  const anunciar = (formato: string, datos: unknown): void => {
    const texto = typeof datos === "string" ? datos : datos == null ? "" : JSON.stringify(datos, null, 2);
    const tipo = TIPO_ARCHIVO[formato.toLowerCase()] ?? "application/octet-stream";
    if (previa.current) URL.revokeObjectURL(previa.current);
    const u = URL.createObjectURL(new Blob([texto], { type: tipo }));
    previa.current = u;
    setUrl(u);
    setNombre(`protomolecula.${formato}`);
  };
  return { url, nombre, anunciar };
}

function SinVista({ motivo }: { motivo?: string }) {
  return (
    <div role="note" className="flex items-center justify-center rounded-md border p-4 text-center text-sm text-muted-foreground">
      {motivo ?? "Esta herramienta aún no tiene vista"}
    </div>
  );
}

/** `vista: componente`: `React.lazy` + `Suspense` sobre `VISTAS_COMPONENTE` (átomos/index.ts). */
function VistaComponente({ definicion, atomoId, valores, alCambio }: Omit<MarcoAisladoProps, "alExportar" | "alDeclarar">) {
  const vista = definicion.vista;
  const factory = vista && vista.tipo === "componente" ? VISTAS_COMPONENTE[vista.id] : undefined;
  const Gorda = useMemo(() => (factory ? lazy(factory) : null), [factory]);
  if (!Gorda) return <SinVista />;
  return (
    <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Cargando la vista…</p>}>
      <Gorda
        atomoId={atomoId}
        valores={valores}
        alCambiar={(op) => {
          const a = op as { objetivo: { parametroId: string }; accion: { tipo: string; valor?: unknown } };
          if (a?.accion?.tipo === "exacta") alCambio(a.objetivo.parametroId, a.accion.valor);
        }}
      />
    </Suspense>
  );
}

interface VistaIframeProps {
  tipo: "documento" | "externa";
  titulo: string;
  /** Solo documento: HTML del envoltorio propio con el marcador __PM_CANAL__. */
  documento?: string;
  /** Solo externa: URL ya embebible y su origen real. */
  url?: string;
  origen?: string;
  valores: EstadoValores;
  alCambio: MarcoAisladoProps["alCambio"];
  alExportar?: MarcoAisladoProps["alExportar"];
  alDeclarar?: MarcoAisladoProps["alDeclarar"];
}

/** iframe + puente: identidad por `contentWindow` + token; `establecer` solo con lo que cambió. */
function VistaIframe({ tipo, titulo, documento, url, origen, valores, alCambio, alExportar, alDeclarar }: VistaIframeProps) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const token = useRef<string>("");
  if (!token.current) token.current = crearToken((n) => crypto.getRandomValues(new Uint8Array(n)));
  const html = useMemo(() => documento?.replaceAll("__PM_CANAL__", token.current), [documento]);
  const limites = useRef<EstadoLimite>({ fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: 0 });
  const declarados = useRef<Parametro[] | undefined>(undefined);
  const previos = useRef<EstadoValores>(valores);
  const ganchos = useRef({ alCambio, alExportar, alDeclarar });
  ganchos.current = { alCambio, alExportar, alDeclarar };

  const enviar = (mensaje: Record<string, unknown>): void => {
    const cw = ref.current?.contentWindow;
    if (!cw) return;
    const marco: Marco = { ventana: cw, token: token.current, origenEsperado: origen ?? null };
    cw.postMessage(mensaje, destinoDe(marco));
  };

  useEffect(() => {
    const escuchar = (ev: MessageEvent) => {
      const marco: Marco = { ventana: ref.current?.contentWindow, token: token.current, origenEsperado: origen ?? null, parametros: declarados.current };
      const r = procesarMensaje(ev, marco, Date.now(), limites.current);
      limites.current = r.estado;
      if (!r.entrada) return;
      const e = r.entrada;
      if (e.tipo === "hola") {
        declarados.current = e.parametros;
        ganchos.current.alDeclarar?.({ nombre: e.nombre, parametros: e.parametros ?? [] });
      } else if (e.tipo === "cambio") {
        ganchos.current.alCambio(e.parametroId, e.valor);
      } else if (e.tipo === "exportar") {
        ganchos.current.alExportar?.(e.formato, e.datos);
      } else if (e.tipo === "listo") {
        const visibles = declarados.current ? Object.fromEntries(Object.entries(valores).filter(([k]) => declarados.current?.some((p) => p.id === k))) : valores;
        enviar(mensajeParaMarco("estado", { valores: visibles }, token.current));
        previos.current = { ...valores };
      }
    };
    window.addEventListener("message", escuchar);
    return () => window.removeEventListener("message", escuchar);
  }, [origen, valores]);

  useEffect(() => {
    const anteriores = previos.current;
    previos.current = valores;
    for (const [k, v] of Object.entries(valores)) {
      if (anteriores[k] === v) continue;
      if (declarados.current && !declarados.current.some((p) => p.id === k)) continue;
      enviar(mensajeParaMarco("establecer", { parametroId: k, valor: v }, token.current));
    }
  }, [valores]);

  if (tipo === "documento")
    return (
      <iframe ref={ref} srcDoc={html} title={titulo} sandbox="allow-scripts" data-protomolecula="documento" className="aspect-video w-full rounded-md border" />
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Se muestra tal cual: Protomolécula controla su ventana y sus archivos, no sus parámetros.</p>
      <iframe ref={ref} src={url} title={titulo} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" data-protomolecula="externa" className="aspect-video w-full rounded-md border" />
    </div>
  );
}

/** El marco de una herramienta: documento propio · componente del OS · app externa embebida. */
export function MarcoAislado({ definicion, atomoId, valores, alCambio, alExportar, alDeclarar }: MarcoAisladoProps) {
  const vista = definicion.vista;
  if (!vista) return <SinVista motivo={definicion.proximamente} />;
  if (vista.tipo === "documento")
    return (
      <VistaIframe
        tipo="documento"
        titulo={definicion.nombre}
        documento={vista.documento()}
        valores={valores}
        alCambio={alCambio}
        alExportar={alExportar}
        alDeclarar={alDeclarar}
      />
    );
  if (vista.tipo === "componente") return <VistaComponente definicion={definicion} atomoId={atomoId} valores={valores} alCambio={alCambio} />;
  const embebible =
    typeof location !== "undefined"
      ? esUrlEmbebible(vista.url, location.origin)
      : { ok: false as const, motivo: "No se pudo comprobar el enlace en este aparato" };
  if (!embebible.ok)
    return (
      <div role="note" className="flex flex-col gap-2 rounded-md border p-4 text-sm">
        <p>{embebible.motivo}</p>
        <a href={vista.url} target="_blank" rel="noreferrer" className="cursor-pointer text-xs underline">
          Abrir en una pestaña nueva
        </a>
      </div>
    );
  return (
    <VistaIframe
      tipo="externa"
      titulo={definicion.nombre}
      url={vista.url}
      origen={embebible.origen}
      valores={valores}
      alCambio={alCambio}
      alExportar={alExportar}
      alDeclarar={alDeclarar}
    />
  );
}
