"use client";

// Vista de un diagrama de Astraura (architecture/diagramas.md §3 y §4-I). El HTML de la skill MIT diagram-design
// (vendor/habilidades/diagram-design/) se pinta SOLO en un iframe `sandbox` sin `allow-same-origin` (prepararDiagrama),
// con las fuentes del OS, zoom, desplazamiento, piel clara u oscura y Exportar SVG/PNG. Nada sale de la neurona.

import dynamic from "next/dynamic";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Box, FileDown, ImageDown, Minus, Moon, Plus, RotateCcw } from "lucide-react";
import { prepararDiagrama } from "@/lib/diagramas/aislar-diagrama";
import { estructuraDeSvg, type TipoDiagrama3d } from "@/lib/diagramas/diagrama-3d";
import { sustituirFuentes, type FuenteDisponible } from "@/lib/diagramas/fuentes-locales";
import { conModo, modoDeDiagrama, planPng, svgDeDiagrama, type ModoDiagrama } from "@/lib/diagramas/exportar-diagrama";
import { descargarBlob } from "@/lib/conversion/cliente";
import { cn } from "@/lib/utils";

// La escena 3D es pesada: se carga solo al pedirla y nunca en el servidor.
const Diagrama3D = dynamic(() => import("@/components/vivo/espacial/diagrama-3d"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-xs text-white/60">Preparando la escena…</div>,
});

export interface VistaDiagramaProps {
  html: string;
  titulo?: string;
  /** Nombre de los archivos exportados, sin extensión. */ nombre?: string;
  /** Fuentes que el OS ya sirve (data URL); sin ellas, caras de sistema equivalentes. */ fuentes?: FuenteDisponible[];
  /** Escala del PNG, de 1 a 4 (la skill recomienda 2). */ escalaPng?: number;
  /** Alto de la vista en píxeles. */ alto?: number;
  className?: string;
}

const PASO = 1.25, PASO_PX = 40;
const acotar = (z: number) => Math.min(4, Math.max(0.25, z));
const TIPO_SVG = "image/svg+xml;charset=utf-8";
/** XML estricto con el analizador del navegador (inerte: no ejecuta nada ni pide recursos). */
function aXml(svg: string): string {
  const el = new DOMParser().parseFromString(svg, "text/html").querySelector("svg");
  return el ? new XMLSerializer().serializeToString(el) : svg;
}

function Boton({ etiqueta, texto, pulsado, onClick, children }: { etiqueta: string; texto?: string; pulsado?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={etiqueta} title={etiqueta} aria-pressed={pulsado} onClick={onClick}
      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-2 transition-colors duration-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 aria-pressed:bg-white/10 [&_svg]:h-4 [&_svg]:w-4">
      {children}
      {texto && <span>{texto}</span>}
    </button>
  );
}

