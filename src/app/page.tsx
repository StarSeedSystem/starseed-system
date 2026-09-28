"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import { leerPreferencias, resolverPantallaInicial } from "@/lib/inicio/pantalla-inicial";
import { activeProfileId } from "@/lib/profiles/profiles";
import { deviceId } from "@/lib/sync/entity-state";

const RUTAS_INICIO = ["/dashboard", "/escritorios"];

function rutaValida(ruta: string): boolean {
  return RUTAS_INICIO.some((base) => ruta.startsWith(base))
    || APP_CATALOG.some((app) => app.open.route && ruta.startsWith(app.open.route));
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const preferencias = leerPreferencias();
    const perfil = activeProfileId() ?? "local";
    const neurona = deviceId();
    router.replace(resolverPantallaInicial({
      perfil: preferencias.perfiles[perfil],
      neurona: preferencias.neuronas[neurona],
      rutaValida,
    }));
  }, [router]);

  // (Ola 381 · INI4) Mientras se decide la pantalla inicial: un orbe tenue, nunca una página en blanco.
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Abriendo StarSeed">
      <div className="flex flex-col items-center gap-4">
        <span aria-hidden className="ss-respirar block size-20 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #ffffffaa, #7c5cff66 40%, #23d5ab22 70%, transparent)" }} />
        <span className="text-xs tracking-[0.3em] text-white/60 uppercase">Abriendo StarSeed…</span>
      </div>
    </div>
  );
}
