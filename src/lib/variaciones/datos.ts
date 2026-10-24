// Variaciones públicas · capa de datos (architecture/variaciones-publicas.md §6) sobre la migración 20261019130000_os_variaciones.sql.
// Pura (cliente de Supabase inyectado) y nunca lanza: sin tabla, sin función o sin red → lista vacía y `disponible: false`, así la
// ventana nunca se rompe. Los contadores (usos, valoración media y número de valoraciones) los calcula la base, nunca el cliente.
import { leerClave } from "./clave-elemento";
import { validarVariacion } from "./validar";
export const TABLA_VARIACIONES = "os_variaciones", TABLA_VALORACIONES = "os_variaciones_valoraciones", RPC_USADA = "os_variacion_usada";
export const TIPOS_VARIACION = ["variacion", "nota", "repo", "fuente", "adaptacion"] as const;
export type TipoVariacion = (typeof TIPOS_VARIACION)[number];
export const COLUMNAS_VARIACION = "id,clave,familia,tipo,titulo,descripcion,payload,version,de_variacion,licencia,"
  + "enlace_externo,etiquetas,tema,autor,publicado_en,usos,valoracion_media,valoraciones,updated_at";
/** Una fila de `os_variaciones`, con las columnas exactas de la migración. */
export interface FilaVariacion {
  id: string; clave: string; familia: string; tipo: TipoVariacion; titulo: string; descripcion: string | null; payload: unknown; version: string | null;
  de_variacion: string | null; licencia: string; enlace_externo: string | null; etiquetas: string[]; tema: string | null; autor: string;
  publicado_en: string; usos: number; valoracion_media: number; valoraciones: number; updated_at: string;
}
export interface ErrorBd { code?: string; message?: string }
type Respuesta<T> = { data: T | null; error: ErrorBd | null; count?: number | null }; type Q = ConsultaVariaciones;
/** Lo mínimo del cliente de Supabase y de su constructor de consultas (el real se pasa con `as unknown as ClienteVariaciones`). */
export interface ConsultaVariaciones extends PromiseLike<Respuesta<unknown[]>> {
  eq(columna: string, valor: string): Q; contains(columna: string, valor: string[]): Q; or(filtros: string): Q;
  order(columna: string, opciones: { ascending: boolean }): Q; range(desde: number, hasta: number): Q;
}
export interface ClienteVariaciones {
  from(tabla: string): {
    select(columnas: string, opciones?: { count: "exact" }): Q;
    insert(fila: Record<string, unknown>): { select(columnas: string): { single(): PromiseLike<Respuesta<unknown>> } };
    upsert(fila: Record<string, unknown>, opciones: { onConflict: string }): PromiseLike<Respuesta<unknown>>;
  };
  rpc(nombre: string, args: Record<string, unknown>): PromiseLike<Respuesta<unknown>>; auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null } }> };
}
export type OrdenVariaciones = "aurora" | "novedades" | "populares" | "usadas" | "valoradas" | "alfabetico";
/** Orden en la base. «aurora» depende del contexto y del ADN: llega por novedades y lo reordena el cliente. */
const ORDEN: Record<OrdenVariaciones, Array<[string, boolean]>> = { aurora: [["publicado_en", false]], novedades: [["publicado_en", false]],
  populares: [["valoraciones", false], ["usos", false]], usadas: [["usos", false], ["publicado_en", false]], valoradas: [["valoracion_media", false], ["valoraciones", false]], alfabetico: [["titulo", true]] };
