// src/lib/variaciones/sugerir-astraura.ts
// Sugerencias de variaciones con Astraura: enrutador inyectado, validación pura y ADN del contexto.
// Contrato: architecture/variaciones-publicas.md §4.
import { validarVariacion } from "./validar";

export type Sugerencia = { variacion: unknown; motivo: string };

export type EnrutadorAstraura = {
  sugerirVariaciones?: (clave: string, payload: unknown, contexto: ContextoVariacion) => Promise<Sugerencia[]>;
};

export type ContextoVariacion = {
  payload?: unknown;
  adn?: {
    prohibiciones?: string[];
    pruebas?: { id: string; comprobacion: string; auto: boolean }[];
  };
};

export type DepsSugerir = { enrutador?: EnrutadorAstraura };

export async function sugerirVariaciones(clave: string, contexto: ContextoVariacion, deps: DepsSugerir): Promise<Sugerencia[]> {
  const enrutador = deps?.enrutador;
  if (!enrutador?.sugerirVariaciones) return [];
  const payload = contexto?.payload ?? {};
  const candidatas = await enrutador.sugerirVariaciones(clave, payload, contexto);
  if (!Array.isArray(candidatas)) return [];
  const filtradas: Sugerencia[] = [];
  for (const c of candidatas) {
    const variacion = c?.variacion;
    if (variacion === undefined) continue;
    const validacion = validarVariacion(variacion);
    if (!validacion.ok) continue;
    if (!pasaAdn(variacion, contexto?.adn)) continue;
    filtradas.push({ variacion, motivo: c.motivo ?? "" });
  }
  return filtradas;
}

function pasaAdn(variacion: unknown, adn?: ContextoVariacion["adn"]): boolean {
  if (!adn) return true;
  const prohibiciones = adn.prohibiciones ?? [];
  if (prohibiciones.length === 0) return true;
  try {
    const texto = JSON.stringify(variacion).toLowerCase();
    for (const p of prohibiciones) {
      if (p && texto.includes(String(p).toLowerCase())) return false;
    }
  } catch {
    return false;
  }
  return true;
}
