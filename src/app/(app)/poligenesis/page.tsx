"use client";

/**
 * /poligenesis — el Genesis de grupos y páginas (2026-10-10). `?entidad=<id o slug>` abre una
 * entidad concreta. Es el mismo nivel PoliGenesis que hay en /genesis, como página propia (con el
 * dock del OS) para llegar desde una comunidad o desde el lanzador.
 * SOP: architecture/genesis-personas-poligenesis.md
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserCog } from "lucide-react";
import { PoliGenesis } from "@/components/genesis/poligenesis";

export default function PoliGenesisPage() {
    const [entidad, setEntidad] = useState<string | null | undefined>(undefined);
    useEffect(() => {
        setEntidad(new URLSearchParams(window.location.search).get("entidad"));
    }, []);
    return (
        <main className="min-h-screen px-4 py-8 pb-28 md:px-8">
            <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">PoliGenesis</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Los grupos y páginas que gestionas: cambia su perfil y sus agentes con tu rol; si la entidad decide en democracia, cada cambio se vota.
                    </p>
                </div>
                <Link href="/genesis?nivel=mi" className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-emerald-300 hover:underline">
                    <UserCog className="h-4 w-4" aria-hidden /> Mi Genesis
                </Link>
            </header>
            {entidad === undefined ? null : <PoliGenesis entidadInicial={entidad} />}
        </main>
    );
}
