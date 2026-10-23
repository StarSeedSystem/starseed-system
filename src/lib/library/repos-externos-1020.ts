"use client";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FONDO_SHADER_REPO,
  STARSEED_AGENTS_REPO,
  STARSEED_CORE_REPO,
  STARSEED_DESIGN_ELEMENTS_REPO,
  STARSEED_IA_TOOLS_REPO,
  STARSEED_LABS_REPO,
  STARSEED_THEMES_REPO,
  type LibraryRepo,
} from "./packages";

const REPO_ROOT = process.cwd();
const CONFIG_1_PATH = resolve(REPO_ROOT, "config", "repos-libreria-1020.json");
const CONFIG_2_PATH = resolve(REPO_ROOT, "config", "repos-libreria-1020b.json");
const CONFIG_3_PATH = resolve(REPO_ROOT, "config", "repos-libreria-1020c.json");

const repos1 = JSON.parse(readFileSync(CONFIG_1_PATH, "utf-8"));
const repos2 = JSON.parse(readFileSync(CONFIG_2_PATH, "utf-8"));
const repos3 = JSON.parse(readFileSync(CONFIG_3_PATH, "utf-8"));

const EXCLUIDA_1: string[] = [repos1.excluida?.repo ?? ""].filter((v): v is string => v !== "");
const EXCLUIDAS_2: string[] = repos2.excluidas?.map((e: { repo: string }) => e.repo) ?? [];
const EXCLUIDAS_3: string[] = repos3.excluidas?.map((e: { repo: string }) => e.repo) ?? [];

export const REPOS_EXCLUIDOS: string[] = [...EXCLUIDA_1, ...EXCLUIDAS_2, ...EXCLUIDAS_3];

function mapaPatronTag(patron_tag: string): string {
  return patron_tag ?? "";
}

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

function transformaPaquete(
  p: typeof repos1.paquetes[0] | (typeof repos2.paquetes)[0] | (typeof repos3.paquetes)[0],
): ReposExternosPaquete {
  const efecto = p.efecto ?? "";
  const preinstalar = p.preinstalar ?? "";
  const claude = p.claude ?? false;
  const patronTag = mapaPatronTag(p.patron_tag);

  const githubRepo = p.repo ?? "";
  const externalUrl = `https://github.com/${githubRepo}`;

  const esEfectoQueRequiereComingSoon =
    efecto === "CONECTOR" || efecto === "HERRAMIENTA-AGENTE" || efecto === "CATALOGO";

  let comingSoon = false;
  let motivoComingSoon = "";

  if (esEfectoQueRequiereComingSoon) {
    comingSoon = true;
    motivoComingSoon = `efecto ${efecto}: instalación externa, sin ruta propia del OS`;
  }

  return {
    id: p.id,
    repo: p.repo,
    nombre: p.nombre ?? p.id,
    kind: p.kind ?? "app",
    canal: p.canal ?? "releases",
    patronTag,
    licencia: p.licencia ?? "",
    area: p.area ?? [],
    efecto,
    preinstalar,
    claude,
    githubRepo,
    externalUrl,
    comingSoon,
    motivoComingSoon,
  };
}

const paquetes1 = (repos1.paquetes ?? []).map(transformaPaquete);
const paquetes2 = (repos2.paquetes ?? []).map(transformaPaquete);
const paquetes3 = (repos3.paquetes ?? []).map(transformaPaquete);

const reposExcluidosSet = new Set(REPOS_EXCLUIDOS);

/* ── No duplicar repos que ya están (3.ª tanda) ───────────────────────────
 * Si un paquete builtin de packages.ts ya apunta al mismo repo de GitHub por
 * `payload.externalUrl` (p. ej. iatool-penpot → penpot/penpot), no se crea otro
 * paquete con ese repo: queda visible en REPOS_YA_PRESENTES. La regla entra con
 * la 3.ª tanda: las tandas 1 y 2 conservan su catálogo fijado por sus pruebas.
 * ──────────────────────────────────────────────────────────────────────── */
const REPOS_BUILTIN_CON_URL: LibraryRepo[] = [
  STARSEED_CORE_REPO,
  STARSEED_LABS_REPO,
  STARSEED_IA_TOOLS_REPO,
  STARSEED_AGENTS_REPO,
  STARSEED_THEMES_REPO,
  STARSEED_DESIGN_ELEMENTS_REPO,
  FONDO_SHADER_REPO,
];

function repoDeGithub(url: string): string {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/.exec(url.trim());
  return match ? match[1] : "";
}

const idBuiltinPorRepo = new Map<string, string>();
for (const repoBuiltin of REPOS_BUILTIN_CON_URL) {
  for (const pkg of repoBuiltin.packages) {
    const externa = typeof pkg.payload.externalUrl === "string" ? pkg.payload.externalUrl : "";
    const github = repoDeGithub(externa);
    if (github && !idBuiltinPorRepo.has(github)) idBuiltinPorRepo.set(github, pkg.id);
  }
}

export interface ReposExternosYaPresente {
  repo: string;
  id: string;
}

const reposDeTandasPrevias = new Set(
  [...paquetes1, ...paquetes2].map((p: ReposExternosPaquete) => p.repo),
);
const candidatos3 = paquetes3.filter((p: ReposExternosPaquete) => {
  return !reposExcluidosSet.has(p.repo) && !reposDeTandasPrevias.has(p.repo);
});

export const REPOS_YA_PRESENTES: ReposExternosYaPresente[] = candidatos3
  .filter((p: ReposExternosPaquete) => idBuiltinPorRepo.has(p.repo))
  .map((p: ReposExternosPaquete) => ({ repo: p.repo, id: idBuiltinPorRepo.get(p.repo) as string }));

const reposYaPresentes = new Set(REPOS_YA_PRESENTES.map((presente) => presente.repo));

export const PAQUETES_EXTERNOS: ReposExternosPaquete[] = [
  ...paquetes1.filter((p: ReposExternosPaquete) => !reposExcluidosSet.has(p.repo)),
  ...paquetes2.filter((p: ReposExternosPaquete) => !reposExcluidosSet.has(p.repo)),
  ...candidatos3.filter((p: ReposExternosPaquete) => !reposYaPresentes.has(p.repo)),
];