import type { Observador } from "../alcance";
import type { Nodo, Arista } from "../modelo";
import type { Fuente } from "./tipos";
import type { OsPage, OsGroup } from "@/lib/os-social";
import type { Pestana } from "@/lib/entidad-espacio/modelo";
import { ENTITY_KINDS, normalizeEntityKind, type EntityKind } from "@/lib/entity-kinds";

export interface EspacioEntidad {
  tipo: "page" | "group";
  slug: string;
  pestanas: Pestana[];
}

export interface DatosEntidades {
  paginas?: OsPage[];
  grupos?: OsGroup[];
  espacios?: EspacioEntidad[];
}

export type LectorEntidades = (observador: Observador) => Promise<DatosEntidades>;

function sistemaDe(kind: EntityKind): string {
  return ENTITY_KINDS[kind].system;
}

function pesoPorMiembros(miembros: number): number {
  const extra = Math.min(0.4, Math.max(0, miembros) / 250);
  return Math.round((0.6 + extra) * 100) / 100;
}

function formatoDePestana(tipo: string): string {
  const t = tipo.toLowerCase();
  if (t.includes("pizarra") || t.includes("lienzo")) return "pizarra";
  if (t.includes("video")) return "video";
  if (t.includes("audio")) return "audio";
  if (t.includes("imagen") || t.includes("galeria")) return "imagen";
  if (t.includes("texto")) return "texto";
  if (t.includes("documento")) return "documento";
  return "app";
}

export function nodoDesdePagina(pagina: OsPage): Nodo {
  const kind = normalizeEntityKind(pagina.kind);
  const system = sistemaDe(kind);
  const slug = pagina.slug || pagina.id;
  return {
    id: `entidad:page:${slug}`,
    tipo: "entidad",
    titulo: pagina.name,
    formato: "documento",
    ref: `/pagina/${slug}`,
    alcance: "publico",
    dueno: "red",
    capas: ["entidades", kind, system],
    t_creado: Date.now(),
    t_actividad: Date.now(),
    peso: pesoPorMiembros(pagina.memberCount),
    tema: system,
    categoria: kind,
    etiquetas: [kind, system, pagina.isSample ? "ejemplo" : "real", ...pagina.tags],
  };
}

export function nodoDesdeGrupo(grupo: OsGroup): Nodo {
  const kind = normalizeEntityKind(grupo.kind);
  const system = sistemaDe(kind);
  const slug = grupo.slug || grupo.id;
  return {
    id: `entidad:group:${slug}`,
    tipo: "entidad",
    titulo: grupo.name,
    formato: "documento",
    ref: `/grupo/${slug}`,
    alcance: "publico",
    dueno: "red",
    capas: ["entidades", kind, system],
    t_creado: Date.now(),
    t_actividad: Date.now(),
    peso: pesoPorMiembros(grupo.memberCount),
    tema: system,
    categoria: kind,
    etiquetas: [kind, system, grupo.isSample ? "ejemplo" : "real", ...grupo.tags],
  };
}

export function nodosDesdeEspacio(
  slug: string,
  tipo: "page" | "group",
  pestanas: Pestana[],
): { nodos: Nodo[]; aristas: Arista[] } {
  const entidadId = `entidad:${tipo}:${slug}`;
  const nodos: Nodo[] = [];
  const aristas: Arista[] = [];
  const t = Date.now();

  for (const pestana of pestanas) {
    if (pestana.visibilidad === "privada") continue;
    const alcance = pestana.visibilidad === "publica"
      ? "publico"
      : tipo === "group"
        ? "grupo"
        : "comunidad";
    const nodo: Nodo = {
      id: `espacio:${slug}:${pestana.id}`,
      tipo: "archivo",
      titulo: pestana.titulo,
      formato: formatoDePestana(pestana.tipo),
      ref: `/pagina/${slug}?pestana=${pestana.id}`,
      alcance,
      dueno: alcance === "publico" ? "red" : slug,
      capas: ["entidades", "espacios", tipo],
      t_creado: t,
      t_actividad: t,
      peso: alcance === "publico" ? 0.7 : 0.6,
      etiquetas: ["espacio", pestana.tipo, pestana.visibilidad],
    };
    nodos.push(nodo);
    aristas.push({ de: entidadId, a: nodo.id, tipo: "contiene", t, intensidad: 0.8 });
  }

  return { nodos, aristas };
}

async function leerEntidadesReal(): Promise<DatosEntidades> {
  try {
    const { fetchPages, fetchGroups } = await import("@/lib/os-social");
    const [paginas, grupos] = await Promise.all([fetchPages(), fetchGroups()]);
    return { paginas, grupos };
  } catch {
    return {};
  }
}

export function crearFuenteEntidades(leer: LectorEntidades = leerEntidadesReal): Fuente {
  const suscriptores = new Set<(evento: { tipo: string; datos: unknown }) => void>();

  function emitir(evento: { tipo: string; datos: unknown }) {
    for (const cb of suscriptores) {
      try {
        cb(evento);
      } catch {
        // silencioso
      }
    }
  }

  return {
    id: "entidades",
    capa: "entidades",
    leer: async (observador: Observador) => {
      const datos = await leer(observador);
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];

      for (const pagina of datos.paginas ?? []) {
        const nodo = nodoDesdePagina(pagina);
        nodos.set(nodo.id, nodo);
      }
      for (const grupo of datos.grupos ?? []) {
        const nodo = nodoDesdeGrupo(grupo);
        nodos.set(nodo.id, nodo);
      }
      for (const espacio of datos.espacios ?? []) {
        const resultado = nodosDesdeEspacio(espacio.slug, espacio.tipo, espacio.pestanas);
        for (const nodo of resultado.nodos) nodos.set(nodo.id, nodo);
        aristas.push(...resultado.aristas);
      }

      const validas = aristas.filter((a) => nodos.has(a.de) && nodos.has(a.a));
      emitir({
        tipo: "fuente_leida",
        datos: { fuenteId: "entidades", nodos: nodos.size, aristas: validas.length },
      });
      return { nodos, aristas: validas };
    },
    suscribir: (callback) => {
      suscriptores.add(callback);
      return () => {
        suscriptores.delete(callback);
      };
    },
  };
}

export const fuenteEntidades = crearFuenteEntidades();
