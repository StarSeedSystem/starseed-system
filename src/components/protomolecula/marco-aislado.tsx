"use client";

/**
 * Protomolécula · MARCO AISLADO (F1B). Pinta la vista de una herramienta según su `vista`
 * (documento propio en iframe sin origen, componente React o app ajena) y habla con ella por
 * el puente `postMessage`. Contrato: architecture/protomolecula.md §8.1 y §11.1.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { VISTAS_COMPONENTE } from "@/lib/protomolecula/atomos";
import {
  MENSAJES_POR_SEGUNDO, crearToken, esUrlEmbebible, mensajeParaMarco, procesarMensaje,
  type EstadoLimite, type Marco,
} from "@/lib/protomolecula/puente-herramientas";
import type { DefinicionAtomo, VistaProps } from "@/lib/protomolecula/registro-atomos";
import type { Parametro, ValorParametro } from "@/lib/protomolecula/tipos";

export interface DeclaracionAtomo { nombre?: string; parametros?: Parametro[] }

export interface MarcoAisladoProps {
  definicion: DefinicionAtomo;
  atomoId: string;
  /** Valores de ESTE átomo, por id de parámetro. */
  valores: Record<string, ValorParametro>;
  alCambio: (parametroId: string, valor: ValorParametro) => void;
  alExportar?: (formato: string, datos: unknown) => void;
  alDeclarar?: (declaracion: DeclaracionAtomo) => void;
}

const SANDBOX_DOCUMENTO = "allow-scripts";
const SANDBOX_EXTERNA = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";
const ROTULO_EXTERNA = "Se muestra tal cual: Protomolécula controla su ventana y sus archivos, no sus parámetros.";
const SIN_VISTA = "Esta herramienta aún no tiene vista";

const esValor = (v: unknown): v is ValorParametro =>
  typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

const nuevoToken = (): string =>
  typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
    ? crearToken((n) => crypto.getRandomValues(new Uint8Array(n)))
    : "";

function VistaComponente(props: { id: string; atomoId: string; valores: Record<string, ValorParametro>; alCambio: MarcoAisladoProps["alCambio"] }) {
  const Vista = useMemo(() => {
    const cargar = VISTAS_COMPONENTE[props.id];
    return cargar ? lazy(cargar) : null;
  }, [props.id]);
  const alCambiar = (op: Parameters<NonNullable<VistaProps["alCambiar"]>>[0]): void => {
    const accion = op.accion;
    if (!accion || typeof accion !== "object" || (accion as { tipo?: unknown }).tipo !== "exacta") return;
    const valor = (accion as { valor?: unknown }).valor;
    if (esValor(valor)) props.alCambio(op.objetivo.parametroId, valor);
  };
  if (!Vista) return <p className="text-sm text-muted-foreground" role="status">{SIN_VISTA}</p>;
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground" role="status">Cargando la vista…</p>}>
      <Vista atomoId={props.atomoId} valores={props.valores} alCambiar={alCambiar} />
    </Suspense>
  );
}

export function MarcoAislado({ definicion, atomoId, valores, alCambio, alExportar, alDeclarar }: MarcoAisladoProps) {
  const vista = definicion.vista;
  const marcoRef = useRef<HTMLIFrameElement>(null);
  const [token, setToken] = useState("");
  const anterior = useRef<Record<string, ValorParametro> | null>(null);
  const limites = useRef<EstadoLimite>({ fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: 0 });
  const cb = useRef({ alCambio, alExportar, alDeclarar });
  cb.current = { alCambio, alExportar, alDeclarar };
  const parametros = useRef(definicion.parametros);
  parametros.current = definicion.parametros;

  useEffect(() => {
    if (vista?.tipo === "documento") setToken((t) => t || nuevoToken());
  }, [vista]);

  useEffect(() => {
    if (vista?.tipo !== "documento" || !token) return;
    const ventana = marcoRef.current?.contentWindow;
    if (!ventana) return;
    const previos = anterior.current ?? {};
    for (const [parametroId, valor] of Object.entries(valores)) {
      if (previos[parametroId] === valor) continue;
      ventana.postMessage(mensajeParaMarco("establecer", { parametroId, valor }, token), "*");
    }
    anterior.current = { ...previos, ...valores };
  }, [valores, token, vista]);

  useEffect(() => {
    if (!vista || vista.tipo === "externa") return;
    const recibir = (ev: MessageEvent) => {
      const marco: Marco = {
        ventana: marcoRef.current?.contentWindow ?? null, token, origenEsperado: null, parametros: parametros.current,
      };
      const r = procesarMensaje({ origin: ev.origin, source: ev.source, data: ev.data }, marco, Date.now(), limites.current);
      limites.current = r.estado;
      const e = r.entrada;
      if (!e) return;
      if (e.tipo === "cambio" && typeof e.parametroId === "string" && esValor(e.valor)) {
        cb.current.alCambio(e.parametroId, e.valor);
      } else if (e.tipo === "exportar" && typeof e.formato === "string") {
        cb.current.alExportar?.(e.formato, e.datos);
      } else if (e.tipo === "hola") {
        cb.current.alDeclarar?.({
          nombre: typeof e.nombre === "string" ? e.nombre : undefined,
          parametros: Array.isArray(e.parametros) ? (e.parametros as Parametro[]) : undefined,
        });
      }
    };
    window.addEventListener("message", recibir);
    return () => window.removeEventListener("message", recibir);
  }, [vista, token]);

  if (!vista) return <p className="text-sm text-muted-foreground" role="status">{SIN_VISTA}</p>;
  if (vista.tipo === "componente") return <VistaComponente id={vista.id} atomoId={atomoId} valores={valores} alCambio={alCambio} />;
  if (vista.tipo === "externa") {
    const embebible = esUrlEmbebible(vista.url, typeof window === "undefined" ? "" : window.location.origin);
    if (!embebible.ok) {
      return (
        <div className="flex flex-col gap-1 rounded-md border p-3 text-sm" role="note">
          <p>No se puede incrustar esta herramienta.</p>
          <p className="text-xs text-muted-foreground">{embebible.motivo}</p>
          <a className="cursor-pointer text-xs underline" href={vista.url} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña</a>
        </div>
      );
    }
    return (
      <figure className="flex flex-col gap-1">
        <iframe ref={marcoRef} src={vista.url} title={definicion.nombre} sandbox={SANDBOX_EXTERNA} referrerPolicy="no-referrer" className="h-72 w-full rounded-md border" />
        <figcaption className="text-xs text-muted-foreground">{ROTULO_EXTERNA}</figcaption>
      </figure>
    );
  }
  if (!token) return <p className="text-sm text-muted-foreground" role="status">Preparando la herramienta…</p>;
  return (
    <iframe
      ref={marcoRef}
      title={definicion.nombre}
      sandbox={SANDBOX_DOCUMENTO}
      srcDoc={vista.documento().replaceAll("__PM_CANAL__", token)}
      className="h-72 w-full rounded-md border"
    />
  );
}

export default MarcoAislado;
