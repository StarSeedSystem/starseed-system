"use client";

import { RespuestaViva } from "./respuesta-viva";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";

interface WidgetRespuestaVivaProps {
  widget: DashboardWidget;
  onUpdateSettings?: (patch: Record<string, any>) => void;
}

export function WidgetRespuestaViva({ widget, onUpdateSettings }: WidgetRespuestaVivaProps) {
  const contenido = (widget.settings?.contenido as string) ?? "";
  const enCurso = false;

  return (
    <WidgetLibre
      forma="orbe"
      acento="#007FFF"
      acento2="#39FF14"
      intensidad={0.45}
      etiqueta="Respuesta viva"
      caja={[0.95, 0.95]}
    >
      {({ clase, ancho, alto }) => (
        <div
          className="h-full w-full flex flex-col"
          style={{
            fontSize: clase === "s" ? "0.8125rem" : clase === "m" ? "0.875rem" : "0.9375rem",
          }}
        >
          <div className="flex-1 min-h-0 overflow-auto p-[0.8125rem]">
            <RespuestaViva texto={contenido} enCurso={enCurso} />
          </div>
          {!contenido && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              aria-hidden="true"
            >
              <p className="text-xs text-muted-foreground/60 text-center px-3">
                Sin contenido guardado. Edita el widget para añadir código OpenUI Lang.
              </p>
            </div>
          )}
        </div>
      )}
    </WidgetLibre>
  );
}