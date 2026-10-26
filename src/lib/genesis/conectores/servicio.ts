/** GENESIS · SERVICIO DE OPCIONES POR ÁMBITO (Ola 1019G · GCA1019Lb · architecture/genesis-conectores-abiertos.md §3 y §6).
 * Lógica de la API /api/genesis/conectores, EXTRAÍDA a un módulo PURO sin red, reloj, disco ni Supabase:
 * red, reloj, catálogo, bóveda y asignaciones llegan INYECTADOS (dependencias falsas en las pruebas).
 * Nunca ve, guarda ni devuelve valores de claves o tokens: solo nombres de variables y huellas. */
import { sugerirParaAmbito, type GrupoSugerencias } from "./sugerir";
import type { OpcionCatalogo, Papel } from "./catalogo-opciones";
import { fusionarConAmbito, type Asignacion, type Preferencias } from "./asignaciones";
import { CONTENEDORES_OPCIONES } from "./contenedores";
import type { OfertaContexto } from "./escalera";

/** Un proveedor más una huella (nada de valores). */
export interface VinculacionAmbito { proveedor: string; huella: string }

/** Una asignación del ámbito: a qué cadena de opciones sirve cada papel o director. */
export interface AsignacionAmbito { clave: string; cadena: string[] }

/** Dependencias inyectables: en la ruta las cumple Supabase; en las pruebas, dobles puros. */
export interface DependenciasConectores {
  catalogo(): Promise<OpcionCatalogo[]>;
  asignacionesDelAmbito(ambitoId: string): Promise<AsignacionAmbito[]>;
  ofertasDelAmbito(ambitoId: string): Promise<OfertaContexto[]>;
  vinculadasDelAmbito(ambitoId: string): Promise<ReadonlySet<string>>;
  vincularClave(e: { ambitoId: string; proveedor: string; valor: string }): Promise<{ ok: boolean; huella?: string; error?: string }>;
  asignarCadena(e: { ambitoId: string; clave: string; cadena: string[] }): Promise<{ ok: boolean; error?: string }>;
}

export type AccionConectores =
  | { accion: "vincular"; proveedor: string; valor: string }
  | { accion: "asignar"; clave: string; cadena: string[] };

export type Despacho = { estado: 200 | 201 | 400 | 500; cuerpo: Record<string, unknown> };
export type LecturaAccion = { ok: true; accion: AccionConectores } | { ok: false; estado: 400; error: string };
export type RespuestaCatalogo = { estado: 200 | 500; cuerpo: Record<string, unknown> };

/** Lee y sanea el cuerpo de POST. PURO: sin e/s; jamás conserva el valor de una clave más allá del despacho. */
export function leerAccionConectores(crudo: string): LecturaAccion {
  if (!crudo) return { ok: false, estado: 400, error: "Petición vacía." };
  let cuerpo: unknown;
  try { cuerpo = JSON.parse(crudo); } catch { return { ok: false, estado: 400, error: "JSON inválido en el cuerpo." }; }
  if (typeof cuerpo !== "object" || cuerpo === null) return { ok: false, estado: 400, error: "Cuerpo no válido." };
  const c = cuerpo as Record<string, unknown>;
  if (c.accion === "vincular") {
    const proveedor = typeof c.proveedor === "string" ? c.proveedor.trim().slice(0, 100) : "";
    const valor = typeof c.valor === "string" ? c.valor : "";
    if (!proveedor || !valor) return { ok: false, estado: 400, error: "Faltan el proveedor y el valor de la clave." };
    return { ok: true, accion: { accion: "vincular", proveedor, valor } };
  }
  if (c.accion === "asignar") {
    const clave = typeof c.clave === "string" ? c.clave.trim().slice(0, 100) : "";
    const bruto = Array.isArray(c.cadena) ? c.cadena : typeof c.cadena === "string" ? [c.cadena] : [];
    const cadena = bruto
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 120);
    if (!clave || !cadena.length) return { ok: false, estado: 400, error: "Faltan la clave y su cadena de opciones." };
    return { ok: true, accion: { accion: "asignar", clave, cadena } };
  }
  return { ok: false, estado: 400, error: "Acción no soportada: solo «vincular» y «asignar»." };
}

