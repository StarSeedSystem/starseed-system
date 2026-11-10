/**
 * Protomolécula · Átomo «Símbolo del escritorio» (ESC1110B). Abre el archivo de símbolo de un
 * perfil, una página o un grupo como molécula, lo transforma con los controles de la Protomolécula
 * (pose, luz, comportamientos y, en uno propio, el material) y lo devuelve a su dueño.
 *
 * La molécula CITA el símbolo, no lo copia: su capa `escena3d` referencia
 * `{ tipo: "simbolo-escritorio", id: "<ámbito>:<id>" }` y solo guarda los valores de los
 * parámetros. Los recursos pesados (GLB, SVG, imagen) se quedan en el archivo del dueño, así
 * que la molécula cabe de sobra en los 256 KB del almacén. La vuelta pasa SIEMPRE por el
 * validador del archivo: lo que llegue fuera de rango se acota y la marca oficial no se
 * recolorea (su material se ignora). Contrato: architecture/simbolo-escritorio.md §5.
 */
import type { DefinicionAtomo, Parametro } from "@/lib/protomolecula/registro-atomos";
import type { EstadoValores, Molecula } from "@/lib/protomolecula/tipos";
import { acotar, claveDe, valorActual, valorPorDefecto } from "@/lib/protomolecula/parametros";
import {
  RANGOS,
  SIMBOLO_OFICIAL,
  validarArchivoSimbolo,
  type ArchivoSimbolo,
  type ResultadoSimbolo,
} from "@/components/brand/simbolo-archivo";

export const ID_HERRAMIENTA_SIMBOLO = "simbolo-escritorio";
export const TIPO_REFERENCIA_SIMBOLO = "simbolo-escritorio";
export const ID_VISTA_SIMBOLO = "simbolo-escritorio";
/** Prefijo de las moléculas de símbolo: una por destino, estable. */
export const PREFIJO_MOLECULA_SIMBOLO = "simbolo-";

const O = SIMBOLO_OFICIAL;
const num = (id: string, nombre: string, [min, max]: readonly [number, number], paso: number, defecto: number, sinonimos: string[], unidad?: Parametro["unidad"]): Parametro =>
  ({ id, nombre, tipo: "numero", min, max, paso, defecto, sinonimos, ...(unidad ? { unidad } : {}) });
const bool = (id: string, nombre: string, defecto: boolean, sinonimos: string[]): Parametro => ({ id, nombre, tipo: "booleano", defecto, sinonimos });

export const SIMBOLO_ESCRITORIO: DefinicionAtomo = {
  herramientaId: ID_HERRAMIENTA_SIMBOLO,
  nombre: "Símbolo del escritorio",
  categoria: "3d",
  integracion: "libreria-js",
  control: "total",
  parametros: [
    num("guinada", "Giro de reposo", RANGOS.guinada, 1, O.pose.guinada, ["giro", "guiñada", "yaw"], "grados"),
    num("cabeceo", "Inclinación de reposo", RANGOS.cabeceo, 1, O.pose.cabeceo, ["inclinacion", "cabeceo", "pitch"], "grados"),
    num("escala", "Escala", RANGOS.escala, 0.05, O.pose.escala, ["tamano", "tamaño"], "x"),
    num("flotacion", "Flotación", RANGOS.flotacion, 0.05, O.pose.flotacion, ["flotar", "vaiven"]),
    num("luz-clave", "Luz principal", RANGOS.intensidadClave, 0.05, O.luces.clave.intensidad, ["luz", "brillo"], "x"),
    num("luz-relleno", "Luz de relleno", RANGOS.intensidadRelleno, 0.05, O.luces.relleno.intensidad, ["relleno"], "x"),
    num("luz-contra", "Contraluz", RANGOS.intensidadContra, 0.05, O.luces.contra.intensidad, ["contraluz", "borde"], "x"),
    num("entorno", "Luz de entorno", RANGOS.entorno, 0.05, O.luces.entorno, ["ambiente", "entorno"], "x"),
    bool("seguir-cursor", "Seguir el cursor", O.comportamientos.seguirCursor, ["mirar", "seguir"]),
    bool("parpadeo", "Parpadeo al tocar", O.comportamientos.parpadeo, ["parpadear", "guiño"]),
    bool("parpadeo-ocioso", "Parpadeo ocioso", O.comportamientos.parpadeoOcioso, ["parpadeo solo"]),
    bool("rotacion-flor", "Rotación de la flor", O.comportamientos.rotacionFlor, ["girar flor", "rotar flor"]),
    bool("fusion-flor", "Fusión con la flor", O.comportamientos.fusionFlor, ["flor de la vida", "flor"]),
    num("velocidad-flor", "Velocidad de la flor", RANGOS.velocidadFlor, 0.05, O.comportamientos.velocidadFlor, ["velocidad"], "x"),
    num("pausa-flor", "Pausa de la flor", RANGOS.pausaFlor, 0.5, O.comportamientos.pausaFlor, ["pausa", "espera"], "s"),
    num("rugosidad", "Rugosidad (símbolo propio)", RANGOS.rugosidad, 0.05, O.material.rugosidad, ["mate", "rugoso"]),
    num("metalico", "Metálico (símbolo propio)", RANGOS.metalico, 0.05, O.material.metalico, ["metal"]),
  ],
  entradas: ["json", "glb", "svg", "png"],
  salidas: ["json"],
  vista: { tipo: "componente", id: ID_VISTA_SIMBOLO },
  ficha: { licencia: "MIT" },
};

