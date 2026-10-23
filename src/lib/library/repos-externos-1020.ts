"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · EL CARGADOR de las tandas de repos externos 1020
// ------------------------------------------------------------------------------
// Lee las TRES tandas del catálogo verificado (Olas 1020, 1020b y 1020c):
//   · config/repos-libreria-1020.json  · 1020b.json · 1020c.json
// y produce el catálogo aplicado en la Biblioteca a través de packages.ts
// (listRepos → REPO_EXTERNOS_1020). Bloquea los repos excluidos por seguridad
// (REPOS_EXCLUIDOS / esRepoExcluido) y no duplica los que ya están como builtin
// (REPOS_YA_PRESENTES, p. ej. penpot/penpot → iatool-penpot).
// Puro y sin `node:*`: esta ficha la importa el cliente.
//
// CICLO DEL CARGADOR: packages.ts importa de aquí y aquí se escanean sus repos
// builtin, así que body de uno necesita body del otro. Para que el orden de
// evaluación dé igual (packages primero en la app, cargador primero en los
// tests), el cálculo que depende de los builtins vive en registrarReposBuiltin:
// el cargador se auto-registra al evaluarse y packages.ts lo re-registra al
// terminar su body; quien llegue antes lanza (TDZ) y quien llegue después lo
// completa. Las llamadas son idempotentes.
// ════════════════════════════════════════════════════════════════════════════

import tandaA from "../../../config/repos-libreria-1020.json";
import tandaB from "../../../config/repos-libreria-1020b.json";
import tandaC from "../../../config/repos-libreria-1020c.json";
import {
  FONDO_SHADER_REPO,
  STARSEED_AGENTS_REPO,
  STARSEED_CORE_REPO,
  STARSEED_DESIGN_ELEMENTS_REPO,
  STARSEED_IA_TOOLS_REPO,
  STARSEED_LABS_REPO,
  STARSEED_THEMES_REPO,
  type LibraryPackage,
  type LibraryRepo,
} from "./packages";

/* ───────────────────── Tipos del catálogo crudo (sin any) ───────────────────── */

interface EntradaCatalogo {
  id: string;
  repo: string;
  nombre: string;
  kind: string;
  canal?: string;
  licencia?: string;
  area?: string[];
  efecto?: string;
  preinstalar?: string;
  claude?: string | boolean;
  patron_tag?: string;
  que_es?: string;
  aviso?: string;
  ruta_os?: string;
}

interface CatalogoCrudo {
  paquetes?: EntradaCatalogo[];
  excluida?: { repo: string; motivo: string };
  excluidas?: { repo: string; motivo: string }[];
}

const repos1 = tandaA as CatalogoCrudo;
const repos2 = tandaB as CatalogoCrudo;
const repos3 = tandaC as CatalogoCrudo;

const EXCLUIDA_1: string[] = [repos1.excluida?.repo ?? ""].filter((v): v is string => v !== "");
const EXCLUIDAS_2: string[] = repos2.excluidas?.map((e) => e.repo) ?? [];
const EXCLUIDAS_3: string[] = repos3.excluidas?.map((e) => e.repo) ?? [];

export const REPOS_EXCLUIDOS: string[] = [...EXCLUIDA_1, ...EXCLUIDAS_2, ...EXCLUIDAS_3];

/* ──────────────────────────── Mapeo de las tandas ──────────────────────────── */

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
  queEs: string;
  aviso: string;
  claude: string | boolean;
  githubRepo: string;
  externalUrl: string;
  comingSoon?: boolean;
  motivoComingSoon?: string;
}

