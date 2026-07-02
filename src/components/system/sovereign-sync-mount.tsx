"use client";

/*
 * SovereignSyncMount — Punto de montaje único de la sincronización soberana.
 * ------------------------------------------------------------------------
 * Arranca, una sola vez en el árbol, los hooks que mantienen el store soberano
 * (Biblioteca + Apps) y el respaldo de tableros en sincronía con la cuenta
 * StarSeed (Supabase `user_settings`). Además monta el chrome global del
 * sistema (SystemChrome: pantalla completa automática al primer gesto +
 * alternador por evento), que tampoco pinta nada visible.
 *
 * Recomendado montarlo UNA vez en el RootLayout (`src/app/layout.tsx`), dentro
 * de los providers de cliente, para que viva durante toda la sesión.
 *
 * Defensivo por diseño: si no hay sesión o falla la red, los hooks degradan en
 * silencio y localStorage sigue siendo la fuente de verdad.
 */

import { useLibrarySync } from "@/lib/library-sync";
import { useDashboardsBackup } from "@/lib/dashboards-sync";
import { SystemChrome } from "@/components/system/system-chrome";

export function SovereignSyncMount() {
    useLibrarySync();
    useDashboardsBackup();
    return (
        <>
            <SystemChrome />
        </>
    );
}
