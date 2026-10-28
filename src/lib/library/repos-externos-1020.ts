// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Repo builtin externo 1020 (Ola 1020)
// Convierte config/repos-libreria-1020.json (14 repos verificados) en un repo
// builtin: cada ficha guarda su upstream y su canal para que available-updates
// autobúsque releases/tags/commits por payload.externalUrl. Nada se descarga ni
// se ejecuta; por eso todas llevan comingSoon:true. Módulo PURO (sin node:*):
// lo consume el bundle de cliente de packages.ts.
// Contratos: architecture/repos-libreria-1020.md §5 (1.ª), repos-libreria-1020b.md
// (2.ª) y repos-libreria-1020c.md §3 (3.ª, Ola 1020T).
// La 2.ª y la 3.ª tanda viven en PAQUETES_EXTERNOS (vista plana); la repo builtin
// REPO_EXTERNOS_1020 conserva la 1.ª, como dejó la Ola 1020D.
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";
import catalogo1020 from "../../../config/repos-libreria-1020.json";
import catalogo1020b from "../../../config/repos-libreria-1020b.json";
import catalogo1020c from "../../../config/repos-libreria-1020c.json";

interface Entrada1020 {
  id: string; repo: string; nombre: string; kind: string;
  canal: "releases" | "tags" | "commits"; licencia: string; area: string[];
  que_es: string; aviso?: string; skillId?: string; assets?: string[];
  patron_tag?: string; efecto?: string; preinstalar?: string;
  claude?: string | boolean;
}
interface Catalogo1020 { paquetes: Entrada1020[]; excluida?: { repo: string } }
interface Catalogo1020b { paquetes: Entrada1020[]; excluidas?: { repo: string }[] }
interface Catalogo1020c { paquetes: Entrada1020[]; excluidas?: { repo: string }[] }

const CATALOGO = catalogo1020 as unknown as Catalogo1020;
const CATALOGO_B = catalogo1020b as unknown as Catalogo1020b;
const CATALOGO_C = catalogo1020c as unknown as Catalogo1020c;
const ICONOS: Record<string, string> = { app: "AppWindow", "ai-source": "BrainCircuit", function: "Boxes" };

function autorDe(repo: string): string { return repo.split("/")[0] ?? repo; }

function payloadDe(e: Entrada1020): Record<string, unknown> {
  return {
    externalUrl: `https://github.com/${e.repo}`,
    githubRepo: e.repo, canal: e.canal, area: e.area, licencia: e.licencia,
    assets: e.assets ?? false,
    ...(e.skillId ? { skillId: e.skillId } : {}),
  };
}

function paqueteDe(e: Entrada1020): LibraryPackage {
  return {
    id: e.id, kind: e.kind as PackageKind, name: e.nombre,
    description: e.que_es + (e.aviso ? ` — ${e.aviso}` : ""),
    icon: ICONOS[e.kind] ?? "Package",
    tags: [...e.area, e.canal, e.licencia ? "lic" : ""].filter(Boolean),
    version: "1.0.0", author: autorDe(e.repo),
    sourceRepoId: "starseed-biblioteca-externa", free: true, comingSoon: true,
    payload: payloadDe(e),
  };
}

// ── Fusión 1.ª + 2.ª + 3.ª tanda (Olas 1020D y 1020K): exclusiones de seguridad,
//    repos ya presentes como builtin y vista plana ──

export const REPOS_EXCLUIDOS: string[] = [
  CATALOGO.excluida?.repo,
  ...(CATALOGO_B.excluidas ?? []).map((e) => e.repo),
  ...(CATALOGO_C.excluidas ?? []).map((e) => e.repo),
].filter((v): v is string => Boolean(v));

const excluidos = new Set(REPOS_EXCLUIDOS);
const esExcluida = (e: Entrada1020): boolean =>
  excluidos.has(e.repo) || e.id.includes("reverse-skill") || e.repo.includes("reverse-skill");

// ── 3.ª tanda (RLB1020K): no duplicar repos que ya son builtin en packages.ts ──

