// Imaginación · línea del medidor: lo que el filtro de Astraura dejó fuera hoy y por qué.
// Solo pinta lo que guarda `propuestas.json` (`filtro_astraura`); nunca inventa cifras ni
// las recalcula desde las propuestas que ya entraron (las descartadas no están ahí).
// (Ola 1102A) La cuenta del filtro es por id y por día; si es de otro día, no se pinta «hoy».
import type { FiltroAstraura } from "@/lib/mando/imaginacion-tipos";

/** Cuenta entera y no negativa: un JSON viejo o roto nunca pinta NaN ni cifras negativas. */
function cuenta(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : 0;
  return v > 0 ? v : 0;
}

/** Hoy en ISO corto (AAAA-MM-DD) con la fecha local, que es la que escribe el director. */
function hoyAstraura(ahora: Date = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}

/**
 * «Filtradas de Astraura hoy: N (familia X · tipo Y · tope Z)» a partir del `filtro_astraura`
 * persistido: N es la suma de los tres motivos y X, Y, Z sus cuentas. `null` si no hay filtro
 * o si es de otro día (para no llamar «hoy» a una cuenta vieja).
 */
function lineaFiltroAstraura(
  filtro: FiltroAstraura | null | undefined,
  hoy: string = hoyAstraura(),
): string | null {
  if (!filtro || filtro.fecha !== hoy) return null;
  const familia = cuenta(filtro.filtradas?.["familia repetida"]);
  const tipo = cuenta(filtro.filtradas?.["tipo de archivo"]);
  const tope = cuenta(filtro.filtradas?.tope);
  return `Filtradas de Astraura hoy: ${familia + tipo + tope} (familia ${familia} · tipo ${tipo} · tope ${tope})`;
}

/** La línea, solo si hay una cuenta de hoy. Sin datos no se pinta nada: nunca se simula. */
export default function ImaginacionPanel({
  filtro,
  hoy,
}: {
  /** El `filtro_astraura` que devuelve el medidor de Imaginación (no el recalculado local). */
  filtro?: FiltroAstraura | null;
  /** Fecha de referencia para las pruebas; por defecto, hoy. */
  hoy?: string;
}) {
  const linea = lineaFiltroAstraura(filtro, hoy);
  if (!linea) return null;
  return (
    <p className="mc-centrado text-[11px] text-violet-200" data-testid="imaginacion-filtro-astraura">
      {linea}
    </p>
  );
}
