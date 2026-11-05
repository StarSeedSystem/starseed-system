"use client";

import { WidgetShell } from "@/components/dashboard/kit";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import { RespuestaViva } from "@/components/openui/respuesta-viva";

const ACENTO = "#00F0FF";

export interface WidgetRespuestaVivaProps {
    widget?: DashboardWidget;
    onUpdateSettings?: (patch: Record<string, any>) => void;
}

export function WidgetRespuestaViva({ widget, onUpdateSettings }: WidgetRespuestaVivaProps) {
    const texto = widget?.settings?.contenido as string | undefined;
    const enCurso = Boolean(widget?.settings?.enCurso);

    return (
        <WidgetShell
            title="Respuesta viva"
            icon={widget?.settings?.icono || "MessageCircle"}
            accent={ACENTO}
            actions={
                widget?.settings?.editable !== false && (
                    <button
                        type="button"
                        onClick={() => {
                            const nuevo = prompt("Contenido OpenUI Lang:", texto || "");
                            if (nuevo !== null) {
                                onUpdateSettings?.({ contenido: nuevo });
                            }
                        }}
                        className="grid place-items-center size-6 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                        title="Editar contenido"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-3.5 w-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                )
            }
        >
            {(size) => {
                if (!texto) {
                    return (
                        <div className="flex h-full items-center justify-center p-4 text-center text-muted-foreground/60">
                            <p className="text-sm">
                                Sin contenido OpenUI Lang. Haz clic en el icono para editar.
                            </p>
                        </div>
                    );
                }

                return (
                    <div className="h-full w-full overflow-y-auto p-3">
                        <RespuestaViva texto={texto} enCurso={enCurso} onAccion={undefined} />
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default WidgetRespuestaViva;