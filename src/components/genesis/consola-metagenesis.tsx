"use client";

/*
 * ConsolaMetaGenesis — la consola de los desarrolladores dentro de /genesis (nivel MetaGenesis).
 * Es lo mismo que /metagenesis: en esta máquina se pinta tal cual; desde otra neurona,
 * `MetaGenesisRemoto` busca el motor de la Mac por su túnel. Se carga a demanda desde el
 * selector de niveles (2026-10-10).
 */

import { CentroMando } from "@/components/mando/centro-mando";
import { CrearEnjambre } from "@/components/mando/crear-enjambre";
import { MetaGenesisRemoto } from "@/components/mando/metagenesis-remoto";

export function ConsolaMetaGenesis() {
    return (
        <MetaGenesisRemoto>
            <CentroMando />
            <div className="mx-auto mt-8 max-w-xl">
                <CrearEnjambre />
            </div>
        </MetaGenesisRemoto>
    );
}