const parametro = (id: string): Parametro => {
  const p = SIMBOLO_ESCRITORIO.parametros.find((q) => q.id === id);
  if (!p) throw new Error(`Parámetro desconocido del símbolo: ${id}`);
  return p;
};

/** Valores del átomo a partir de un archivo. */
export function valoresDeArchivo(a: ArchivoSimbolo, atomoId: string): EstadoValores {
  const v: Record<string, number | boolean> = {
    guinada: a.pose.guinada, cabeceo: a.pose.cabeceo, escala: a.pose.escala, flotacion: a.pose.flotacion,
    "luz-clave": a.luces.clave.intensidad, "luz-relleno": a.luces.relleno.intensidad, "luz-contra": a.luces.contra.intensidad, entorno: a.luces.entorno,
    "seguir-cursor": a.comportamientos.seguirCursor, parpadeo: a.comportamientos.parpadeo, "parpadeo-ocioso": a.comportamientos.parpadeoOcioso,
    "rotacion-flor": a.comportamientos.rotacionFlor, "fusion-flor": a.comportamientos.fusionFlor,
    "velocidad-flor": a.comportamientos.velocidadFlor, "pausa-flor": a.comportamientos.pausaFlor,
    rugosidad: a.material.rugosidad, metalico: a.material.metalico,
  };
  const out: EstadoValores = {};
  for (const [k, val] of Object.entries(v)) out[claveDe({ atomoId, parametroId: k })] = val;
  return out;
}

/** Id estable de la molécula de un destino («perfil:abc» → «simbolo-perfil-abc»). */
export function idMoleculaSimbolo(claveDestino: string): string {
  return PREFIJO_MOLECULA_SIMBOLO + claveDestino.replace(/[^\w-]+/g, "-").slice(0, 80);
}

/** Crea la molécula que abre el archivo en la Protomolécula. Pura. */
export function moleculaDesdeSimbolo(a: ArchivoSimbolo, claveDestino: string, ahora: number, ambito: Molecula["ambito"] = "perfil"): Molecula {
  const id = idMoleculaSimbolo(claveDestino);
  const atomoId = `${id}-atomo`;
  const capaId = `${id}-capa`;
  return {
    id,
    titulo: `Símbolo · ${a.nombre}`.slice(0, 80),
    ambito,
    capas: [{
      id: capaId, tipo: "escena3d", titulo: a.nombre.slice(0, 80) || "Símbolo", formato: "starseed-simbolo+json",
      referencia: { tipo: TIPO_REFERENCIA_SIMBOLO, id: claveDestino, version: String(a.version) },
      orden: 0, visible: true, bloqueada: false,
    }],
    atomos: [{ id: atomoId, herramientaId: ID_HERRAMIENTA_SIMBOLO, capaId, titulo: "Símbolo del escritorio", ejecutaEn: "navegador", estado: "activo" }],
    valores: valoresDeArchivo(a, atomoId),
    version: 1,
    creadaEn: ahora,
    actualizadaEn: ahora,
  };
}

