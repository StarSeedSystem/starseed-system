"use client";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = process.cwd();
const CONFIG_1_PATH = resolve(REPO_ROOT, "config", "repos-libreria-1020.json");
const CONFIG_2_PATH = resolve(REPO_ROOT, "config", "repos-libreria-1020b.json");

const repos1 = JSON.parse(readFileSync(CONFIG_1_PATH, "utf-8"));
const repos2 = JSON.parse(readFileSync(CONFIG_2_PATH, "utf-8"));

const EXCLUIDA_1: string[] = [repos1.excluida?.repo ?? ""].filter((v): v is string => v !== "");
const EXCLUIDAS_2: string[] = repos2.excluidas?.map((e: { repo: string }) => e.repo) ?? [];

export const REPOS_EXCLUIDOS: string[] = [...EXCLUIDA_1, ...EXCLUIDAS_2];

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

function transformaPaquete(p: typeof repos1.paquetes[0] | (typeof repos2.paquetes)[0]): ReposExternosPaquete {
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

const reposExcluidosSet = new Set(REPOS_EXCLUIDOS);

export const PAQUETES_EXTERNOS: ReposExternosPaquete[] = [
  ...paquetes1.filter((p) => !reposExcluidosSet.has(p.repo)),
  ...paquetes2.filter((p) => !reposExcluidosSet.has(p.repo)),
];