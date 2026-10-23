// src/lib/library/repos-externos-1020.ts
// Repo builtin «Biblioteca externa» de la Ola 1020: las 14 publicaciones del
// visionario que viven en repos de GitHub. Módulo PURO: sanea el JSON verificado
// `config/repos-libreria-1020.json` a LibraryPackage[].
// Honestidad radical: ninguna tiene efecto real de instalación (`comingSoon`).
// `zhaoxuya520/reverse-skill` queda EXCLUIDA por seguridad.

import type { LibraryPackage, LibraryRepo } from "./packages";
import crudoCatalogo from "../../../config/repos-libreria-1020.json";

const REPO_ID = "starseed-biblioteca-externa";

type Kind1020 = "app" | "ai-source" | "function";
type Canal1020 = "releases" | "commits" | "tags";

const KINDS_1020: readonly Kind1020[] = ["app", "ai-source", "function"];
const CANALES_1020: readonly Canal1020[] = ["releases", "commits", "tags"];

const ICONOS_1020: Record<Kind1020, string> = {
  app: "AppWindow",
  "ai-source": "BrainCircuit",
  function: "Boxes",
};

interface Entrada1020 {
  id: string;
  repo: string;
  nombre: string;
  kind: Kind1020;
  canal: Canal1020;
  licencia: string;
  area: string[];
  aviso: string;
  queEs: string;
  skillId: string;
  assets: string[];
  externalUrl: string;
}

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

function unaDe<T extends string>(lista: readonly T[], valor: unknown): T | null {
  return typeof valor === "string" && (lista as readonly string[]).includes(valor)
    ? (valor as T)
    : null;
}

function cadenas(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.map(texto).filter(Boolean) : [];
}

function leerEntrada(valor: unknown): Entrada1020 | null {
  if (typeof valor !== "object" || valor === null) return null;
  const f = valor as Record<string, unknown>;
  const id = texto(f.id);
  const repo = texto(f.repo);
  const nombre = texto(f.nombre);
  const kind = unaDe(KINDS_1020, f.kind);
  const canal = unaDe(CANALES_1020, f.canal);
  if (!id || !nombre || !repo || !kind || !canal) return null;
  if (!/^[^/]+\/[^/]+$/.test(repo)) return null;
  if (id.includes("reverse-skill") || repo.includes("reverse-skill")) return null;
  return {
    id,
    repo,
    nombre,
    kind,
    canal,
    licencia: texto(f.licencia),
    area: cadenas(f.area),
    aviso: texto(f.aviso),
    queEs: texto(f.que_es),
    skillId: texto(f.skillId),
    assets: cadenas(f.assets),
    externalUrl: texto(f.externalUrl),
  };
}

function paqueteDe(entrada: Entrada1020): LibraryPackage {
  const descripcion = entrada.aviso
    ? `${entrada.queEs} — ${entrada.aviso}`
    : entrada.queEs;
  const payload: Record<string, unknown> = {
    externalUrl: entrada.externalUrl || `https://github.com/${entrada.repo}`,
    githubRepo: entrada.repo,
    canal: entrada.canal,
    area: [...entrada.area],
    licencia: entrada.licencia,
    assets: entrada.assets.length ? [...entrada.assets] : false,
  };
  if (entrada.skillId) payload.skillId = entrada.skillId;
  return {
    id: entrada.id,
    kind: entrada.kind,
    name: entrada.nombre,
    description: descripcion || entrada.licencia || entrada.nombre,
    icon: ICONOS_1020[entrada.kind],
    tags: [...entrada.area, entrada.canal, entrada.licencia ? "lic" : ""].filter(
      Boolean
    ),
    version: "1.0.0",
    author: entrada.repo.split("/")[0],
    sourceRepoId: REPO_ID,
    free: true,
    comingSoon: true,
    payload,
  };
}

const paquetesCrudos = (crudoCatalogo as { paquetes?: unknown }).paquetes;

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: REPO_ID,
  name: "Biblioteca externa",
  builtin: true,
  packages: (Array.isArray(paquetesCrudos) ? paquetesCrudos : [])
    .map(leerEntrada)
    .filter((entrada): entrada is Entrada1020 => entrada !== null)
    .map(paqueteDe),
};
