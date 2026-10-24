"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VariacionesHost — anfitrión global de la ventana «Variaciones públicas» (Ola 1019V · §4 del contrato
 * architecture/variaciones-publicas.md)
 * ---------------------------------------------------------------------------
 * Como `Astraura158WindowHost`: escucha `starseed:variaciones-abrir` (vía `suscribirVariaciones`) y monta una
 * `OSWindow` por elemento abierto, portada a `document.body`. Varias a la vez (pila): reabrir la clave de una
 * ventana ya abierta la trae al frente en vez de duplicarla (`apilarVariaciones`). Sin estado en módulo.
 *
 * Escape cierra solo la de arriba: lo resuelve la pila compartida de `OSWindow` (OPF1024H), que toma por arriba
 * la última en el orden del documento, así que la que `apilarVariaciones` trae al frente es la que cierra.
 *
 * El contenido de cada ventana lo pone quien monta el anfitrión (`renderContenido`); sin él, un aviso honesto.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Layers } from "lucide-react";
import { OSWindow } from "@/components/dashboard/apps/os-window";
import { apilarVariaciones, cerrarVariacion, suscribirVariaciones, tituloVariaciones, type EntradaVariaciones } from "./variaciones-bus";

export interface VariacionesHostProps {
  /** Cuerpo de cada ventana (la lista, el buscador y «Publicar mi variación»); recibe cómo cerrarla. */
  renderContenido?: (entrada: EntradaVariaciones, cerrar: () => void) => ReactNode;
}

/** Acento del OS por token (nada de hexadecimales sueltos). */
const ACENTO = "var(--primary)";

function SinContenido({ entrada }: { entrada: EntradaVariaciones }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-6 text-center backdrop-blur-xl">
        <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1 font-mono text-[11px] text-muted-foreground">
          {entrada.clave}
        </span>
        <p className="text-sm text-muted-foreground">Las variaciones públicas de este elemento aparecerán aquí.</p>
      </div>
    </div>
  );
}

export function VariacionesHost({ renderContenido }: VariacionesHostProps) {
  const [pila, setPila] = useState<EntradaVariaciones[]>([]);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);
  useEffect(() => suscribirVariaciones((detalle) => setPila((previa) => apilarVariaciones(previa, detalle))), []);

  const cerrar = useCallback((clave: string) => {
    setPila((previa) => cerrarVariacion(previa, clave));
  }, []);

  if (!montado || pila.length === 0) return null;

  return createPortal(
    <>
      {pila.map((entrada) => {
        const { titulo, subtitulo } = tituloVariaciones(entrada);
        const alCerrar = () => cerrar(entrada.clave);
        return (
          <OSWindow
            key={entrada.clave}
            title={titulo}
            subtitle={subtitulo}
            icon={Layers}
            accent={ACENTO}
            onClose={alCerrar}
            sizeClass="w-[min(94vw,920px)] h-[min(86vh,700px)]"
          >
            <div data-ss-variaciones={entrada.clave} className="absolute inset-0 overflow-hidden">
              {renderContenido ? renderContenido(entrada, alCerrar) : <SinContenido entrada={entrada} />}
            </div>
          </OSWindow>
        );
      })}
    </>,
    document.body,
  );
}

export default VariacionesHost;