export interface RepoYaPresente { repo: string; id: string }

/**
 *. Semilla del contrato (packages.ts la confirma y la deriva de sus builtin al
 * arrancar, ver `registrarReposYaPresentes`): builtin con el MISMO repo por
 * payload.externalUrl o payload.githubRepo.
 */
export const REPOS_YA_PRESENTES: RepoYaPresente[] = [
  { repo: "penpot/penpot", id: "iatool-penpot" },
];

const RE_REPOS_GITHUB = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/;

function repoGithubDe(p: { payload?: Record<string, unknown> }): string {
  const gh = p.payload?.githubRepo;
  if (typeof gh === "string" && gh) return gh;
  const url = p.payload?.externalUrl;
  return typeof url === "string" ? RE_REPOS_GITHUB.exec(url)?.[1] ?? "" : "";
}

/** Deriva los ya presentes de verdad: builtin que ya sirve un repo de la 3.ª tanda. */
export function reposYaPresentesDe(builtins: readonly LibraryRepo[]): RepoYaPresente[] {
  const deLaTandaC = new Set(CATALOGO_C.paquetes.map((e) => e.repo));
  const vistos = new Map<string, string>();
  for (const repo of builtins) {
    for (const p of repo.packages) {
      const repoGh = repoGithubDe(p);
      if (deLaTandaC.has(repoGh) && !vistos.has(repoGh)) vistos.set(repoGh, p.id);
    }
  }
  return [...vistos].map(([repo, id]) => ({ repo, id }));
}

let cacheYaPresentes: Set<string> | null = null;

/**
 * APLICA la derivación: `packages.ts` la llama con sus builtin al arrancar y
 * `REPOS_YA_PRESENTES` deja de ser la semilla y pasa a ser lo real.
 */
export function registrarReposYaPresentes(builtins: readonly LibraryRepo[]): RepoYaPresente[] {
  REPOS_YA_PRESENTES.splice(0, REPOS_YA_PRESENTES.length, ...reposYaPresentesDe(builtins));
  cacheYaPresentes = null;
  return REPOS_YA_PRESENTES;
}

function esRepoYaPresente(repo: string): boolean {
  cacheYaPresentes ??= new Set(REPOS_YA_PRESENTES.map((r) => r.repo));
  return cacheYaPresentes.has(repo);
}

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa", name: "Biblioteca externa",
  builtin: true, packages: CATALOGO.paquetes.filter((e) => !esExcluida(e)).map(paqueteDe),
};

export interface ReposExternosPaquete {
  id: string; repo: string; nombre: string; kind: string; canal: string;
  patronTag: string; licencia: string; area: string[]; efecto: string;
  preinstalar: string; claude: string | boolean; githubRepo: string;
  externalUrl: string; comingSoon?: boolean; motivoComingSoon?: string;
}

function transformaPaquete(p: Entrada1020): ReposExternosPaquete {
  const efecto = p.efecto ?? "";
  const comingSoon = efecto === "CONECTOR" || efecto === "HERRAMIENTA-AGENTE" || efecto === "CATALOGO";
  return {
    id: p.id, repo: p.repo, nombre: p.nombre ?? p.id, kind: p.kind ?? "app",
    canal: p.canal ?? "releases", patronTag: p.patron_tag ?? "",
    licencia: p.licencia ?? "", area: p.area ?? [], efecto,
    preinstalar: p.preinstalar ?? "", claude: p.claude ?? false,
    githubRepo: p.repo, externalUrl: `https://github.com/${p.repo}`,
    comingSoon,
    motivoComingSoon: comingSoon ? `efecto ${efecto}: instalación externa, sin ruta propia del OS` : "",
  };
}

export const PAQUETES_EXTERNOS: ReposExternosPaquete[] = [
  ...CATALOGO.paquetes,
  ...CATALOGO_B.paquetes,
  ...CATALOGO_C.paquetes.filter((e) => !esRepoYaPresente(e.repo)),
].filter((e) => !esExcluida(e)).map(transformaPaquete);
