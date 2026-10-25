// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Repos externos (Ola 1020, tandas 1020 y 1020b)
// ────────────────────────────────────────────────────────────────────────────
// Consolidación de las fichas externas verificadas de la Ola 1020:
//   · PAQUETES_EXTERNOS  → fichas crudas unificadas de los dos catálogos
//     (config/repos-libreria-1020.json y config/repos-libreria-1020b.json),
//     sin las repos excluidas por seguridad (REPOS_EXCLUIDOS).
//   · REPO_EXTERNOS_1020 → repo builtin «starseed-biblioteca-externa» con las
//     14 publicaciones de la tanda 1020 mapeadas a LibraryPackage, para que
//     aparezcan en la Biblioteca como paquetes con upstream GitHub real
//     (available-updates.ts autobusca releases vía payload.externalUrl).
//
// Módulo PURO: importa los JSON directamente (como otros módulos de library),
// sin node:fs, para no bloquear a los clientes que lo importan (packages.ts
// es "use client"). Sin red, disco ni procesos: solo datos derivados.
// ════════════════════════════════════════════════════════════════════════════

import repos1020 from "../../../config/repos-libreria-1020.json";
import repos1020b from "../../../config/repos-libreria-1020b.json";
import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";

/** Entrada cruda de cualquiera de los dos catálogos (campos unificados). */
interface EntradaCruda {
  id: string;
  repo: string;
  nombre?: string;
  kind?: string;
  canal?: string;
  patron_tag?: string;
  licencia?: string;
  area?: string[];
  efecto?: string;
  preinstalar?: string;
  claude?: string | boolean;
  que_es?: string;
  aviso?: string;
  assets?: string[];
  skillId?: string;
}

const entradas1020: EntradaCruda[] = repos1020.paquetes;
const entradas1020b: EntradaCruda[] = repos1020b.paquetes;

/* ───────────── Excluidas por seguridad (bloqueo permanente) ───────────── */

const EXCLUIDA_1: string[] = [repos1020.excluida?.repo ?? ""].filter(
  (v): v is string => v !== "",
);
const EXCLUIDAS_2: string[] = (repos1020b.excluidas ?? []).map((e) => e.repo);

export const REPOS_EXCLUIDOS: string[] = [...EXCLUIDA_1, ...EXCLUIDAS_2];

/* ───────────── Fichas crudas unificadas (PAQUETES_EXTERNOS) ───────────── */

export interface ReposExternosPaquete {
  id: string;
  repo: string;
  nombre: string;
  kind: string;
  canal: string;
  patronTag: string;
  licencia: string;
  area: string[];
  efecto: string;
  preinstalar: string;
  claude: string | boolean;
  githubRepo: string;
  externalUrl: string;
  comingSoon?: boolean;
  motivoComingSoon?: string;
}

/**
 * Ficha cruda unificada de una entrada del catálogo. Conserva la lógica de hoy:

 * CONECTOR / HERRAMIENTA-AGENTE / CATALOGO → `comingSoon` (instalación
 * externa, sin ruta propia del OS); lo demás queda sin marca.
 */
function transformaPaquete(e: EntradaCruda): ReposExternosPaquete {
  const efecto = e.efecto ?? "";
  const conectorOCatalogo =
    efecto === "CONECTOR" || efecto === "HERRAMIENTA-AGENTE" || efecto === "CATALOGO";
  return {
    id: e.id,
    repo: e.repo,
    nombre: e.nombre ?? e.id,
    kind: e.kind ?? "app",
    canal: e.canal ?? "releases",
    patronTag: e.patron_tag ?? "",
    licencia: e.licencia ?? "",
    area: e.area ?? [],
    efecto,
    preinstalar: e.preinstalar ?? "",
    claude: e.claude ?? false,
    githubRepo: e.repo,
    externalUrl: `https://github.com/${e.repo}`,
    comingSoon: conectorOCatalogo ? true : undefined,
    motivoComingSoon: conectorOCatalogo
      ? `efecto ${efecto}: instalación externa, sin ruta propia del OS`
      : undefined,
  };
}

const reposExcluidosSet = new Set(REPOS_EXCLUIDOS);

export const PAQUETES_EXTERNOS: ReposExternosPaquete[] = [
  ...entradas1020.filter((e) => !reposExcluidosSet.has(e.repo)),
  ...entradas1020b.filter((e) => !reposExcluidosSet.has(e.repo)),
].map(transformaPaquete);

/* ── Repo builtin «starseed-biblioteca-externa» (tanda 1020, 14 publicaciones) ──
   Cada entrada se mapea a LibraryPackage con su upstream GitHub real. Ninguna
   tiene efecto de instalación real todavía: todas van honestas con
   `comingSoon: true` (guardar el enlace y abrir la repo/app externa). */

const ICONO_POR_KIND: Record<string, string> = {
  app: "AppWindow",
  "ai-source": "BrainCircuit",
  function: "Boxes",
};

function ficha1020(e: EntradaCruda): LibraryPackage {
  const [owner] = e.repo.split("/");
  return {
    id: e.id,
    kind: (e.kind ?? "app") as PackageKind,
    name: e.nombre ?? e.id,
    description: (e.que_es ?? "") + (e.aviso ? ` — ${e.aviso}` : ""),
    icon: ICONO_POR_KIND[e.kind ?? ""] ?? "Globe",
    tags: [...(e.area ?? []), e.canal ?? "", e.licencia ? "lic" : ""].filter(Boolean),
    version: "1.0.0",
    author: owner || "desconocido",
    sourceRepoId: "starseed-biblioteca-externa",
    free: true,
    comingSoon: true,
    payload: {
      externalUrl: `https://github.com/${e.repo}`,
      githubRepo: e.repo,
      canal: e.canal,
      area: e.area,
      licencia: e.licencia,
      assets: e.assets ?? false,
      ...(e.skillId ? { skillId: e.skillId } : {}),
    },
  };
}

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: entradas1020.map(ficha1020),
};
