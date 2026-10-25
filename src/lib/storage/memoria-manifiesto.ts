/**
 * Manifiesto de copias de memorias de cerebros (INF1025H · ola 1025R).
 * PURO: sin red, disco ni reloj (`actualizadoMs` entra en cada copia). La
 * huella usa SHA-256 con Web Crypto; BLAKE3 —el hash de Spacedrive— no está
 * en el navegador sin dependencias. Solo se PROPONEN limpiezas: nunca solas.
 */
export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";

export interface CopiaMemoria {
  cerebroId: string; memoriaId: string; destino: DestinoMemoria;
  huella: string; bytes: number; actualizadoMs: number | null;
}
export interface EntradaManifiesto {
  cerebroId: string; memoriaId: string; huella: string;
  copias: CopiaMemoria[]; destinos: DestinoMemoria[];
  ultimaCopia: boolean; divergente: boolean;
}
export type ManifiestoMemoria = EntradaManifiesto[];
export interface DivergenciaMemoria {
  cerebroId: string; memoriaId: string; huellas: string[];
  masNueva: string | null; empate: boolean;
}
export interface PropuestaLimpieza {
  cerebroId: string; memoriaId: string; destino: DestinoMemoria; huella: string;
  motivo: string; requiereConfirmacion: true;
}
const DESTINOS: readonly DestinoMemoria[] = ["local", "starseed", "gdrive", "p2p", "externo"];
const ORDEN = new Map(DESTINOS.map((d, i) => [d, i] as const));
const texto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const claveId = (c: { cerebroId: string; memoriaId: string }) => `${c.cerebroId}\u0000${c.memoriaId}`;
const claveEntrada = (c: CopiaMemoria) => `${claveId(c)}\u0000${c.huella}`;
export async function huellaContenido(textoEntrada: string): Promise<string> {
  const datos = new TextEncoder().encode(textoEntrada.replace(/\r\n/g, "\n"));
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, "0")).join("");
}

function copiasPorId(m: ManifiestoMemoria): Map<string, CopiaMemoria[]> {
  const mapa = new Map<string, CopiaMemoria[]>();
  for (const e of m) for (const c of e.copias) mapa.set(claveId(c), [...(mapa.get(claveId(c)) ?? []), c]);
  return mapa;
}
export function construirManifiesto(copias: readonly CopiaMemoria[]): ManifiestoMemoria {
  const grupos = new Map<string, CopiaMemoria[]>();
  const porId = new Map<string, { huellas: Set<string>; total: number }>();
  for (const c of copias) {
    const k = claveEntrada(c);
    const g = grupos.get(k);
    if (g) g.push(c); else grupos.set(k, [c]);
    const r = porId.get(claveId(c));
    if (r) { r.huellas.add(c.huella); r.total++; } else porId.set(claveId(c), { huellas: new Set([c.huella]), total: 1 });
  }
  const entradas: ManifiestoMemoria = [];
  for (const lista of grupos.values()) {
    const ordenadas = [...lista].sort((a, b) =>
      (ORDEN.get(a.destino)! - ORDEN.get(b.destino)!) || texto(a.huella, b.huella) ||
      (a.actualizadoMs ?? -1) - (b.actualizadoMs ?? -1) || a.bytes - b.bytes);
    const p = ordenadas[0];
    const r = porId.get(claveId(p));
    entradas.push({
      cerebroId: p.cerebroId, memoriaId: p.memoriaId, huella: p.huella, copias: ordenadas,
      destinos: DESTINOS.filter((d) => ordenadas.some((c) => c.destino === d)),
      ultimaCopia: r?.total === 1,
      divergente: (r?.huellas.size ?? 0) > 1,
    });
  }
  return entradas.sort((a, b) =>
    texto(a.cerebroId, b.cerebroId) || texto(a.memoriaId, b.memoriaId) || texto(a.huella, b.huella));
}
export function divergencias(m: ManifiestoMemoria): DivergenciaMemoria[] {
  const marca = (cs: readonly CopiaMemoria[]) =>
    cs.reduce<number | null>((m, c) => c.actualizadoMs !== null && (m === null || c.actualizadoMs > m) ? c.actualizadoMs : m, null);
  const salida: DivergenciaMemoria[] = [];
  for (const [k, copias] of copiasPorId(m)) {
    const huellas = [...new Set(copias.map((c) => c.huella))].sort(texto);
    if (huellas.length < 2) continue;
    const max = marca(copias);
    const ganan = max === null ? [] : huellas.filter((h) => marca(copias.filter((c) => c.huella === h)) === max);
    const [cerebroId = "", memoriaId = ""] = k.split("\u0000");
    salida.push({ cerebroId, memoriaId, huellas, masNueva: ganan.length === 1 ? ganan[0] : null, empate: ganan.length !== 1 });
  }
  return salida.sort((a, b) => texto(a.cerebroId, b.cerebroId) || texto(a.memoriaId, b.memoriaId));
}

export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const porId = copiasPorId(m);
  const propuestas = new Map<string, PropuestaLimpieza>();
  for (const d of divergencias(m)) {
    if (d.masNueva === null) continue;
    const copias = porId.get(claveId(d)) ?? [];
    if (copias.length <= 1) continue;
    const locales = copias.filter((c) => c.destino === "local").length;
    for (const c of copias) {
      if (c.huella === d.masNueva) continue;
      if (c.destino === "local" && locales <= 1) continue;
      const k = `${claveId(c)}\u0000${c.destino}\u0000${c.huella}`;
      if (propuestas.has(k)) continue;
      propuestas.set(k, {
        cerebroId: c.cerebroId, memoriaId: c.memoriaId, destino: c.destino, huella: c.huella,
        motivo: "Versión anterior a la más reciente; solo se retira si la persona lo confirma.",
        requiereConfirmacion: true,
      });
    }
  }
  return [...propuestas.values()].sort((a, b) =>
    texto(a.cerebroId, b.cerebroId) || texto(a.memoriaId, b.memoriaId) ||
    (ORDEN.get(a.destino)! - ORDEN.get(b.destino)!) || texto(a.huella, b.huella));
}

export function resumenManifiesto(m: ManifiestoMemoria): string {
  const porId = copiasPorId(m);
  let unicas = 0;
  let divergentes = 0;
  for (const copias of porId.values()) {
    if (copias.length === 1) unicas++;
    if (new Set(copias.map((c) => c.huella)).size > 1) divergentes++;
  }
  const memorias = porId.size === 1 ? "1 memoria" : `${porId.size} memorias`;
  return `${memorias}, ${unicas} con copia única, ${divergentes} ${divergentes === 1 ? "divergente" : "divergentes"}`;
}
