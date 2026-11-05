"use client";

import { RespuestaViva } from "@/components/openui/respuesta-viva";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { biblioteca } from "@/lib/openui/biblioteca";

interface WidgetRespuestaVivaProps {
  widget?: DashboardWidget;
}

export function RespuestaVivaLibre({ widget }: WidgetRespuestaVivaProps) {
  const texto = (widget?.settings as Record<string, unknown>)?.texto as string | undefined ?? "";
  const enCurso = (widget?.settings as Record<string, unknown>)?.enCurso as boolean | undefined ?? false;

  return (
    <WidgetLibre forma="ninguna" acento="#7c5cff" acento2="#23d5ab">
      <RespuestaViva texto={texto} enCurso={enCurso} library={biblioteca} />
    </WidgetLibre>
  );
}
