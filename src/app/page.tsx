"use client";

import { useEffect } from "react";
import Link from "next/link";
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
    <div className="flex min-h-dvh flex-col items-center justify-between px-4 py-6">
      <div className="my-auto">
        <CargaStarSeed />
      </div>
      <footer className="max-w-xl text-center text-xs leading-relaxed text-white/60">
        <p>
          <strong>StarSeed OS</strong> · Sistema operativo social descentralizado. La app OAuth{" "}
          <strong>StarSeed actividad</strong> funciona en modo de solo lectura para uso privado del titular.{" "}
          <span className="text-white/45">
            (Read-only private assistant integration under Google API Services User Data Policy.)
          </span>
        </p>
        <nav aria-label="Información legal" className="mt-2 flex flex-wrap items-center justify-center gap-4">
          <Link href="/privacidad" className="cursor-pointer underline underline-offset-4 hover:text-white/90">
            Política de privacidad
          </Link>
          <Link href="/terminos" className="cursor-pointer underline underline-offset-4 hover:text-white/90">
            Términos del servicio
          </Link>
        </nav>
      </footer>
    </div>
  );
}
