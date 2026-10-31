/** Manifiesto de copias de memorias de cerebros (Ola 1025R · INF1025H).
 * BLAKE3 no está en el navegador sin dependencias: huella SHA-256 con Web Crypto
 * (`globalThis.crypto.subtle`, nunca `node:crypto`). Módulo PURO, sin red/disco/
 * reloj, con `actualizadoMs` como dato. Contenido = entidad única: se referencia. */
export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";
export interface CopiaMemoria { cerebroId: string; memoriaId: string; destino: DestinoMemoria; huella: string; bytes: number; actualizadoMs: number | null }
export interface GrupoHuella { huella: string; copias: CopiaMemoria[]; destinos: DestinoMemoria[]; ultimaCopia: boolean; divergente: boolean }
export interface ManifiestoMemoria { grupos: GrupoHuella[] }
export interface Divergencia { cerebroId: string; memoriaId: string; huellas: string[]; destinos: DestinoMemoria[]; ganadora: CopiaMemoria | null; empate: boolean }
export interface PropuestaLimpieza { cerebroId: string; memoriaId: string; destino: DestinoMemoria; huella: string; motivo: string; requiereConfirmacion: true }
const ORDEN: readonly DestinoMemoria[] = ["local", "starseed", "gdrive", "p2p", "externo"];
const rango = (d: DestinoMemoria): number => ORDEN.indexOf(d);
const claveMemoria = (c: CopiaMemoria): string => `${c.cerebroId}\u0000${c.memoriaId}`;
const compararTexto = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export async function huellaContenido(texto: string): Promise<string> {
  const normalizado = texto.replace(/\r\n/g, "\n");
  const bytes = new TextEncoder().encode(normalizado);
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, "0")).join("");
}

function compararCopias(a: CopiaMemoria, b: CopiaMemoria): number {
  return rango(a.destino) - rango(b.destino) || compararTexto(a.cerebroId, b.cerebroId)
    || compararTexto(a.memoriaId, b.memoriaId) || (a.actualizadoMs ?? -1) - (b.actualizadoMs ?? -1)
    || a.bytes - b.bytes;
}

export function construirManifiesto(copias: CopiaMemoria[]): ManifiestoMemoria {
  const porHuella = new Map<string, CopiaMemoria[]>();
  const hashes = new Map<string, Set<string>>();
  for (const c of copias) {
    const lista = porHuella.get(c.huella) ?? [];
    lista.push(c); porHuella.set(c.huella, lista);
    const set = hashes.get(claveMemoria(c)) ?? new Set<string>();
    set.add(c.huella); hashes.set(claveMemoria(c), set);
  }
  const grupos = [...porHuella.entries()].sort(([a], [b]) => compararTexto(a, b)).map(([huella, lista]) => {
    const ordenadas = [...lista].sort(compararCopias);
    return { huella, copias: ordenadas, destinos: ORDEN.filter((d) => ordenadas.some((c) => c.destino === d)),
      ultimaCopia: ordenadas.length === 1,
      divergente: ordenadas.some((c) => (hashes.get(claveMemoria(c))?.size ?? 0) > 1) };
  });
  return { grupos };
}

function copiaGanadora(copias: CopiaMemoria[]): CopiaMemoria | null {
  const conFecha = copias.filter((c): c is CopiaMemoria & { actualizadoMs: number } => c.actualizadoMs !== null);
  if (conFecha.length === 0) return null;
  const max = Math.max(...conFecha.map((c) => c.actualizadoMs));
  const masNuevas = conFecha.filter((c) => c.actualizadoMs === max);
  if (new Set(masNuevas.map((c) => c.huella)).size > 1) return null;
  return [...masNuevas].sort(compararCopias)[0] ?? null;
}

export function divergencias(m: ManifiestoMemoria): Divergencia[] {
  const porMemoria = new Map<string, CopiaMemoria[]>();
  for (const g of m.grupos) for (const c of g.copias) {
    const lista = porMemoria.get(claveMemoria(c)) ?? [];
    lista.push(c); porMemoria.set(claveMemoria(c), lista);
  }
  const lista: Divergencia[] = [];
  for (const copias of porMemoria.values()) {
    const huellas = [...new Set(copias.map((c) => c.huella))].sort(compararTexto);
    if (huellas.length < 2) continue;
    const ganadora = copiaGanadora(copias);
    lista.push({ cerebroId: copias[0].cerebroId, memoriaId: copias[0].memoriaId, huellas,
      destinos: ORDEN.filter((d) => copias.some((c) => c.destino === d)), ganadora, empate: ganadora === null });
  }
  return lista.sort((a, b) => compararTexto(a.cerebroId, b.cerebroId) || compararTexto(a.memoriaId, b.memoriaId));
}

export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const propuestas = new Map<string, PropuestaLimpieza>();
  const proponer = (c: CopiaMemoria, motivo: string): void => {
    const k = `${claveMemoria(c)}\u0000${c.destino}\u0000${c.huella}`;
    if (!propuestas.has(k)) propuestas.set(k, { cerebroId: c.cerebroId, memoriaId: c.memoriaId,
      destino: c.destino, huella: c.huella, motivo, requiereConfirmacion: true });
  };
  for (const g of m.grupos) {
    if (g.ultimaCopia) continue;
    const locales = g.copias.filter((c) => c.destino === "local").length;
    const conservadas = new Set<string>();
    for (const c of g.copias) {
      const ranura = `${claveMemoria(c)}\u0000${c.destino}`;
      if (!conservadas.has(ranura)) { conservadas.add(ranura); continue; }
      if (c.destino !== "local" || locales > 1) proponer(c, "Copia duplicada del mismo contenido en el mismo destino; se conserva una.");
    }
  }
  for (const d of divergencias(m)) {
    if (!d.ganadora) continue;
    const clave = `${d.cerebroId}\u0000${d.memoriaId}`;
    for (const g of m.grupos) {
      if (g.huella === d.ganadora.huella || g.ultimaCopia) continue;
      const locales = g.copias.filter((c) => c.destino === "local").length;
      for (const c of g.copias) {
        if (claveMemoria(c) === clave && (c.destino !== "local" || locales > 1))
          proponer(c, "Versión anterior de una memoria divergente; gana la más reciente.");
      }
    }
  }
  return [...propuestas.values()].sort((a, b) =>
    compararTexto(a.cerebroId, b.cerebroId) || compararTexto(a.memoriaId, b.memoriaId)
    || rango(a.destino) - rango(b.destino) || compararTexto(a.huella, b.huella));
}

export function resumenManifiesto(m: ManifiestoMemoria): string {
  const porMemoria = new Map<string, CopiaMemoria[]>();
  for (const g of m.grupos) for (const c of g.copias) {
    const lista = porMemoria.get(claveMemoria(c)) ?? [];
    lista.push(c); porMemoria.set(claveMemoria(c), lista);
  }
  let unicas = 0, divergentes = 0;
  for (const copias of porMemoria.values()) {
    if (copias.length === 1) unicas++;
    if (new Set(copias.map((c) => c.huella)).size > 1) divergentes++;
  }
  const plural = (v: number, uno: string, varios: string) => `${v} ${v === 1 ? uno : varios}`;
  return `${plural(porMemoria.size, "memoria", "memorias")}, ${unicas} con copia única, ${plural(divergentes, "divergente", "divergentes")}`;
}
