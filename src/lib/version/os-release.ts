// Fuente ÚNICA de verdad de la versión del OS. Módulo PURO: sin React,
// sin node:* y sin process.cwd(), porque lo importan componentes de cliente.
// Cualquier medio que muestre la versión debe leer de aquí y jamás escribir
// su propia fecha (ver el test medios-version-coherentes y el checkpoint).

export const OS_VERSION = "2026.09.09";

export const OS_FECHA = "2026-09-09";

export type CanalRelease = "alpha" | "beta" | "estable";

export const OS_CANAL: CanalRelease = "alpha";

export const OS_NOTAS =
  "Versión que unifica la versión del sistema en una sola fuente de verdad, para que el instalador muestre la misma información en todos los medios.";

export const MEDIOS_DE_VERSION: readonly string[] = [
  "src/app/(app)/library/page.tsx",
  "src/components/library/os-download-card.tsx",
  "src/components/library/install-official-section.tsx",
  "src/data/starseed-apps-listings.ts",
  "package.json",
];

const MESES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function parsearFecha(v: string): Date | null {
  if (typeof v !== "string") return null;
  const partes = v.trim().split(/[.\-/]/).map((p) => Number(p));
  if (partes.length !== 3) return null;
  const [anio, mes, dia] = partes;
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
    return null;
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const ok =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
  return ok ? fecha : null;
}

export function formatearFechaBuild(v: string): string {
  const fecha = parsearFecha(v);
  if (!fecha) return v;
  return `${fecha.getUTCDate()} de ${MESES_ES[fecha.getUTCMonth()]} de ${fecha.getUTCFullYear()}`;
}

export function versionMasReciente<T extends { version: string; date: string }>(
  lista: T[],
): T | undefined {
  if (!Array.isArray(lista) || lista.length === 0) return undefined;
  const conFecha = lista.map((item) => ({ item, ts: parsearFecha(item.date)?.getTime() ?? null }));
  const validos = conFecha
    .filter((c): c is { item: T; ts: number } => c.ts !== null)
    .sort((a, b) => b.ts - a.ts);
  if (validos.length === 0) return undefined;
  return validos[0].item;
}

export function etiquetaBuild(): string {
  return `StarSeed OS · build ${OS_VERSION} · ${OS_CANAL}`;
}