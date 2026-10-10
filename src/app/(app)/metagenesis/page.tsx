"use client";

/**
 * /metagenesis — la consola de MetaGenesis (el Genesis de los desarrolladores de StarSeed OS).
 * (2026-10-10) Usable desde CUALQUIER neurona: en la Mac se pinta tal cual; fuera de ella,
 * `MetaGenesisRemoto` comprueba la cuenta (miembro de MetaGenesis), busca el motor de la Mac por
 * su túnel cifrado y manda ahí las rutas `/api/mando/*` con el token de la sesión. Ya no reexporta
 * `/genesis`: esa ruta será la entrada con selector de nivel (contrato
 * architecture/genesis-niveles-malla-universal-estaciones.md §A.1). SOP:
 * architecture/metagenesis-remoto-tunel.md
 */

import { CentroMando } from "@/components/mando/centro-mando";
import { CrearEnjambre } from "@/components/mando/crear-enjambre";
import { MetaGenesisRemoto } from "@/components/mando/metagenesis-remoto";

export default function MetaGenesisPage() {
    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <header className="mb-6">
                <h1 className="text-2xl font-semibold">MetaGenesis · StarSeed OS</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    El Genesis de los desarrolladores: olas, tareas, flota de proveedores y el relevo entre
                    agentes, en vivo. Se usa desde cualquier neurona con una cuenta con permiso; quién entra
                    se decide en Ajustes › Accesos.
                </p>
            </header>
            <MetaGenesisRemoto>
                <CentroMando />
                <div className="mt-8 max-w-xl mx-auto">
                    <CrearEnjambre />
                </div>
            </MetaGenesisRemoto>
        </main>
    );
}
