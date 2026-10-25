// Ola 1020 · Repo builtin «starseed-biblioteca-externa»: las 14 repos externas
// del catálogo verificado config/repos-libreria-1020.json, mapeadas a
// LibraryPackage. Módulo puro (sin node::*): el JSON se IMPORTA, no se lee de
// disco, así que sirve igual en el navegador, en vitest y en next build.
//
// Honestidad radical: NINGUNA tiene aún efecto de instalación real
// (comingSoon:true, botón deshabilitado). Con payload.externalUrl de GitHub,
// available-updates.ts ya autobusca releases/tags — NO se duplica ese motor.
// La zhaoxuya520/reverse-skill queda EXCLUIDA por seguridad (bloque «excluida»
// del catálogo): nunca se mapea ni se menciona en el repo resultante.

import repos1020 from "../../../config/repos-libreria-1020.json";
import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";

/** Una entrada del catálogo config/repos-libreria-1020.json (no se cambia). */
interface Entrada1020 {
  id: string;
  repo: string;
  nombre: string;
  kind: string;
  canal: string;
  licencia?: string;
  area: string[];
  que_es: string;
  aviso?: string;
  skillId?: string;
  assets?: string[];
}

const ENTRADAS = repos1020.paquetes as Entrada1020[];

/** Icono lucide por kind (la UI lo resuelve por nombre). */
const ICONO_POR_KIND: Record<string, string> = {
  app: "AppWindow",
  "ai-source": "BrainCircuit",
  function: "Boxes",
};

const KIND_VALIDO: Record<string, PackageKind> = {
  app: "app",
  "ai-source": "ai-source",
  function: "function",
};

function kindDe(entrada: Entrada1020): PackageKind {
  return KIND_VALIDO[entrada.kind] ?? "app";
}

/** Tags = áreas del OS + canal de actualización + «lic» si declara licencia. */
function tagsDe(entrada: Entrada1020): string[] {
  return [...entrada.area, entrada.canal, entrada.licencia ? "lic" : ""].filter(Boolean);
}

function descripcionDe(entrada: Entrada1020): string {
  return entrada.que_es + (entrada.aviso ? " — " + entrada.aviso : "");
}

function payloadDe(entrada: Entrada1020): Record<string, unknown> {
  return {
    externalUrl: "https://github.com/" + entrada.repo,
    githubRepo: entrada.repo,
    canal: entrada.canal,
    area: entrada.area,
    licencia: entrada.licencia,
    assets: entrada.assets ?? false,
    ...(entrada.skillId ? { skillId: entrada.skillId } : {}),
  };
}

function paqueteDe(entrada: Entrada1020): LibraryPackage {
  return {
    id: entrada.id,
    kind: kindDe(entrada),
    name: entrada.nombre ?? entrada.id,
    description: descripcionDe(entrada),
    icon: ICONO_POR_KIND[entrada.kind] ?? "Globe",
    tags: tagsDe(entrada),
    version: "1.0.0",
    author: entrada.repo.split("/")[0] ?? "StarSeed",
    sourceRepoId: "starseed-biblioteca-externa",
    free: true,
    comingSoon: true,
    payload: payloadDe(entrada),
  };
}

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: ENTRADAS.map(paqueteDe),
};