export interface FiltrosVariaciones { tipo?: TipoVariacion; etiquetas?: string[]; tema?: string; licencia?: string }
export interface OpcionesListar { buscar?: string; filtros?: FiltrosVariaciones; orden?: OrdenVariaciones; pagina?: number; porPagina?: number }
export interface Listado { disponible: boolean; variaciones: FilaVariacion[]; total: number; pagina: number; porPagina: number; error?: string }
export type Resultado<T> = { ok: true; valor: T } | { ok: false; disponible: boolean; motivos: string[] };
/** Lo que se publica; `codigo` = la familia declara que su variación es código y solo se abrirá aislada. */
export interface NuevaVariacion { clave: string; tipo?: TipoVariacion; titulo: string; descripcion?: string; payload: unknown; version?: string;
  codigo?: boolean; deVariacion?: string | null; licencia: string; enlaceExterno?: string; etiquetas?: string[]; tema?: string }
/** ¿Falta la tabla o la función en la base (migración sin aplicar)? */
export const faltaEnLaBase = (e?: ErrorBd | null) =>
  !!e && (/^(42P01|42883|PGRST20[25])$/.test(e.code ?? "") || /does not exist|could not find|schema cache/i.test(e.message ?? ""));
const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const no = (disponible: boolean, motivo: string): Resultado<never> => ({ ok: false, disponible, motivos: [motivo] });
const fallo = (e: ErrorBd) => faltaEnLaBase(e) ? no(false, "Base: las variaciones públicas aún no están en este proyecto") : no(true, `Base: ${e.message || e.code}`);
const sinRed = (e: unknown) => no(false, `Red: ${e instanceof Error ? e.message : "sin conexión"}`);
/** Texto seguro para el filtro `or` de PostgREST (comas, paréntesis y comodines rompen la consulta). */
const textoBusqueda = (t?: string) => (t ?? "").replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
/** Comprueba una variación antes de publicarla: clave, campos y que no lleve nada privado ni secretos. */
export function motivosNuevaVariacion(v: NuevaVariacion): { motivos: string[]; requiereAislamiento: boolean } {
  const motivos: string[] = [], titulo = v.titulo.trim();
  if (!leerClave(v.clave)) motivos.push(`Clave: «${v.clave}» no es una clave de elemento válida`);
  if (!TIPOS_VARIACION.includes(v.tipo ?? "variacion")) motivos.push(`Tipo: «${v.tipo}» no es un tipo de variación`);
  if (titulo.length < 1 || titulo.length > 200) motivos.push("Título: entre 1 y 200 caracteres");
  if (!v.licencia.trim()) motivos.push("Licencia: toda variación declara su licencia");
  if (v.deVariacion && !PATRON_UUID.test(v.deVariacion)) motivos.push("Origen: «de_variacion» no es un identificador válido");
  if (v.enlaceExterno && !/^https:\/\/\S+$/.test(v.enlaceExterno)) motivos.push("Url: el enlace externo solo puede ser https");
  const datos = validarVariacion(v.payload, { codigo: v.codigo });
  const ficha = validarVariacion({ titulo, descripcion: v.descripcion ?? "", etiquetas: v.etiquetas ?? [], tema: v.tema ?? "" });
  for (const r of [datos, ficha]) if (!r.ok) motivos.push(...r.motivos);
  return { motivos, requiereAislamiento: datos.requiereAislamiento };
}
/** Capa de datos sobre el cliente inyectado. `publicarVariacion` valida y guarda el autor de la sesión y `de_variacion`; `valorar`: de 1
 *  a 5, una por persona (repetir la cambia; la media la recalcula la base); `registrarUso`: «la usé», la RPC con sesión suma y da el total. */
