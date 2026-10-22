// src/lib/library/repos-externos-1020.ts
"use client";

import catalog from "../../../config/repos-libreria-1020.json" assert { type: "json" };
import { LibraryPackage, LibraryRepo } from "./packages";

/**
 * Mapea una entrada del catálogo a un LibraryPackage.
 */
function mapEntryToPackage(entry: any): LibraryPackage {
  const [owner, repo] = entry.repo.split("/");
  const description = entry.aviso
    ? `${entry.que_es} — ${entry.aviso}`
    : entry.que_es;
  let icon: string;
  switch (entry.kind) {
    case "app":
      icon = "AppWindow";
      break;
    case "ai-source":
      icon = "BrainCircuit";
      break;
    case "function":
      icon = "Boxes";
      break;
    default:
      icon = "Package";
  }
  const tags = [
    ...entry.area,
    entry.canal,
    entry.licencia ? "lic" : undefined,
  ].filter(Boolean) as string[];
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.nombre,
    description,
    icon,
    tags,
    version: "1.0.0",
    author: owner,
    sourceRepoId: "starseed-biblioteca-externa",
    free: true,
    comingSoon: true,
    payload: {
      externalUrl: `https://github.com/${entry.repo}`,
      githubRepo: entry.repo,
      canal: entry.canal,
      area: entry.area,
      licencia: entry.licencia,
      assets: entry.assets ?? false,
      ...(entry.skillId ? { skillId: entry.skillId } : {}),
    },
  };
}

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: (catalog.paquetes as any[]).map(mapEntryToPackage),
};