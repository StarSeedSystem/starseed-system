// Versiones del laboratorio: probar cambios sin tocar el OS y promover solo lo que convenza.
// Nada de aquí escribe en el OS: promoverAlOS devuelve un plan para confirmación humana.

import { CAPAS, type Genoma, type NodoGenoma } from "./genoma";

export interface VersionLab {
  id: string;
  genomaId: string;
  nombre: string;
  nota: string;
  creada: string;
  padre?: string;
  instantanea: Genoma;
  metricas?: {
    latenciaMs?: number;
    tokens?: number;
    aciertos?: number;
    notas?: string;
  };
}

export interface ComparacionVersiones {
  añadidos: NodoGenoma[];
  quitados: NodoGenoma[];
  cambiados: Array<{ nodo: string; campo: string; antes: unknown; despues: unknown }>;
}

export interface PlanPromocion {
  cambios: Array<{ sistema: string; clave: string; valor: unknown }>;
  avisos: string[];
}

const CLAVE_VERSIONES = "starseed.laboratorio.versiones.v1";

function leerVersiones(): Record<string, VersionLab> {
  if (typeof localStorage === "undefined") return {};
  try {
    const crudo = localStorage.getItem(CLAVE_VERSIONES);
    if (!crudo) return {};
    const datos: unknown = JSON.parse(crudo);
    if (datos && typeof datos === "object" && !Array.isArray(datos)) {
      return datos as Record<string, VersionLab>;
    }
  } catch {
    // JSON roto: empezar de cero sin lanzar.
  }
  return {};
}

function escribirVersiones(mapa: Record<string, VersionLab>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CLAVE_VERSIONES, JSON.stringify(mapa));
  } catch {
    // Almacenamiento lleno o bloqueado: se ignora sin romper la sesión.
  }
}

function clonarGenoma(g: Genoma): Genoma {
  return {
    ...g,
    nodos: g.nodos.map((n) => ({
      ...n,
      parametros: { ...n.parametros },
      enlaces: [...n.enlaces],
    })),
  };
}

function nuevoId(prefijo: string): string {
  const azar =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefijo}-${azar}`;
}

export function crearVersion(genoma: Genoma, nombre: string, nota: string): VersionLab {
  const version: VersionLab = {
    id: nuevoId("ver"),
    genomaId: genoma.id,
    nombre,
    nota,
    creada: new Date().toISOString(),
    instantanea: clonarGenoma(genoma),
  };
  const mapa = leerVersiones();
  mapa[version.id] = version;
  escribirVersiones(mapa);
  return version;
}

export function versionesDe(genomaId: string): VersionLab[] {
  return Object.values(leerVersiones())
    .filter((v) => v.genomaId === genomaId)
    .sort((a, b) => a.creada.localeCompare(b.creada));
}

export function ramificar(versionId: string, nombre: string): VersionLab | null {
  const mapa = leerVersiones();
  const origen = mapa[versionId];
  if (!origen) return null;
  const rama: VersionLab = {
    id: nuevoId("ver"),
    genomaId: origen.genomaId,
    nombre,
    nota: origen.nota,
    creada: new Date().toISOString(),
    padre: versionId,
    instantanea: clonarGenoma(origen.instantanea),
  };
  mapa[rama.id] = rama;
  escribirVersiones(mapa);
  return rama;
}

function camposDeNodo(nodo: NodoGenoma): Record<string, unknown> {
  return {
    nombre: nodo.nombre,
    descripcion: nodo.descripcion,
    capa: nodo.capa,
    origen: nodo.origen,
    medio: nodo.medio,
    enlaces: [...nodo.enlaces].sort(),
    ...nodo.parametros,
  };
}

export function compararVersiones(a: VersionLab, b: VersionLab): ComparacionVersiones {
  const porIdA = new Map(a.instantanea.nodos.map((n) => [n.id, n]));
  const porIdB = new Map(b.instantanea.nodos.map((n) => [n.id, n]));

  const añadidos = b.instantanea.nodos.filter((n) => !porIdA.has(n.id));
  const quitados = a.instantanea.nodos.filter((n) => !porIdB.has(n.id));
  const cambiados: ComparacionVersiones["cambiados"] = [];

  for (const nodoA of a.instantanea.nodos) {
    const nodoB = porIdB.get(nodoA.id);
    if (!nodoB) continue;
    const camposA = camposDeNodo(nodoA);
    const camposB = camposDeNodo(nodoB);
    const claves = new Set([...Object.keys(camposA), ...Object.keys(camposB)]);
    for (const clave of claves) {
      const antes = camposA[clave];
      const despues = camposB[clave];
      if (JSON.stringify(antes) !== JSON.stringify(despues)) {
        cambiados.push({ nodo: nodoA.id, campo: clave, antes, despues });
      }
    }
  }
  return { añadidos, quitados, cambiados };
}

export function historia(versionId: string): VersionLab[] {
  const mapa = leerVersiones();
  const cadena: VersionLab[] = [];
  let actual = mapa[versionId];
  const vistos = new Set<string>();
  while (actual && !vistos.has(actual.id)) {
    cadena.push(actual);
    vistos.add(actual.id);
    actual = actual.padre ? mapa[actual.padre] : (undefined as unknown as VersionLab);
  }
  return cadena;
}

export function promoverAlOS(versionId: string): PlanPromocion | null {
  const mapa = leerVersiones();
  const version = mapa[versionId];
  if (!version) return null;

  const avisos: string[] = [];
  const cambios: PlanPromocion["cambios"] = [];

  for (const nodo of version.instantanea.nodos) {
    const info = CAPAS[nodo.capa];
    for (const [clave, valor] of Object.entries(nodo.parametros)) {
      cambios.push({
        sistema: `laboratorio.${nodo.capa}`,
        clave: `${nodo.id}.${clave}`,
        valor,
      });
    }
    if (info && info.mutabilidad < 0.2) {
      avisos.push(
        `El nodo «${nodo.id}» pertenece a la capa «${info.nombre}» (mutabilidad ${info.mutabilidad}): promoverlo toca lo casi inmutable del núcleo.`,
      );
    }
  }

  return { cambios, avisos };
}
