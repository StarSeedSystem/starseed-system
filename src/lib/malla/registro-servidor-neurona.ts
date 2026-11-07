/*
 * registro-servidor-neurona — qué neurona vinculada es cada servidor del registro (VIN1107T1, 2026-11-07).
 * Contrato: architecture/sincronizacion-neuronas.md §8.
 *
 * El registro de servidores (`RegistryServer`, src/lib/brains/servers.ts) NO guarda el id de neurona y su
 * formato no cambia: la asociación vive aparte, en UNA clave versionada de `localStorage` de ESTE aparato
 * (`starseed.malla.servidor-neurona.v1` → `{ v: 1, mapa: { [idServidor]: idNeurona } }`).
 *
 * Puro y sin Node: las funciones de decisión no tocan el almacén; `leerAsociaciones`/`guardarAsociaciones`
 * reciben el `Storage` (o usan el del navegador) y nunca lanzan. Nada de claves, IPs ni tokens.
 */

export const CLAVE_SERVIDOR_NEURONA = "starseed.malla.servidor-neurona.v1";
export const MAX_ASOCIACIONES = 200;

/** idServidor → idNeurona (`neuron_devices`). */
export type MapaServidorNeurona = Readonly<Record<string, string>>;

/** Lo mínimo que se necesita de un vínculo (es compatible con `VinculoVivo`). */
export interface VinculoMinimo {
  neurona: string;
  nombre: string;
}
export interface ServidorMinimo {
  id: string;
  name: string;
}

export type EstadoUnion = "vinculada" | "asociada-sin-vinculo" | "sin-asociar";
export interface FilaServidorNeurona<V extends VinculoMinimo = VinculoMinimo> {
  servidor: string;
  neurona: string | null;
  vinculo: V | null;
  estado: EstadoUnion;
}

const idValido = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= 200;

/** Lee el valor guardado; cualquier cosa rara (JSON roto, versión distinta) da un mapa vacío. */
export function interpretarMapa(texto: string | null | undefined): MapaServidorNeurona {
  if (!texto) return {};
  try {
    const o = JSON.parse(texto) as { v?: unknown; mapa?: unknown };
    if (!o || o.v !== 1 || !o.mapa || typeof o.mapa !== "object" || Array.isArray(o.mapa)) return {};
    const salida: Record<string, string> = {};
    for (const [s, n] of Object.entries(o.mapa as Record<string, unknown>)) {
      if (idValido(s) && idValido(n) && Object.keys(salida).length < MAX_ASOCIACIONES) salida[s] = n.trim();
    }
    return salida;
  } catch {
    return {};
  }
}

export function serializarMapa(mapa: MapaServidorNeurona): string {
  return JSON.stringify({ v: 1, mapa });
}

/** Mapa nuevo con el servidor asociado a esa neurona (null o vacío = quitar la asociación). No muta. */
export function asociarServidor(mapa: MapaServidorNeurona, servidor: string, neurona: string | null): MapaServidorNeurona {
  if (!idValido(servidor)) return mapa;
  const { [servidor]: _quitado, ...resto } = mapa;
  void _quitado;
  if (!idValido(neurona)) return resto;
  if (!(servidor in mapa) && Object.keys(mapa).length >= MAX_ASOCIACIONES) return mapa;
  return { ...resto, [servidor]: neurona.trim() };
}

/** El id de neurona de un servidor, o null si no se sabe. */
export function neuronaDeServidor(mapa: MapaServidorNeurona, servidor: string): string | null {
  return Object.prototype.hasOwnProperty.call(mapa, servidor) ? mapa[servidor] : null;
}

/** Los servidores asociados a una neurona (puede haber varios). */
export function servidoresDeNeurona(mapa: MapaServidorNeurona, neurona: string): string[] {
  return Object.keys(mapa).filter((s) => mapa[s] === neurona);
}

/** Une cada servidor con su vínculo por el id de neurona; el orden es el de `servidores`. */
export function unirServidoresConVinculos<V extends VinculoMinimo>(
  servidores: readonly ServidorMinimo[],
  vinculos: readonly V[],
  mapa: MapaServidorNeurona,
): FilaServidorNeurona<V>[] {
  const porNeurona = new Map(vinculos.map((v) => [v.neurona, v] as const));
  return servidores.map((s) => {
    const neurona = neuronaDeServidor(mapa, s.id);
    const vinculo = neurona ? (porNeurona.get(neurona) ?? null) : null;
    const estado: EstadoUnion = vinculo ? "vinculada" : neurona ? "asociada-sin-vinculo" : "sin-asociar";
    return { servidor: s.id, neurona, vinculo, estado };
  });
}

/** Texto corto para la tarjeta del servidor. */
export function textoUnion(f: Pick<FilaServidorNeurona, "estado" | "vinculo">): string {
  if (f.estado === "vinculada") return `neurona vinculada: ${f.vinculo?.nombre ?? "—"}`;
  if (f.estado === "asociada-sin-vinculo") return "neurona asociada, aún sin vincular en este aparato";
  return "sin neurona asociada";
}

function almacen(s?: Pick<Storage, "getItem" | "setItem"> | null): Pick<Storage, "getItem" | "setItem"> | null {
  if (s) return s;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function leerAsociaciones(s?: Pick<Storage, "getItem" | "setItem"> | null): MapaServidorNeurona {
  try {
    return interpretarMapa(almacen(s)?.getItem(CLAVE_SERVIDOR_NEURONA));
  } catch {
    return {};
  }
}

/** true si se guardó. */
export function guardarAsociaciones(mapa: MapaServidorNeurona, s?: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  try {
    const a = almacen(s);
    if (!a) return false;
    a.setItem(CLAVE_SERVIDOR_NEURONA, serializarMapa(mapa));
    return true;
  } catch {
    return false;
  }
}
