"use client";

/**
 * Protomolécula · MARCO AISLADO (F1B). Pinta la vista de un átomo según `definicion.vista` (documento propio
 * en iframe sandbox, componente de `VISTAS_COMPONENTE` o app ajena «solo ventana») y lo une con el puente:
 * valida cada `message` con `procesarMensaje` y manda `establecer` solo de lo que cambió (contrato §8.1, §11.1).
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { VISTAS_COMPONENTE } from "@/lib/protomolecula/atomos";
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { EstadoValores } from "@/lib/protomolecula/tipos";
import { MENSAJES_POR_SEGUNDO, crearToken, destinoDe, esUrlEmbebible, mensajeParaMarco, procesarMensaje, type EstadoLimite } from "@/lib/protomolecula/puente-herramientas";

const SIN_VISTA = "Esta herramienta aún no tiene vista.";
const ROTULO_EXTERNA = "Se muestra tal cual: Protomolécula controla su ventana y sus archivos, no sus parámetros.";

export interface MarcoAisladoProps {
  definicion: DefinicionAtomo;
  atomoId: string;
  valores: EstadoValores;
  alCambio: (parametroId: string, valor: unknown) => void;
  alExportar?: (formato: string, datos: unknown) => void;
  /** Un «hola»: solo informa cómo se declara la herramienta. */
  alDeclarar?: (info: { nombre?: string; parametros?: DefinicionAtomo["parametros"] }) => void;
}

/** Valores de UN átomo: el estado viaja por «atomoId::parametroId»; aquí queda por «parametroId». */
export function valoresDelAtomo(valores: EstadoValores, atomoId: string): Record<string, unknown> {
  const prefijo = `${atomoId}::`;
  const propios: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    if (clave.startsWith(prefijo)) propios[clave.slice(prefijo.length)] = valor;
  }
  return propios;
}

const MIMES: Record<string, string> = { png: "image/png", svg: "image/svg+xml", json: "application/json", wav: "audio/wav", mp3: "audio/mpeg", mp4: "video/mp4", glb: "model/gltf-binary", csv: "text/csv", html: "text/html", vtt: "text/vtt", srt: "text/plain" };

/** URL de objeto (Blob con el MIME del formato) para el enlace «Descargar»; sin `URL.createObjectURL` (pruebas) devuelve null. */
export function urlDeDescarga(ex: { formato: string; datos: unknown }): string | null {
  if (typeof URL !== "object" || typeof URL.createObjectURL !== "function") return null;
  const cuerpo = ex.datos instanceof Blob ? ex.datos : new Blob([typeof ex.datos === "string" ? ex.datos : JSON.stringify(ex.datos ?? "")], { type: MIMES[ex.formato.toLowerCase()] ?? "application/octet-stream" });
  return URL.createObjectURL(cuerpo);
}

