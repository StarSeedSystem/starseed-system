// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · tanda del 2026-10-20 (14 repos builtin externos)
// ------------------------------------------------------------------------------
// Convierte `config/repos-libreria-1020.json` en fichas LibraryPackage del repo
// builtin «starseed-biblioteca-externa». NINGUNA tiene efecto de instalación
// real todavía: todas van con `comingSoon: true` (botón deshabilitado) para que
// la honestidad radical no traicione lo que muestran. Otra tanda ya activa la
// comprobación de releases vía `available-updates.ts` con `payload.externalUrl`;
// aquí NO se duplica ese motor.
//
// Módulo PURO y sin "use client": el JSON entra por importación estática
// (resolveJsonModule), NADA de `node:fs`. La entrada excluida por seguridad
// (zhaoxuya520/reverse-skill, ingeniería inversa) ni siquiera se mapea: el
// contrato §4 la saca del JSON mapeado y el test lo comprueba.
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";
import datos from "../../../config/repos-libreria-1020.json";

/** Entrada del catálogo verificado (config/repos-libreria-1020.json). */
interface Entrada1020 {
  id: string;
  repo: string;
  nombre: string;
  kind: PackageKind;
  canal: string;
  licencia: string;
  area: string[];
  que_es: string;
  aviso?: string;
  skillId?: string;
  assets?: string[];
}

interface Catalogo1020 {
  paquetes: Entrada1020[];
}

const CATALOGO = datos as unknown as Catalogo1020;

/** Icono lucide por kind (según el contrato §5). */
function iconoPorKind(kind: PackageKind): string {
  if (kind === "ai-source") return "BrainCircuit";
  if (kind === "function") return "Boxes";
  return "AppWindow";
}

/** Mapea una entrada del JSON a una ficha honesta de la Biblioteca. */
function mapearFicha(entrada: Entrada1020): LibraryPackage {
  const externalUrl = `https://github.com/${entrada.repo}`;
  return {
    id: entrada.id,
    kind: entrada.kind,
    name: entrada.nombre,
    description: entrada.aviso
      ? `${entrada.que_es} — ${entrada.aviso}`
      : entrada.que_es,
    icon: iconoPorKind(entrada.kind),
    tags: [...entrada.area, entrada.canal, entrada.licencia ? "lic" : ""].filter(Boolean),
    version: "1.0.0",
    author: entrada.repo.split("/")[0],
    sourceRepoId: "starseed-biblioteca-externa",
    free: true,
    comingSoon: true,
    payload: {
      externalUrl,
      githubRepo: entrada.repo,
      canal: entrada.canal,
      area: entrada.area,
      licencia: entrada.licencia,
      assets: entrada.assets ?? false,
      ...(entrada.skillId ? { skillId: entrada.skillId } : {}),
    },
  };
}

/** Las fichas de la tanda 1020 (sin la excluida zhaoxuya520/reverse-skill). */
export const FICHAS_EXTERNAS_1020: LibraryPackage[] = CATALOGO.paquetes
  .filter((e) => !e.repo.includes("reverse-skill"))
  .map(mapearFicha);

/** El repo builtin externo completo, listo para listRepos(). */
export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-biblioteca-externa",
  name: "Biblioteca externa",
  builtin: true,
  packages: FICHAS_EXTERNAS_1020,
};
