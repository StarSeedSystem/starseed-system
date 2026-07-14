"use client";

/*
 * RealtimeSyncProvider — punto de montaje ÚNICO del motor de sincronización
 * en tiempo real (src/lib/sync/realtime-sync.ts).
 * ----------------------------------------------------------------------------
 * No pinta nada visible (igual que SovereignSyncMount). Arranca el motor si
 * hay sesión StarSeed Y el toggle `starseed.sync.realtime.v1` está activo
 * (ON por defecto); lo detiene ante logout o si el usuario lo desactiva desde
 * Ajustes → Cuenta y Sincronización o el Centro de Control. Reacciona a
 * cambios de sesión sin recargar la página (el propio motor ya escucha
 * onAuthStateChange, aquí solo cubrimos el primer arranque/parada según el
 * toggle persistido, que el motor no conoce por sí mismo).
 *
 * Recomendado montarlo UNA vez en el RootLayout (src/app/layout.tsx), junto a
 * <SovereignSyncMount/>.
 *
 * Aditivo: registrar la neurona (cerebro+servidor) y su heartbeat periódico
 * YA corre desde AuroraProvider (ver src/components/aurora/aurora-provider.tsx
 * → ensureThisNeuron()); aquí SOLO añadimos un último "toque" best-effort al
 * ocultar/cerrar la pestaña, que hoy no existe, para que `last_seen_at`
 * refleje el cierre real en vez de esperar al próximo heartbeat de hasta 60s.
 */

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { isRealtimeSyncEnabled, startRealtimeSync, stopRealtimeSync } from "@/lib/sync/realtime-sync";

export function RealtimeSyncProvider(): null {
    useEffect(() => {
        if (typeof window === "undefined") return;
        let cancelled = false;

        // ── Adenda 69 · C — ARRANQUE SIN CARRERA ────────────────────────────
        // Antes: `if (await hasStarseedSession())` → `startRealtimeSync()`. Una
        // sola comprobación, UNA vez, y `hasStarseedSession()` hacía una llamada
        // de RED (`auth.getUser()`). Si en ese instante la sesión aún no estaba
        // hidratada o la red tosía, el motor NO arrancaba… y nadie lo volvía a
        // intentar en toda la vida de la pestaña: sincronización muerta en
        // silencio (una de las causas de que la personalidad de Aurora no
        // viajara, y de la sensación de "se ha cerrado la sesión" al recargar).
        //
        // Ahora arrancamos SIEMPRE que el toggle esté activo: el propio motor ya
        // se suscribe a `onAuthStateChange` antes de comprobar la sesión, así
        // que si todavía no hay, se conecta solo en cuanto la haya. Además
        // escuchamos aquí los cambios de sesión como red de seguridad.
        void (async () => {
            try {
                if (cancelled) return;
                if (isRealtimeSyncEnabled()) await startRealtimeSync();
            } catch { /* defensivo: nunca romper el arranque de la app */ }
        })();

        // Red de seguridad: si la sesión aparece después (hidratación tardía,
        // login sin recargar, refresco de token), reintenta el arranque.
        let authSub: { unsubscribe: () => void } | null = null;
        try {
            const supabase = createClient();
            const { data } = supabase.auth.onAuthStateChange((_event, session) => {
                if (cancelled || !session) return;
                if (isRealtimeSyncEnabled()) void startRealtimeSync();
            });
            authSub = data.subscription;
        } catch { /* noop */ }

        // Último latido best-effort al ocultar/cerrar (heartbeat regular ya
        // vive en ensureThisNeuron(); esto solo adelanta el próximo tick).
        const onHide = () => {
            if (document.visibilityState !== "hidden") return;
            void (async () => {
                try {
                    const neurons = await import("@/lib/neurons/neurons");
                    await neurons.ensureThisNeuron();
                } catch { /* noop */ }
            })();
        };
        document.addEventListener("visibilitychange", onHide);
        window.addEventListener("pagehide", onHide);

        return () => {
            cancelled = true;
            document.removeEventListener("visibilitychange", onHide);
            window.removeEventListener("pagehide", onHide);
            try { authSub?.unsubscribe(); } catch { /* noop */ }
            // No se detiene el motor al desmontar: este provider vive en el
            // RootLayout durante toda la sesión de la pestaña. stopRealtimeSync()
            // queda para el toggle explícito del usuario (Ajustes/Centro de Control).
        };
    }, []);

    return null;
}
