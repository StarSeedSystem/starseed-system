'use client';

import { useEffect, useState } from 'react';
import { misEntidades } from '@/lib/genesis/entidades';
import Link from 'next/link';
import { Wand2 } from 'lucide-react';

export function EnlacePoliGenesis({ entidadId, slug }: { entidadId?: string; slug: string }) {
  const [lista, setLista] = useState<EntidadGestionable[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEntidades() {
      const result = await misEntidades();
      if (result.ok) {
        setLista(result.lista);
      } else {
        setError(result.motivo);
      }
    }
    fetchEntidades();
  }, []);

  if (!lista) return null;
  const entidad = lista.find(e => 
    (entidadId && e.id === entidadId) || 
    (slug && e.slug === slug)
  );
  if (!entidad || entidad.rango < 2) return null;

  return (
    <Link
      href={`/poligenesis?entidad=${entidad.id}`}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-400/30 px-3 py-1.5 text-sm text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/10"
    >
      <Wand2 className="h-4 w-4" />
      <span>Gestionar con PoliGenesis</span>
    </Link>
  );
}

interface EntidadGestionable {
  id: string;
  slug: string;
  rango: number;
  // other fields as needed
}