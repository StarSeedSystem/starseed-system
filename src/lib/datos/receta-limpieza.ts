/** Recetas de limpieza de OpenRefine como DATOS y su validador puro (INV1025F · parte 1).
 * Sin red, disco ni reloj. R5/R9: reconciliación solo https de lista blanca (Wikidata) y con
 * datos públicos; solo operaciones de lista blanca y expresiones GREL (Jython/Clojure y
 * «column-addition by fetching urls» se rechazan porque ejecutan código o hacen red). */
export type DatosReceta = "publicos" | "privados";
export type OperacionOpenRefine = Record<string, unknown>;
/** Topes duros de una receta aceptada. */
export const MAX_OPERACIONES = 100;
export const MAX_BYTES = 200 * 1024;
/** Operaciones que no ejecutan código ni salen a la red. Nombres exactos de OpenRefine 3.x. */
export const OPERACIONES_PERMITIDAS = [
  "core/text-transform",
  "core/mass-edit",
  "core/column-removal",
  "core/column-rename",
  "core/column-split",
  "core/column-addition",
  "core/blank-down",
  "core/fill-down",
  "core/row-removal",
  "core/multivalued-cell-split",
  "core/multivalued-cell-join",
  "core/column-reorder",
] as const;
/**
 * Reconciliación: no entra en la lista blanca general. Solo se admite si la receta declara
 * `datos: "publicos"` y el servicio es https de Wikidata.
 */
export const OPERACIONES_RECONCILIACION = [
  "core/recon", "core/recon-judge-similar-cells", "core/recon-mark-new-topics",
  "core/recon-clear-one-cell", "core/recon-clear-similar-cells", "core/recon-discard-judgments",
  "core/recon-use-values",
] as const;
/** Dominios de reconciliación permitidos (R9). Cualquier otro host se rechaza. */
export const HOSTS_RECONCILIACION = [
  "wikidata.reconci.link",
  "www.wikidata.org",
  "wikidata.org",
  "query.wikidata.org",
] as const;
export interface RecetaValida {
  valida: true;
  datos: DatosReceta;
  operaciones: OperacionOpenRefine[];
}

export interface RecetaInvalida {
  valida: false;
  errores: string[];
}

export type ResultadoReceta = RecetaValida | RecetaInvalida;

const PERMITIDAS = new Set<string>(OPERACIONES_PERMITIDAS);
const RECON = new Set<string>(OPERACIONES_RECONCILIACION);
const HOSTS = new Set<string>(HOSTS_RECONCILIACION);
const PROHIBIDOS = ["jython:", "clojure:", "python:", "groovy:", "ruby:", "javascript:", "js:", "cel:"];
const CLAVES_SERVICIO = new Set(["service", "reconcileService"]);

export function validarReceta(x: unknown): ResultadoReceta {
  const e = leerEntrada(x);
  if (!e) return { valida: false, errores: ["La receta debe ser {datos, operaciones} o una lista de operaciones."] };
  let json: string;
  try { json = JSON.stringify(x); } catch { return { valida: false, errores: ["La receta no se puede serializar a JSON."] }; }
  const errores: string[] = [];
  if (new TextEncoder().encode(json).length > MAX_BYTES) errores.push(`La receta supera ${MAX_BYTES} bytes.`);
  if (e.operaciones.length > MAX_OPERACIONES) errores.push(`Demasiadas operaciones: ${e.operaciones.length} (máximo ${MAX_OPERACIONES}).`);
  e.operaciones.forEach((op, i) => revisarOperacion(op, i, e.datos, errores));
  return errores.length ? { valida: false, errores } : { valida: true, datos: e.datos, operaciones: e.operaciones };
}

function leerEntrada(x: unknown): { datos: DatosReceta; operaciones: OperacionOpenRefine[] } | null {
  if (Array.isArray(x)) return { datos: "privados", operaciones: x as OperacionOpenRefine[] };
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>, lista = o.operaciones ?? o.operations;
  return Array.isArray(lista)
    ? { datos: o.datos === "publicos" ? "publicos" : "privados", operaciones: lista as OperacionOpenRefine[] }
    : null;
}

function revisarOperacion(op: unknown, i: number, datos: DatosReceta, errores: string[]): void {
  if (!op || typeof op !== "object" || Array.isArray(op)) { errores.push(`Operación ${i + 1}: no es un objeto.`); return; }
  const o = op as Record<string, unknown>, id = o.op;
  if (typeof id !== "string" || !id) { errores.push(`Operación ${i + 1}: falta "op".`); return; }
  if (id === "core/column-addition-by-fetching-urls") { errores.push(`Operación ${i + 1}: ${id} hace red y no se permite.`); return; }
  if (!PERMITIDAS.has(id) && !RECON.has(id)) { errores.push(`Operación ${i + 1}: ${id} no está en la lista blanca.`); return; }
  if (RECON.has(id) && datos !== "publicos") errores.push(`Operación ${i + 1}: ${id} exige datos: "publicos" (R5, R9).`);
  if (id === "core/recon" && typeof o.service !== "string") errores.push(`Operación ${i + 1}: core/recon exige "service" https.`);
  revisarValor(o, `operación ${i + 1}`, errores, 0);
}

function revisarValor(valor: unknown, ruta: string, errores: string[], nivel: number): void {
  if (nivel > 12) { errores.push(`${ruta}: demasiado anidada.`); return; }
  if (typeof valor === "string") {
    if (PROHIBIDOS.some((p) => valor.toLowerCase().startsWith(p))) errores.push(`${ruta}: solo se admite GREL.`);
    return;
  }
  if (Array.isArray(valor)) { valor.forEach((v, i) => revisarValor(v, `${ruta}[${i}]`, errores, nivel + 1)); return; }
  if (!valor || typeof valor !== "object") return;
  for (const [clave, hijo] of Object.entries(valor)) {
    if (clave === "expression") {
      if (typeof hijo !== "string" || !hijo.startsWith("grel:")) errores.push(`${ruta}.expression: solo se admite grel:`);
    } else {
      if (CLAVES_SERVICIO.has(clave) && (typeof hijo !== "string" || !servicioPermitido(hijo))) errores.push(`${ruta}.${clave}: servicio de reconciliación no permitido.`);
      revisarValor(hijo, `${ruta}.${clave}`, errores, nivel + 1);
    }
  }
}

function servicioPermitido(entrada: string): boolean {
  try {
    const url = new URL(entrada);
    return url.protocol === "https:" && !url.username && !url.password && (url.port === "" || url.port === "443") && HOSTS.has(url.hostname.toLowerCase());
  } catch { return false; }
}
/** El propio validador revisa la lista blanca al cargar el módulo, no solo en las pruebas. */
const COHERENCIA = validarReceta({ datos: "publicos", operaciones: [
  ...OPERACIONES_PERMITIDAS.map((op) => ({ op })),
  ...OPERACIONES_RECONCILIACION.map((op) => (op === "core/recon" ? { op, service: `https://${HOSTS_RECONCILIACION[0]}/` } : { op }))] });
if (!COHERENCIA.valida) throw new Error(`Lista blanca de recetas incoherente: ${COHERENCIA.errores.join(" ")}`);
