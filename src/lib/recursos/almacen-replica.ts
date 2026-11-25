type Ambito = 'privado' | 'grupo' | 'comunidad' | 'publico';

export type Copia = {
  medio: string;
  verificado: boolean;
};

export type EstadoReplica = 'verificado' | 'pendiente' | 'fijado';

const NOMBRES_PRINCIPALES = ['main-commit.txt', 'starseed_memory_root'];

export function clasificarPrincipal(ruta: string): boolean {
  const nombre = ruta.split('/').pop() ?? '';
  return NOMBRES_PRINCIPALES.includes(nombre);
}

export function estadoReplica(entrada: {
  copias: Copia[];
  fijado?: boolean;
}): EstadoReplica {
  if (entrada.fijado === true) return 'fijado';

  const copiasVerificadas = entrada.copias.filter(c => c.verificado);
  if (copiasVerificadas.length < 2) return 'pendiente';

  const mediosDistintos = new Set(copiasVerificadas.map(c => c.medio));
  if (mediosDistintos.size < 2) return 'pendiente';

  return 'verificado';
}

export type ResultadoBorrado = {
  puedeBorrar: boolean;
  motivo: string | null;
};

export function puedeBorrar(entrada: {
  esPrincipal: boolean;
  fijado: boolean;
  replicaVerificada: boolean;
}): ResultadoBorrado {
  if (entrada.esPrincipal) return { puedeBorrar: false, motivo: 'es-principal' };
  if (entrada.fijado) return { puedeBorrar: false, motivo: 'fijado' };
  if (!entrada.replicaVerificada) return { puedeBorrar: false, motivo: 'replica-no-verificada' };

  return { puedeBorrar: true, motivo: null };
}