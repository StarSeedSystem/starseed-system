"use client";

/** Protomolécula · MARCO AISLADO (F1B). Pinta la vista de un átomo y la conecta al controlador por el puente de F1A. */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VISTAS_COMPONENTE } from "@/lib/protomolecula/atomos";
import { crearToken, destinoDe, esUrlEmbebible, MENSAJES_POR_SEGUNDO, mensajeParaMarco, procesarMensaje, type EstadoLimite, type Marco } from "@/lib/protomolecula/puente-herramientas";
import type { DefinicionAtomo, Parametro, VistaProps } from "@/lib/protomolecula/registro-atomos";
import type { EstadoValores, ValorParametro } from "@/lib/protomolecula/tipos";

const SANDBOX_DOCUMENTO = "allow-scripts";
const SANDBOX_EXTERNA = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";
const SIN_VISTA = "Esta herramienta aún no tiene vista";
const AVISO_EXTERNA = "Se muestra tal cual: Protomolécula controla su ventana y sus archivos, no sus parámetros.";
type ValoresAtomo = Record<string, ValorParametro>;
export interface MarcoAisladoProps {
  definicion: DefinicionAtomo;
  atomoId: string;
  valores: EstadoValores;
  alCambio: (parametroId: string, valor: ValorParametro) => void;
  alExportar?: (formato: string, datos: unknown) => void;
  alDeclarar?: (declaracion: { nombre?: string; parametros?: Parametro[] }) => void;
}

const nuevoToken = (): string => crearToken((n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
function valoresDelAtomo(valores: EstadoValores, atomoId: string): ValoresAtomo {
  const prefijo = `${atomoId}::`;
  const out: ValoresAtomo = {};
  for (const [clave, valor] of Object.entries(valores)) {
    if (clave.startsWith(prefijo)) out[clave.slice(prefijo.length)] = valor;
    else if (!clave.includes("::")) out[clave] = valor;
  }
  return out;
}

const diferencia = (antes: ValoresAtomo, ahora: ValoresAtomo): Array<[string, ValorParametro]> => Object.entries(ahora).filter(([id, valor]) => !Object.is(antes[id], valor));
export function MarcoAislado({ definicion, atomoId, valores, alCambio, alExportar, alDeclarar }: MarcoAisladoProps) {
  const vista = definicion.vista;
  const [token] = useState(nuevoToken);
  const limiteRef = useRef<EstadoLimite>({ fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: 0 });
  const marcoRef = useRef<HTMLIFrameElement>(null);
  const previosRef = useRef<ValoresAtomo | null>(null);
  const modo = vista?.tipo === "externa" ? esUrlEmbebible(vista.url, typeof window === "undefined" ? "" : window.location.origin) : null;
  const origenExterno = modo?.ok ? modo.origen : null;
  const cargador = vista?.tipo === "componente" ? VISTAS_COMPONENTE[vista.id] : undefined;
  const Vista = useMemo(() => (cargador ? lazy(cargador) : null), [cargador]);
  const html = useMemo(() => (vista?.tipo === "documento" ? vista.documento().split("__PM_CANAL__").join(token) : ""), [vista, token]);

  const enviar = useCallback((parametroId: string, valor: ValorParametro) => {
    const ventana = marcoRef.current?.contentWindow;
    if (!ventana) return;
    const marco: Marco = { ventana, token, origenEsperado: origenExterno, parametros: definicion.parametros };
    ventana.postMessage(mensajeParaMarco("establecer", { parametroId, valor }, token), destinoDe(marco));
  }, [token, origenExterno, definicion.parametros]);

  useEffect(() => {
    if (!vista || vista.tipo === "componente") return;
    const alMensaje = (ev: MessageEvent) => {
      const marco: Marco = { ventana: marcoRef.current?.contentWindow, token, origenEsperado: vista.tipo === "externa" ? origenExterno : null, parametros: definicion.parametros };
      const r = procesarMensaje({ origin: ev.origin, source: ev.source, data: ev.data }, marco, Date.now(), limiteRef.current);
      limiteRef.current = r.estado;
      const e = r.entrada;
      if (!e) return;
      if (e.tipo === "cambio" && typeof e.parametroId === "string") alCambio(e.parametroId, e.valor as ValorParametro);
      else if (e.tipo === "exportar" && typeof e.formato === "string") alExportar?.(e.formato, e.datos);
      else if (e.tipo === "hola") alDeclarar?.({ nombre: typeof e.nombre === "string" ? e.nombre : undefined, parametros: e.parametros as Parametro[] | undefined });
    };
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, [vista, token, origenExterno, definicion.parametros, alCambio, alExportar, alDeclarar]);

  useEffect(() => {
    const ahora = valoresDelAtomo(valores, atomoId);
    const antes = previosRef.current;
    previosRef.current = ahora;
    if (!antes || vista?.tipo !== "documento") return;
    for (const [parametroId, valor] of diferencia(antes, ahora)) enviar(parametroId, valor);
  }, [valores, atomoId, vista, enviar]);

  if (!vista) return <p role="status" className="text-sm text-muted-foreground">{definicion.proximamente ?? SIN_VISTA}</p>;

  if (vista.tipo === "documento") {
    return (
      <iframe ref={marcoRef} title={definicion.nombre} sandbox={SANDBOX_DOCUMENTO} srcDoc={html}
        onLoad={() => { for (const [parametroId, valor] of Object.entries(valoresDelAtomo(valores, atomoId))) enviar(parametroId, valor); }}
        className="h-full min-h-64 w-full rounded-md border bg-background" />
    );
  }

  if (vista.tipo === "componente") {
    if (!Vista) return <p role="status" className="text-sm text-muted-foreground">{SIN_VISTA}</p>;
    const alCambiar: NonNullable<VistaProps["alCambiar"]> = (op) => {
      const accion = op.accion as { tipo?: string; valor?: ValorParametro };
      if (accion.tipo === "exacta" && accion.valor !== undefined) alCambio(op.objetivo.parametroId, accion.valor);
      else if (accion.tipo === "disparo") alCambio(op.objetivo.parametroId, true);
    };
    return <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Cargando vista…</p>}>
      <Vista atomoId={atomoId} valores={valoresDelAtomo(valores, atomoId)} alCambiar={alCambiar} />
    </Suspense>;
  }

  if (!modo?.ok) {
    const enlace = /^https?:\/\//.test(vista.url) ? vista.url : null;
    return (
      <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
        <p className="text-muted-foreground">No se puede mostrar aquí: {modo?.ok === false ? modo.motivo : "URL inválida"}.</p>
        {enlace && <a href={enlace} target="_blank" rel="noopener noreferrer" className="cursor-pointer text-primary underline">{vista.url}</a>}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-1">
      <p className="text-xs text-muted-foreground">{AVISO_EXTERNA}</p>
      <iframe ref={marcoRef} title={definicion.nombre} src={vista.url} sandbox={SANDBOX_EXTERNA}
        referrerPolicy="no-referrer" className="min-h-64 w-full flex-1 rounded-md border bg-background" />
    </div>
  );
}
export default MarcoAislado;
