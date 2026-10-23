"use client";

// ════════════════════════════════════════════════════════════════════════════
// Biblioteca · catálogo externo de la ola 1020
// ----------------------------------------------------------------------------
// Las 14 publicaciones verificadas de `config/repos-libreria-1020.json` entran
// como un repo builtin de la Biblioteca. Todas se abren en su upstream de
// GitHub y se autoactualizan solas por `payload.externalUrl`
// (`available-updates.ts`, que ya existe: aquí no se duplica ese motor).
// `comingSoon: true` es honesto: instalar hoy solo guarda el enlace; no hay
// efecto local todavía. Se conserva además la fusión con la 2.ª tanda
// (`config/repos-libreria-1020b.json`) que ya vivía en este módulo.
// ════════════════════════════════════════════════════════════════════════════

import catalogo1020 from "../../../config/repos-libreria-1020.json";
import catalogo1020b from "../../../config/repos-libreria-1020b.json";
import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";

export interface EntradaCatalogo {
  id: string;
  repo: string;
  nombre: string;
  kind: string;
  canal: string;
  assets?: string[];
  licencia?: string;
  area?: string[];
  que_es?: string;
  aviso?: string;
  skillId?: string;
}

export interface EntradaConEfecto extends EntradaCatalogo {
  patron_tag?: string;
  efecto?: string;
  preinstalar?: string;
  claude?: string | boolean;
}

export interface CatalogoExterno {
  paquetes: EntradaConEfecto[];
  excluida?: { repo: string };
  excluidas?: { repo: string }[];
}

const catalogoA = catalogo1020 as unknown as CatalogoExterno;
const catalogoB = catalogo1020b as unknown as CatalogoExterno;

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

const EXCLUIDOS = [
  catalogoA.excluida?.repo,
  ...(catalogoA.excluidas ?? []).map((e) => e.repo),
  ...(catalogoB.excluidas ?? []).map((e) => e.repo),
].filter((repo): repo is string => Boolean(repo));

/** Repos que no se instalan ni se integran (p. ej. herramientas ofensivas). */
export const REPOS_EXCLUIDOS: string[] = [...new Set(EXCLUIDOS)];

function iconoDeKind(kind: string): string {
  if (kind === "app") return "AppWindow";
  if (kind === "ai-source") return "BrainCircuit";
  if (kind === "function") return "Boxes";
  return "Package";
}

function kindSeguro(kind: string): PackageKind {
  return kind === "app" || kind === "ai-source" || kind === "function" ? kind : "app";
}

function descripcionDe(e: EntradaCatalogo): string {
  const queEs = e.que_es ?? "";
  return e.aviso ? `${queEs} — ${e.aviso}` : queEs;
}

/** Mapea una entrada del catálogo a la ficha instalable de la Biblioteca. */
function aPaquete(e: EntradaCatalogo): LibraryPackage {
  const owner = e.repo.split("/")[0] ?? "";
  const tags = [...(e.area ?? []), e.canal, e.licencia ? "lic" : ""].filter(
    (t): t is string => Boolean(t),
  );
  return {
    id: e.id,
    kind: kindSeguro(e.kind),
    name: e.nombre,
    description: descripcionDe(e),
    icon: iconoDeKind(e.kind),
    tags,
    version: "1.0.0",
    author: owner,
    sourceRepoId: "starseed-biblioteca-externa",
    free: true,
    comingSoon: true,
    payload: {
      externalUrl: `https://github.com/${e.repo}`,
      githubRepo: e.repo,
      canal: e.canal,
      area: e.area ?? [],
      licencia: e.licencia ?? "",
      assets: e.assets ?? false,
      ...(e.skillId ? { skillId: e.skillId } : {}),
    },
  };
}

/** Repo builtin con las 14 publicaciones externas de la ola 1020. */
export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: catalogoA.paquetes.map(aPaquete),
};

// ── 2.ª tanda: catálogo fusionado 1020 + 1020b (se conserva tal cual) ──
function transformaPaquete(p: EntradaConEfecto): ReposExternosPaquete {
  const efecto = p.efecto ?? "";
  const githubRepo = p.repo;
  const comingSoon =
    efecto === "CONECTOR" || efecto === "HERRAMIENTA-AGENTE" || efecto === "CATALOGO";

  return {
    id: p.id,
    repo: p.repo,
    nombre: p.nombre ?? p.id,
    kind: p.kind ?? "app",
    canal: p.canal ?? "releases",
    patronTag: p.patron_tag ?? "",
    licencia: p.licencia ?? "",
    area: p.area ?? [],
    efecto,
    preinstalar: p.preinstalar ?? "",
    claude: p.claude ?? false,
    githubRepo,
    externalUrl: `https://github.com/${githubRepo}`,
    comingSoon,
    motivoComingSoon: comingSoon ? `efecto ${efecto}: instalación externa, sin ruta propia del OS` : "",
  };
}

const excluidos = new Set(REPOS_EXCLUIDOS);

export const PAQUETES_EXTERNOS: ReposExternosPaquete[] = [
  ...catalogoA.paquetes,
  ...catalogoB.paquetes,
]
  .filter((p) => !excluidos.has(p.repo))
  .map(transformaPaquete);
