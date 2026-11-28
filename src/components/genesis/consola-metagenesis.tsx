"use client";

/*
 * ConsolaMetaGenesis — la consola de los desarrolladores dentro de /genesis (nivel MetaGenesis).
 * Combina `MetaGenesisAutonoma` (disponible en cualquier neurona, Oracle A1 y malla mesh aun
 * sin la Mac) con `MetaGenesisRemoto` (motor local :9002, túnel cifrado o entornos alternos).
 */

import { CentroMando } from "@/components/mando/centro-mando";
import { CrearEnjambre } from "@/components/mando/crear-enjambre";
import { MetaGenesisRemoto } from "@/components/mando/metagenesis-remoto";
import { MetaGenesisAutonoma } from "@/components/metagenesis/metagenesis-autonoma";

export function ConsolaMetaGenesis() {
    return (
        <div className="space-y-4">
            <MetaGenesisAutonoma />
            <MetaGenesisRemoto>
                <CentroMando />
                <div className="mx-auto mt-8 max-w-xl">
                    <CrearEnjambre />
                </div>
            </MetaGenesisRemoto>
        </div>
    );
}
