"use client";
/**
 * Registro de los widgets libres (Ola 383). Con el marco «libre» (el de fábrica), los tipos
 * que ya tienen su diseño sin caja se pintan con él; el resto sigue con su widget de siempre
 * dentro de un WidgetShell sin marco (FL6). Cada familia se carga a demanda: el dashboard no
 * paga por los diseños que no usa.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";

const cargando = () => null;
const RelojLibre = dynamic(() => import("./familias/reloj-libre").then((m) => m.RelojLibre), { ssr: false, loading: cargando });
const ClimaLibre = dynamic(() => import("./familias/clima-libre").then((m) => m.ClimaLibre), { ssr: false, loading: cargando });
const NotificacionesLibre = dynamic(() => import("./familias/notificaciones-libre").then((m) => m.NotificacionesLibre), { ssr: false, loading: cargando });
const AccesosLibre = dynamic(() => import("./familias/accesos-libre").then((m) => m.AccesosLibre), { ssr: false, loading: cargando });
const EstadoSistemaLibre = dynamic(() => import("./familias/estado-sistema-libre").then((m) => m.EstadoSistemaLibre), { ssr: false, loading: cargando });
const EventosLibre = dynamic(() => import("./familias/eventos-libre").then((m) => m.EventosLibre), { ssr: false, loading: cargando });
const TareasLibre = dynamic(() => import("./familias/tareas-libre").then((m) => m.TareasLibre), { ssr: false, loading: cargando });
const AstrauraLibre = dynamic(() => import("./familias/astraura-libre").then((m) => m.AstrauraLibre), { ssr: false, loading: cargando });

/** Tipos que ya tienen diseño libre propio. */
export const TIPOS_CON_DISENO_LIBRE = [
    "CLOCK_DATE", "WEATHER_BASIC", "NOTIFICATIONS", "QUICK_ACCESS",
    "SYSTEM_STATUS", "MY_EVENTS", "TASKS_QUICK", "AURORA_LAST",
] as const;

/** El diseño libre del widget, o `null` si su tipo aún no lo tiene. */
export function widgetLibre(widget: DashboardWidget, onUpdateSettings?: (patch: Record<string, any>) => void): React.ReactElement | null {
    switch (widget.widget_type) {
        case "CLOCK_DATE": return <RelojLibre widget={widget} onUpdateSettings={onUpdateSettings} />;
        case "WEATHER_BASIC": return <ClimaLibre />;
        case "NOTIFICATIONS": return <NotificacionesLibre />;
        case "QUICK_ACCESS": return <AccesosLibre />;
        case "SYSTEM_STATUS": return <EstadoSistemaLibre />;
        case "MY_EVENTS": return <EventosLibre />;
        case "TASKS_QUICK": return <TareasLibre />;
        case "AURORA_LAST": return <AstrauraLibre />;
        default: return null;
    }
}
