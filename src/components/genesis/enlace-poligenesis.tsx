"use client";

// EnlacePoliGenesis — acceso directo a PoliGenesis desde la cabecera de una entidad
// (2026-10-10, GN1010A). Al montarse consulta UNA vez `misEntidades`: si quien mira
// gestiona esta entidad (rango ≥ 2, por id o por slug) pinta el enlace; si no, nada.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wand2 } from "lucide-react";
import { misEntidades } from "@/lib/genesis/entidades";

export function EnlacePoliGenesis({ entidadId, slug }: { entidadId?: string; slug: string }) {
    const [id, setId] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        void misEntidades().then((r) => {
            if (!vivo || !r.ok) return;
            const entidad = r.lista.find((x) => x.rango >= 2 && (x.id === entidadId || x.slug === slug));
            if (entidad) setId(entidad.id);
        });
        return () => {
            vivo = false;
        };
    }, [entidadId, slug]);

    if (!id) return null;

    return (
        <Link
            href={`/poligenesis?entidad=${id}`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/10"
        >
            <Wand2 className="h-4 w-4" aria-hidden />
            Gestionar con PoliGenesis
        </Link>
    );
}