/** Papeles que se pueden asignar (los directores van a su tarea aparte). */
const PAPELES_QUE_SUGEREN: readonly Papel[] = ["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"];

/** Preferencias por defecto: local primero, lo privado queda en la cuenta, pago SOLO con permiso explícito. */
const PREFERENCIAS_DEFECTO: Preferencias = { localPrimero: true, privacidad: "nube-con-retencion", presupuesto: null };

/** GET: catálogo del ámbito + sugerencias de `sugerir.ts` + asignaciones saneadas, SIN claves. */
export async function catalogoDelAmbito(
  deps: DependenciasConectores,
  ambitoId: string,
): Promise<RespuestaCatalogo> {
  let catalogo: OpcionCatalogo[];
  try {
    catalogo = await deps.catalogo();
  } catch {
    return { estado: 500, cuerpo: { error: "No se pudo preparar el catálogo de opciones." } };
  }
  const crudas = await deps.asignacionesDelAmbito(ambitoId).catch<AsignacionAmbito[]>(() => []);
  const asignaciones: AsignacionAmbito[] = crudas.map((a) => ({
    clave: a.clave,
    cadena: fusionarConAmbito([], a.cadena, catalogo),
  }));
  const paraSugerir: Asignacion<Papel>[] = asignaciones
    .filter((a): a is AsignacionAmbito & { clave: Papel } => (PAPELES_QUE_SUGEREN as readonly string[]).includes(a.clave))
    .map((a) => ({ clave: a.clave, cadena: a.cadena, respaldo: [], preferencias: PREFERENCIAS_DEFECTO }));
  let sugerencias: GrupoSugerencias[] = [];
  try {
    sugerencias = sugerirParaAmbito({
      asignaciones: paraSugerir,
      catalogo,
      ofertas: await deps.ofertasDelAmbito(ambitoId).catch(() => []),
      vinculadas: await deps.vinculadasDelAmbito(ambitoId).catch(() => new Set<string>()),
      contenedores: CONTENEDORES_OPCIONES,
    });
  } catch {
    sugerencias = [];
  }
  return { estado: 200, cuerpo: { ambito: ambitoId, sugerencias, asignaciones, catalogo } };
}

/** POST: ejecuta la acción saneada con las dependencias. «vincular» responde SOLO la huella; jamás el valor. */
export async function despacharAccion(
  deps: DependenciasConectores,
  ambitoId: string,
  accion: AccionConectores,
): Promise<Despacho> {
  if (accion.accion === "vincular") {
    const r = await deps.vincularClave({ ambitoId, proveedor: accion.proveedor, valor: accion.valor })
      .catch<{ ok: false; error: string }>(() => ({ ok: false, error: "No se pudo guardar en la bóveda del ámbito." }));
    if (!r.ok) return { estado: 500, cuerpo: { error: r.error ?? "No se pudo vincular el proveedor." } };
    return { estado: 201, cuerpo: { accion: "vincular", proveedor: accion.proveedor, huella: r.huella ?? null } };
  }
  const catalogo = await deps.catalogo().catch<OpcionCatalogo[]>(() => []);
  const cadena = fusionarConAmbito([], accion.cadena, catalogo);
  if (!cadena.length) return { estado: 400, cuerpo: { error: "Ninguna opción de la cadena existe en el catálogo." } };
  const r = await deps.asignarCadena({ ambitoId, clave: accion.clave, cadena })
    .catch<{ ok: false; error: string }>(() => ({ ok: false, error: "No se pudo registrar la asignación." }));
  if (!r.ok) return { estado: 500, cuerpo: { error: r.error ?? "No se pudo asignar la clave." } };
  return { estado: 200, cuerpo: { accion: "asignar", clave: accion.clave, cadena } };
}
