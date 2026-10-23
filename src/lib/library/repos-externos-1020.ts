import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";
import crudo1 from "../../../config/repos-libreria-1020.json";
import crudo2 from "../../../config/repos-libreria-1020b.json";

const repos1 = crudo1 as unknown as Cat;
const repos2 = crudo2 as unknown as Cat;

interface Entrada {
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
  assets?: unknown;
  skillId?: string;
  que_es?: string;
  aviso?: string;
}
interface Cat {
  excluida?: { repo: string };
  excluidas?: { repo: string }[];
  paquetes?: Entrada[];
}

const EXCLUIDA_1: string[] = [repos1.excluida?.repo ?? ""].filter((v): v is string => v !== "");
const EXCLUIDAS_2: string[] = repos2.excluidas?.map((e) => e.repo) ?? [];

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

function transformaPaquete(p: Entrada): ReposExternosPaquete {
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
  ...paquetes1.filter((p: ReposExternosPaquete) => !reposExcluidosSet.has(p.repo)),
  ...paquetes2.filter((p: ReposExternosPaquete) => !reposExcluidosSet.has(p.repo)),
];

const ICONO_POR_KIND: Record<string, string> = { app: "AppWindow", "ai-source": "BrainCircuit", function: "Boxes" };

function aLibraryPackage(e: Entrada): LibraryPackage {
  const owner = e.repo.split("/")[0];
  return {
    id: e.id,
    kind: (e.kind ?? "app") as PackageKind,
    name: e.nombre ?? e.id,
    description: (e.que_es ?? "") + (e.aviso ? " — " + e.aviso : ""),
    icon: ICONO_POR_KIND[e.kind ?? "app"] ?? "Boxes",
    tags: [...(e.area ?? []), e.canal, e.licencia ? "lic" : ""].filter((t): t is string => Boolean(t)),
    version: "1.0.0",
    author: owner,
    sourceRepoId: "starseed-biblioteca-externa",
    free: true,
    comingSoon: true,
    payload: {
      externalUrl: "https://github.com/" + e.repo,
      githubRepo: e.repo,
      canal: e.canal,
      area: e.area,
      licencia: e.licencia,
      assets: e.assets ?? false,
      ...(e.skillId ? { skillId: e.skillId } : {}),
    },
  };
}

/** Repo builtin con las 14 publicaciones externas verificadas (1.ª tanda). */
export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: (repos1.paquetes ?? []).filter((e) => !reposExcluidosSet.has(e.repo)).map(aLibraryPackage),
};
