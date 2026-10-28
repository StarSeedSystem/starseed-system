// src/lib/variaciones/adaptadores/publicaciones.ts
// Familias «post» y «mensaje» (contrato §5): estilos, plantillas y decoración
// del editor rico y del compositor de publicaciones. PURO: los puertos del
// borrador se inyectan; nunca viajan texto, destinatarios ni datos privados.
import type { EstiloMensaje } from "@/lib/mensajeria/formato-tipos";
import { leerClave } from "../clave-elemento";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";
export type FamiliaEditor = "post" | "mensaje";
export type ParteEditor = "estilo" | "plantilla" | "decoracion";
export type EstiloEditor = EstiloMensaje;
export interface EstiloBloque { tipo: string; bg?: string; color?: string; radius?: string }
export interface PlantillaEditor { formato?: string; layout?: "bloques" | "codigo"; preset?: string; bloques?: string[] }
export interface DecoracionEditor { fondo?: string; animacionFondo?: string; radio?: number; bloques?: EstiloBloque[] }
export type ParcheEditor = { parte: "estilo"; datos: EstiloEditor } | { parte: "plantilla"; datos: PlantillaEditor } | { parte: "decoracion"; datos: DecoracionEditor };
export interface BorradorEditor { estilo?: EstiloEditor; plantilla?: PlantillaEditor; decoracion?: DecoracionEditor }
export interface DepsPublicaciones { leer: (familia: FamiliaEditor) => BorradorEditor; escribir: (familia: FamiliaEditor, borrador: BorradorEditor) => void }
const PARTES: ParteEditor[] = ["estilo", "plantilla", "decoracion"];
const TOKEN = /^[a-z0-9][a-z0-9._-]{0,63}$/i; const COLOR = /^(#[0-9a-f]{6}|[a-z][a-z0-9-]{0,39})$/i;
const FUENTES = new Set(["inter", "outfit", "titular", "roboto", "mono", "serif", "manuscrita", "redonda"]);
const ANIM_TEXTO = new Set(["ninguna", "aparecer", "maquina", "ola", "brillo", "latido", "arcoiris", "neon", "flotar", "temblor"]);
const ANIM_FONDO = new Set(["ninguna", "aurora", "estrellas", "gradiente", "pulso", "particulas"]);
const ALINEACION = new Set(["izquierda", "centro", "derecha"]); const LAYOUTS = new Set(["bloques", "codigo"]);
const BLOQUES = new Set(["parrafo", "titulo", "lista", "tareas", "cita", "codigo", "separador", "texto", "media", "embed", "boton", "columnas2", "columnas3", "tarjeta"]);
type Regla = (v: unknown) => string | null;
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esToken = (v: unknown): string | null => (typeof v === "string" && TOKEN.test(v) ? null : "no es un identificador válido");
const esColor = (v: unknown): string | null => (typeof v === "string" && COLOR.test(v) ? null : "no es un color o un token válido");
const esFondo = (v: unknown): string | null => (typeof v === "string" && (COLOR.test(v) || TOKEN.test(v)) ? null : "no es un fondo válido");
const booleano = (v: unknown): string | null => (typeof v === "boolean" ? null : "debe ser verdadero o falso");
const numero = (min: number, max: number): Regla => (v) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? null : `debe ir de ${min} a ${max}`);
const unoDe = (valores: Set<string>, que: string): Regla => (v) => (typeof v === "string" && valores.has(v) ? null : `${que} no es del editor`);
const listaBloques: Regla = (v) => (Array.isArray(v) && v.length <= 40 && v.every((x) => typeof x === "string" && BLOQUES.has(x)) ? null : "lleva tipos de bloque ajenos al editor");
function validarCampos(d: Record<string, unknown>, reglas: Record<string, Regla>, prefijo: string): string[] {
  const motivos = Object.keys(d).filter((k) => !(k in reglas)).map((k) => `${prefijo}: «${k}» no es un campo de esta variación`);
  for (const [clave, regla] of Object.entries(reglas)) {
    const error = d[clave] === undefined ? null : regla(d[clave]);
    if (error) motivos.push(`${prefijo}: «${clave}» ${error}`);
  }
  return motivos;
}
const REGLAS_ESTILO: Record<string, Regla> = {
  fuente: unoDe(FUENTES, "la fuente"), tamano: numero(11, 64), color: esColor, colorMarco: esColor, grosorMarco: numero(0, 6),
  fondo: esFondo, animacionTexto: unoDe(ANIM_TEXTO, "la animación de texto"), animacionFondo: unoDe(ANIM_FONDO, "la animación de fondo"),
  alineacion: unoDe(ALINEACION, "la alineación"), negrita: booleano, cursiva: booleano,
};
const REGLAS_PLANTILLA: Record<string, Regla> = { formato: esToken, layout: unoDe(LAYOUTS, "la disposición"), preset: esToken, bloques: listaBloques };
const REGLAS_BLOQUE: Record<string, Regla> = { tipo: esToken, bg: esColor, color: esColor, radius: esToken };
const REGLAS_DECORACION: Record<string, Regla> = {
  fondo: esFondo, animacionFondo: unoDe(ANIM_FONDO, "la animación de fondo"), radio: numero(0, 64),
  bloques: (v) => {
    if (!Array.isArray(v) || v.length > 40) return "debe ser una lista de hasta 40 estilos";
    for (const item of v) {
      if (!esObjeto(item)) return "cada bloque debe ser un objeto";
      const motivos = validarCampos(item, REGLAS_BLOQUE, "decoración.bloque");
      if (motivos.length) return motivos[0];
    }
    return null;
  },
};
const reglasDe = (parte: ParteEditor) => (parte === "estilo" ? REGLAS_ESTILO : parte === "plantilla" ? REGLAS_PLANTILLA : REGLAS_DECORACION);
export function parteDeClave(clave: string): { familia: FamiliaEditor; parte: ParteEditor } | null {
  const valida = leerClave(clave);
  if (!valida) return null;
  const [cabecera, parte] = valida.split("#");
  const familia = cabecera.split(":")[0];
  if ((familia !== "post" && familia !== "mensaje") || !PARTES.includes(parte as ParteEditor)) return null;
  return { familia, parte: parte as ParteEditor };
}
export function capturarParte(borrador: BorradorEditor, parte: ParteEditor): ParcheEditor | null {
  if (parte === "estilo") return borrador.estilo ? { parte, datos: borrador.estilo } : null;
  if (parte === "plantilla") return borrador.plantilla ? { parte, datos: borrador.plantilla } : null;
  return borrador.decoracion ? { parte, datos: borrador.decoracion } : null;
}
export function fusionarParte(borrador: BorradorEditor, parche: ParcheEditor): BorradorEditor {
  if (parche.parte === "estilo") return { ...borrador, estilo: parche.datos };
  if (parche.parte === "plantilla") return { ...borrador, plantilla: parche.datos };
  return { ...borrador, decoracion: parche.datos };
}
export function validarParcheEditor(raw: unknown): { ok: true; payload: ParcheEditor } | { ok: false; motivos: string[] } {
  const revision = validarVariacion(raw);
  if (!revision.ok) return { ok: false, motivos: revision.motivos };
  if (!esObjeto(raw)) return { ok: false, motivos: ["La variación debe ser un objeto con su parte"] };
  const parte = raw.parte;
  if (typeof parte !== "string" || !PARTES.includes(parte as ParteEditor)) return { ok: false, motivos: ["La parte debe ser estilo, plantilla o decoración"] };
  if (!esObjeto(raw.datos)) return { ok: false, motivos: ["La variación debe traer «datos»"] };
  const sobran = Object.keys(raw).filter((k) => k !== "parte" && k !== "datos");
  if (sobran.length) return { ok: false, motivos: sobran.map((k) => `Fuera de la variación: «${k}»`) };
  const motivos = validarCampos(raw.datos, reglasDe(parte as ParteEditor), parte);
  if (motivos.length) return { ok: false, motivos };
  if (parte === "estilo") return { ok: true, payload: { parte, datos: raw.datos as EstiloEditor } };
  if (parte === "plantilla") return { ok: true, payload: { parte, datos: raw.datos as PlantillaEditor } };
  return { ok: true, payload: { parte, datos: raw.datos as DecoracionEditor } };
}
export function crearAdaptadorPublicaciones(familia: FamiliaEditor, deps: DepsPublicaciones): AdaptadorFamilia<ParcheEditor> {
  return {
    familia,
    nombre: familia === "post" ? "Publicaciones" : "Mensajes",
    capturar: (clave) => {
      const destino = parteDeClave(clave);
      return destino && destino.familia === familia ? capturarParte(deps.leer(familia), destino.parte) : null;
    },
    validar: validarParcheEditor,
    aplicar: (clave, payload) => {
      const destino = parteDeClave(clave);
      const revision = validarParcheEditor(payload);
      if (!destino || destino.familia !== familia || !revision.ok || revision.payload.parte !== destino.parte) {
        return { deshacer: () => undefined };
      }
      const anterior = deps.leer(familia);
      deps.escribir(familia, fusionarParte(anterior, revision.payload));
      return { deshacer: () => deps.escribir(familia, anterior) };
    },
  };
}
export function registrarAdaptadoresPublicaciones(deps: DepsPublicaciones): void {
  registrarFamilia(crearAdaptadorPublicaciones("post", deps));
  registrarFamilia(crearAdaptadorPublicaciones("mensaje", deps));
}
