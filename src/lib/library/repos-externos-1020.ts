// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Repos externos de las dos tandas 1020 (R y S)
// ----------------------------------------------------------------------------
// Cargador puro de las DOS tandas verificadas de repos del visionario:
//   · 1.ª tanda (Ola 1020R): config/repos-libreria-1020.json
//   · 2.ª tanda (Ola 1020S): config/repos-libreria-1020b.json
// Los datos vienen del catálogo verificado; NO se inventan. Une las dos listas
// de `paquetes`, mapea cada entrada a un `LibraryPackage` y elimina cualquier
// paquete cuyo `repo` esté en la lista de excluidas (criminales o señuelos).
// Honestidad radical: sin ruta real del OS el paquete entra en `comingSoon`
// con su motivo; instalar entonces solo guarda la ficha y el enlace.
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryRepo, LibraryPackage, PackageKind } from "./packages";
import tandaA from "../../../config/repos-libreria-1020.json";
import tandaB from "../../../config/repos-libreria-1020b.json";

/* ───────────────────────── Tipos del catálogo crudo ───────────────────────── */

interface PaqueteCrudo {
  id: string;
  repo: string;
  nombre: string;
  kind: string;
  canal?: string;
  licencia?: string;
  area?: string[];
  ruta_os?: string;
  externalUrl?: string;
  que_es?: string;
  nota?: string;
  aviso?: string;
  claude?: string;
  efecto?: string;
  preinstalar?: string;
  patron_tag?: string;
}

interface ExcluidaCruda {
  repo?: string;
  motivo?: string;
}

interface TandaCruda {
  paquetes?: PaqueteCrudo[];
  excluida?: ExcluidaCruda;
  excluidas?: ExcluidaCruda[];
}

/* ─────────────────── Repos bloqueados en las dos tandas ─────────────────── */

function excluidasDe(t: TandaCruda): string[] {
  const lista = t.excluidas ?? [];
  const una = t.excluida ? [t.excluida] : [];
  return [...una, ...lista]
    .map((e) => (e?.repo ?? "").trim())
    .filter((r) => r.length > 0);
}

/** Repos excluidos por seguridad/fraude: nunca entran en la Librería. */
export const REPOS_EXCLUIDOS: string[] = Array.from(
  new Set([...excluidasDe(tandaA as TandaCruda), ...excluidasDe(tandaB as TandaCruda)]),
);

/* ─────────────────────────── Mapeo por kind/efecto ─────────────────────────── */

const KINDS_VALIDOS: PackageKind[] = [
  "app", "widget", "page", "publication", "board", "research",
  "project", "design", "animation", "function", "ai-source", "repo",
  "agent",
];

function esKindValido(k: string): k is PackageKind {
  return (KINDS_VALIDOS as string[]).includes(k);
}

/** `tool` (CLI/MCP/skill de agentes) → `function`; `link` (ficha externa) → `app`. */
function kindDe(p: PaqueteCrudo): PackageKind {
  if (esKindValido(p.kind)) return p.kind;
  if (p.kind === "tool") return "function";
  if (p.kind === "link") return "app";
  if (p.efecto === "HERRAMIENTA-AGENTE") return "function";
  if (p.efecto === "CONECTOR" || p.efecto === "CATALOGO") return "app";
  return "app";
}

/** Motivo honesto por el que instalar no tendría efecto real todavía. */
function motivoSinEfecto(p: PaqueteCrudo): string {
  const e = p.efecto ?? "";
  if (e === "CONECTOR") {
    return "Conector: el servidor se levanta aparte (A1 o Mac) y su endpoint se pega en el Hub de Conectores; instalar solo registra la capacidad y el enlace.";
  }
  if (e === "HERRAMIENTA-AGENTE") {
    return "Herramienta de agentes (CLI, skill o MCP): se instala en la máquina del agente, no dentro del OS; aquí solo queda la ficha y el enlace.";
  }
  if (e === "CATALOGO") {
    return "Catálogo: solo ficha, enlace y seguimiento de versiones; no corre dentro del OS.";
  }
  return "Sin ruta propia en el OS todavía: instalar solo guarda la ficha y el enlace; el botón queda deshabilitado.";
}

/* ─────────────────────── Conversión a LibraryPackage ─────────────────────── */

function githubUrl(repo: string): string {
  return `https://github.com/${repo}`;
}

function mapearPaquete(p: PaqueteCrudo): LibraryPackage {
  const externalUrl = p.externalUrl?.trim() || githubUrl(p.repo);
  const ruta = p.ruta_os?.trim();
  const tieneRuta = Boolean(ruta);
  const payload: Record<string, unknown> = {
    githubRepo: p.repo,
    externalUrl,
    canal: p.canal ?? "releases",
    area: p.area ?? [],
    licencia: p.licencia ?? "",
  };
  if (p.efecto) payload.efecto = p.efecto;
  if (p.preinstalar) payload.preinstalar = p.preinstalar;
  if (p.claude) payload.claude = p.claude;
  if (p.patron_tag) payload.patronTag = p.patron_tag;
  if (ruta) payload.route = ruta;
  if (p.nota) payload.nota = p.nota;
  if (p.aviso) payload.aviso = p.aviso;

  const descripcion = p.que_es?.trim() || p.nombre;
  const pkg: LibraryPackage = {
    id: p.id,
    kind: kindDe(p),
    name: p.nombre,
    description: p.aviso ? `${descripcion} ${p.aviso}` : descripcion,
    icon: "Package",
    tags: p.area ?? [],
    version: "1.0.0",
    author: p.repo.split("/")[0] ?? "externo",
    sourceRepoId: "starseed-repos-1020",
    free: true,
    payload,
  };
  if (!tieneRuta) {
    pkg.comingSoon = true;
    pkg.description = `${pkg.description} ${motivoSinEfecto(p)}`;
  }
  return pkg;
}

function paquetesDe(t: TandaCruda, excluidos: string[]): LibraryPackage[] {
  const lista = t.paquetes ?? [];
  return lista
    .filter((p) => p?.repo && !excluidos.includes(p.repo))
    .map(mapearPaquete);
}

const EXCLUIDOS_SET = new Set(REPOS_EXCLUIDOS);

/** Repo builtin con las dos tandas (1.ª Ola 1020R + 2.ª Ola 1020S). */
export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-repos-1020",
  name: "Repos del visionario 1020",
  builtin: true,
  packages: [
    ...paquetesDe(tandaA as TandaCruda, REPOS_EXCLUIDOS),
    ...paquetesDe(tandaB as TandaCruda, REPOS_EXCLUIDOS),
  ],
};

/** `true` si el repo está bloqueado por alguna de las dos tandas. */
export function esRepoExcluido(repo: string): boolean {
  return EXCLUIDOS_SET.has(repo);
}
