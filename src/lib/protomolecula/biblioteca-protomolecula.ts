// Protomolécula · Fichas de herramientas para la Biblioteca (módulo PURO).
// Une el catálogo verificado (inyectado) con los átomos registrados y las
// versiones de `protomolecula-versiones.json` (inyectado). "proximamente"
// siempre con motivo; versión sin SHA = "disponible", nunca "instalada".

import type { HerramientaProto } from "./catalogo-herramientas";
import { CATEGORIAS_PROTOMOLECULA, GRUPOS_PROTOMOLECULA } from "./catalogo-herramientas";
import { listarAtomos } from "./registro-atomos";
import type { DefinicionAtomo } from "./registro-atomos";

/** Lo que aporta `config/protomolecula-versiones.json` por herramienta. */
export interface VersionProto {
  version?: string; fecha?: string; licencia?: string; sha?: string; estado?: string;
}

/** Grado de control real de la ficha, en español claro. */
export type GradoControlReal = "total" | "solo ventana" | "solo enlace";

export interface FichaHerramienta {
  id: string;
  nombre: string;
  categoria: string; // id de grupo (imagen, audio, vídeo…)
  categoriaEtiqueta: string;
  descripcion: string;
  licencia: string;
  enlaces: { web?: string; repo?: string; documentacion?: string };
  integracion?: string;
  controlReal: GradoControlReal;
  estado: "integrada" | "disponible" | "proximamente" | "solo-enlace";
  proximamente?: string; // «próximamente: <motivo>» cuando no corre aún
  versionInstalada?: string;
  versionDisponible?: string;
}

/** Orden de grupos; los 4 extra van detrás. Los vacíos no se pintan. */
export const ORDEN_GRUPOS_PROTO = [
  "imagen", "audio", "video", "3d", "arquitectura", "fisicas", "juegos",
  "vr-ar", "codigo", "ia", "documentos", "controles", "colaboracion", "recursos",
] as const;

const GRUPO_POR_CATEGORIA = new Map(CATEGORIAS_PROTOMOLECULA.map((c) => [c.id, c.grupo] as const));
const ETIQUETA_GRUPO = new Map(GRUPOS_PROTOMOLECULA.map((g) => [g.id, g.nombre] as const));

function controlRealDe(h: HerramientaProto): GradoControlReal {
  if (h.integracion === "solo-enlace" || h.control.via.includes("ninguno")) return "solo enlace";
  if (h.integracion === "libreria-js" || h.integracion === "wasm-en-worker") return "total";
  return "solo ventana";
}

function controlDeAtomo(a: DefinicionAtomo): GradoControlReal {
  return a.control === "total" ? "total" : a.control === "ventana" ? "solo ventana" : "solo enlace";
}

/**
 * Una ficha por herramienta, ordenadas por grupo (los vacíos no se pintan al
 * agrupar). `versiones` es el contenido de protomolecula-versiones.json.
 */
export function fichasProtomolecula(
  versiones: Record<string, VersionProto> = {},
  catalogo: readonly HerramientaProto[] = [],
): FichaHerramienta[] {
  const atomos = new Map(listarAtomos().map((a) => [a.herramientaId, a] as const));
  const fichas: FichaHerramienta[] = [];

  for (const h of catalogo) {
    const atomo = atomos.get(h.id);
    const grupo = GRUPO_POR_CATEGORIA.get(h.categoria) ?? "codigo";
    const v = versiones[h.id];
    const ficha: FichaHerramienta = {
      id: h.id,
      nombre: h.nombre,
      categoria: grupo,
      categoriaEtiqueta: ETIQUETA_GRUPO.get(grupo) ?? grupo,
      descripcion: h.descripcion,
      licencia: v?.licencia ?? h.licencia ?? atomo?.ficha?.licencia ?? "desconocida",
      enlaces: {
        web: h.web ?? atomo?.ficha?.web ?? undefined,
        repo: h.codigo ?? atomo?.ficha?.repo ?? undefined,
      },
      integracion: h.integracion,
      controlReal: atomo ? controlDeAtomo(atomo) : controlRealDe(h),
      estado: "disponible",
    };
    if (atomo) {
      ficha.estado = "integrada";
    } else if (h.estado === "proximamente") {
      ficha.estado = "proximamente";
      ficha.proximamente = `próximamente: ${h.motivo}`;
    } else if (h.estado === "solo-enlace") {
      ficha.estado = "solo-enlace";
    }
    if (v?.version) {
      // Sin SHA verificado jamás se anuncia como instalada.
      if (v.sha) ficha.versionInstalada = v.version;
      else ficha.versionDisponible = v.version;
    }
    fichas.push(ficha);
  }

  // Átomos propios sin entrada en el catálogo: también merecen ficha.
  for (const atomo of atomos.values()) {
    if (catalogo.some((h) => h.id === atomo.herramientaId)) continue;
    fichas.push({
      id: atomo.herramientaId,
      nombre: atomo.nombre,
      categoria: atomo.categoria,
      categoriaEtiqueta: ETIQUETA_GRUPO.get(atomo.categoria) ?? atomo.categoria,
      descripcion: `Átomo integrado de ${atomo.nombre}.`,
      licencia: atomo.ficha?.licencia ?? "desconocida",
      enlaces: { web: atomo.ficha?.web, repo: atomo.ficha?.repo },
      integracion: atomo.integracion,
      controlReal: controlDeAtomo(atomo),
      estado: "integrada",
      proximamente: atomo.proximamente ? `próximamente: ${atomo.proximamente}` : undefined,
    });
  }

  const orden = new Map(ORDEN_GRUPOS_PROTO.map((g, i) => [g, i] as const));
  const indice = (c: string) => orden.get(c as (typeof ORDEN_GRUPOS_PROTO)[number]) ?? 99;
  return fichas.sort((a, b) => indice(a.categoria) - indice(b.categoria) || a.nombre.localeCompare(b.nombre, "es"));
}
