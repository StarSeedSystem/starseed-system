// Experiencias del razonador (Trinidad: Needle · Jev · BitNet) en el OS.
// Mismo formato que scripts/puente/experiencias.py del Mando. Se guardan en
// IndexedDB (nunca localStorage: son muchas) detrás de la interfaz Almacen.

export type Capa = "regla" | "needle" | "jev" | "bitnet" | "llm" | "persona";
export type TipoExperiencia = "intencion" | "eleccion" | "si_no" | "puntuacion" | "texto";

export const MAX_ENTRADA = 400;

export interface Experiencia {
  id: string;
  t: string;
  medio: string;
  capa: Capa;
  tipo: TipoExperiencia;
  dominio: string;
  entrada: string;
  salida: unknown;
  confianza: number | null;
  ms: number | null;
  resultado: boolean | null;
  opciones?: unknown[];
  nota_resultado?: string;
}

export interface CierreExperiencia {
  ref: string;
  t: string;
  resultado: boolean;
  nota: string;
}

// Clave-valor mínimo: IndexedDB en el navegador, un Map en las pruebas.
export interface Almacen {
  poner(linea: Experiencia | CierreExperiencia): Promise<void>;
  lineas(): Promise<(Experiencia | CierreExperiencia)[]>;
}

export function recortar(x: unknown, n = MAX_ENTRADA): string {
  const s = typeof x === "string" ? x : JSON.stringify(x) ?? "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

function ahora(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function idDe(semilla: string): Promise<string> {
  const datos = new TextEncoder().encode(semilla);
  const cripto = globalThis.crypto?.subtle;
  if (cripto) {
    const hash = await cripto.digest("SHA-256", datos);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
  }
  let h = 0;
  for (const b of datos) h = (h * 31 + b) >>> 0;
  return h.toString(16).padStart(8, "0") + "0000";
}

export async function nueva(op: {
  capa: Capa;
  tipo: TipoExperiencia;
  entrada: unknown;
  salida: unknown;
  confianza?: number | null;
  ms?: number | null;
  opciones?: unknown[];
  dominio?: string;
  medio?: string;
}): Promise<Experiencia> {
  const entrada = recortar(op.entrada);
  const e: Experiencia = {
    id: await idDe(`${Date.now()}|${op.capa}|${op.tipo}|${entrada}`),
    t: ahora(),
    medio: op.medio ?? "os-web",
    capa: op.capa,
    tipo: op.tipo,
    dominio: op.dominio ?? "",
    entrada,
    salida: op.salida,
    confianza: op.confianza == null ? null : Math.round(op.confianza * 10000) / 10000,
    ms: op.ms == null ? null : Math.trunc(op.ms),
    resultado: null,
  };
  if (op.opciones && op.opciones.length > 0) e.opciones = [...op.opciones];
  return e;
}

export async function anotar(e: Experiencia, almacen: Almacen): Promise<string> {
  await almacen.poner(e);
  return e.id;
}

export async function cerrar(id: string, resultado: boolean, nota: string, almacen: Almacen): Promise<CierreExperiencia> {
  const c: CierreExperiencia = { ref: id, t: ahora(), resultado: Boolean(resultado), nota: nota.slice(0, 200) };
  await almacen.poner(c);
  return c;
}

export async function leer(ultimas: number = 500, almacen: Almacen): Promise<Experiencia[]> {
  const lineas = (await almacen.lineas()).slice(-ultimas * 2);
  const porId = new Map<string, Experiencia>();
  const orden: string[] = [];
  for (const d of lineas) {
    if ("ref" in d) {
      const e = porId.get(d.ref);
      if (e) {
        e.resultado = d.resultado;
        e.nota_resultado = d.nota ?? "";
      }
    } else if (d.id) {
      porId.set(d.id, { ...d });
      orden.push(d.id);
    }
  }
  return orden.slice(-ultimas).map((id) => porId.get(id) as Experiencia);
}

export async function exportar(almacen: Almacen): Promise<string> {
  const lineas = await almacen.lineas();
  return lineas.map((l) => JSON.stringify(l)).join("\n") + (lineas.length > 0 ? "\n" : "");
}
