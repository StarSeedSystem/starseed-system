/**
 * StarSeed OS — Biblioteca · repo builtin externo 1020 (14 publicaciones).
 * ---------------------------------------------------------------------------
 * Mapea el catálogo VERIFICADO `config/repos-libreria-1020.json` (licencias
 * comprobadas el 2026-10-20) a `LibraryPackage[]`. Puro: sin red, sin disco y
 * sin `node:*`; solo el catálogo y un mapeo determinista.
 *
 * HONESTIDAD: ninguna de las 14 tiene todavía efecto real de instalación —no
 * hay build que alojar ni servidor que levantar—, así que van con
 * `comingSoon: true` y el botón queda deshabilitado. Lo que sí es real:
 * `payload.externalUrl` + `payload.githubRepo` dejan que `available-updates.ts`
 * autobusque releases/tags/commits según `payload.canal`, y `payload.area`
 * declara dónde encaja en el OS. No se duplica ese motor.
 *
 * EXCLUSIÓN PERMANENTE: `zhaoxuya520/reverse-skill` no entra aquí; el catálogo
 * solo publica `paquetes`, nunca el bloque `excluida`.
 */

import catalogo from "../../../config/repos-libreria-1020.json";
import type { LibraryPackage, LibraryRepo, PackageKind } from "./packages";

/** Id del repo builtin donde viven estas 14 publicaciones. */
export const REPO_EXTERNOS_1020_ID = "starseed-biblioteca-externa";

/** Una entrada del catálogo verificado (los datos son reales: no se tocan). */
export interface EntradaCatalogo {
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

/** Dueño de un repo `owner/repo`, o `null` si la forma no es válida. */
function duenoDe(repo: string): string | null {
  const partes = repo.split("/");
  if (partes.length !== 2) return null;
  const dueno = partes[0]?.trim() ?? "";
  const nombre = partes[1]?.trim() ?? "";
  return dueno && nombre ? dueno : null;
}

/** Mapea una entrada del catálogo a una publicación de la Biblioteca. */
export function mapearEntradaExterna(entrada: EntradaCatalogo): LibraryPackage | null {
  const tipo = TIPOS[entrada.kind];
  const dueno = duenoDe(entrada.repo);
  // Un tipo o repo que no entendemos no se publica: antes callar que mentir.
  if (!tipo || !dueno) return null;

  const descripcion = entrada.aviso
    ? `${entrada.que_es} — ${entrada.aviso}`
    : entrada.que_es;
  const etiquetas = [
    ...entrada.area,
    entrada.canal,
    entrada.licencia ? "lic" : "",
  ].filter((etiqueta) => etiqueta.length > 0);

  return {
    id: entrada.id,
    kind: tipo.kind,
    name: entrada.nombre,
    description: descripcion,
    icon: tipo.icon,
    tags: etiquetas,
    version: "1.0.0",
    author: dueno,
    sourceRepoId: REPO_EXTERNOS_1020_ID,
    free: true,
    // Sin efecto real todavía → botón deshabilitado (honestidad radical).
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

/** Exclusión permanente por seguridad: nunca se publica, aunque esté en `paquetes`. */
const EXCLUIDOS = new Set([catalogo.excluida?.repo, "zhaoxuya520/reverse-skill"]);

/** Las 14 publicaciones del catálogo, en su orden y sin inventar nada. */
export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: REPO_EXTERNOS_1020_ID,
  name: "Biblioteca externa",
  builtin: true,
  packages: (catalogo.paquetes as EntradaCatalogo[])
    .filter((entrada) => !EXCLUIDOS.has(entrada.repo))
    .map(mapearEntradaExterna)
    .filter((paquete): paquete is LibraryPackage => paquete !== null),
};
