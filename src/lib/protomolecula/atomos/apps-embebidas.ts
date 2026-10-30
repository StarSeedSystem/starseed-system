/**
 * Protomolécula · APPS AJENAS EMBEBIDAS (F1E, PM1010F1F). Tercer grado de integración (§3.2):
 * la app ajena se muestra TAL CUAL en un iframe aislado y Protomolécula solo controla su ventana
 * (abrir, cerrar, enfocar), no sus parámetros: `control: "ventana"`, sin parámetros ni puente.
 * Una app solo lleva `vista: "externa"` si la medición lo permitió; si un sitio empieza a
 * prohibir el marco, se le retira la vista y queda «próximamente» (la Biblioteca, F2K, la lista).
 *
 * HONESTIDAD · mediciones del enunciado (2026-10-10), re-verificadas el 2026-10-30 con
 * `curl -sI <url>` (cabeceras) y `curl -s <url> | grep http-equiv` (CSP en <meta>), y la licencia
 * con `curl -s https://raw.githubusercontent.com/<repo>/HEAD/LICENSE`:
 * - https://excalidraw.com · HTTP 200, sin `x-frame-options` ni `content-security-policy`:
 *   se incrusta. Repo excalidraw/excalidraw, LICENSE: MIT («Copyright (c) 2020 Excalidraw»).
 * - https://threejs.org/editor/ · HTTP 200, sin cabeceras de marco: se incrusta.
 *   Repo mrdoob/three.js, LICENSE: MIT («Copyright © 2010-2026 three.js authors»).
 * - https://hydra.ojack.xyz · HTTP 200, sin cabeceras de marco: se incrusta.
 *   Repo hydra-synth/hydra, LICENSE: AGPL-3.0 (FSF, 19 de noviembre de 2007).
 * - https://strudel.cc · HTTP 200, sin cabeceras de marco: se incrusta.
 *   Repo tidalcycles/strudel, LICENSE: AGPL-3.0 (FSF, 19 de noviembre de 2007).
 *
 * Contrato: architecture/protomolecula.md §3.2 y §11.1.
 */
import { esUrlEmbebible } from "../puente-herramientas";
import { obtenerAtomo, registrarAtomo, type DefinicionAtomo } from "../registro-atomos";

/** Origen del OS: una `vista` externa nunca apunta aquí (lo vigila también `esUrlEmbebible`). */
const ORIGEN_OS = "https://starseed-os.vercel.app";

function embebida(
  herramientaId: string,
  nombre: string,
  categoria: DefinicionAtomo["categoria"],
  url: string,
  web: string,
  repo: string,
  licencia: string
): DefinicionAtomo {
  return {
    herramientaId,
    nombre,
    categoria,
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: [],
    salidas: [],
    vista: { tipo: "externa", url },
    ficha: { web, repo, licencia },
  };
}

export const APPS_EMBEBIDAS: DefinicionAtomo[] = [
  embebida("excalidraw", "Excalidraw", "imagen", "https://excalidraw.com", "https://excalidraw.com", "https://github.com/excalidraw/excalidraw", "MIT"),
  embebida("threejs-editor", "Editor de three.js", "3d", "https://threejs.org/editor/", "https://threejs.org/editor/", "https://github.com/mrdoob/three.js", "MIT"),
  embebida("hydra", "Hydra", "video", "https://hydra.ojack.xyz", "https://hydra.ojack.xyz", "https://github.com/hydra-synth/hydra", "AGPL-3.0"),
  embebida("strudel", "Strudel", "audio", "https://strudel.cc", "https://strudel.cc", "https://github.com/tidalcycles/strudel", "AGPL-3.0"),
];

/**
 * Registra las apps cuyo incrustado real está en pie (idempotente). Sin efecto real no se
 * pinta: una app con `proximamente` o cuya URL dejó de pasar `esUrlEmbebible` no entra en el
 * registro; su ficha la enseñará la Biblioteca (F2K).
 */
export function registrarAppsEmbebidas(): void {
  for (const def of APPS_EMBEBIDAS) {
    if (def.proximamente) continue;
    if (obtenerAtomo(def.herramientaId)) continue;
    if (def.vista?.tipo === "externa" && !esUrlEmbebible(def.vista.url, ORIGEN_OS).ok) continue;
    registrarAtomo(def);
  }
}
