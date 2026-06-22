"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { SyncthingPanel } from "@/components/exocortex/syncthing-panel";

export default function SincronizacionPage() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (active) setSignedIn(Boolean(data?.user?.id));
      } catch {
        if (active) setSignedIn(false);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-cyan-50">Sincronización de archivos · Syncthing</h1>
        <p className="mb-6 mt-1 text-sm text-white/50">
          Sincroniza tus archivos entre tus dispositivos de forma P2P, cifrada y en tiempo real. La sincronización la hace
          Syncthing; StarSeed la gestiona, monitorea y te guía.
        </p>
        {ready && !signedIn && (
          <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
            No has iniciado sesión. Conéctate a StarSeed OS para guardar tu configuración de Syncthing en tu bóveda.
          </div>
        )}
        <SyncthingPanel />
      </div>
    </main>
  );
}
