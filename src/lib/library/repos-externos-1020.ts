// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Repo builtin externo 1020 (14 publicaciones)
// ------------------------------------------------------------------------------
// Mapea el catálogo verificado config/repos-libreria-1020.json a LibraryPackage[].
// Cada paquete declara su upstream, canal y área; comingSoon=true (sin efecto
// real de instalación todavía). Honestidad radical: qué hace DE VERDAD.
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage, LibraryRepo } from "./packages";

/* ───────────────────────────── Datos (JSON) ───────────────────────────── */

const catalogo = require("../../../config/repos-libreria-1020.json") as {
  paquetes: Array<{
    id: string;
    repo: string;
    nombre: string;
    kind: "app" | "ai-source" | "function";
    canal: "releases" | "commits" | "tags";
    assets?: string[];
    licencia?: string;
    area: string[];
    externalUrl?: string;
    que_es: string;
    aviso?: string;
    skillId?: string;
  }>;
};

/* ───────────────────────────── Mapeo ───────────────────────────── */

function iconForKind(kind: "app" | "ai-source" | "function"): string {
  switch (kind) {
    case "app":
      return "AppWindow";
    case "ai-source":
      return "BrainCircuit";
    case "function":
      return "Boxes";
  }
}

function authorFromRepo(repo: string): string {
  return repo.split("/")[0];
}

function buildPackages(): LibraryPackage[] {
  return catalogo.paquetes.map((entrada) => {
    const externalUrl = `https://github.com/${entrada.repo}`;
    const description = entrada.aviso
      ? `${entrada.que_es} — ${entrada.aviso}`
      : entrada.que_es;

    const tags = [
      ...entrada.area,
      entrada.canal,
      entrada.licencia ? "lic" : "",
    ].filter(Boolean);

    const payload: Record<string, unknown> = {
      externalUrl,
      githubRepo: entrada.repo,
      canal: entrada.canal,
      area: entrada.area,
      licencia: entrada.licencia,
      assets: entrada.assets ?? false,
    };

    if (entrada.skillId) {
      payload.skillId = entrada.skillId;
    }

    return {
      id: entrada.id,
      kind: entrada.kind,
      name: entrada.nombre,
      description,
      icon: iconForKind(entrada.kind),
      tags,
      version: "1.0.0",
      author: authorFromRepo(entrada.repo),
      sourceRepoId: "starseed-biblioteca-externa",
      free: true,
      comingSoon: true,
      payload,
    };
  });
}

/* ───────────────────────────── Exportación ───────────────────────────── */

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: buildPackages(),
};