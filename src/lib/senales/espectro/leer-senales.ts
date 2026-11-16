export type SenalEspectro = {
  id: string;
  uid: string;
  valor: number;
  capa: 'publica' | 'comunidad';
  fuente: 'publicada por su dueño' | 'medida' | 'declarada' | 'estimada';
  medido_en: string;
};

export type ResultadoSenales = {
  senales: SenalEspectro[];
  estado: 'ok' | 'sin-tabla' | 'sin-sesion' | 'error';
  motivo?: string;
};

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export type SenalEspectro = {
  id: string;
  uid: string;
  valor: number;
  capa: 'publica' | 'comunidad';
  fuente: 'publicada por su dueño' | 'medida' | 'declarada' | 'estimada';
  medido_en: string;
};

export type ResultadoSenales = {
  senales: SenalEspectro[];
  estado: 'ok' | 'sin-tabla' | 'sin-sesion' | 'error';
  motivo?: string;
};

export async function leerSenalesPublicadas(deps: {
  cliente: any;
  uid: string;
}): Promise<ResultadoSenales> {
  const { cliente, uid } = deps;
  if (!uid) return { senales: [], estado: 'sin-sesion' };

  const { data, error } = await cliente
    .from('os_senales_publicas')
    .select('*')
    .order('medido_en', { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === '42P01') {
      return { senales: [], estado: 'sin-tabla', motivo: 'Tabla no encontrada' };
    }
    return { senales: [], estado: 'error', motivo: error.message };
  }

  const senales: SenalEspectro[] = data
    .filter((s: any) => s.uid !== uid)
    .map((s: any) => ({
      id: s.id,
      uid: s.uid,
      valor: s.valor,
      capa: s.capa,
      fuente: 'publicada por su dueño',
      medido_en: s.medido_en,
    }));

  return { senales, estado: 'ok' };
}

export function useSenalesPublicadas(uid: string) {
  const [data, setData] = useState<ResultadoSenales>({ senales: [], estado: 'ok' });
  const cliente = createClient();

  useEffect(() => {
    async function fetch() {
      if (document.hidden) return;
      const res = await leerSenalesPublicadas({ cliente, uid });
      setData(res);
    }
    fetch();
    const interval = setInterval(fetch, 45000);
    return () => clearInterval(interval);
  }, [uid, cliente]);

  return data;
}
