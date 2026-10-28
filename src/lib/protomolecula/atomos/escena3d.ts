/**
 * Protomolécula · Átomo «Escena 3D (three.js)» (PM1010F1E). Integración `libreria-js`: three ya
 * vive en el bundle y el envoltorio es NUESTRO, así que la vista va en la página (cargada de
 * forma perezosa), no en un iframe. Contrato: architecture/protomolecula.md §3.2, §11.1.
 *
 * Acepta la MISMA descripción de objeto que `peticion/objeto3d.ts` (forma, color y animación)
 * para que lo pedido desde la ventana pueda vivir como átomo; aquí no se inventa vocabulario.
 */
import type { DefinicionAtomo, Parametro } from "@/lib/protomolecula/registro-atomos";
import type { EstadoValores } from "@/lib/protomolecula/tipos";
import { acotar, claveDe, valorActual, valorPorDefecto } from "@/lib/protomolecula/parametros";

/** Formas que la escena sabe dibujar (las de la descripción de objeto 3D). */
export const FORMAS_ESCENA3D = ["cubo", "esfera", "toroide"] as const;
export type FormaEscena3d = (typeof FORMAS_ESCENA3D)[number];

export const ESCENA3D: DefinicionAtomo = {
  herramientaId: "escena-3d-three",
  nombre: "Escena 3D (three.js)",
  categoria: "3d",
  integracion: "libreria-js",
  control: "total",
  parametros: [
    { id: "forma", nombre: "Forma", tipo: "opcion", opciones: [...FORMAS_ESCENA3D], defecto: "cubo", sinonimos: ["figura", "objeto", "geometria"] },
    { id: "escala", nombre: "Escala", tipo: "numero", min: 0.1, max: 5, paso: 0.1, unidad: "x", defecto: 1, sinonimos: ["tamano", "tamaño"] },
    { id: "rotacion-auto", nombre: "Rotación automática", tipo: "numero", min: 0, max: 2, paso: 0.05, unidad: "x", defecto: 0.4, sinonimos: ["giro automatico", "rotacion"] },
    { id: "camara-fov", nombre: "Campo de visión", tipo: "numero", min: 20, max: 120, paso: 1, unidad: "grados", defecto: 50, sinonimos: ["fov", "angular"] },
    { id: "camara-distancia", nombre: "Distancia de cámara", tipo: "numero", min: 1, max: 20, paso: 0.1, unidad: "m", defecto: 5, sinonimos: ["alejar", "acercar", "zoom"] },
    { id: "luz-intensidad", nombre: "Intensidad de luz", tipo: "numero", min: 0, max: 3, paso: 0.05, unidad: "x", defecto: 1, sinonimos: ["luz", "brillo"] },
    { id: "luz-angulo", nombre: "Ángulo de luz", tipo: "numero", min: 0, max: 360, paso: 1, unidad: "grados", defecto: 45, sinonimos: ["direccion de luz", "angulo"] },
    { id: "malla", nombre: "Malla de alambre", tipo: "booleano", defecto: false, sinonimos: ["alambre", "wireframe"] },
    { id: "color-tono", nombre: "Tono del color", tipo: "numero", min: 0, max: 360, paso: 1, unidad: "grados", defecto: 220, sinonimos: ["color", "tono"] },
  ],
  entradas: ["glb", "png"],
  salidas: ["glb"],
  vista: { tipo: "componente", id: "escena3d" },
  ficha: { web: "https://threejs.org", repo: "mrdoob/three.js", licencia: "MIT" },
};

/** Los valores ya resueltos que consume el componente. */
export interface ValoresEscena3d {
  forma: FormaEscena3d;
  escala: number;
  rotacion: number;
  fov: number;
  distancia: number;
  luz: number;
  angulo: number;
  malla: boolean;
  tono: number;
}

function parametro(id: string): Parametro {
  const p = ESCENA3D.parametros.find((q) => q.id === id);
  if (!p) throw new Error(`Parámetro desconocido en la escena 3D: ${id}`);
  return p;
}

/** Estado por `atomoId::parametroId` a partir de lo que llega sin prefijo desde el marco. */
function estadoDe(valores: Record<string, unknown> | undefined, atomoId: string): EstadoValores {
  const estado: EstadoValores = {};
  for (const p of ESCENA3D.parametros) {
    const v = valores?.[p.id];
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
      estado[claveDe({ atomoId, parametroId: p.id })] = v;
    }
  }
  return estado;
}

function numero(estado: EstadoValores, atomoId: string, id: string): number {
  const p = parametro(id);
  const v = valorActual(estado, { atomoId, parametroId: id }, p);
  return typeof v === "number" && Number.isFinite(v) ? acotar(p, v).valor : Number(valorPorDefecto(p));
}

/** Resuelve los valores del átomo (defectos y rango incluidos) a lo que pinta la escena. Puro. */
export function leerEscena3d(valores: Record<string, unknown> | undefined, atomoId: string): ValoresEscena3d {
  const estado = estadoDe(valores, atomoId);
  const forma = String(valorActual(estado, { atomoId, parametroId: "forma" }, parametro("forma")));
  return {
    forma: (FORMAS_ESCENA3D as readonly string[]).includes(forma) ? (forma as FormaEscena3d) : "cubo",
    escala: numero(estado, atomoId, "escala"),
    rotacion: numero(estado, atomoId, "rotacion-auto"),
    fov: numero(estado, atomoId, "camara-fov"),
    distancia: numero(estado, atomoId, "camara-distancia"),
    luz: numero(estado, atomoId, "luz-intensidad"),
    angulo: numero(estado, atomoId, "luz-angulo"),
    malla: valorActual(estado, { atomoId, parametroId: "malla" }, parametro("malla")) === true,
    tono: numero(estado, atomoId, "color-tono"),
  };
}

/** Posición de la luz direccional: círculo de 6 m alrededor del objeto, a 4 m de alto. */
export function posicionLuz3d(grados: number): [number, number, number] {
  const rad = (grados * Math.PI) / 180;
  return [Math.cos(rad) * 6, 4, Math.sin(rad) * 6];
}
