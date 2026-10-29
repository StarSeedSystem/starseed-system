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

interface Entrada1020 {
  id: string; repo: string; nombre: string; kind: string;
  canal: "releases" | "tags" | "commits"; licencia: string; area: string[];
  que_es: string; aviso?: string; skillId?: string; assets?: string[];
  patron_tag?: string; efecto?: string; preinstalar?: string;
  claude?: string | boolean;
}
interface Catalogo1020 { paquetes: Entrada1020[]; excluida?: { repo: string } }
interface Catalogo1020b { paquetes: Entrada1020[]; excluidas?: { repo: string }[] }
interface Catalogo1020c { paquetes: Entrada1020[]; excluidas?: { repo: string; motivo: string }[]; duplicadas?: Record<string, string> }

const CATALOGO = catalogo1020 as unknown as Catalogo1020;
const CATALOGO_B = catalogo1020b as unknown as Catalogo1020b;
const CATALOGO_C = catalogo1020c as unknown as Catalogo1020c;

/** El catálogo es dato externo: normalizamos antes de confiar en su `kind`. */
function kindSeguro(kind: string): PackageKind {
  return kind === "app" || kind === "ai-source" || kind === "function" ? kind : "app";
}

function iconoDeKind(kind: string): string {
  if (kind === "app") return "AppWindow";
  if (kind === "ai-source") return "BrainCircuit";
  if (kind === "function") return "Boxes";
  return "Package";
}

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
    id: e.id, kind: kindSeguro(e.kind), name: e.nombre,
    description: e.que_es + (e.aviso ? ` — ${e.aviso}` : ""),
    icon: iconoDeKind(e.kind),
    tags: [...e.area, e.canal, e.licencia ? "lic" : ""].filter(Boolean),
    version: "1.0.0", author: autorDe(e.repo),
    sourceRepoId: "starseed-biblioteca-externa", free: true, comingSoon: true,
    payload: payloadDe(e),
  };
}

// ── Fusión 1.ª + 2.ª + 3.ª tanda (Ola 1020T): exclusiones de seguridad y vista plana ──

export const REPOS_EXCLUIDOS: string[] = [...new Set([
  CATALOGO.excluida?.repo,
  ...(CATALOGO_B.excluidas ?? []).map((e) => e.repo),
  ...(CATALOGO_C.excluidas ?? []).map((e) => e.repo),
].filter((v): v is string => Boolean(v)))];

/// Repos de la 3.ª tanda que YA EXISTEN en packages.ts (mismo GitHub repo por externalUrl).
/// No se crean paquetes duplicados; esta lista sirve de visibilidad para la integración.
export const REPOS_YA_PRESENTES: { repo: string; id: string }[] = [
  { repo: "penpot/penpot", id: "iatool-penpot" },
];

const yaPresentes = new Set(REPOS_YA_PRESENTES.map((r) => r.repo));
const excluidos = new Set(REPOS_EXCLUIDOS);
const esExcluida = (e: Entrada1020): boolean =>
  excluidos.has(e.repo) || yaPresentes.has(e.repo) || e.id.includes("reverse-skill") || e.repo.includes("reverse-skill");

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa", name: "Biblioteca externa",
  builtin: true, packages: [
    ...CATALOGO.paquetes.filter((e) => !esExcluida(e)).map(paqueteDe),
    ...CATALOGO_B.paquetes.filter((e) => !esExcluida(e)).map(paqueteDe),
    ...CATALOGO_C.paquetes.filter((e) => !esExcluida(e)).map(paqueteDe),
  ],
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
  ...CATALOGO_C.paquetes,
].filter((e) => !esExcluida(e)).map(transformaPaquete);