export function crearDatosVariaciones(cliente: ClienteVariaciones) {
  const usuario = async () => (await cliente.auth.getUser()).data.user;
  return {
    /** Lo publicado de una clave, con búsqueda, filtros, orden y página (empieza en 1). */
    async listarVariaciones(clave: string, op: OpcionesListar = {}): Promise<Listado> {
      const porPagina = Math.min(Math.max(Math.trunc(op.porPagina ?? 24), 1), 100), pagina = Math.max(Math.trunc(op.pagina ?? 1), 1);
      const vacio: Listado = { disponible: true, variaciones: [], total: 0, pagina, porPagina };
      if (!leerClave(clave)) return { ...vacio, error: "Clave de elemento no válida" };
      try {
        let q = cliente.from(TABLA_VARIACIONES).select(COLUMNAS_VARIACION, { count: "exact" }).eq("clave", clave);
        const f = op.filtros ?? {}, texto = textoBusqueda(op.buscar), etiquetas = (f.etiquetas ?? []).map((e) => e.trim()).filter(Boolean);
        for (const col of ["tipo", "tema", "licencia"] as const) { const valor = f[col]; if (valor) q = q.eq(col, valor); }
        if (etiquetas.length) q = q.contains("etiquetas", etiquetas);
        if (texto) q = q.or(`titulo.ilike.*${texto}*,descripcion.ilike.*${texto}*`);
        for (const [col, asc] of ORDEN[op.orden ?? "novedades"] ?? ORDEN.novedades) q = q.order(col, { ascending: asc });
        const { data, error, count } = await q.range((pagina - 1) * porPagina, pagina * porPagina - 1);
        if (error) return { ...vacio, disponible: false, error: faltaEnLaBase(error) ? undefined : error.message || error.code };
        const variaciones = (data ?? []) as FilaVariacion[]; // PostgREST da numeric como número y etiquetas nunca es nula (migración)
        return { ...vacio, variaciones, total: typeof count === "number" ? count : variaciones.length };
      } catch (e) { return { ...vacio, disponible: false, error: e instanceof Error ? e.message : "sin conexión" }; }
    },
    async publicarVariacion(v: NuevaVariacion): Promise<Resultado<{ variacion: FilaVariacion; requiereAislamiento: boolean }>> {
      const { motivos, requiereAislamiento } = motivosNuevaVariacion(v);
      if (motivos.length) return { ok: false, disponible: true, motivos };
      try {
        const yo = await usuario();
        if (!yo) return no(true, "Sesión: hace falta iniciar sesión para publicar");
        const fila = { clave: v.clave, familia: v.clave.split(":")[0], tipo: v.tipo ?? "variacion", titulo: v.titulo.trim(),
          descripcion: v.descripcion ?? null, payload: v.payload, version: v.version ?? null, de_variacion: v.deVariacion ?? null,
          licencia: v.licencia.trim(), enlace_externo: v.enlaceExterno ?? null, etiquetas: v.etiquetas ?? [], tema: v.tema ?? null, autor: yo.id };
        const { data, error } = await cliente.from(TABLA_VARIACIONES).insert(fila).select(COLUMNAS_VARIACION).single();
        return error || !data ? fallo(error ?? { message: "la base no devolvió la fila" }) : { ok: true, valor: { variacion: data as FilaVariacion, requiereAislamiento } };
      } catch (e) { return sinRed(e); }
    },
    async valorar(variacion: string, valor: number): Promise<Resultado<number>> {
      if (!PATRON_UUID.test(variacion) || !Number.isInteger(valor) || valor < 1 || valor > 5) return no(true, "Valoración: variación válida y un entero de 1 a 5");
      try {
        const yo = await usuario();
        if (!yo) return no(true, "Sesión: hace falta iniciar sesión para valorar");
        const { error } = await cliente.from(TABLA_VALORACIONES).upsert({ variacion, persona: yo.id, valor }, { onConflict: "variacion,persona" });
        return error ? fallo(error) : { ok: true, valor };
      } catch (e) { return sinRed(e); }
    },
    async registrarUso(variacion: string): Promise<Resultado<number>> {
      if (!PATRON_UUID.test(variacion)) return no(true, "Variación: identificador no válido");
      try {
        const { data, error } = await cliente.rpc(RPC_USADA, { p_variacion: variacion });
        return error ? fallo(error) : { ok: true, valor: Number(data) || 0 };
      } catch (e) { return sinRed(e); }
    },
  };
}
export type DatosVariaciones = ReturnType<typeof crearDatosVariaciones>;
