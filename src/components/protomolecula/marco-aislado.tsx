"use client";

/** Protomolécula · MARCO AISLADO (F1B). Documento propio en iframe `sandbox="allow-scripts"` (sin
 * `allow-same-origin`) con token en `__PM_CANAL__`; componente conocido; o app ajena solo si es
 * `https` y de otro origen. Habla con los marcos por `procesarMensaje` (F1A). */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactElement } from "react";
import { VISTAS_COMPONENTE } from "@/lib/protomolecula/atomos";
import { MENSAJES_POR_SEGUNDO, crearToken, destinoDe, esUrlEmbebible, mensajeParaMarco, procesarMensaje, type EstadoLimite, type Marco } from "@/lib/protomolecula/puente-herramientas";
import type { DefinicionAtomo, VistaProps } from "@/lib/protomolecula/registro-atomos";
import type { EstadoValores, Parametro, ValorParametro } from "@/lib/protomolecula/tipos";

export interface MarcoAisladoProps {
  definicion: DefinicionAtomo; atomoId: string; valores: EstadoValores;
  alCambio: (parametroId: string, valor: ValorParametro) => void;
  alExportar?: (formato: string, datos: unknown) => void;
  alDeclarar?: (informe: { nombre?: string; parametros?: Parametro[] }) => void; // solo informa del `hola`
}
const SANDBOX_DOCUMENTO = "allow-scripts";
const SANDBOX_EXTERNA = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";
const AVISO_EXTERNA = "Se muestra tal cual: Protomolécula controla su ventana y sus archivos, no sus parámetros.";
const CLASE_IFRAME = "h-64 w-full rounded-md border border-border bg-background";
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", glb: "model/gltf-binary", gltf: "model/gltf+json", json: "application/json", csv: "text/csv", txt: "text/plain", srt: "text/plain", vtt: "text/vtt" };
/** Blob y nombre para una descarga real de lo que exporta una herramienta. */
export function blobDeExportacion(formato: string, datos: unknown): { blob: Blob; nombre: string } {
  const ext = formato.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const contenido = typeof datos === "string" ? datos : (JSON.stringify(datos) ?? "");
  return { blob: new Blob([contenido], { type: MIME[ext] ?? "application/octet-stream" }), nombre: `protomolecula.${ext}` };
}
/** Id de una `Operacion` con la misma trampa que el panel: `randomUUID` si el navegador lo da. */
export const idOperacion = (): string => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `pm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const nuevoToken = (): string => crearToken((n) => crypto.getRandomValues(new Uint8Array(n)));
/** Valores del átomo, tanto si llegan por `atomoId::parametroId` como si ya vienen por parámetro. */
function valoresDelAtomo(valores: EstadoValores, atomoId: string): Record<string, ValorParametro> {
  const out: Record<string, ValorParametro> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    const [id, parametroId] = clave.includes("::") ? clave.split("::") : [atomoId, clave];
    if (id === atomoId) out[parametroId] = valor;
  }
  return out;
}
type VistaComponenteProps = { cargador: () => Promise<{ default: ComponentType<VistaProps> }>; atomoId: string; valores: Record<string, ValorParametro>; alCambio: (p: string, v: ValorParametro) => void };

function VistaComponente({ cargador, atomoId, valores, alCambio }: VistaComponenteProps): ReactElement {
  const Componente = useMemo(() => lazy(cargador), [cargador]);
  return (
    <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Cargando la vista de la herramienta…</p>}>
      <Componente atomoId={atomoId} valores={valores} alCambiar={(op) => {
        const accion = op.accion as { tipo?: string; valor?: ValorParametro };
        if (accion.tipo === "exacta" && accion.valor !== undefined) alCambio(op.objetivo.parametroId, accion.valor);
      }} />
    </Suspense>
  );
}

export function MarcoAislado({ definicion, atomoId, valores, alCambio, alExportar, alDeclarar }: MarcoAisladoProps): ReactElement | null {
  const vista = definicion.vista;
  const [entorno, setEntorno] = useState<{ token: string; origen: string } | null>(null);
  const marcoRef = useRef<HTMLIFrameElement | null>(null);
  const anteriores = useRef<Record<string, ValorParametro> | null>(null);
  const limite = useRef<EstadoLimite>({ fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: 0 });
  const cargada = useRef(false);
  const valoresAtomo = useMemo(() => valoresDelAtomo(valores, atomoId), [valores, atomoId]);
  const token = entorno?.token ?? null;

  useEffect(() => { setEntorno({ token: nuevoToken(), origen: window.location.origin }); }, []);

  const enviar = useCallback((parametroId: string, valor: ValorParametro) => {
    const ventana = marcoRef.current?.contentWindow;
    if (!ventana || !token) return;
    const marco: Marco = { ventana, token, origenEsperado: null, parametros: definicion.parametros };
    ventana.postMessage(mensajeParaMarco("establecer", { parametroId, valor }, token), destinoDe(marco));
  }, [token, definicion.parametros]);

  useEffect(() => {
    if (!vista || vista.tipo !== "documento" || !token) return;
    const previos = anteriores.current;
    anteriores.current = valoresAtomo;
    for (const [p, v] of Object.entries(valoresAtomo)) if (!previos || !Object.is(previos[p], v)) enviar(p, v);
  }, [valoresAtomo, vista, token, enviar]);

  useEffect(() => {
    if (!vista || vista.tipo !== "documento" || !token) return;
    const alRecibir = (ev: MessageEvent) => {
      const ventana = marcoRef.current?.contentWindow;
      if (!ventana) return;
      const marco: Marco = { ventana, token, origenEsperado: null, parametros: definicion.parametros };
      const r = procesarMensaje(ev, marco, Date.now(), limite.current);
      limite.current = r.estado;
      const e = r.entrada;
      if (!e) return;
      if (e.tipo === "cambio") alCambio(String(e.parametroId), e.valor as ValorParametro);
      else if (e.tipo === "exportar") alExportar?.(String(e.formato), e.datos);
      else if (e.tipo === "hola") alDeclarar?.({ nombre: e.nombre as string | undefined, parametros: e.parametros as Parametro[] | undefined });
    };
    window.addEventListener("message", alRecibir);
    return () => window.removeEventListener("message", alRecibir);
  }, [vista, token, definicion.parametros, alCambio, alExportar, alDeclarar]);

  if (!vista) return null;
  if (vista.tipo === "documento") {
    if (!token) return null;
    const alCargar = () => {
      if (cargada.current) return;
      cargada.current = true;
      for (const [p, v] of Object.entries(valoresAtomo)) enviar(p, v);
    };
    return <iframe ref={marcoRef} title={definicion.nombre} sandbox={SANDBOX_DOCUMENTO} srcDoc={vista.documento().replaceAll("__PM_CANAL__", token)} onLoad={alCargar} data-pm-canal={token} className={CLASE_IFRAME} />;
  }
  if (vista.tipo === "componente") {
    const cargador = VISTAS_COMPONENTE[vista.id];
    return cargador ? <VistaComponente cargador={cargador} atomoId={atomoId} valores={valoresAtomo} alCambio={alCambio} />
      : <p role="status" className="text-sm text-muted-foreground">Esta herramienta aún no tiene vista</p>;
  }
  if (!entorno) return null;
  const embebible = esUrlEmbebible(vista.url, entorno.origen);
  if (!embebible.ok) return <div role="note" className="flex flex-col gap-1 rounded-md border border-amber-400/40 p-2 text-sm"><p>No se puede incrustar esta herramienta: {embebible.motivo}.</p><a href={vista.url} target="_blank" rel="noopener noreferrer" className="cursor-pointer underline">Abrir en una pestaña nueva</a></div>;
  return <figure className="flex flex-col gap-1"><iframe title={definicion.nombre} src={vista.url} sandbox={SANDBOX_EXTERNA} referrerPolicy="no-referrer" className={CLASE_IFRAME} /><figcaption className="text-xs text-muted-foreground">{AVISO_EXTERNA}</figcaption></figure>;
}
