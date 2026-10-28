// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Repo builtin externo 1020 (Ola 1020)
// Convierte config/repos-libreria-1020.json (14 repos verificados) en un repo
// builtin: cada ficha guarda su upstream y su canal para que available-updates
// autobúsque releases/tags/commits por payload.externalUrl. Nada se descarga ni
// se ejecuta; por eso todas llevan comingSoon:true. Módulo PURO (sin node:*):
// lo consume el bundle de cliente de packages.ts.
// Contrato: architecture/repos-libreria-1020.md §5.
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";
import catalogo1020 from "../../../config/repos-libreria-1020.json";
import catalogo1020b from "../../../config/repos-libreria-1020b.json";
import catalogo1020c from "../../../config/repos-libreria-1020c.json";
import catalogo1020d from "../../../config/repos-libreria-1020d.json";

/** Requisitos del catálogo de la 4.ª tanda; `null` = sin medir (no se inventa). */
export interface Requisitos1020D {
  ram_gb: number | null; vram_gb: number | null;
  gpu: "no" | "opcional" | "recomendada" | "necesaria";
  docker: string; arquitecturas: string[]; so: string[]; fuente: string;
}

interface Entrada1020 {
  id: string; repo: string; nombre: string; kind: string;
  canal: "releases" | "tags" | "commits"; licencia: string; area: string[];
  que_es: string; aviso?: string; skillId?: string; assets?: string[];
  patron_tag?: string; efecto?: string; preinstalar?: string;
  claude?: string | boolean; requisitos?: Requisitos1020D;
}
interface Catalogo1020 { paquetes: Entrada1020[]; excluida?: { repo: string } }
interface Catalogo1020b { paquetes: Entrada1020[]; excluidas?: { repo: string }[] }
interface Catalogo1020c { paquetes: Entrada1020[]; excluidas?: { repo: string; motivo: string }[]; duplicadas?: Record<string, string> }
interface Catalogo1020d { paquetes: Entrada1020[]; excluidas?: { repo: string; motivo: string }[]; duplicadas?: Record<string, string> }

const CATALOGO = catalogo1020 as unknown as Catalogo1020;
const CATALOGO_B = catalogo1020b as unknown as Catalogo1020b;
const CATALOGO_C = catalogo1020c as unknown as Catalogo1020c;
const CATALOGO_D = catalogo1020d as unknown as Catalogo1020d;
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

// ── Fusión 1.ª + 2.ª + 3.ª + 4.ª tanda: exclusiones de seguridad y vista plana ──

export const REPOS_EXCLUIDOS: string[] = [
  CATALOGO.excluida?.repo,
  ...(CATALOGO_B.excluidas ?? []).map((e) => e.repo),
  ...(CATALOGO_C.excluidas ?? []).map((e) => e.repo),
  ...(CATALOGO_D.excluidas ?? []).map((e) => e.repo),
].filter((v): v is string => Boolean(v));

/// Repos de la 3.ª y 4.ª tanda que YA EXISTEN en packages.ts (mismo GitHub repo por externalUrl).
/// No se crean paquetes duplicados; esta lista sirve de visibilidad para la integración.
/// ComfyUI no está aquí: no tiene ficha en packages.ts, así que entra como `lib-comfyui`.
export const REPOS_YA_PRESENTES: { repo: string; id: string }[] = [
  { repo: "penpot/penpot", id: "iatool-penpot" },
  { repo: "coollabsio/coolify", id: "iatool-coolify" },
  { repo: "OpenHands/OpenHands", id: "iatool-openhands" },
  { repo: "Stirling-Tools/Stirling-PDF", id: "iatool-stirling-pdf" },
];

/// GitHub no distingue mayúsculas: la comparación de repos se hace en minúsculas.
const normalizaRepo = (repo: string): string => repo.toLowerCase();
const yaPresentes = new Set(REPOS_YA_PRESENTES.map((r) => normalizaRepo(r.repo)));
const excluidos = new Set(REPOS_EXCLUIDOS.map(normalizaRepo));
const esExcluida = (e: Entrada1020): boolean => {
  const repo = normalizaRepo(e.repo);
  return excluidos.has(repo) || yaPresentes.has(repo) || e.id.includes("reverse-skill") || repo.includes("reverse-skill");
};

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa", name: "Biblioteca externa",
  builtin: true, packages: [
    ...CATALOGO.paquetes.filter((e) => !esExcluida(e)).map(paqueteDe),
    ...CATALOGO_B.paquetes.filter((e) => !esExcluida(e)).map(paqueteDe),
    ...CATALOGO_C.paquetes.filter((e) => !esExcluida(e)).map(paqueteDe),
    ...CATALOGO_D.paquetes.filter((e) => !esExcluida(e)).map(paqueteDe),
  ],
};

// ── Requisitos de la 4.ª tanda para la bolsa de recursos ──────────────────
/// Se incluyen las diez entradas del catálogo (también Coolify, OpenHands y
/// Stirling-PDF, que ya tienen ficha): la bolsa coloca servicios pesados y
/// necesita sus requisitos aunque el paquete no se duplique.
function requisitosDe(catalogo: Catalogo1020d): Record<string, Requisitos1020D> {
  const salida: Record<string, Requisitos1020D> = {};
  for (const e of catalogo.paquetes) if (e.requisitos) salida[e.id] = e.requisitos;
  return salida;
}
export const REQUISITOS_1020D: Record<string, Requisitos1020D> = requisitosDe(CATALOGO_D);

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
  ...CATALOGO_C.paquetes,
  ...CATALOGO_D.paquetes,
].filter((e) => !esExcluida(e)).map(transformaPaquete);
