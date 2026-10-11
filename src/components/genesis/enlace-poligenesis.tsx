'use client';

import { useEffect, useState } from 'react';
import { misEntidades } from '@/lib/genesis/entidades';
import Link from 'next/link';
import { Wand2 } from 'lucide-react';

export type EnlacePoliGenesisProps = {
  entidadId?: string;
  slug: string;
};

export const EnlacePoliGenesis = ({ entidadId, slug }: EnlacePoliGenesisProps) => {
  const [data, setData] = useState<{ ok: boolean; lista: { id: string; slug: string; rango: number }[] } | null>(null);

  useEffect(() => {
    misEntidades().then(setData);
  }, []);

  if (!data || !data.ok) {
    return null;
  }

  const entidad = data.lista.find(
    (e) => e.id === entidadId || e.slug === slug
  );

  if (!entidad || entidad.rango < 2) {
    return null;
  }

  return (
    <Link
      href={`/poligenesis?entidad=${entidad.id}`}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/10"
    >
      <Wand2 className="h-4 w-4" />
      <span className="ml-2">Gestionar con PoliGenesis</span>
    </Link>
  );
};