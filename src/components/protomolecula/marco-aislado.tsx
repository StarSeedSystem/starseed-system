"use client";
/**
 * Protomolécula · MARCO AISLADO (F1B). Pinta la vista de un átomo según su grado de integración
 * (contrato §8.1): documento propio en iframe `sandbox="allow-scripts"` con origen opaco y token
 * por marco, componente React diferido, o app ajena embebida solo si es `https` y de otro origen.
 * Habla con el documento por `postMessage` con `procesarMensaje` y le manda `establecer` solo de
 * los valores que cambiaron.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { VISTAS_COMPONENTE } from "@/lib/protomolecula/atomos";
import { valorActual } from "@/lib/protomolecula/parametros";
import { crearToken, destinoDe, esUrlEmbebible, mensajeParaMarco, procesarMensaje, type EstadoLimite, type Marco } from "@/lib/protomolecula/puente-herramientas";
import type { DefinicionAtomo, Parametro, VistaProps } from "@/lib/protomolecula/registro-atomos";
import type { EstadoValores, ValorParametro } from "@/lib/protomolecula/tipos";
const SANDBOX_DOCUMENTO = "allow-scripts";
const SANDBOX_EXTERNA = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";
const AVISO_EXTERNA = "Se muestra tal cual: Protomolécula controla su ventana y sus archivos, no sus parámetros.";
const SIN_VISTA = "Esta herramienta aún no tiene vista";
const FICHAS: EstadoLimite = { fichas: 120, proximaRecarga: 0 };
const nuevoToken = (): string => crearToken((n) => crypto.getRandomValues(new Uint8Array(n)));
const tokenInicial = (): string => (typeof window === "undefined" ? "" : nuevoToken());
const origenActual = (): string => (typeof location === "undefined" ? "" : location.origin);
function enlaceSeguro(url: string): boolean {
  try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}
export interface DeclaracionAtomo { nombre?: string; parametros?: Parametro[] }
export interface MarcoAisladoProps {
  definicion: DefinicionAtomo;
  atomoId: string;
  valores: EstadoValores;
  alCambio?: (parametroId: string, valor: ValorParametro) => void;
  alExportar?: (formato: string, datos: unknown) => void;
  alDeclarar?: (declaracion: DeclaracionAtomo) => void;
}
export function MarcoAislado({ definicion, atomoId, valores, alCambio, alExportar, alDeclarar }: MarcoAisladoProps) {
  const vista = definicion.vista;
  const [token, setToken] = useState(tokenInicial);
  const [declarado, setDeclarado] = useState(false);
  const marcoRef = useRef<HTMLIFrameElement | null>(null);
  const fichas = useRef<EstadoLimite>(FICHAS);
  const previos = useRef<Record<string, ValorParametro> | null>(null);
  const idComponente = vista?.tipo === "componente" ? vista.id : null;
  const Vista = useMemo(() => {
    const cargador = idComponente ? VISTAS_COMPONENTE[idComponente] : undefined;
    return cargador ? lazy(cargador) : null;
  }, [idComponente]);
  const esDocumento = vista?.tipo === "documento";
  const documento = useMemo(() => {
    if (vista?.tipo !== "documento" || !token) return "";
    return vista.documento().split("__PM_CANAL__").join(token);
  }, [vista, token]);
  useEffect(() => { if (!token) setToken(nuevoToken()); }, [token]);
  useEffect(() => {
    if (!esDocumento) return;
    previos.current = null;
    fichas.current = FICHAS;
    setDeclarado(false);
  }, [esDocumento, token, atomoId]);
  useEffect(() => {
    if (!esDocumento) return;
    const alRecibir = (ev: MessageEvent) => {
      const marco: Marco = { ventana: marcoRef.current?.contentWindow ?? null, token, origenEsperado: null, parametros: definicion.parametros };
      const r = procesarMensaje({ origin: ev.origin, source: ev.source, data: ev.data }, marco, Date.now(), fichas.current);
      fichas.current = r.estado;
      const e = r.entrada;
      if (!e) return;
      if (e.tipo === "hola") {
        setDeclarado(true);
        alDeclarar?.({ nombre: e.nombre as string | undefined, parametros: e.parametros as Parametro[] | undefined });
      } else if (e.tipo === "cambio") alCambio?.(e.parametroId as string, e.valor as ValorParametro);
      else if (e.tipo === "exportar") alExportar?.(e.formato as string, e.datos);
    };
    window.addEventListener("message", alRecibir);
    return () => window.removeEventListener("message", alRecibir);
  }, [esDocumento, token, definicion.parametros, alCambio, alExportar, alDeclarar]);
  useEffect(() => {
    if (!esDocumento || !declarado) return;
    const ventana = marcoRef.current?.contentWindow;
    if (!ventana) return;
    const antes = previos.current ?? {};
    const siguiente: Record<string, ValorParametro> = {};
    const cambios: { parametroId: string; valor: ValorParametro }[] = [];
    for (const p of definicion.parametros) {
      const valor = valorActual(valores, { atomoId, parametroId: p.id }, p);
      siguiente[p.id] = valor;
      if (antes[p.id] !== valor) cambios.push({ parametroId: p.id, valor });
    }
    previos.current = siguiente;
    for (const c of cambios) ventana.postMessage(mensajeParaMarco("establecer", { parametroId: c.parametroId, valor: c.valor }, token), destinoDe({ ventana, token, origenEsperado: null }));
  }, [esDocumento, declarado, valores, token, atomoId, definicion.parametros]);
  if (vista?.tipo === "documento") {
    return token ? <iframe ref={marcoRef} title={`Vista de ${definicion.nombre}`} sandbox={SANDBOX_DOCUMENTO} srcDoc={documento} className="h-full min-h-64 w-full rounded-md border" /> : null;
  }
  if (vista?.tipo === "componente") {
    if (!Vista) return <p role="status" className="p-2 text-sm text-muted-foreground">{SIN_VISTA}</p>;
    const mapa: Record<string, unknown> = {};
    for (const p of definicion.parametros) mapa[p.id] = valorActual(valores, { atomoId, parametroId: p.id }, p);
    const alCambiarVista: VistaProps["alCambiar"] = alCambio
      ? (op) => { const a = op.accion as { tipo?: string; valor?: unknown } | null; if (a?.tipo === "exacta") alCambio(op.objetivo.parametroId, a.valor as ValorParametro); }
      : undefined;
    return <Suspense fallback={<p role="status" className="p-2 text-sm text-muted-foreground">Cargando la vista…</p>}><Vista atomoId={atomoId} valores={mapa} alCambiar={alCambiarVista} /></Suspense>;
  }
  if (vista?.tipo === "externa") {
    const revision = esUrlEmbebible(vista.url, origenActual());
    if (revision.ok) return (
      <div className="flex h-full w-full flex-col gap-1">
        <p className="text-xs text-muted-foreground">{AVISO_EXTERNA}</p>
        <iframe title={`Vista de ${definicion.nombre}`} src={vista.url} sandbox={SANDBOX_EXTERNA} className="min-h-64 w-full flex-1 rounded-md border" />
      </div>
    );
    return <div role="note" className="flex flex-col gap-1 rounded-md border p-3"><p className="text-sm font-medium">{definicion.nombre}</p><p className="text-xs text-muted-foreground">{revision.motivo}</p>{enlaceSeguro(vista.url) && <a href={vista.url} target="_blank" rel="noreferrer noopener" className="cursor-pointer text-sm underline">Abrir en otra pestaña</a>}</div>;
  }
  return <p role="status" className="p-2 text-sm text-muted-foreground">{SIN_VISTA}</p>;
}
