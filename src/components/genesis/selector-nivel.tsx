"use client";

/*
 * SelectorNivelGenesis — la entrada de /genesis con sus tres niveles (2026-10-10, contrato
 * architecture/genesis-niveles-malla-universal-estaciones.md §A):
 *   · Mi Genesis (cada persona) · PoliGenesis (grupos y páginas) · MetaGenesis (desarrolladores).
 * MetaGenesis solo aparece si la página está abierta en esta máquina (bucle local) o si la cuenta
 * es miembro (`miAccesoMetaGenesis`). Los enlaces viejos `/genesis?pestana=…` (y `?ambito=`)
 * siguen abriendo MetaGenesis para quien tiene acceso. La consola de MetaGenesis se carga a
 * demanda: quien no la usa no la descarga.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Code2, Loader2, UserCog, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { miAccesoMetaGenesis } from "@/lib/metagenesis/accesos";
import { abiertoEnLaMac } from "@/lib/metagenesis/remoto";
import { MiGenesis } from "./mi-genesis";

const PoliGenesis = dynamic(() => import("./poligenesis").then((m) => m.PoliGenesis), { ssr: false });
const ConsolaMetaGenesis = dynamic(() => import("./consola-metagenesis").then((m) => m.ConsolaMetaGenesis), {
    ssr: false,
    loading: () => (
        <p className="flex items-center gap-2 text-xs text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Abriendo la consola de MetaGenesis…
        </p>
    ),
});

export type NivelGenesis = "mi" | "poli" | "meta";
const CLAVE_NIVEL = "starseed.genesis.nivel.v1";

const NIVELES: { id: NivelGenesis; nombre: string; que: string; Icono: typeof UserCog }[] = [
    { id: "mi", nombre: "Mi Genesis", que: "Tu cuenta: perfil, páginas, apariencia, dock, tableros y agentes.", Icono: UserCog },
    { id: "poli", nombre: "PoliGenesis", que: "Los grupos y páginas que gestionas, con su rol y su modo de gobierno.", Icono: Users2 },
    { id: "meta", nombre: "MetaGenesis", que: "El código del OS: olas, enjambre, publicación. Solo desarrolladores.", Icono: Code2 },
];

/** Nivel pedido por la URL (los enlaces viejos con ?pestana= o ?ambito= son de MetaGenesis). */
export function nivelDeLaUrl(params: URLSearchParams): NivelGenesis | null {
    const n = params.get("nivel");
    if (n === "mi" || n === "poli" || n === "meta") return n;
    if (params.get("pestana") || params.get("ambito")) return "meta";
    if (params.get("entidad")) return "poli";
    return null;
}

export function SelectorNivelGenesis() {
    const [meta, setMeta] = useState<boolean | null>(null);
    const [nivel, setNivel] = useState<NivelGenesis | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [entidad, setEntidad] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setEntidad(params.get("entidad"));
        const pedido = nivelDeLaUrl(params);
        let guardado: NivelGenesis | null = null;
        try {
            const g = window.localStorage.getItem(CLAVE_NIVEL);
            if (g === "mi" || g === "poli" || g === "meta") guardado = g;
        } catch {
            /* sin almacenamiento */
        }
        const decidir = (acceso: boolean) => {
            setMeta(acceso);
            const quiere = pedido ?? guardado ?? (acceso ? "meta" : "mi");
            if (quiere === "meta" && !acceso) {
                if (pedido === "meta") setAviso("MetaGenesis es el Genesis de los desarrolladores del OS y tu cuenta no tiene acceso. Aquí tienes tu Genesis.");
                setNivel("mi");
            } else setNivel(quiere);
        };
        if (abiertoEnLaMac(window.location.hostname)) return decidir(true);
        void miAccesoMetaGenesis().then((a) => decidir(a?.miembro === true));
    }, []);

    const elegir = (n: NivelGenesis) => {
        setNivel(n);
        setAviso(null);
        try {
            window.localStorage.setItem(CLAVE_NIVEL, n);
            const url = new URL(window.location.href);
            url.searchParams.set("nivel", n);
            if (n !== "meta") url.searchParams.delete("pestana");
            window.history.replaceState(null, "", url.toString());
        } catch {
            /* la elección vale igual para esta visita */
        }
    };

    const visibles = NIVELES.filter((n) => n.id !== "meta" || meta === true);
    const actual = NIVELES.find((n) => n.id === nivel);

    return (
        <div className="space-y-5">
            <header className="space-y-3">
                <div>
                    <h1 className="text-2xl font-semibold">{actual?.nombre ?? "Genesis"}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{actual?.que ?? "Cambia tu sistema con un agente que propone y tú decides."}</p>
                </div>
                <div role="tablist" aria-label="Nivel de Genesis" className="flex flex-wrap gap-2">
                    {visibles.map((n) => (
                        <button
                            key={n.id}
                            type="button"
                            role="tab"
                            aria-selected={nivel === n.id}
                            onClick={() => elegir(n.id)}
                            data-testid={`genesis-nivel-${n.id}`}
                            className={cn(
                                "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors duration-200",
                                nivel === n.id ? "border-emerald-300/60 bg-emerald-500/15 text-white" : "border-white/15 text-white/65 hover:border-white/30 hover:text-white",
                            )}
                        >
                            <n.Icono className="h-4 w-4" aria-hidden /> {n.nombre}
                        </button>
                    ))}
                    {meta === null ? <Loader2 className="h-4 w-4 animate-spin self-center text-white/40" aria-label="Comprobando acceso" /> : null}
                </div>
                {aviso ? <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-2 text-xs text-amber-100">{aviso}</p> : null}
            </header>
            {nivel === "mi" ? <MiGenesis /> : null}
            {nivel === "poli" ? <PoliGenesis entidadInicial={entidad} /> : null}
            {nivel === "meta" && meta ? <ConsolaMetaGenesis /> : null}
        </div>
    );
}
