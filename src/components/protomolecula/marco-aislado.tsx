"use client";

/** Protomolécula · MARCO AISLADO: documento en iframe aislado, componente diferido o app externa. */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VISTAS_COMPONENTE } from "@/lib/protomolecula/atomos";
import {
  crearToken, destinoDe, esUrlEmbebible, mensajeParaMarco, procesarMensaje,
  MENSAJES_POR_SEGUNDO, type EstadoLimite, type Marco,
} from "@/lib/protomolecula/puente-herramientas";
import type { DefinicionAtomo, Parametro, VistaProps } from "@/lib/protomolecula/registro-atomos";
import type { EstadoValores } from "@/lib/protomolecula/tipos";

export interface MarcoAisladoProps {
  definicion: DefinicionAtomo;
  atomoId: string;
  valores: EstadoValores;
  alCambio: (parametroId: string, valor: unknown) => void;
  alExportar?: (formato: string, datos: unknown) => void;
  alDeclarar?: (declaracion: { nombre?: string; parametros?: Parametro[] }) => void;
}

const AVISO_EXTERNA = "Se muestra tal cual: Protomolécula controla su ventana y sus archivos, no sus parámetros.";
const SANDBOX_EXTERNA = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";

const tokenAleatorio = (): string => crearToken((n) => crypto.getRandomValues(new Uint8Array(n)));

export function MarcoAislado({ definicion, atomoId, valores, alCambio, alExportar, alDeclarar }: MarcoAisladoProps) {
  const vista = definicion.vista;
  const esDocumento = vista?.tipo === "documento";
  const [token] = useState(tokenAleatorio);
  const refIframe = useRef<HTMLIFrameElement | null>(null);
  const marcoRef = useRef<Marco | null>(null);
  const previosRef = useRef<EstadoValores | null>(null);
  const valoresRef = useRef(valores);
  valoresRef.current = valores;

  const html = useMemo(() => (vista?.tipo === "documento" ? vista.documento().split("__PM_CANAL__").join(token) : ""), [vista, token]);
  const idComponente = vista?.tipo === "componente" ? vista.id : null;
  const Vista = useMemo(() => {
    const carga = idComponente === null ? undefined : VISTAS_COMPONENTE[idComponente];
    return carga ? lazy(carga) : null;
  }, [idComponente]);

  const fijarIframe = useCallback((nodo: HTMLIFrameElement | null) => {
    refIframe.current = nodo;
    const ventana = nodo?.contentWindow ?? null;
    marcoRef.current = ventana ? { ventana, token, origenEsperado: null, parametros: definicion.parametros } : null;
  }, [token, definicion.parametros]);

  const enviar = useCallback((actuales: EstadoValores, todos: boolean) => {
    const marco = marcoRef.current;
    if (!marco) return;
    const previos = previosRef.current;
    const lista = Object.entries(actuales).filter(([k, v]) => todos || previos === null || previos[k] !== v);
    previosRef.current = { ...actuales };
    const destino = destinoDe(marco);
    for (const [parametroId, valor] of lista) {
      (marco.ventana as Window).postMessage(mensajeParaMarco("establecer", { parametroId, valor }, marco.token), destino);
    }
  }, []);

  useEffect(() => {
    if (esDocumento) enviar(valores, false);
  }, [valores, esDocumento, enviar]);

  useEffect(() => {
    if (!esDocumento) return;
    let limite: EstadoLimite = { fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: 0 };
    const alRecibir = (ev: MessageEvent) => {
      const marco = marcoRef.current;
      if (!marco) return;
      const r = procesarMensaje({ origin: ev.origin, source: ev.source, data: ev.data }, marco, Date.now(), limite);
      limite = r.estado;
      const e = r.entrada;
      if (!e) return;
      if (e.tipo === "cambio") alCambio(String(e.parametroId), e.valor);
      else if (e.tipo === "exportar" && alExportar) alExportar(String(e.formato), e.datos);
      else if (e.tipo === "hola" && alDeclarar)
        alDeclarar({ nombre: e.nombre as string | undefined, parametros: e.parametros as Parametro[] | undefined });
    };
    window.addEventListener("message", alRecibir);
    return () => window.removeEventListener("message", alRecibir);
  }, [esDocumento, alCambio, alExportar, alDeclarar]);

  if (!vista) {
    return <p role="status" className="text-sm text-muted-foreground">Esta herramienta aún no tiene vista.</p>;
  }
  if (vista.tipo === "externa") {
    const origenOS = typeof window === "undefined" ? "" : window.location.origin;
    const embebible = esUrlEmbebible(vista.url, origenOS);
    return (
      <section aria-label={`Vista de ${definicion.nombre}`} className="flex flex-col gap-2">
        {embebible.ok ? (<>
          <iframe title={definicion.nombre} src={vista.url} sandbox={SANDBOX_EXTERNA} referrerPolicy="no-referrer" className="h-full min-h-[240px] w-full border-0" />
          <p className="text-xs text-muted-foreground">{AVISO_EXTERNA}</p>
        </>) : (
          <div className="rounded-md border p-3 text-sm">
            <p>No se puede mostrar dentro del OS: {embebible.motivo}.</p>
            <a href={vista.url} target="_blank" rel="noopener noreferrer" className="cursor-pointer text-primary underline">Abrir «{definicion.nombre}» en otra pestaña</a>
          </div>
        )}
      </section>
    );
  }
  if (vista.tipo === "componente") {
    if (!Vista) {
      return <p role="status" className="text-sm text-muted-foreground">Esta herramienta aún no tiene vista.</p>;
    }
    const alCambiarComponente = (op: Parameters<NonNullable<VistaProps["alCambiar"]>>[0]) => {
      const accion = op.accion as { tipo?: string; valor?: unknown };
      if (accion.tipo === "exacta") alCambio(op.objetivo.parametroId, accion.valor);
    };
    return <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Cargando {definicion.nombre}…</p>}>
      <Vista atomoId={atomoId} valores={valores} alCambiar={alCambiarComponente} />
    </Suspense>;
  }
  return <iframe ref={fijarIframe} title={definicion.nombre} sandbox="allow-scripts" srcDoc={html}
    onLoad={() => enviar(valoresRef.current, true)} className="h-full min-h-[240px] w-full border-0" />;
}
