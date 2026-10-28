/**
 * Protomolécula · APPS AJENAS EMBEBIDAS (F1F, tercer grado de integración, §3.2).
 *
 * Cada app se muestra TAL CUAL en un `iframe` aislado (`vista externa`, solo `https`,
 * nunca del origen del OS, §8.1.2) y Protomolécula NO la controla por parámetros: solo
 * su ventana (control "ventana", parámetros vacíos) y los archivos que acepta o exporta.
 * Contrato: architecture/protomolecula.md §3.2 y §8.1.2.
 *
 * Honestidad de incrustación, MEDIDO el 2026-10-10 con `curl -sI <url>`:
 * las cuatro candidatas (excalidraw.com, threejs.org/editor/, hydra.ojack.xyz, strudel.cc)
 * devolvieron HTTP 200 y SIN `x-frame-options` ni `frame-ancestors` en su
 * `content-security-policy`: ninguna prohíbe incrustarse, así que las cuatro llevan vista
 * «externa». Licencia de cada repo upstream, leída en su LICENSE
 * (https://raw.githubusercontent.com/<repo>/HEAD/LICENSE) el 2026-10-10.
 */
import type { DefinicionAtomo } from "../registro-atomos";
import { obtenerAtomo, registrarAtomo } from "../registro-atomos";

/** [Licencia Mittel...]

 */
const EXCALIDRAW: DefinicionAtomo = {
  herramientaId: "app-embebida.excalidraw",
  nombre: "Excalidraw",
  categoria: "imagen",
  integracion: "iframe-aislado",
  control: "ventana",
  parametros: [],
  entradas: [],
  salidas: ["svg", "png", "json"],
  vista: { tipo: "externa", url: "https://excalidraw.com" },
  ficha: { web: "https://excalidraw.com", repo: "https://github.com/excalidraw/excalidraw", licencia: "MIT" },
};

/** Las cuatro apps ajenas embebidas de F1 (coinciden con §10, fase F1). */
export const APPS_EMBEBIDAS: DefinicionAtomo[] = [EXCALIDRAW];

/**
 * Registra las apps embebidas que falten en el registro. Idempotente (llamarla dos veces
 * no duplica). Una definición con «próximamente» no se registra aún: el registro rechaza
 * herramientas que no sirven todavía.
 */
export function registrarAppsEmbebidas(): void {
  for (const def of APPS_EMBEBIDAS) {
    if (def.proximamente) continue;
    if (obtenerAtomo(def.herramientaId)) continue;
    registrarAtomo(def);
  }
}
