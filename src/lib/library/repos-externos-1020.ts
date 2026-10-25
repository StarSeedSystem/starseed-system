import repos1020 from "../../../config/repos-libreria-1020.json";

const kindMap: Record<string, string> = {
  app: "AppWindow",
  "ai-source": "BrainCircuit",
  function: "Boxes",
};

export interface RepoExternos1020Package {
  id: string;
  kind: string;
  name: string;
  description: string;
  icon: string;
  tags: string[];
  version: string;
  author: string;
  sourceRepoId: string;
  free: boolean;
  comingSoon: boolean;
  payload: Record<string, unknown>;
}

function mapaIcono(kind: string): string {
  return kindMap[kind] ?? "Globe";
}

function construirTags(entrada: any): string[] {
  return [
    ...(entrada.area ?? []),
    entrada.canal ?? "",
    entrada.licencia ? "lic" : "",
  ].filter(Boolean);
}

function construirAutor(repo: string): string {
  return repo ? repo.split("/")[0] : "unknown";
}

function construirPayload(entrada: any): Record<string, unknown> {
  return {
    externalUrl: `https://github.com/${entrada.repo}`,
    githubRepo: entrada.repo,
    canal: entrada.canal,
    area: entrada.area,
    licencia: entrada.licencia,
    assets: entrada.assets ?? false,
    ...(entrada.skillId ? { skillId: entrada.skillId } : {}),
  };
}

function construirDescripcion(entrada: any): string {
  return entrada.que_es + (entrada.aviso ? " — " + entrada.aviso : "");
}

const paquetes = (repos1020.paquetes ?? []).map((entrada: any): RepoExternos1020Package => ({
  id: entrada.id,
  kind: entrada.kind,
  name: entrada.nombre,
  description: construirDescripcion(entrada),
  icon: mapaIcono(entrada.kind),
  tags: construirTags(entrada),
  version: "1.0.0",
  author: construirAutor(entrada.repo),
  sourceRepoId: "starseed-biblioteca-externa",
  free: true,
  comingSoon: true,
  payload: construirPayload(entrada),
}) as RepoExternos1020Package);

export const REPO_EXTERNOS_1020 = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: paquetes,
};