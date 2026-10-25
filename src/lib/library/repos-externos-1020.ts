// Cargador de las tandas 1020 (1.ª y 2.ª) de repos externos de la Biblioteca.
// Antes leía los catálogos con node:fs en carga: eso lo volvía solo de servidor
// y nadie lo podía montar en el cliente. Ahora los importa de forma ESTÁTICA
// (módulo puro, sin node:*), así que packages.ts puede listar
// REPO_EXTERNOS_1020 en la Biblioteca y available-updates.ts puede leer
// payload.externalUrl de cada ficha para autobuscar releases.
//
// «Instalar no descarga ni lanza servidores»: efecto = ficha + enlace externo;
// cada entrada declara su canal (releases/tags/commits) y su licencia verificada.
//
// Exclusión permanente (seguridad): zhaoxuya520/reverse-skill (1.ª tanda) y
// Vikunja-Self-Hosted/Vikunja-Task-Management (2.ª, señuelo sin código).

import repos1 from "../../../config/repos-libreria-1020.json";
import repos2 from "../../../config/repos-libreria-1020b.json";
import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";

/** Campos que usan las entradas de las dos tandas (todas opcionales salvo id/repo). */
export interface EntradaExterna {
  id: string;
  repo: string;
  nombre?: string;
  kind?: string;
  canal?: string;
  patron_tag?: string;
  licencia?: string;
  area?: string[];
  efecto?: string;
  preinstalar?: string;
  claude?: string | boolean;
  que_es?: string;
  nota?: string;
  aviso?: string;
  externalUrl?: string;
  assets?: string[];
  skillId?: string;
}

const crudos1 = repos1.paquetes as unknown as EntradaExterna[];
const crudos2 = repos2.paquetes as unknown as EntradaExterna[];

const EXCLUIDA_1: string[] = [repos1.excluida?.repo ?? ""].filter((v): v is string => v !== "");
const EXCLUIDAS_2: string[] = (repos2.excluidas ?? []).map((e) => e.repo);

export const REPOS_EXCLUIDOS: string[] = [...EXCLUIDA_1, ...EXCLUIDAS_2];

function mapaPatronTag(patron_tag: string | undefined): string {
  return patron_tag ?? "";
}

/** Ficha del cargador (las dos tandas, más cruda que LibraryPackage). */
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

function transformaPaquete(p: EntradaExterna): ReposExternosPaquete {
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

const reposExcluidosSet = new Set(REPOS_EXCLUIDOS);

export const PAQUETES_EXTERNOS: ReposExternosPaquete[] = [
  ...crudos1.filter((p: EntradaExterna) => !reposExcluidosSet.has(p.repo)).map(transformaPaquete),
  ...crudos2.filter((p: EntradaExterna) => !reposExcluidosSet.has(p.repo)).map(transformaPaquete),
];

/* ══════════ REPO BUILTIN «starseed-biblioteca-externa» (1.ª tanda) ══════════ */
/**
 * Las 14 publicaciones de `config/repos-libreria-1020.json` como paquetes de
 * la Biblioteca (shape LibraryPackage). TODAS son comingSoon: instalar solo
 * guardaría la ficha y abriría el repo externo; el motor de releases de
 * available-updates.ts autobusca la versión nueva de cada una vía
 * payload.externalUrl. Nada se descarga ni se lanza desde el navegador.
 * Licencia de cada una se muestra tal cual la verificó el catálogo (2026-10-20).
 */

/** Icono lucide por kind: app/ai-source/function; cae a AppWindow si cambia. */
function iconoPorKind(kind: string): string {
  if (kind === "ai-source") return "BrainCircuit";
  if (kind === "function") return "Boxes";
  return "AppWindow";
}

/** Mapea una entrada cruda de la 1.ª tanda a LibraryPackage (ficha de tienda). */
function paqueteExterno(e: EntradaExterna): LibraryPackage {
  const kind = e.kind as PackageKind | undefined ?? "app";
  const author = (e.repo ?? "").split("/")[0] || "desconocido";
  return {
    id: e.id,
    kind,
    name: e.nombre ?? e.id,
    description: `${e.que_es ?? e.nota ?? "Fuente externa"}${e.aviso ? ` — ${e.aviso}` : ""}`,
    icon: iconoPorKind(kind),
    tags: [...(e.area ?? []), e.canal ?? "", e.licencia ? "lic" : ""].filter(
      (t): t is string => Boolean(t),
    ),
    version: "1.0.0",
    author,
    sourceRepoId: "starseed-biblioteca-externa",
    free: true,
    comingSoon: true,
    payload: {
      externalUrl: `https://github.com/${e.repo}`,
      githubRepo: e.repo,
      canal: e.canal,
      area: e.area,
      licencia: e.licencia,
      assets: e.assets ?? false,
      ...(e.skillId ? { skillId: e.skillId } : {}),
    },
  };
}

const prohibidaFuera = (e: EntradaExterna): boolean =>
  !reposExcluidosSet.has(e.repo) &&
  !e.repo.includes("reverse-skill") &&
  !e.id.includes("reverse-skill");

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: crudos1.filter(prohibidaFuera).map(paqueteExterno),
};
