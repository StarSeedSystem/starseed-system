// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · repos externos de la Ola 1020 (2 tandas de 14)
// Contrato: architecture/repos-libreria-1020.md (+ 1020b = 2.ª tanda).
// Mapea cada entrada de config/repos-libreria-1020.json a LibraryPackage con
// payload.externalUrl + payload.githubRepo + canal: así available-updates.ts
// autobusca releases/tags/commits (motor ya existente: no se duplica).
// Excluida por seguridad: zhaoxuya520/reverse-skill (nunca se reintroduce).
// Módulo PURO: los JSON entran por import estático (nada de node:fs), apto
// para el cliente (packages.ts) y para /api/library/actualizaciones.
// ════════════════════════════════════════════════════════════════════════════

import json1 from "../../../config/repos-libreria-1020.json";
import json2 from "../../../config/repos-libreria-1020b.json";
import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";

/* ─────────────────────────── Tipos de los catálogos ─────────────────── */

/** Entrada cruda del JSON de catálogo (campos opcionales, defensivo). */
interface EntradaCatalogo {
  id: string; repo: string; nombre?: string; kind?: string; canal?: string;
  patron_tag?: string; licencia?: string; area?: string[]; efecto?: string;
  preinstalar?: string; claude?: string | boolean; que_es?: string;
  aviso?: string; assets?: string[]; skillId?: string;
}

/** Shape de los dos JSON de catálogo (1.ª y 2.ª tanda). */
interface CatalogoJson {
  paquetes?: EntradaCatalogo[];
  excluida?: { repo?: string };
  excluidas?: { repo?: string }[];
}

const catalogo1 = json1 as unknown as CatalogoJson;
const catalogo2 = json2 as unknown as CatalogoJson;

/** Excluidas por seguridad (1.ª tanda: reverse-skill · 2.ª: señuelo Vikunja). */
export const REPOS_EXCLUIDOS: string[] = [
  ...(catalogo1.excluida?.repo ? [catalogo1.excluida.repo] : []),
  ...(catalogo2.excluidas ?? []).map((e) => e.repo).filter((r): r is string => r !== ""),
];

const excluidasSet = new Set(REPOS_EXCLUIDOS);

/** Las dos tandas juntas, sin las excluidas (ficha plana, compat vigía/seeds). */
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

function fichaPlana(e: EntradaCatalogo): ReposExternosPaquete {
  const efecto = e.efecto ?? "";
  const comingSoon = efecto === "CONECTOR" || efecto === "HERRAMIENTA-AGENTE" || efecto === "CATALOGO";
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
    ...(comingSoon ? { comingSoon: true, motivoComingSoon: `efecto ${efecto}: instalación externa, sin ruta propia del OS` } : {}),
  };
}

/** Fichas planas de las dos tandas (28 en total, excluidas fuera). */
export const PAQUETES_EXTERNOS: ReposExternosPaquete[] = [
  ...(catalogo1.paquetes ?? []),
  ...(catalogo2.paquetes ?? []),
].filter((e) => !excluidasSet.has(e.repo)).map(fichaPlana);

/* ═══════════ REPO BUILTIN «starseed-biblioteca-externa» (1.ª tanda, 14) ═══════════ */

/** Icono por kind (nombres lucide; la UI resuelve con fallback a Package). */
const ICONO_POR_KIND: Record<string, string> = {
  app: "AppWindow",
  "ai-source": "BrainCircuit",
  function: "Boxes",
};

/** Los kinds reales de este catálogo mapean directo a PackageKind; resto → app. */
function kindReal(kind?: string): PackageKind {
  return kind === "ai-source" || kind === "function" ? kind : "app";
}/** Mapea una entrada del catálogo a LibraryPackage (creada como paquete de la Biblioteca). */
function aPackage(e: EntradaCatalogo): LibraryPackage {
  return {
    id: e.id,
    kind: kindReal(e.kind),
    name: e.nombre ?? e.id,
    description: (e.que_es ?? "") + (e.aviso ? ` — ${e.aviso}` : ""),
    icon: ICONO_POR_KIND[e.kind ?? "app"] ?? "AppWindow",
    tags: [...(e.area ?? []), e.canal ?? "", e.licencia ? "lic" : ""].filter(Boolean),
    version: "1.0.0",
    author: e.repo.split("/")[0] ?? e.repo,
    sourceRepoId: "starseed-biblioteca-externa",
    free: true,
    // Honesto: ninguna tiene todavía efecto de instalación real (conector/
    // skill/servidor por cablear); el botón queda deshabilitado.
    comingSoon: true,
    payload: {
      externalUrl: `https://github.com/${e.repo}`,
      githubRepo: e.repo,
      canal: e.canal ?? "releases",
      area: e.area ?? [],
      licencia: e.licencia ?? "",
      assets: e.assets ?? false,
      ...(e.skillId ? { skillId: e.skillId } : {}),
    },
  };
}

/** Las 14 de la 1.ª tanda (1020), fuera las excluidas, como paquetes reales de la Biblioteca. */
export const PAQUETES_1020: LibraryPackage[] = (catalogo1.paquetes ?? [])
  .filter((e) => !excluidasSet.has(e.repo))
  .map(aPackage);

/** Repo builtin de la Ola 1020: se lista en listRepos() junto a los demás builtins. */
export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: PAQUETES_1020,
};
