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
import { useAgentsSync } from "@/lib/agents/sync";
import { useConnectorsSync } from "@/lib/connectors/store";
import { SystemChrome } from "@/components/system/system-chrome";

// Variaciones públicas · familia «ajuste» (contrato §5:
// architecture/variaciones-publicas.md, tarea VPU1019E): el adaptador real
// (src/lib/variaciones/adaptadores/ajustes.ts) vive en el Registro de familias,
// con `pushPreferences` inyectado — el mismo canal user_settings que este
// montaje ya mantiene. Los adaptadores genéricos (adaptadores.ts) se evalúan
// solo en el servidor (layout raíz, contexto servidor), así que el registro
// ÚNICO que ve el navegador es este: sin este cableado, `adaptadorDe("ajuste:…")`
// devolvería el stub sin aplicar nada. Sobrescribe solo la familia «ajuste» y
// registra siempre el mismo par: registrarFamilia reemplaza por familia, idempotente.
import { registrarAdaptadorAjustes } from "@/lib/variaciones/adaptadores/ajustes";
import { pushPreferences } from "@/lib/settings-sync";

registrarAdaptadorAjustes({ pushPreferences });

export function SovereignSyncMount() {
    useLibrarySync();
    useDashboardsBackup();
    useAgentsSync();
    useConnectorsSync();
    return (
        <>
            <SystemChrome />
        </>
    );
}
