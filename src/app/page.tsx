"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CargaStarSeed } from "@/components/carga/carga-starseed";
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

  // (Ola 381 · INI4) Mientras se decide la pantalla inicial, nunca una página en blanco. (CAR1025A) Ya no es una
  // bola con degradado: es la animación de carga 3D de la Protomolécula con el símbolo de StarSeed dentro de su
  // esfera. Pinta al instante (respaldo en SVG) y el 3D entra a demanda; la redirección de arriba no la espera.
  return (
    <div className="grid min-h-dvh place-items-center">
      <CargaStarSeed />
    </div>
  );
}
