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

// Variaciones públicas · familias «escritorio», «dock» y «app» (contrato §5,
// tarea VPU1019G): se registran aquí, junto a «ajuste», porque este es el
// montaje de cliente que ve el Registro de familias del navegador. Los puertos
// leen y escriben SOLO lo que ya existe: el dock persistido (loadDockConfig),
// el catálogo de apps (APP_CATALOG) y la disposición de los escritorios
// (desktop-store). Nada privado viaja: la disposición va por `refId`, nunca por
// el nombre del archivo de la persona.
import {
    registrarAdaptadoresEscritorio,
    type Movimiento,
    type PuertoApps,
    type PuertoDock,
    type PuertoEscritorio,
} from "@/lib/variaciones/adaptadores/escritorio";
import { loadDockConfig, saveDockConfig } from "@/components/layout/dock-config";
import { APP_CATALOG, getApp } from "@/components/dashboard/apps/app-catalog";
import { moveIcon, moveIconToPage, readDesktopsSnapshot } from "@/components/desktop/desktop-store";

const puertoDock: PuertoDock = {
    leer: () => loadDockConfig(),
    guardar: (items) => {
        saveDockConfig(items);
        try { window.dispatchEvent(new Event("starseed:dock")); } catch { /* noop */ }
    },
};

const puertoApps: PuertoApps = {
    existe: (id) => Boolean(getApp(id)),
    leer: () => Object.fromEntries(APP_CATALOG.map((a) => [a.id, { accent: a.accent, short: a.short }])),
    guardar: (registro) => {
        for (const app of APP_CATALOG) {
            const cambio = registro[app.id];
            if (!cambio) continue;
            if (cambio.accent !== undefined) app.accent = cambio.accent;
            if ("short" in cambio) {
                if (cambio.short === undefined) delete app.short;
                else app.short = cambio.short;
            }
        }
    },
};

function escritorioActivo() {
    const estado = readDesktopsSnapshot();
    return estado.desktops.find((d) => d.id === estado.activeId) ?? estado.desktops[0] ?? null;
}

const puertoEscritorio: PuertoEscritorio = {
    leer: () => {
        const escritorio = escritorioActivo();
        if (!escritorio) return [];
        return escritorio.icons.map((i) => ({
            id: i.id,
            ref: i.refId ?? i.id,
            x: i.x,
            y: i.y,
            ...(i.page !== undefined ? { page: i.page } : {}),
        }));
    },
    mover: (cambios: Movimiento[]) => {
        const escritorio = escritorioActivo();
        if (!escritorio) return;
        for (const cambio of cambios) {
            if (cambio.page !== undefined) moveIconToPage(escritorio.id, cambio.id, cambio.page);
            moveIcon(escritorio.id, cambio.id, cambio.x, cambio.y);
        }
    },
};

registrarAdaptadoresEscritorio({ dock: puertoDock, apps: puertoApps, escritorio: puertoEscritorio });

// Variaciones públicas · familias «animacion», «transicion» y «elemento-3d»
// (tarea DSN1019I · adaptadores de movimiento, Ola 1019D): se registran aquí,
// en el Registro de familias que ve el navegador, con la misma pauta que
// «ajuste» y «escritorio». La ficha vigente de cada familia (§3 de
// variaciones-de-identidad.md) vive en localStorage bajo
// `starseed:variacion-movimiento:<familia>`; sin ficha propia, el adaptador
// captura la base del vocabulario (`fichaBase`). Deshacer es del adaptador
// (restaura lo previo); el evento avisa a la interfaz de que la ficha cambió.
import {
    registrarAdaptadoresMovimiento,
    type DepsMovimiento,
    type FamiliaMovimiento,
    type FichaMovimiento,
} from "@/lib/variaciones/adaptadores/movimiento";

const RUTA_FICHA_MOVIMIENTO = "starseed:variacion-movimiento";

const depsMovimiento: DepsMovimiento = {
    leer: (familia: FamiliaMovimiento) => {
        try {
            if (typeof window === "undefined") return null;
            const bruto = window.localStorage.getItem(`${RUTA_FICHA_MOVIMIENTO}:${familia}`);
            return bruto === null ? null : JSON.parse(bruto) as FichaMovimiento;
        } catch { return null; } // sin almacenamiento o valor sin JSON: nada vigente
    },
    escribir: (familia: FamiliaMovimiento, ficha: FichaMovimiento | null) => {
        try {
            if (typeof window === "undefined") return;
            const ruta = `${RUTA_FICHA_MOVIMIENTO}:${familia}`;
            if (ficha === null) window.localStorage.removeItem(ruta);
            else window.localStorage.setItem(ruta, JSON.stringify(ficha));
            window.dispatchEvent(new Event("starseed:variaciones-movimiento"));
        } catch { /* sin almacenamiento: no se persiste, nada rompe */ }
    },
};

registrarAdaptadoresMovimiento(depsMovimiento);

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