function leerNumero(estado: EstadoValores, atomoId: string, id: string): number {
  const p = parametro(id);
  const v = valorActual(estado, { atomoId, parametroId: id }, p);
  return typeof v === "number" && Number.isFinite(v) ? acotar(p, v).valor : Number(valorPorDefecto(p));
}

function leerBool(estado: EstadoValores, atomoId: string, id: string): boolean {
  const v = valorActual(estado, { atomoId, parametroId: id }, parametro(id));
  return v === true;
}

/**
 * Vuelta: aplica los valores de la molécula sobre el archivo base (que conserva su fuente) y lo
 * pasa por el validador. Una molécula ajena (sin el átomo del símbolo) se rechaza.
 */
export function archivoDesdeMolecula(m: Pick<Molecula, "atomos" | "valores" | "capas">, base: ArchivoSimbolo): ResultadoSimbolo {
  const atomo = m.atomos.find((x) => x.herramientaId === ID_HERRAMIENTA_SIMBOLO);
  const capa = m.capas.find((c) => c.referencia?.tipo === TIPO_REFERENCIA_SIMBOLO);
  if (!atomo || !capa) return { ok: false, motivo: "la molécula no es un símbolo del escritorio", archivo: SIMBOLO_OFICIAL, avisos: [] };
  const e = m.valores;
  const i = atomo.id;
  const n = (id: string) => leerNumero(e, i, id);
  const b = (id: string) => leerBool(e, i, id);
  return validarArchivoSimbolo({
    ...base,
    pose: { guinada: n("guinada"), cabeceo: n("cabeceo"), escala: n("escala"), flotacion: n("flotacion") },
    luces: {
      clave: { ...base.luces.clave, intensidad: n("luz-clave") },
      relleno: { ...base.luces.relleno, intensidad: n("luz-relleno") },
      contra: { ...base.luces.contra, intensidad: n("luz-contra") },
      entorno: n("entorno"),
    },
    material: { ...base.material, rugosidad: n("rugosidad"), metalico: n("metalico") },
    comportamientos: {
      seguirCursor: b("seguir-cursor"), parpadeo: b("parpadeo"), parpadeoOcioso: b("parpadeo-ocioso"),
      rotacionFlor: b("rotacion-flor"), fusionFlor: b("fusion-flor"),
      velocidadFlor: n("velocidad-flor"), pausaFlor: n("pausa-flor"),
    },
  });
}

/** Los valores del átomo como archivo, para la vista dentro de la Protomolécula (sin la base, el oficial). */
export function archivoDeValores(valores: Record<string, unknown> | undefined, atomoId: string, base: ArchivoSimbolo = SIMBOLO_OFICIAL): ArchivoSimbolo {
  const estado: EstadoValores = {};
  for (const p of SIMBOLO_ESCRITORIO.parametros) {
    const v = valores?.[p.id] ?? valores?.[claveDe({ atomoId, parametroId: p.id })];
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") estado[claveDe({ atomoId, parametroId: p.id })] = v;
  }
  const r = archivoDesdeMolecula({
    atomos: [{ id: atomoId, herramientaId: ID_HERRAMIENTA_SIMBOLO, estado: "activo" }],
    capas: [{ id: "c", tipo: "escena3d", titulo: "s", formato: "starseed-simbolo+json", referencia: { tipo: TIPO_REFERENCIA_SIMBOLO, id: "vista" }, orden: 0, visible: true, bloqueada: false }],
    valores: estado,
  }, base);
  return r.archivo;
}
