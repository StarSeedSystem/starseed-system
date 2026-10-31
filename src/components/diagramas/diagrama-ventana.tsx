"use client";

/**
 * DGM1018J · Ventana «Diagrama» (architecture/diagramas.md §4-J, Superficies).
 * Muestra un diagrama guardado con la vista aislada de `vista-diagrama.tsx`, «Pedir cambio
 * a Astraura» (vuelve a llamar a la herramienta `diagrama.crear` con el diagrama actual:
 * la petición armada aquí lleva el HTML entre vallas) y «Guardar en la Biblioteca».
 * La llamada a `diagrama.crear` y el guardado van INYECTADOS por el cableado de cada superficie
 * (dashboard, escritorio, pizarra, capa flotante); sin diagrama abierto hay mensaje claro,
 * nunca un bucle. El HTML se ve SIEMPRE dentro del iframe sandbox de la vista.
 */

import { useState } from "react";
import { VistaDiagrama } from "./vista-diagrama";
import type { FuenteDisponible } from "@/lib/diagramas/fuentes-locales";

const VALLA_HTML = "```html";

/** Petición para `diagrama.crear` que EDITA el diagrama actual en vez de rehacerlo. PURA. */
export function pedidoCambio(indicacion: string, html: string): string {
  const deseo = indicacion.trim();
  const encabezado = deseo
    ? `Cambia este diagrama: ${deseo}`
    : "Mejora este diagrama sin cambiar su tipo ni su contenido.";
  return [encabezado, "", "Diagrama actual (edítalo; no lo rehagas desde cero):", VALLA_HTML, html.trim(), "```"].join("\n");
}

export type FaseGuardado = "reposo" | "guardando" | "hecho" | "fallo";

export interface PropsVentanaDiagrama {
  /** HTML del diagrama abierto; vacío = no hay nada abierto. */
  html?: string;
  titulo?: string;
  /** Nombre de los archivos exportados y sugerido al guardar. */
  nombre?: string;
  /** Fuentes que el OS ya sirve (data URL); sin ellas, caras de sistema equivalentes. */
  fuentes?: FuenteDisponible[];
  /** Llama a la herramienta `diagrama.crear` con la petición armada por `pedidoCambio`. */
  alPedirCambio?: (peticion: string) => void;
  /** Guarda el diagrama en la Biblioteca de la persona; cuenta con el resultado. */
  alGuardar?: () => Promise<{ ok: boolean; motivo?: string }>;
}

const ETIQUETA_FASE: Record<FaseGuardado, string> = {
  reposo: "En la Biblioteca o por pedir",
  guardando: "Guardando…",
  hecho: "Guardado en la Biblioteca",
  fallo: "No se pudo guardar",
};

export function DiagramaVentana(props: PropsVentanaDiagrama) {
  const { html = "", titulo = "Diagrama", nombre, fuentes, alPedirCambio, alGuardar } = props;
  const [cambio, ponCambio] = useState("");
  const [fase, ponFase] = useState<FaseGuardado>("reposo");
  const [detalle, ponDetalle] = useState<string | null>(null);

  const pedir = () => {
    if (!alPedirCambio) return;
    alPedirCambio(pedidoCambio(cambio, html));
    ponCambio("");
    ponFase("reposo");
    ponDetalle("Cambio pedido a Astraura: la respuesta llega aquí al abrirse.");
  };

  const guardar = async () => {
    if (!alGuardar) return;
    ponFase("guardando");
    ponDetalle(null);
    try {
      const r = await alGuardar();
      ponFase(r.ok ? "hecho" : "fallo");
      if (!r.ok && r.motivo) ponDetalle(r.motivo);
    } catch {
      ponFase("fallo");
      ponDetalle("El guardado falló sin decir por qué.");
    }
  };

  return (
    <div aria-label="Diagrama" className="flex h-full min-h-0 flex-col gap-2 p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{titulo}</span>
        {html && (
          <span data-testid="estado-guardado"
            className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {ETIQUETA_FASE[fase]}
          </span>
        )}
      </div>
      {html ? (
        <>
          <VistaDiagrama html={html} titulo={titulo} nombre={nombre} fuentes={fuentes} alto={300} className="min-h-0 flex-1" />
          <div className="flex flex-col gap-2 rounded-md border border-border bg-black/20 p-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Cambiar con Astraura</span>
              <textarea data-testid="cambio-texto" value={cambio} onChange={(e) => ponCambio(e.target.value)} rows={2}
                placeholder="¿Qué cambia? P. ej. «añade la capa de correo»"
                className="min-h-[44px] cursor-text resize-none rounded-md border border-border bg-black/30 px-2 py-1.5" />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-testid="pedir-cambio" onClick={pedir} disabled={!alPedirCambio}
                className="min-h-[44px] cursor-pointer rounded-md border border-primary/60 bg-primary/20 px-2 transition-colors duration-200 hover:bg-primary/30 disabled:cursor-not-allowed disabled:opacity-50">
                Pedir cambio a Astraura
              </button>
              <button type="button" data-testid="guardar-biblioteca" onClick={() => void guardar()}
                disabled={!alGuardar || fase === "guardando"}
                className="min-h-[44px] cursor-pointer rounded-md border border-border px-2 transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                Guardar en la Biblioteca
              </button>
            </div>
            {detalle && <p role="status" data-testid="estado-accion" className="text-[10px] text-muted-foreground">{detalle}</p>}
          </div>
        </>
      ) : (
        <div data-testid="sin-diagrama"
          className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-border bg-black/20 p-3 text-center text-muted-foreground">
          <p className="max-w-[240px] leading-relaxed">
            No hay diagrama abierto. Pídeselo a Astraura en el chat («dibuja la arquitectura de…») o guarda un diagrama nuevo: se abre aquí.
          </p>
        </div>
      )}
    </div>
  );
}
