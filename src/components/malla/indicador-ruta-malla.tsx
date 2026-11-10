"use client";

/**
 * IndicadorRutaMalla — indicador global y discreto de «Internet por: MaggaBook · Bluetooth directo · 240 kb/s» (PTA1110A · 2026-11-10).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3. Se monta una vez en el montaje de la malla (todas las rutas, no solo
 * el navegador de la app). Aparece SOLO mientras esta neurona sale por otra, o cuando hay una pregunta pendiente; al pulsarlo
 * abre «Actividad de la malla». Los avisos de cambio de ruta salen una vez cada uno (la máquina `AvisosRuta` evita los bucles).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { estadoPuerta, suscribirPuerta } from "@/lib/malla/puerta/servicio";
import { textoIndicador, type AvisoRuta } from "@/lib/malla/puerta/actividad";

const PanelActividadMalla = dynamic(() => import("@/components/malla/panel-actividad-malla").then((m) => m.PanelActividadMalla), { ssr: false });

export const DURACION_AVISO_MS = 9_000;

export function IndicadorRutaMalla({ className }: { className?: string }) {
  const s = useSyncExternalStore(suscribirPuerta, estadoPuerta, estadoPuerta);
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<AvisoRuta | null>(null);
  const vistos = useRef(new Set<string>());

  // Un aviso se enseña una sola vez (por id), aunque el componente se vuelva a pintar.
  const ultimo = (s.avisos ?? [])[(s.avisos ?? []).length - 1] ?? null;
  useEffect(() => {
    if (!ultimo || vistos.current.has(ultimo.id)) return;
    vistos.current.add(ultimo.id);
    setAviso(ultimo);
    const t = setTimeout(() => setAviso((a) => (a?.id === ultimo.id ? null : a)), DURACION_AVISO_MS);
    return () => clearTimeout(t);
  }, [ultimo]);

  // Abrir desde otros sitios (Ajustes › Neuronas › Medios) sin acoplar componentes.
  useEffect(() => {
    const abrir = (): void => setAbierto(true);
    window.addEventListener("starseed:abrir-actividad-malla", abrir);
    return () => window.removeEventListener("starseed:abrir-actividad-malla", abrir);
  }, []);

  const hayPregunta = !!s.preguntaUso || !!s.preguntaGrande;
  const por = s.internetPor;
  const visible = s.activo && (!!por || hayPregunta || !!aviso);
  if (!visible && !abierto) return null;

  const texto = por
    ? textoIndicador({ nombre: por.nombre, enlace: por.enlace, saltos: por.saltos, bytesPorSegundo: s.bytesPorSegundo })
    : hayPregunta
      ? "La malla necesita tu respuesta"
      : (aviso?.texto ?? "Actividad de la malla");

  return (
    <>
      <div className={cn("pointer-events-none fixed bottom-2 left-2 z-[60] flex max-w-[calc(100vw-1rem)] flex-col items-start gap-1", className)} data-testid="indicador-ruta-malla">
        {aviso && (
          <p role="status" aria-live="polite" data-testid="aviso-ruta" className="pointer-events-auto rounded-lg border border-white/15 bg-background/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
            {aviso.texto}
          </p>
        )}
        {visible && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            aria-label="Abrir Actividad de la malla"
            title="Actividad de la malla"
            data-testid="indicador-ruta-boton"
            className={cn(
              "pointer-events-auto inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] leading-5 backdrop-blur",
              hayPregunta ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-[#39FF14]/30 bg-[#39FF14]/5 text-emerald-200",
            )}
          >
            <Network className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{texto}</span>
          </button>
        )}
      </div>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Actividad de la malla</DialogTitle>
            <DialogDescription>Qué pasa ahora por las neuronas, los carriles y los topes de hoy.</DialogDescription>
          </DialogHeader>
          <PanelActividadMalla />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default IndicadorRutaMalla;
