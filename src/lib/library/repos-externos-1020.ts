import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";
import catalogo from "../../../config/repos-libreria-1020.json";
import catalogoB from "../../../config/repos-libreria-1020b.json";

interface EntradaCatalogo {
  id: string;
  repo: string;
  nombre: string;
  kind: string;
  canal: string;
  licencia?: string;
  area: string[];
  que_es: string;
  aviso?: string;
  assets?: unknown;
  skillId?: string;
  efecto?: string;
  preinstalar?: string;
  claude?: string | boolean;
  patron_tag?: string;
}

const catalogoBtipado = catalogoB as {
  paquetes?: EntradaCatalogo[];
  excluidas?: { repo: string }[];
};

const ICONO_POR_KIND: Record<string, string> = {
  app: "AppWindow",
  "ai-source": "BrainCircuit",
  function: "Boxes",
};

const VETADOS = ["reverse-skill"];

export const REPOS_EXCLUIDOS: string[] = [
  catalogo.excluida?.repo,
  ...(catalogoBtipado.excluidas ?? []).map((e) => e.repo),
].filter((v): v is string => Boolean(v));

function excluida(e: EntradaCatalogo): boolean {
  return (
    REPOS_EXCLUIDOS.includes(e.repo) ||
    VETADOS.some((x) => e.id.includes(x) || e.repo.includes(x))
  );
}

function aPaquete(e: EntradaCatalogo): LibraryPackage {
  return {
    id: e.id,
    kind: e.kind as PackageKind,
    name: e.nombre,
    description: e.que_es + (e.aviso ? ` — ${e.aviso}` : ""),
    icon: ICONO_POR_KIND[e.kind] ?? "Package",
    tags: [...e.area, e.canal, e.licencia ? "lic" : ""].filter(Boolean),
    version: "1.0.0",
    author: e.repo.split("/")[0],
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

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: (catalogo.paquetes as EntradaCatalogo[]).filter((e) => !excluida(e)).map(aPaquete),
};

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

function aLoader(e: EntradaCatalogo): ReposExternosPaquete {
  const efecto = e.efecto ?? "";
  const comingSoon = ["CONECTOR", "HERRAMIENTA-AGENTE", "CATALOGO"].includes(efecto);
  return {
    id: e.id,
    repo: e.repo,
    nombre: e.nombre ?? e.id,
    kind: e.kind ?? "app",
    canal: e.canal ?? "releases",
    patronTag: e.patron_tag ?? "",
    licencia: e.licencia ?? "",
    area: e.area ?? [],
    efecto,
    preinstalar: e.preinstalar ?? "",
    claude: e.claude ?? false,
    githubRepo: e.repo,
    externalUrl: `https://github.com/${e.repo}`,
    comingSoon,
    motivoComingSoon: comingSoon ? `efecto ${efecto}: instalación externa, sin ruta propia del OS` : "",
  };
}

const ENTRADAS: EntradaCatalogo[] = [...(catalogo.paquetes as EntradaCatalogo[]), ...(catalogoBtipado.paquetes ?? [])];

export const PAQUETES_EXTERNOS: ReposExternosPaquete[] = ENTRADAS.filter((e) => !excluida(e)).map(aLoader);