export function MarcoAislado({ definicion, atomoId, valores, alCambio, alExportar, alDeclarar }: MarcoAisladoProps) {
  const [token] = useState(() => crearToken((n: number) => crypto.getRandomValues(new Uint8Array(n))));
  const vista = definicion.vista;
  const alIframe = useRef<HTMLIFrameElement | null>(null);
  const fichasRef = useRef<EstadoLimite>({ fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: 0 });
  const previosRef = useRef<Record<string, unknown> | null>(null);
  const llamadas = useRef({ alCambio, alExportar, alDeclarar, definicion });
  llamadas.current = { alCambio, alExportar, alDeclarar, definicion };
  const origenExterno = vista?.tipo === "externa" ? esUrlEmbebible(vista.url, typeof location === "undefined" ? "https://os.invalid" : location.origin) : null;
  const html = useMemo(() => (vista?.tipo === "documento" ? vista.documento().replaceAll("__PM_CANAL__", token) : null), [vista, token]);
  const Componente = useMemo(() => (vista?.tipo === "componente" && VISTAS_COMPONENTE[vista.id] ? lazy(VISTAS_COMPONENTE[vista.id]) : null), [vista]);

  // Las callbacks cambian en cada render; el oyente se apunta UNA vez y las lee frescas.
  useEffect(() => {
    const oir = (evento: MessageEvent) => {
      const ventana = alIframe.current?.contentWindow ?? null;
      const juez = llamadas.current;
      const r = procesarMensaje(
        { origin: evento.origin, source: evento.source, data: evento.data },
        { ventana, token, origenEsperado: origenExterno && origenExterno.ok ? origenExterno.origen : null, parametros: juez.definicion.parametros },
        Date.now(),
        fichasRef.current,
      );
      fichasRef.current = r.estado;
      if (!r.entrada) return;
      if (r.entrada.tipo === "cambio") juez.alCambio(r.entrada.parametroId, r.entrada.valor);
      else if (r.entrada.tipo === "exportar") juez.alExportar?.(r.entrada.formato, r.entrada.datos);
      else if (r.entrada.tipo === "hola") juez.alDeclarar?.({ nombre: r.entrada.nombre, parametros: r.entrada.parametros });
    };
    window.addEventListener("message", oir);
    return () => window.removeEventListener("message", oir);
  }, [token, origenExterno]);

  // Diferencia con el ANTERIOR: solo lo que cambió viaja, nunca el estado entero.
  useEffect(() => {
    const ventana = alIframe.current?.contentWindow;
    if (!ventana) return;
    const propios = valoresDelAtomo(valores, atomoId);
    const previos = previosRef.current;
    previosRef.current = propios;
    const destino = vista?.tipo === "externa" && origenExterno && origenExterno.ok ? origenExterno.origen : destinoDe({ ventana, token, origenEsperado: null });
    for (const [parametroId, valor] of Object.entries(propios)) {
      if (previos !== null && previos[parametroId] === valor) continue;
      const esDisparo = definicion.parametros.find((p) => p.id === parametroId)?.tipo === "disparo";
      const orden = esDisparo ? mensajeParaMarco("disparar", { parametroId }, token) : mensajeParaMarco("establecer", { parametroId, valor }, token);
      ventana.postMessage(orden, destino);
    }
  }, [valores, atomoId, token, vista, origenExterno, definicion]);

  const alCambiarComponente = (op: { objetivo: { parametroId: string }; accion: unknown }): void => {
    const a = op.accion && typeof op.accion === "object" ? (op.accion as { tipo?: string; valor?: unknown }) : null;
    if (a?.tipo === "exacta" && a.valor !== undefined) alCambio(op.objetivo.parametroId, a.valor);
  };

  let corazon: ReactNode;
  if (vista?.tipo === "documento" && html !== null) {
    corazon = <iframe ref={alIframe} sandbox="allow-scripts" srcDoc={html} title={definicion.nombre} className="h-64 w-full rounded-lg border bg-background" />;
  } else if (vista?.tipo === "externa" && origenExterno && origenExterno.ok) {
    corazon = (
      <>
        <iframe ref={alIframe} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" src={vista.url} title={definicion.nombre} className="h-64 w-full rounded-lg border" />
        <p className="text-xs text-muted-foreground">{ROTULO_EXTERNA}</p>
      </>
    );
  } else if (vista?.tipo === "externa") {
    corazon = (
      <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
        <p>{ROTULO_EXTERNA}</p>
        <p className="text-xs text-muted-foreground">No se puede embeber aquí: {origenExterno?.motivo ?? "sin URL"}</p>
        <a href={vista.url} target="_blank" rel="noreferrer" className="cursor-pointer text-sm text-primary underline">Abrir en otra pestaña</a>
      </div>
    );
  } else if (vista?.tipo === "componente" && Componente) {
    corazon = (
      <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Cargando la vista…</p>}>
        <Componente atomoId={atomoId} valores={valoresDelAtomo(valores, atomoId)} alCambiar={alCambiarComponente} />
      </Suspense>
    );
  } else {
    corazon = <p role="status" className="text-sm text-muted-foreground">{SIN_VISTA}</p>;
  }
  return <section aria-label={`Vista de ${definicion.nombre}`} className="my-2 flex flex-col gap-1">{corazon}</section>;
}