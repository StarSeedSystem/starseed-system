// Adaptador de la Protomolécula para «Variaciones públicas» (contrato §5).
// Familias herramienta:, atomo: y molecula:. Viaja SOLO la configuración del
// elemento (parámetros y la molécula guardada), nunca el contenido privado del
// lienzo. Módulo PURO: el almacén, el reloj y los ids se inyectan.
import type { AdaptadorFamilia } from "../familias";
import { registrarFamilia } from "../familias";
import { validarVariacion } from "../validar";
import { CATALOGO_PROTOMOLECULA } from "@/lib/protomolecula/catalogo-herramientas";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import {
  borrarMolecula, cargarMolecula, esMoleculaGuardable, esObjetoPlano, guardarMolecula,
  type AlmacenLocal, type MoleculaGuardada,
} from "@/lib/protomolecula/almacen-moleculas";
import type { Molecula, ValorParametro } from "@/lib/protomolecula/tipos";
type Valores = Record<string, ValorParametro>;
/** Configuración publicada: parámetros de una herramienta o un átomo, o una molécula guardada. */
export type PayloadProtomolecula =
  | { tipo: "herramienta"; herramientaId: string; titulo?: string; valores?: Valores }
  | { tipo: "atomo"; atomoId: string; titulo?: string; valores?: Valores }
  | { tipo: "molecula"; molecula: MoleculaGuardada };
export interface DepsProtomolecula {
  almacen: AlmacenLocal;
  ahora: () => number;
  nuevoId: () => string;
  capturarValores?: (clave: string) => Valores | null;
}
export type ResultadoPayload = { ok: true; payload: PayloadProtomolecula } | { ok: false; motivos: string[] };
const IDS_CATALOGO = new Set(CATALOGO_PROTOMOLECULA.map((h) => h.id));
const CONTENIDO_PRIVADO = new Set(["contenido", "contenidoPrivado", "datosPrivados", "blob", "archivo", "archivos", "bytes", "buffer"]);
const NOMBRES_PROTO = { herramienta: "Herramienta de la Protomolécula", atomo: "Átomo de la Protomolécula", molecula: "Molécula de la Protomolécula" };
/** Motivos por los que el payload lleva contenido privado del lienzo, a cualquier profundidad. */
export function motivosDeContenidoPrivado(valor: unknown, ruta = "payload"): string[] {
  if (valor === null || typeof valor !== "object") return [];
  if (Array.isArray(valor)) return valor.flatMap((hijo, i) => motivosDeContenidoPrivado(hijo, `${ruta}[${i}]`));
  return Object.entries(valor as Record<string, unknown>).flatMap(([clave, hijo]) => [
    ...(CONTENIDO_PRIVADO.has(clave) ? [`Privacidad: «${ruta}.${clave}» es contenido del lienzo, no configuración`] : []),
    ...motivosDeContenidoPrivado(hijo, `${ruta}.${clave}`),
  ]);
}
/** Valida un payload: ids del catálogo y del registro, sin contenido privado ni secretos. */
export function validarPayloadProtomolecula(payload: unknown): ResultadoPayload {
  const base = validarVariacion(payload);
  const motivos: string[] = base.ok ? [] : [...base.motivos];
  if (!esObjetoPlano(payload)) return { ok: false, motivos: [...motivos, "El payload debe ser un objeto JSON plano"] };
  const p = payload as Record<string, unknown>;
  motivos.push(...motivosDeContenidoPrivado(payload));
  if (p.tipo === "herramienta") {
    if (typeof p.herramientaId !== "string" || !IDS_CATALOGO.has(p.herramientaId)) motivos.push("La herramienta no está en el catálogo");
  } else if (p.tipo === "atomo") {
    if (typeof p.atomoId !== "string" || obtenerAtomo(p.atomoId) === undefined) motivos.push("El átomo no está en el registro");
  } else if (p.tipo === "molecula") {
    if (!esMoleculaGuardable(p.molecula)) motivos.push("La molécula no es válida para el almacén del lienzo");
    else for (const a of p.molecula.atomos) {
      const h = (a as { herramientaId?: unknown }).herramientaId;
      if (typeof h === "string" && !IDS_CATALOGO.has(h)) motivos.push(`Átomo con herramienta desconocida: ${h}`);
    }
  } else {
    motivos.push("Tipo de variación desconocido (herramienta, atomo o molecula)");
  }
  return motivos.length === 0 ? { ok: true, payload: payload as unknown as PayloadProtomolecula } : { ok: false, motivos };
}
/** Copia nueva de una molécula con un átomo de la herramienta dada, lista para el lienzo. */
function moleculaConAtomo(deps: DepsProtomolecula, titulo: string, herramientaId: string, valores: Valores): Molecula {
  const atomoId = deps.nuevoId();
  const t = deps.ahora();
  const reindexados: Valores = {};
  for (const [parametro, valor] of Object.entries(valores)) reindexados[`${atomoId}::${parametro}`] = valor;
  return {
    id: deps.nuevoId(), titulo, ambito: "personal", capas: [],
    atomos: [{ id: atomoId, herramientaId, titulo, estado: "activo" }],
    valores: reindexados, version: 1, creadaEn: t, actualizadaEn: t,
  };
}

