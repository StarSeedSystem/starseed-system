// Registro de familias de variaciones públicas
export type AdaptadorFamilia<P> = {
  familia: string;
  nombre: string;
  capturar: (clave: string) => P | null;
  validar: (payload: unknown) => { ok: true, payload: P } | { ok: false, motivos: string[] };
  aplicar: (clave: string, payload: P) => { deshacer: () => void };
  vistaPrevia?: (payload: P) => unknown;
};

let familias = new Map<string, AdaptadorFamilia<unknown>>();

export function registrarFamilia<P>(adaptador: AdaptadorFamilia<P>): void {
  familias.set(adaptador.familia, adaptador as AdaptadorFamilia<unknown>);
}

export function adaptadorDe(clave: string): AdaptadorFamilia<unknown> | null {
  const familia = clave.split(':')[0];
  return familias.get(familia) ?? null;
}

export function familiasRegistradas(): string[] {
  return Array.from(familias.keys());
}

// For testing only
export function __resetRegistros(): void {
  familias.clear();
}