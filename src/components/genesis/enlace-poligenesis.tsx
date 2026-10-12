"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wand2 } from "lucide-react";
import { misEntidades } from "@/lib/genesis/entidades";

export function EnlacePoliGenesis({ entidadId, slug }: { entidadId?: string; slug: string }) {
    const [linkId, setLinkId] = useState<string | null>(null);

    useEffect(() => {
        let activo = true;
        misEntidades().then((r) => {
            if (!activo || !r.ok) return;
            const entidad = r.lista.find(
                (x) => x.rango >= 2 && (x.id === entidadId || x.slug === slug)
            );
            if (entidad) {
                setLinkId(entidad.id);
            } else {
                setLinkId(null);
            }
        });
        return () => {
            activo = false;
        };
    }, [entidadId, slug]);

    if (!linkId) return null;

    return (
        <Link
            href={`/poligenesis?entidad=${linkId}`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/10"
        >
            <Wand2 className="h-4 w-4" aria-hidden />
            Gestionar con PoliGenesis
        </Link>
    );
}