function transformaPaquete(p: EntradaCatalogo): ReposExternosPaquete {
  const efecto = p.efecto ?? "";
  const preinstalar = p.preinstalar ?? "";
  const claude = p.claude ?? false;
  const patronTag = mapaPatronTag(p.patron_tag ?? "");

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
    queEs: p.que_es ?? "",
    aviso: p.aviso ?? "",
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

/** ¿Es un repo excluido por seguridad (reverse-skill, Vikunja falso, open-kritt)? */
export function esRepoExcluido(repo: string): boolean {
  return REPOS_EXCLUIDOS.includes(repo.trim());
}

/* ───────────────── Ficha LibraryPackage de cada entrada ───────────────── */

/** `tool` (CLI/MCP/skill de agentes) → `function`; `link` (ficha externa) → `app`. */
function kindDe(p: ReposExternosPaquete): LibraryPackage["kind"] {
  if (p.kind === "tool") return "function";
  if (p.kind === "link") return "app";
  return (
    ["app", "ai-source", "function"].find((k) => k === p.kind) ?? "app"
  ) as LibraryPackage["kind"];
}

function fichaDe(p: ReposExternosPaquete): LibraryPackage {
  const descripcion = p.queEs.trim() || p.nombre;
  const nota = p.aviso.trim();
  return {
    id: p.id,
    kind: kindDe(p),
    name: p.nombre,
    description: nota ? `${descripcion} ${nota}` : descripcion,
    icon: "Package",
    tags: [...p.area, p.canal].slice(0, 12),
    version: "1.0.0",
    author: p.repo.split("/")[0] ?? "externo",
    sourceRepoId: "starseed-repos-1020",
    free: true,
    comingSoon: p.comingSoon === true,
    payload: {
      externalUrl: p.externalUrl,
      githubRepo: p.githubRepo,
      canal: p.canal,
      area: [...p.area],
      licencia: p.licencia,
      efecto: p.efecto,
      preinstalar: p.preinstalar,
      patronTag: p.patronTag,
    },
  };
}

export interface ReposExternosYaPresente {
  repo: string;
  id: string;
}

/* ──────────────── Registro: builtin map, dedupe y repo builtin ──────────────── */

// Let de carga: se rellenan en registrarReposBuiltin (ver el aviso del ciclo).
export let REPOS_YA_PRESENTES: ReposExternosYaPresente[] = [];
export let PAQUETES_EXTERNOS: ReposExternosPaquete[] = [];
export let REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-repos-1020",
  name: "Repos del visionario 1020",
  builtin: true,
  packages: [],
};

export function registrarReposBuiltin(): void {
  const idBuiltinPorRepo = new Map<string, string>();
  for (const repoBuiltin of [STARSEED_CORE_REPO, STARSEED_LABS_REPO, STARSEED_IA_TOOLS_REPO, STARSEED_AGENTS_REPO, STARSEED_THEMES_REPO, STARSEED_DESIGN_ELEMENTS_REPO, FONDO_SHADER_REPO]) {
    for (const pkg of repoBuiltin.packages) {
      const externa = typeof pkg.payload.externalUrl === "string" ? pkg.payload.externalUrl : "";
      const github = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/.exec(externa.trim())?.[1] ?? "";
      if (github && !idBuiltinPorRepo.has(github)) idBuiltinPorRepo.set(github, pkg.id);
    }
  }

  const reposExcluidosSet = new Set(REPOS_EXCLUIDOS);
  const reposDeTandasPrevias = new Set([...paquetes1, ...paquetes2].map((p) => p.repo));
  const candidatos3 = paquetes3.filter(
    (p) => !reposExcluidosSet.has(p.repo) && !reposDeTandasPrevias.has(p.repo),
  );

  REPOS_YA_PRESENTES = candidatos3
    .filter((p) => idBuiltinPorRepo.has(p.repo))
    .map((p) => ({ repo: p.repo, id: idBuiltinPorRepo.get(p.repo) as string }));

  const reposYaPresentes = new Set(REPOS_YA_PRESENTES.map((presente) => presente.repo));

  PAQUETES_EXTERNOS = [
    ...paquetes1.filter((p) => !reposExcluidosSet.has(p.repo)),
    ...paquetes2.filter((p) => !reposExcluidosSet.has(p.repo)),
    ...candidatos3.filter((p) => !reposYaPresentes.has(p.repo)),
  ];

  REPO_EXTERNOS_1020 = {
    id: "starseed-repos-1020",
    name: "Repos del visionario 1020",
    builtin: true,
    packages: PAQUETES_EXTERNOS.map(fichaDe),
  };
}

// Auto-registro: si el cargador fue evaluado primero (p. ej. en los tests),
// aquí queda TODO listo. Si packages.ts se evaluó antes, la primera llamada
// saltó por TDZ y lo completa al terminar su body.
try {
  registrarReposBuiltin();
} catch {
  /* packages.ts se está evaluando: completará cuando su body llame de nuevo */
}
