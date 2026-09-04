"use client";

/**
 * Panel de ajustes del Centro de Mando (Ola 231)
 * ─────────────────────────────────────────────────────────────────────────────
 * Interruptores y recordatorios de la consola: por qué las rutas `/api/mando/*`
 * solo existen en local, cómo activarlas en una instancia propia de producción
 * (`STARSEED_MANDO=1`) y dónde se guarda el estado de la consola
 * (localStorage; solo claves, nunca contenido sensible).
 */

import { Eye, KeyRound, ShieldCheck } from "lucide-react";

/** Una tarjeta de ajuste informativo. */
function Tarjeta({
    titulo,
    icono,
    children,
}: {
    titulo: string;
    icono: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <article className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="text-white/60">{icono}</span>
                {titulo}
            </h3>
            <div className="mt-2 space-y-2 text-sm text-white/70">{children}</div>
        </article>
    );
}

export function PanelAjustes() {
    return (
        <div className="space-y-4">
            <Tarjeta
                titulo="Solo en tu máquina"
                icono={<ShieldCheck className="h-4 w-4" aria-hidden />}
            >
                <p>
                    Las rutas <code className="text-white/80">/api/mando/*</code> responden{" "}
                    <strong>404 fuera de local</strong>: nunca publican el estado del
                    desarrollo en el despliegue público.
                </p>
                <p>
                    Para activarlas en una instancia propia desplegada, define la variable{" "}
                    <code className="text-white/80">STARSEED_MANDO=1</code> en su entorno
                    (solo nombres de variables, jamás claves).
                </p>
            </Tarjeta>

            <Tarjeta
                titulo="Nunca claves ni rutas del disco"
                icono={<KeyRound className="h-4 w-4" aria-hidden />}
            >
                <p>
                    La API del mando recorta todo a rutas relativas del repositorio y a
                    resúmenes seguros. Jamás devuelve tokens, cookies ni rutas absolutas
                    del disco del usuario.
                </p>
            </Tarjeta>

            <Tarjeta
                titulo="Preferencias locales de la consola"
                icono={<Eye className="h-4 w-4" aria-hidden />}
            >
                <p>
                    La última pestaña visitada se guarda en{" "}
                    <code className="text-white/80">starseed.mando.pestana</code>{" "}
                    (localStorage del navegador). Nada se sube a tu cuenta.
                </p>
            </Tarjeta>
        </div>
    );
}
