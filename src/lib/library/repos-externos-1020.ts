// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Repos externos de la Ola 1020 (dos tandas)
// ----------------------------------------------------------------------------
// 1.ª tanda (`config/repos-libreria-1020.json`, 14 repos verificadas, contrato
// architecture/repos-libreria-1020.md §5): se mapea a LibraryPackage como repo
// builtin `REPO_EXTERNOS_1020` para que `available-updates.ts` autobúsque sus
// releases/tags/commits con `payload.externalUrl`. Nada se descarga ni se
// ejecuta: instalar solo guarda el enlace y abre el repo; por eso todas llevan
// `comingSoon: true` mientras no exista un efecto real en el OS.
// 2.ª tanda (`config/repos-libreria-1020b.json`, Ola 1020S): export crudo
// `PAQUETES_EXTERNOS` traído de RLB1020D y hecho PURO (import estática del
// JSON, sin `node:fs` — CLAUDE.md, trampa 11; `packages.ts` lo consume en
// cliente). Exclusión permanente: zhaoxuya520/reverse-skill (§6 del contrato).
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";
import datos1020 from "../../../config/repos-libreria-1020.json";
import datos1020b from "../../../config/repos-libreria-1020b.json";

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

const CATALOGO = datos1020 as unknown as Catalogo1020;

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

/** (repository/)repo bloqueadas por seguridad en las dos tandas. */
export const REPOS_EXCLUIDOS: string[] = [
  ...(datos1020.excluida ? [datos1020.excluida.repo] : []),
  ...(datos1020b.excluidas ?? []).map((e) => e.repo),
].filter((r): r is string => r !== "");

const reposExcluidosSet = new Set(REPOS_EXCLUIDOS);

/** Repo builtin de la 1.ª tanda: 14 fichas LibraryPackage, sin reverse-skill. */
export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: CATALOGO.paquetes
    .filter((e) => !reposExcluidosSet.has(e.repo))
    .map(paqueteDe),
};

/* ── 2.ª tanda · crudo de la Ola 1020S (RLB1020D), sin node:fs ── */

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

interface EntradaCruda {
  id?: string;
  repo?: string;
  nombre?: string;
  kind?: string;
  canal?: string;
  patron_tag?: string;
  licencia?: string;
  area?: string[];
  efecto?: string;
  preinstalar?: string;
  claude?: string | boolean;
}

function transformaPaquete(p: EntradaCruda): ReposExternosPaquete {
  const efecto = p.efecto ?? "";
  const preinstalar = p.preinstalar ?? "";
  const esExterno =
    efecto === "CONECTOR" || efecto === "HERRAMIENTA-AGENTE" || efecto === "CATALOGO";
  const githubRepo = p.repo ?? "";
  return {
    id: p.id ?? "",
    repo: p.repo ?? "",
    nombre: p.nombre ?? p.id ?? "",
    kind: p.kind ?? "app",
    canal: p.canal ?? "releases",
    patronTag: p.patron_tag ?? "",
    licencia: p.licencia ?? "",
    area: p.area ?? [],
    efecto,
    preinstalar,
    claude: p.claude ?? false,
    githubRepo,
    externalUrl: `https://github.com/${githubRepo}`,
    ...(esExterno
      ? {
          comingSoon: true,
          motivoComingSoon: `efecto ${efecto}: instalación externa, sin ruta propia del OS`,
        }
      : {}),
  };
}

const crudos: EntradaCruda[] = [
  ...datos1020b.paquetes,
  ...CATALOGO.paquetes,
];

export const PAQUETES_EXTERNOS: ReposExternosPaquete[] = crudos
  .filter((p) => (p.repo ?? "") !== "" && !reposExcluidosSet.has(p.repo ?? ""))
  .map(transformaPaquete);