function conDeshacer(deps: DepsProtomolecula, m: MoleculaGuardada): { deshacer: () => void } {
  const guardada = guardarMolecula(deps.almacen, m);
  return { deshacer: () => { if (guardada) borrarMolecula(deps.almacen, m.id); } };
}

function idDeClave(clave: string, familia: string): string | null {
  const [f, resto] = clave.split(":", 2);
  return f === familia && resto ? resto.split("#", 1)[0] : null;
}

/** Adaptadores de las tres familias; el anfitrión los registra con `registrarAdaptadoresProtomolecula`. */
export function crearAdaptadorProtomolecula(deps: DepsProtomolecula): AdaptadorFamilia<PayloadProtomolecula>[] {
  const validar = (payload: unknown) => validarPayloadProtomolecula(payload);
  const val = (clave: string): Valores => deps.capturarValores?.(clave) ?? {};
  const sinEfecto = { deshacer: () => {} };
  const nueva = (titulo: string, herramientaId: string, v: Valores) => conDeshacer(deps, moleculaConAtomo(deps, titulo, herramientaId, v));
  const copiaMolecula = (m: MoleculaGuardada) => {
    const t = deps.ahora();
    return conDeshacer(deps, { ...m, id: deps.nuevoId(), version: 1, creadaEn: t, actualizadaEn: t });
  };
  const capturar = (clave: string, familia: string): PayloadProtomolecula | null => {
    const id = idDeClave(clave, familia);
    if (id === null) return null;
    if (familia === "molecula") { const m = cargarMolecula(deps.almacen, id); return m === null ? null : { tipo: "molecula", molecula: m }; }
    if (familia === "atomo") return { tipo: "atomo", atomoId: id, valores: val(clave) };
    return { tipo: "herramienta", herramientaId: id, valores: val(clave) };
  };
  const aplicar = (familia: string, payload: PayloadProtomolecula): { deshacer: () => void } => {
    if (familia === "molecula") return payload.tipo !== "molecula" ? sinEfecto : copiaMolecula(payload.molecula);
    if (payload.tipo !== familia) return sinEfecto;
    if (payload.tipo === "herramienta") return nueva(payload.titulo ?? payload.herramientaId, payload.herramientaId, payload.valores ?? {});
    return nueva(payload.titulo ?? payload.atomoId, obtenerAtomo(payload.atomoId)?.herramientaId ?? payload.atomoId, payload.valores ?? {});
  };
  return (["herramienta", "atomo", "molecula"] as const).map((familia) => ({
    familia,
    nombre: NOMBRES_PROTO[familia],
    capturar: (clave: string) => capturar(clave, familia),
    validar,
    aplicar: (_clave: string, payload: PayloadProtomolecula) => aplicar(familia, payload),
  }));
}

/** Registra las tres familias de la Protomolécula en el registro común de variaciones. */
export function registrarAdaptadoresProtomolecula(deps: DepsProtomolecula): void {
  for (const adaptador of crearAdaptadorProtomolecula(deps)) registrarFamilia(adaptador);
}
