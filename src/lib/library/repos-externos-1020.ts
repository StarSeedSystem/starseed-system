"use client";

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

const EXCLUIDOS = [
  catalogo1020.excluida?.repo,
  ...(catalogo1020.excluidas ?? []).map((e: { repo: string }) => e.repo),
  ...(catalogo1020b.excluidas ?? []).map((e: { repo: string }) => e.repo),
].filter((repo): repo is string => Boolean(repo));

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
  packages: catalogo1020.paquetes
    .filter((e) => !REPOS_EXCLUIDOS.includes(e.repo))
    .map(aPaquete),
};