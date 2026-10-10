"use client";

/**
 * /genesis — la entrada de Genesis con sus tres niveles (2026-10-10).
 * ─────────────────────────────────────────────────────────────────────────────
 *   · Mi Genesis: cada persona cambia SU cuenta con operaciones tipadas (agente de modelos
 *     gratuitos que propone, vista previa, confirmación y deshacer).
 *   · PoliGenesis: lo mismo para los grupos y páginas que gestiona (rol de os_entity_roles;
 *     en modo democrático cada cambio es una propuesta que se vota).
 *   · MetaGenesis: la consola de los desarrolladores del OS (olas, enjambre, publicación). Solo
 *     aparece en esta máquina o para las cuentas miembro; `/genesis?pestana=…` sigue abriéndola.
 * Contrato: architecture/genesis-niveles-malla-universal-estaciones.md §A.
 * SOP: architecture/genesis-personas-poligenesis.md
 */

import { SelectorNivelGenesis } from "@/components/genesis/selector-nivel";

export default function GenesisPage() {
    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <SelectorNivelGenesis />
        </main>
    );
}
