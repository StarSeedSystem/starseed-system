"use client";

/**
 * /mando — PUENTE DE MANDO (Ola 231).
 * ─────────────────────────────────────────────────────────────────────────────
 * Consola de producción y desarrollo del StarSeed OS: el pulso del trabajo
 * (olas, tareas, commits, flota de proveedores), los procesos en marcha, los
 * informes de cierre de ola y el chat de orquestación, todo bajo pestañas.
 *
 * Solo funciona en local: las rutas `/api/mando/*` responden 404 en el
 * despliegue público y la consola lo explica con un aviso claro.
 */

import { CentroMando } from "@/components/mando/centro-mando";

export default function MandoPage() {
    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <header className="mb-6">
                <h1 className="text-2xl font-semibold">Puente de Mando · StarSeed OS</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Consola de producción y desarrollo: olas, tareas, flota de
                    proveedores y el relevo entre agentes, en vivo y en tu máquina.
                </p>
            </header>
            <CentroMando />
        </main>
    );
}
