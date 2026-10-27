import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";
import catalogo from "../../../config/repos-libreria-1020.json";

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
}

const ICONO_POR_KIND: Record<string, string> = {
  app: "AppWindow",
  "ai-source": "BrainCircuit",
  function: "Boxes",
};

const EXCLUIDOS = ["reverse-skill"];

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

const ENTRADAS = (catalogo.paquetes as EntradaCatalogo[]).filter(
  (e) => !EXCLUIDOS.some((x) => e.id.includes(x) || e.repo.includes(x)),
);

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: ENTRADAS.map(aPaquete),
};
