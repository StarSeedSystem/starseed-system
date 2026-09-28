"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import { leerPreferencias, resolverPantallaInicial } from "@/lib/inicio/pantalla-inicial";
import { activeProfileId } from "@/lib/profiles/profiles";
import { deviceId } from "@/lib/sync/entity-state";

const RUTAS_INICIO = ["/dashboard", "/inicio", "/escritorios"];

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

  return null;
}
