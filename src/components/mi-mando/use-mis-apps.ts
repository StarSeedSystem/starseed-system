"use client";

/**
 * Lista viva de «mis apps» (Biblioteca + Lanzador + destinos de instalación).
 * La fusión es pura (src/lib/mi-mando/apps.ts); aquí solo se conecta a los
 * tres almacenes, que ya avisan solos cuando cambian (también entre pestañas).
 */

import { useMemo } from "react";

import { useInstalledApps, useSavedLibrary } from "@/lib/library-store";
import { combinarApps, resumenApps, type AppMia } from "@/lib/mi-mando/apps";

import { useMiMando } from "./contexto";

export function useMisApps(): { apps: AppMia[]; resumen: ReturnType<typeof resumenApps> } {
    const { items } = useSavedLibrary();
    const { apps: lanzador } = useInstalledApps();
    const { destinos } = useMiMando();
    return useMemo(() => {
        const apps = combinarApps(items, lanzador, destinos);
        return { apps, resumen: resumenApps(apps) };
    }, [items, lanzador, destinos]);
}
