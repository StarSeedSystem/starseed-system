// Registro de familias de variaciones públicas
// Contrato: architecture/variaciones-publicas.md

export type AdaptadorFamilia<P> = {
  familia: string;
  nombre: string;
  capturar: (clave: string) => P | null;
  validar: (payload: unknown) => { ok: true, payload: P } | { ok: false, motivos: string[] };
  aplicar: (clave: string, payload: P) => () => void;
  vistaPrevia?: (payload: P) => unknown;
};

// Registry for family adapters
const familiaRegistry = new Map<string, AdaptadorFamilia<unknown>>();

export function registrarFamilia<P>(adapter: AdaptadorFamilia<P>): void {
  familiaRegistry.set(adapter.familia, adapter as AdaptadorFamilia<unknown>);
}

export function adaptadorDe(clave: string): AdaptadorFamilia<unknown> | null {
  const familia = clave.split(':')[0];
  return familiaRegistry.get(familia) ?? null;
}

export function familiasRegistradas(): AdaptadorFamilia<unknown>[] {
  return Array.from(familiaRegistry.values());
}