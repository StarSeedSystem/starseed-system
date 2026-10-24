// Driver de almacenamiento «neurona» / A1 (architecture/apps-en-la-malla.md §7 · tarea K).
// Guarda y lee objetos como VOLÚMENES POR BANDAS en otra neurona o en el A1: trocea en
// bandas de 4 MiB con SHA-256, compone el manifiesto y mueve cada banda por un TRANSPORTE
// INYECTADO (malla, daemon o HTTP del A1: nunca fija el canal ni guarda credenciales).
// Puro: sin node:*, sin red concreta; lo privado nunca sale de la cuenta del dueño.
import { TAMANO_BANDA, type Banda, type Manifiesto } from "@/lib/recursos/volumen";
import { crearLector, type CacheVolumen, type Verificador } from "@/lib/recursos/lector-volumen";
/* ── El transporte: TODO lo que este driver pide del mundo. Cada método es una orden al
 * ANFITRIÓN (la neurona que presta espacio, o el A1); quien enchufe el driver registra su
 * canal, y el driver nunca conserva ningún secreto. */
export interface TransporteNeurona {
  vivo(): Promise<boolean>; // sonda barata: ¿está vivo el anfitrión? (no toca datos)
  guardarBanda(ruta: string, indice: number, banda: Uint8Array): Promise<boolean>;
  guardarManifiesto(ruta: string, manifiesto: Manifiesto): Promise<boolean>;
  leerManifiesto(ruta: string): Promise<Manifiesto | null>; // null = no lo guarda
  leerBanda(ruta: string, indice: number): Promise<Uint8Array | null>; // null = no la tiene
  borrar(ruta: string): Promise<boolean>; // manifiesto y bandas: true si lo atendió
}
/* ── Troceo y manifiesto (puros: sin red ni reloj) ───────────────────────── */

/** Parte los bytes en bandas contiguas; la última queda con lo que sobre. */
export function trocear(bytes: Uint8Array, tamanoBanda: number = TAMANO_BANDA): Uint8Array[] {
  const trozos: Uint8Array[] = [];
  for (let i = 0; i < bytes.byteLength; i += tamanoBanda) trozos.push(bytes.subarray(i, Math.min(i + tamanoBanda, bytes.byteLength)));
  return trozos;
}
/** Digesto SHA-256 por defecto (webcrypto del medio); cadena vacía si no lo ofrece. */
export async function sha256Hex(datos: Uint8Array): Promise<string> {
  const sutil = globalThis.crypto?.subtle;
  if (!sutil) return "";
  try {
    const resumen = await sutil.digest("SHA-256", new Uint8Array(datos));
    return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}

/** El manifiesto del volumen (§7): bandas con índice, SHA-256 y tamaño. */
export function manifiestoDe(
  ruta: string,
  trozos: Uint8Array[],
  shas: string[],
  opciones: { tamanoBanda: number; privado?: boolean; importancia?: number } = { tamanoBanda: TAMANO_BANDA },
): Manifiesto {
  const bandas: Banda[] = trozos.map((t, i) => ({ indice: i, sha256: shas[i] ?? "", bytes: t.byteLength }));
  return { id: `volumen/${ruta}`, version: "1", tamano: trozos.reduce((s, t) => s + t.byteLength, 0), banda: opciones.tamanoBanda, bandas, privado: opciones.privado ?? true, importancia: opciones.importancia ?? 1 };
}
/* ── El driver: probar · poner · obtener · borrar ────────────────────────── */
export type ResultadoPoner = { ok: boolean; ruta: string; bandas?: number; bytes?: number; error?: string };
export type ResultadoObtener = { ok: boolean; ruta: string; bytes?: Uint8Array; error?: string };
// Digesto y verificación inyectables (pruebas sin webcrypto y medios sin él); caché del
// medio para el lector (§7); por defecto, sin caché y privado.
export type OpcionesDriverNeurona = {
  digerir?: (datos: Uint8Array) => Promise<string>;
  verificar?: Verificador;
  tamanoBanda?: number;
  cache?: CacheVolumen;
  privado?: boolean;
  importancia?: number;
};
const CACHE_NULA: CacheVolumen = { leer: async () => null, guardar: async () => false };
export type DriverNeurona = {
  probar(): Promise<boolean>;
  poner(ruta: string, bytes: Uint8Array): Promise<ResultadoPoner>;
  obtener(ruta: string): Promise<ResultadoObtener>;
  borrar(ruta: string): Promise<boolean>;
};
export function crearDriverNeurona(transporte: TransporteNeurona, opciones: OpcionesDriverNeurona = {}): DriverNeurona {
  const digerir = opciones.digerir ?? sha256Hex;
  const cache = opciones.cache ?? CACHE_NULA;
  const privacidad = { privado: opciones.privado ?? true, importancia: opciones.importancia ?? 1 };
  return {
    probar: () => transporte.vivo().catch(() => false),
    async poner(ruta: string, bytes: Uint8Array): Promise<ResultadoPoner> {
      if (!ruta) return { ok: false, ruta, error: "Falta la ruta del objeto." };
      const trozos = trocear(bytes, opciones.tamanoBanda);
      const shas: string[] = [];
      for (const trozo of trozos) {
        const sha = await digerir(trozo);
        if (!sha) return { ok: false, ruta, error: "El medio no ofrece SHA-256 (ni digesto inyectado): no se puede verificar volumen alguno." };
        shas.push(sha);
      }
      const manifiesto = manifiestoDe(ruta, trozos, shas, { tamanoBanda: opciones.tamanoBanda ?? TAMANO_BANDA, ...privacidad });
      // Bandas ANTES que el manifiesto: el manifiesto es el punto de compromiso,
      // nunca debe apuntar a bandas que el anfitrión aún no tiene.
      for (let i = 0; i < trozos.length; i++) {
        if (!(await transporte.guardarBanda(ruta, i, trozos[i]))) return { ok: false, ruta, error: `El anfitrión no guardó la banda ${i}.` };
      }
      if (!(await transporte.guardarManifiesto(ruta, manifiesto))) return { ok: false, ruta, error: "El anfitrión no guardó el manifiesto del volumen." };
      return { ok: true, ruta, bandas: trozos.length, bytes: manifiesto.tamano };
    },
    async obtener(ruta: string): Promise<ResultadoObtener> {
      const manifiesto = await transporte.leerManifiesto(ruta);
      if (!manifiesto) return { ok: false, ruta, error: "No hay volumen guardado para esa ruta." };
      // Lectura con el lector multifuente (tarea J): hoy la única fuente es el anfitrión,
      // pero el lector ya trae verificación y descarte honesto de bandas.
      const fuente = {
        id: "anfitrion",
        pedirBanda: async (indice: number): Promise<Uint8Array> => {
          const banda = await transporte.leerBanda(ruta, indice);
          if (banda == null) throw new Error(`El anfitrión no sirve la banda ${indice}.`);
          return new Uint8Array(banda);
        },
      };
      try {
        const lector = crearLector({
          manifiesto,
          cache,
          fuentes: [fuente],
          ...(opciones.verificar ? { verificar: opciones.verificar } : {}),
          paralelo: 2,
        });
        const res = await lector.leer(0, manifiesto.bandas.length - 1);
        return { ok: true, ruta, bytes: res.bytes };
      } catch (e) {
        return { ok: false, ruta, error: (e as Error)?.message ?? "La lectura del volumen falló." };
      }
    },
    borrar: (ruta: string) => transporte.borrar(ruta).catch(() => false),
  };
}
