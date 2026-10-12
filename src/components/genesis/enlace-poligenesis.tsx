"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wand2 } from "lucide-react";
import { misEntidades } from "src/lib/genesis/entidades";

export function EnlacePoliGenesis({ entidadId, slug }: { entidadId?: string; slug: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    async function load() {
      const result = await misEntidades();
      if (result.ok) {
        const entidad = result.lista.find(
          (e) => e.id === entidadId || e.slug === slug
        );
        setVisible(!!entidad && entidad.rango >= 2);
      } else {
        setVisible(false);
      }
    }
    load();
  }, [entidadId, slug]);

  if (!visible) return null;

  return (
    <Link
      href={`/poligenesis?entidad=${entidadId}`}
      data-testid="poligenesis-link"
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/10"
    >
      <Wand2 className="h-4 w-4" />
      Gestionar con PoliGenesis
    </Link>
  );
}