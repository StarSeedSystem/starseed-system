/**
 * StarSeed OS — Biblioteca · REPOS EXTERNOS 1020 (14 publicaciones).
 * ---------------------------------------------------------------------------
 * Las 14 publicaciones autoactualizables de la Ola 1020 (contrato
 * `architecture/repos-libreria-1020.md` §2-§5), leídas del catálogo VERIFICADO
 * `config/repos-libreria-1020.json` (licencias comprobadas el 2026-10-20 contra
 * `api.github.com/repos/<r>/license`).
 *
 * Puro: sin red, sin disco, sin `node:*`. Solo el catálogo y un mapeo
 * determinista, sin `any`.
 *
 * HONESTIDAD: hoy NINGUNA de las 14 tiene efecto de instalación real —no hay
 * build que alojar ni servidor que levantar—, así que todas van con
 * `comingSoon: true` y el botón queda deshabilitado. Lo que SÍ es real:
 *  · `payload.externalUrl` + `payload.githubRepo` → `available-updates.ts`
 *    autobusca releases/tags/commits según `payload.canal` (sin motor nuevo).
 *  · `payload.area` → dónde encaja en el OS; `payload.licencia` y el aviso de
 *    la descripción → lo que hay que respetar antes de alojar nada.
 *
 * EXCLUSIÓN PERMANENTE: `zhaoxuya520/reverse-skill` (ingeniería inversa y
 * pentest) no entra aquí: el catálogo lo marca en `excluida` y este módulo solo
 * lee `paquetes`.
 */

import catalogo from "../../../config/repos-libreria-1020.json";
import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";

/** Id del repo builtin donde viven estas 14 publicaciones. */
export const REPO_EXTERNOS_1020_ID = "starseed-biblioteca-externa";

/** Una entrada del catálogo verificado (los datos son reales: no se tocan). */
interface EntradaCatalogo {
  id: string;
  repo: string;
  nombre: string;
  kind: string;
  canal: string;
  area: string[];
  que_es: string;
  licencia?: string;
  aviso?: string;
  skillId?: string;
  assets?: string[];
}

/** Tipo real del paquete + icono Lucide que lo representa en la Biblioteca. */
const TIPOS: Record<string, { kind: PackageKind; icon: string }> = {
  app: { kind: "app", icon: "AppWindow" },
  "ai-source": { kind: "ai-source", icon: "BrainCircuit" },
  function: { kind: "function", icon: "Boxes" },
};

/** Mapea una entrada del catálogo a una publicación de la Biblioteca. */
function mapearEntrada(entrada: EntradaCatalogo): LibraryPackage | null {
  const tipo = TIPOS[entrada.kind];
  // Un tipo que no conocemos no se publica: se calla antes que mentir en la ficha.
  if (!tipo) return null;
  const owner = entrada.repo.split("/")[0] ?? entrada.repo;
  const descripcion = entrada.aviso
    ? `${entrada.que_es} — ${entrada.aviso}`
    : entrada.que_es;
  const etiquetas = [...entrada.area, entrada.canal, entrada.licencia ? "lic" : ""].filter(
    (etiqueta) => etiqueta.length > 0,
  );
  return {
    id: entrada.id,
    kind: tipo.kind,
    name: entrada.nombre,
    description: descripcion,
    icon: tipo.icon,
    tags: etiquetas,
    version: "1.0.0",
    author: owner,
    sourceRepoId: REPO_EXTERNOS_1020_ID,
    free: true,
    // Sin efecto real todavía → el botón queda deshabilitado (honestidad).
    comingSoon: true,
    payload: {
      externalUrl: `https://github.com/${entrada.repo}`,
      githubRepo: entrada.repo,
      canal: entrada.canal,
      area: entrada.area,
      licencia: entrada.licencia,
      assets: entrada.assets ?? false,
      ...(entrada.skillId ? { skillId: entrada.skillId } : {}),
    },
  };
}

/** Las 14 publicaciones del catálogo, en el orden del catálogo. */
export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: REPO_EXTERNOS_1020_ID,
  name: "Biblioteca externa",
  builtin: true,
  packages: (catalogo.paquetes as EntradaCatalogo[])
    .map(mapearEntrada)
    .filter((paquete): paquete is LibraryPackage => paquete !== null),
};
