// repos-externos-1020 — repo builtin «Biblioteca externa» (Ola 1020).
// Las 14 publicaciones del visionario que viven en repos de GitHub propios:
// se sanear desde `config/repos-libreria-1020.json` a LibraryPackage[] con
// honestidad radical — cada ficha declara su upstream (externalUrl/githubRepo),
// su canal de novedades (releases/commits/tags), su área del OS y su licencia.
// Instalar es HONESTO: aún sin efecto real dentro del OS (comingSoon), así que
// la Botonera queda deshabilitada y el enlace abre el repo en pestaña nueva.
// `reverse-skill` queda EXCLUIDA por seguridad (ver bloque `excluida` del JSON).
//
// Puro: sin React, sin red, sin `node:*`. Nunca lanza; lo inválido se descarta.

import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";
import crudoCatalogo1020 from "../../../config/repos-libreria-1020.json";

const REPO_ID = "starseed-biblioteca-externa";
const KINDS_1020: readonly PackageKind[] = ["app", "ai-source", "function"];
const CANALES_1020: readonly string[] = ["releases", "commits", "tags"];

const texto = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const de = <T extends string>(lista: readonly T[], x: unknown): T | undefined =>
  (lista.includes(x as T) ? (x as T) : undefined);
const cadenas = (x: unknown): string[] =>
  (Array.isArray(x) ? x.map(texto).filter(Boolean) : []);

interface EntradaValida {
  id: string;
  repo: string;
  nombre: string;
  kind: PackageKind;
  canal: string;
  licencia: string;
  area: string[];
  externalUrl: string;
  skillId: string;
  aviso: string;
  queEs: string;
  assets: string[];
}

function sanearEntrada(e: unknown): EntradaValida | null {
  const f = typeof e === "object" && e !== null ? (e as Record<string, unknown>) : {};
  const id = texto(f.id);
  const repo = texto(f.repo);
  const nombre = texto(f.nombre);
  const kind = de(KINDS_1020, f.kind);
  const canal = de(CANALES_1020, f.canal);
  if (!id || !nombre || !kind || !canal) return null;
  if (!/^[^/]+\/[^/]+$/.test(repo)) return null;
  return {
    id,
    repo,
    nombre,
    kind,
    canal,
    licencia: texto(f.licencia),
    area: cadenas(f.area),
    externalUrl: texto(f.externalUrl) || `https://github.com/${repo}`,
    skillId: texto(f.skillId),
    aviso: texto(f.aviso),
    queEs: texto(f.que_es),
    assets: cadenas(f.assets),
  };
}

function paqueteDe(e: EntradaValida): LibraryPackage {
  // El aviso (licencias NC, proyecto joven…) viaja en la descripción: nunca oculto.
  const descripcion = e.aviso ? `${e.queEs} ${e.aviso}` : e.queEs;
  return {
    id: e.id,
    kind: e.kind,
    name: e.nombre,
    description: descripcion || e.licencia || e.nombre,
    icon: "Package",
    tags: [...e.area, "externo", e.canal],
    version: "1.0.0",
    author: e.repo.split("/")[0],
    sourceRepoId: REPO_ID,
    free: true,
    comingSoon: true,
    payload: {
      externalUrl: e.externalUrl,
      githubRepo: e.repo,
      canal: e.canal,
      area: [...e.area],
      licencia: e.licencia,
      assets: [...e.assets],
      skillId: e.skillId,
      nota: e.aviso,
    },
  };
}

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: REPO_ID,
  name: "Biblioteca externa",
  builtin: true,
  packages: (Array.isArray(crudoCatalogo1020.paquetes) ? crudoCatalogo1020.paquetes : [])
    .map(sanearEntrada)
    .filter((e): e is EntradaValida => e !== null)
    .map(paqueteDe),
};
