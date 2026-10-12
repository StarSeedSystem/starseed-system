"use client";

import { Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { misEntidades } from "@/lib/genesis/entidades";

type Props = {
  entidadId?: string;
  slug: string;
};

export function EnlacePoliGenesis({ entidadId, slug }: Props) {
  const [data, setData] = useState<{ ok: boolean; lista: { id: string; slug: string; rango: number }[] } | null>(null);

  useEffect(() => {
    misEntidades().then(setData);
  }, []);

  if (!data) {
    return null;
  }

  if (!data.ok) {
    return null;
  }

  // Find the entity by entidadId or slug
  const entity = data.lista.find(
    (e) => 
      (entidadId && e.id === entidadId) || 
      e.slug === slug
  );

  if (!entity || entity.rango < 2) {
    return null;
  }

  return (
    <Link href={`/poligenesis?entidad=${entity.id}`} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/10">
      <Wand2 />
      Gestionar con PoliGenesis
    </Link>
  );
}