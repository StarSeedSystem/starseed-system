// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Repo builtin externo 1020 (Ola 1020)
// ----------------------------------------------------------------------------
// Convierte `config/repos-libreria-1020.json` (14 repos verificados) en un repo
// builtin de la Biblioteca. Cada ficha conserva su upstream y su canal para que
// `available-updates.ts` autobúsque releases/tags/commits con
// `payload.externalUrl`. Nada se descarga ni se ejecuta: instalar solo guarda el
// enlace y abre el repo; por eso todas llevan `comingSoon: true` mientras no
// exista un efecto real de instalación en el OS.
//
// Módulo PURO: importa el JSON de forma estática (igual que repos-1025.ts).
// Prohibido `node:*` aquí: lo consume el bundle de cliente de `packages.ts`.
// Contrato: architecture/repos-libreria-1020.md §5.
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";
import datos from "../../../config/repos-libreria-1020.json";

interface Entrada1020 {
  id: string;
  repo: string;
  nombre: string;
  kind: PackageKind;
  canal: "releases" | "tags" | "commits";
  licencia: string;
  area: string[];
  que_es: string;
  aviso?: string;
  skillId?: string;
  assets?: string[];
}

interface Catalogo1020 {
  paquetes: Entrada1020[];
}

const CATALOGO = datos as unknown as Catalogo1020;

const ICONOS: Record<string, string> = {
  app: "AppWindow",
  "ai-source": "BrainCircuit",
  function: "Boxes",
};

function iconoDe(kind: string): string {
  return ICONOS[kind] ?? "Package";
}

function autorDe(repo: string): string {
  return repo.split("/")[0] ?? repo;
}

function descripcionDe(e: Entrada1020): string {
  return e.que_es + (e.aviso ? ` — ${e.aviso}` : "");
}

function payloadDe(e: Entrada1020): Record<string, unknown> {
  return {
    externalUrl: `https://github.com/${e.repo}`,
    githubRepo: e.repo,
    canal: e.canal,
    area: e.area,
    licencia: e.licencia,
    assets: e.assets ?? false,
    ...(e.skillId ? { skillId: e.skillId } : {}),
  };
}

function paqueteDe(e: Entrada1020): LibraryPackage {
  return {
    id: e.id,
    kind: e.kind,
    name: e.nombre,
    description: descripcionDe(e),
    icon: iconoDe(e.kind),
    tags: [...e.area, e.canal, e.licencia ? "lic" : ""].filter(Boolean),
    version: "1.0.0",
    author: autorDe(e.repo),
    sourceRepoId: "starseed-biblioteca-externa",
    free: true,
    comingSoon: true,
    payload: payloadDe(e),
  };
}

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: CATALOGO.paquetes.map(paqueteDe),
};