export function VistaDiagrama({ html, titulo = "Diagrama", nombre, fuentes, escalaPng = 2, alto = 420, className }: VistaDiagramaProps) {
  const [elegido, setElegido] = useState<ModoDiagrama | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [aviso, setAviso] = useState<string | null>(null);
  const [en3d, setEn3d] = useState(false);
  const arrastre = useRef<{ x: number; y: number } | null>(null);
  const estructura = useMemo(() => estructuraDeSvg(html), [html]);
  const tipo3d: TipoDiagrama3d = estructura.capas.some((c) => c.nodos.length) ? "capas" : "grafo";
  const original = useMemo(() => modoDeDiagrama(html), [html]);
  const modo = elegido ?? original;
  const aislado = useMemo(
    () => prepararDiagrama(sustituirFuentes(conModo(html, modo), fuentes ?? []), { permitirAnimacion: /<script\b/i.test(html) }),
    [html, modo, fuentes],
  );
  const base = (nombre || titulo).trim().replace(/[^\p{L}\p{N}_-]+/gu, "-") || "diagrama";
  const mover = (dx: number, dy: number) => setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
  const reiniciar = () => { setZoom(1); setPos({ x: 0, y: 0 }); };
  function exportar(formato: "svg" | "png") {
    setAviso(null);
    const r = svgDeDiagrama(aislado.srcdoc ?? "");
    if (!r.ok) return setAviso(`No se pudo exportar: ${r.motivo}.`);
    const svg = aXml(r.svg);
    if (formato === "svg") return descargarBlob(new Blob([svg], { type: TIPO_SVG }), `${base}.svg`);
    const plan = planPng(svg, escalaPng);
    if (!plan.ok) return setAviso(`No se pudo exportar: ${plan.motivo}.`);
    const url = URL.createObjectURL(new Blob([plan.svg], { type: TIPO_SVG }));
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); setAviso("El navegador no pudo dibujar el SVG."); };
    img.onload = () => {
      const lienzo = document.createElement("canvas");
      [lienzo.width, lienzo.height] = [plan.ancho, plan.alto];
      lienzo.getContext("2d")?.drawImage(img, 0, 0, plan.ancho, plan.alto);
      URL.revokeObjectURL(url);
      lienzo.toBlob((png) => (png ? descargarBlob(png, `${base}.png`) : setAviso("No se pudo crear el PNG.")), "image/png");
    };
    img.src = url;
  }

  const teclas: Record<string, () => void> = {
    "+": () => setZoom((z) => acotar(z * PASO)), "=": () => setZoom((z) => acotar(z * PASO)), "-": () => setZoom((z) => acotar(z / PASO)),
    "0": reiniciar, ArrowLeft: () => mover(PASO_PX, 0), ArrowRight: () => mover(-PASO_PX, 0), ArrowUp: () => mover(0, PASO_PX), ArrowDown: () => mover(0, -PASO_PX),
  };
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => { const accion = teclas[e.key]; if (accion) { e.preventDefault(); accion(); } };
  const alPulsar = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture?.(e.pointerId); arrastre.current = { x: e.clientX, y: e.clientY }; };
  const alMover = ({ clientX: x, clientY: y }: PointerEvent<HTMLDivElement>) => {
    if (arrastre.current) { mover(x - arrastre.current.x, y - arrastre.current.y); arrastre.current = { x, y }; } };
  const alSoltar = () => { arrastre.current = null; };

  if (!aislado.ok) return (
    <div role="alert" className={cn("rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-100", className)}>
      <p className="font-semibold">Diagrama rechazado</p>
      <ul className="mt-1 list-disc pl-4">{aislado.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
    </div>);
  return (
    <figure className={cn("flex flex-col overflow-hidden rounded-xl border border-white/10 bg-background/40 text-foreground", className)}>
      <div role="toolbar" aria-label={`Controles de ${titulo}`} className="flex flex-wrap items-center gap-1 border-b border-white/10 p-1.5 text-xs">
        <Boton etiqueta="Alejar" onClick={teclas["-"]}><Minus /></Boton>
        <span aria-live="polite" className="w-12 text-center tabular-nums">{Math.round(zoom * 100)} %</span>
        <Boton etiqueta="Acercar" onClick={teclas["+"]}><Plus /></Boton>
        <Boton etiqueta="Restablecer la vista" onClick={reiniciar}><RotateCcw /></Boton>
        <Boton etiqueta="Piel oscura" pulsado={modo === "oscuro"} onClick={() => setElegido(modo === "oscuro" ? "claro" : "oscuro")}><Moon /></Boton>
        <Boton etiqueta={en3d ? "Volver a la vista 2D" : "Ver el diagrama en 3D"} texto="3D" pulsado={en3d} onClick={() => setEn3d((v) => !v)}><Box /></Boton>
        <span className="flex-1" />
        <Boton etiqueta="Exportar SVG" texto="SVG" onClick={() => exportar("svg")}><FileDown /></Boton>
        <Boton etiqueta="Exportar PNG" texto="PNG" onClick={() => exportar("png")}><ImageDown /></Boton>
      </div>
      <div tabIndex={en3d ? -1 : 0} role="group" onKeyDown={en3d ? undefined : alTeclear} style={{ height: alto }}
        aria-label={en3d ? `${titulo} en 3D: arrastra para girar, rueda o pellizca para recorrer`
          : `${titulo}: arrastra para desplazarte, flechas para moverte, + y - para el zoom, 0 para restablecer`}
        className="relative overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60">
        {en3d ? (
          <Diagrama3D svg={html} tipo={tipo3d} alto={alto} etiqueta={`${titulo} en 3D`} />
        ) : (
          <>
            <iframe srcDoc={aislado.srcdoc} sandbox={aislado.sandbox} title={titulo} className="absolute left-0 top-0 h-full w-full border-0"
              style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`, transformOrigin: "0 0" }} />
            <div aria-hidden="true" data-testid="capa-arrastre" className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={alPulsar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} />
          </>
        )}
      </div>
      {aviso && <figcaption role="status" className="border-t border-white/10 px-3 py-1.5 text-xs text-amber-200">{aviso}</figcaption>}
    </figure>
  );
}
