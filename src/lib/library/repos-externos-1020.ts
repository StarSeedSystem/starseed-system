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
} from "./packages";
import { REPO_DECISIONES } from "./fuentes-decision";

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
  p: (typeof repos1.paquetes)[0] | (typeof repos2.paquetes)[0] | (typeof repos3.paquetes)[0],
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

/* Repos de paquetes BUILTIN que ya apuntan al mismo repo de GitHub por
 * payload.externalUrl o payload.githubRepo: no se crean dos paquetes con el
 * mismo repo (p. ej. iatool-penpot ya enlaza penpot/penpot). */
const REPOS_BUILTIN = [
  STARSEED_CORE_REPO,
  STARSEED_LABS_REPO,
  FONDO_SHADER_REPO,
  STARSEED_IA_TOOLS_REPO,
  STARSEED_AGENTS_REPO,
  STARSEED_THEMES_REPO,
  STARSEED_DESIGN_ELEMENTS_REPO,
  REPO_DECISIONES,
];

function repoEnlazado(p: { payload?: unknown }): string {
  const pl = p?.payload;
  if (!pl || typeof pl !== "object") return "";
  const url = (pl as { externalUrl?: unknown; githubRepo?: unknown }).externalUrl;
  const gh = (pl as { githubRepo?: unknown }).githubRepo;
  if (typeof url === "string") {
    const m = url.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/);
    if (m) return m[1];
  }
  return typeof gh === "string" ? gh : "";
}

const reposTanda3: string[] = (repos3.paquetes ?? []).map((p: { repo?: string }) => p.repo ?? "");

export const REPOS_YA_PRESENTES: { repo: string; id: string }[] = REPOS_BUILTIN.flatMap((repo) =>
  (repo.packages ?? [])
    .map((p) => ({ repo: repoEnlazado(p), id: p.id }))
    .filter((e: { repo: string }) => reposTanda3.includes(e.repo)),
);

const yaPresentesSet = new Set(REPOS_YA_PRESENTES.map((e) => e.repo));

export const PAQUETES_EXTERNOS: ReposExternosPaquete[] = [
  ...paquetes1.filter((p: ReposExternosPaquete) => !reposExcluidosSet.has(p.repo)),
  ...paquetes2.filter((p: ReposExternosPaquete) => !reposExcluidosSet.has(p.repo)),
  ...paquetes3.filter(
    (p: ReposExternosPaquete) => !reposExcluidosSet.has(p.repo) && !yaPresentesSet.has(p.repo),
  ),
];