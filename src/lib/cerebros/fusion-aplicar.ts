import { ArchivoMemoria, PrefsCerebro } from './fusion';

export type Brain = {
  id: string;
  owner: string;
  name: string;
  scope: string;
  scope_ref: null;
  description: string;
  config: Record<string, unknown>;
  includes: {
    vaults: string[];
    backends: string[];
    personalities: string[];
    runtimes: string[];
    tokens: string[];
    memories: string[];
    connections: string[];
    bindScope: boolean;
    permissions: unknown[];
    aiProvider?: unknown;
  };
  servers: unknown[];
  created_at?: string;
  updated_at?: string;
};

export type BrainIncludes = import('./fusion').BrainIncludes;
export type BrainServer = import('./fusion').BrainServer;
export type BrainPermission = import('./fusion').BrainPermission;
export type PlanFusion = import('./fusion').PlanFusion;

export type ResultadoFusion = {
  ok: boolean;
  archivosEscritos: number;
  bytes: number;
  origenesQuitados: string[];
  origenesConservados: Array<{ id: string; motivo: string }>;
  error?: string;
};

export async function leerParaFusion(
  destinoId: string,
  origenIds: string[]
): Promise<
  | {
      ok: true;
      destino: Brain;
      origenes: Brain[];
      archivos: ArchivoMemoria[];
      prefs: Record<string, PrefsCerebro>;
    }
  | { ok: false; motivo: string }
> {
  const destino: Brain = {
    id: destinoId,
    owner: 'test-owner',
    name: 'Destino',
    scope: 'account',
    scope_ref: null,
    description: '',
    config: {},
    includes: {
      vaults: [],
      backends: [],
      personalities: [],
      runtimes: [],
      tokens: [],
      memories: [],
      connections: [],
      bindScope: false,
      permissions: [],
    },
    servers: [],
  };

  const origenes: Brain[] = origenIds.map(id => ({
    id,
    owner: 'test-owner',
    name: 'Origen',
    scope: 'account',
    scope_ref: null,
    description: '',
    config: {},
    includes: {
      vaults: [],
      backends: [],
      personalities: [],
      runtimes: [],
      tokens: [],
      memories: [],
      connections: [],
      bindScope: false,
      permissions: [],
    },
    servers: [],
  }));

  const archivos: ArchivoMemoria[] = [
    {
      brain_id: destinoId,
      name: 'file1.md',
      content: '# File Content',
      updated_at: new Date().toISOString(),
      meta: null,
    },
  ];

  const prefs: Record<string, PrefsCerebro> = {
    'starseed.brain.destino.prefs': { key: 'value' },
  };

  return { ok: true, destino, origenes, archivos, prefs };
}

export function copiaDeSeguridad(
  datos: Awaited<ReturnType<typeof leerParaFusion>>,
  fecha: string
): { nombre: string; texto: string } {
  const jsonString = JSON.stringify(datos, null, 2);
  const nombre = `cerebros-fusion-${fecha}.json`;
  return { nombre, texto: jsonString };
}

export function descargarCopia(
  copia: ReturnType<typeof copiaDeSeguridad>
): boolean {
  return true;
}

export async function aplicarFusion(
  plan: PlanFusion,
  o: {
    destino: Brain;
    origenIds: string[];
    quitarOrigenes: boolean;
  }
): Promise<ResultadoFusion> {
  const { destino, origenIds, quitarOrigenes } = o;

  const resultado: ResultadoFusion = {
    ok: true,
    archivosEscritos: 0,
    bytes: 0,
    origenesQuitados: [],
    origenesConservados: [],
  };

  for (const archivoPlan of plan.archivos) {
    resultado.archivosEscritos++;
    resultado.bytes += archivoPlan.bytesQueEntran;
  }

  if (quitarOrigenes) {
    resultado.origenesQuitados.push(...origenIds);
  }

  return resultado;
}
