// Familias «post» y «mensaje» de las variaciones públicas (contrato §5): SOLO estilos, plantillas y
// decoración del editor rico y del compositor de publicaciones. Nunca viajan texto, destinatarios,
// adjuntos ni URL. Módulo PURO con puertos inyectados; nada se ejecuta sin validar.
import type { LayoutBlock, LayoutBlockType, LayoutDoc, LayoutPresetId } from "@/components/publish/layout-builder";
import { colorValido, validarEstilo } from "@/lib/mensajeria/formato";
import { FONDOS_BURBUJA, type BloqueDoc, type DocRico, type EstiloMensaje, type TramoTexto } from "@/lib/mensajeria/formato-tipos";
import { leerClave } from "../clave-elemento";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";

export type PartePublicacion = "estilo" | "plantilla" | "decoracion";
export type TipoPlantilla = "parrafo" | "titulo1" | "titulo2" | "titulo3" | "lista" | "listaNumerada" | "tareas"
  | "cita" | "codigo" | "separador" | "texto" | "media" | "embed" | "boton" | "columnas2" | "columnas3" | "tarjeta";
/** Estilo (con su `preset` de publicación) o plantilla de bloques; `plantilla` nunca lleva contenido. */
export interface PayloadPublicacion { parte: PartePublicacion; estilo?: EstiloMensaje; preset?: LayoutPresetId; plantilla?: TipoPlantilla[] }
export interface BorradorMensaje { estilo: EstiloMensaje | null; doc: DocRico }
export interface PuertoMensaje { leer(): BorradorMensaje | null; escribir(b: BorradorMensaje): void }
export interface PuertoPost { leer(): LayoutDoc | null; escribir(d: LayoutDoc): void }
export interface DepsPublicaciones { mensaje?: PuertoMensaje; post?: PuertoPost; nuevoId?: () => string }
type Resultado = { ok: true; payload: PayloadPublicacion } | { ok: false; motivos: string[] };

const TIPOS = new Set<string>(["parrafo", "titulo1", "titulo2", "titulo3", "lista", "listaNumerada", "tareas", "cita",
  "codigo", "separador", "texto", "media", "embed", "boton", "columnas2", "columnas3", "tarjeta"]);
const POST = new Set<string>(["texto", "media", "codigo", "embed", "boton", "separador", "columnas2", "columnas3", "tarjeta"]);
const PRESETS = new Set<string>(["post", "articulo", "pagina_entidad", "evento", "app_widget"]);
const FONDOS = new Set(FONDOS_BURBUJA.map((f) => f.id));
const PX: Record<string, number> = { sm: 14, md: 16, lg: 22, xl: 32 };
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const no = (...m: string[]): { ok: false; motivos: string[] } => ({ ok: false, motivos: m });
function parteDe(clave: string): { familia: string; parte: PartePublicacion } | null {
  if (!leerClave(clave)) return null;
  const [familia, resto] = clave.split(":");
  const parte = resto?.split("#")[1];
  return parte === "estilo" || parte === "plantilla" || parte === "decoracion" ? { familia, parte } : null;
}
function soloTexto(e: EstiloMensaje): EstiloMensaje {
  const { fuente, tamano, color, negrita, cursiva, alineacion } = e;
  return { ...(fuente ? { fuente } : {}), ...(tamano ? { tamano } : {}), ...(color ? { color } : {}),
    ...(negrita ? { negrita } : {}), ...(cursiva ? { cursiva } : {}), ...(alineacion ? { alineacion } : {}) };
}
function soloDeco(e: EstiloMensaje): EstiloMensaje {
  const { fondo, animacionFondo, animacionTexto, colorMarco, grosorMarco } = e;
  return { ...(fondo ? { fondo } : {}), ...(animacionFondo ? { animacionFondo } : {}), ...(animacionTexto ? { animacionTexto } : {}),
    ...(colorMarco ? { colorMarco } : {}), ...(grosorMarco !== undefined ? { grosorMarco } : {}) };
}

/** Valida la forma común de las dos familias: estilo del editor o lista de tipos de bloque (sin contenido). */
export function validarPayloadPublicacion(raw: unknown): Resultado {
  const base = validarVariacion(raw); if (!base.ok) return no(...base.motivos);
  if (!obj(raw)) return no("Publicación: el payload debe ser un objeto");
  const parte = raw.parte;
  if (parte !== "estilo" && parte !== "plantilla" && parte !== "decoracion") return no("Publicación: parte desconocida");
  if (parte === "plantilla") {
    if (!Array.isArray(raw.plantilla) || !raw.plantilla.length || raw.plantilla.length > 200) return no("Plantilla: entre 1 y 200 bloques");
    const bloques: TipoPlantilla[] = [];
    for (const t of raw.plantilla) { if (!TIPOS.has(t as string)) return no("Plantilla: tipo de bloque desconocido"); bloques.push(t as TipoPlantilla); }
    return { ok: true, payload: { parte, plantilla: bloques } };
  }
  const limpio = validarEstilo(raw.estilo);
  if (!limpio) return no(`Publicación: ${parte} no es un estilo del editor`);
  if (parte === "estilo") {
    const estilo = soloTexto(limpio);
    return Object.keys(estilo).length ? { ok: true, payload: { parte, estilo } } : no("Estilo: no cambia la tipografía");
  }
  const estilo = soloDeco(limpio);
  if (!Object.keys(estilo).length) return no("Decoración: no cambia nada");
  if (estilo.fondo && !FONDOS.has(estilo.fondo)) return no("Decoración: el fondo debe ser un preset del OS");
  if (raw.preset !== undefined && !PRESETS.has(raw.preset as string)) return no("Decoración: preset desconocido");
  return { ok: true, payload: { parte, estilo, ...(raw.preset ? { preset: raw.preset as LayoutPresetId } : {}) } };
}

// ── Captura (sin texto ni destinatarios) ──
function tipoDoc(b: BloqueDoc): TipoPlantilla {
  if (b.tipo === "titulo") return `titulo${b.nivel}` as TipoPlantilla;
  if (b.tipo === "lista") return b.ordenada ? "listaNumerada" : "lista";
  return b.tipo;
}
function capturarMensaje(port: PuertoMensaje, parte: PartePublicacion): PayloadPublicacion | null {
  const b = port.leer(); if (!b) return null;
  if (parte === "plantilla") return b.doc.bloques.length ? { parte, plantilla: b.doc.bloques.map(tipoDoc) } : null;
  const e = validarEstilo(b.estilo ?? undefined); if (!e) return null;
  const estilo = parte === "estilo" ? soloTexto(e) : soloDeco(e);
  return Object.keys(estilo).length ? { parte, estilo } : null;
}
function capturarPost(port: PuertoPost, parte: PartePublicacion): PayloadPublicacion | null {
  const d = port.leer(); if (!d || !d.blocks.length) return null;
  if (parte === "plantilla") return { parte, plantilla: d.blocks.map((b) => b.type as TipoPlantilla) };
  const s = d.blocks[0].style;
  if (parte === "estilo") {
    const estilo: EstiloMensaje = {};
    if (s.fontSize) estilo.tamano = PX[s.fontSize];
    if (s.align) estilo.alineacion = s.align === "center" ? "centro" : s.align === "right" ? "derecha" : "izquierda";
    const c = colorValido(s.color); if (c) estilo.color = c;
    return Object.keys(estilo).length ? { parte, estilo } : null;
  }
  const estilo: EstiloMensaje = {};
  const bg = colorValido(s.bg); if (bg) estilo.fondo = bg;
  return { parte, estilo, preset: d.preset };
}

// ── Aplicación sobre el borrador actual, siempre con deshacer ──
function lineas(b: BloqueDoc): TramoTexto[][] {
  switch (b.tipo) {
    case "parrafo": case "titulo": case "cita": return [b.tramos];
    case "lista": return b.items;
    case "tareas": return b.items.map((i) => i.tramos);
    case "codigo": return [b.texto ? [{ texto: b.texto }] : []];
    default: return [];
  }
}
function convertir(actual: BloqueDoc | undefined, tipo: TipoPlantilla): BloqueDoc | null {
  if (!TIPOS.has(tipo)) return null;
  const ls = actual ? lineas(actual) : [];
  const texto = ls.map((l) => l.map((x) => x.texto).join("")).join("\n");
  const nivel = tipo === "titulo2" ? 2 : tipo === "titulo3" ? 3 : 1;
  if (tipo.startsWith("titulo")) return actual ? { tipo: "titulo", nivel: nivel as 1 | 2 | 3, tramos: ls[0] ?? [] } : { tipo: "titulo", nivel: nivel as 1 | 2 | 3, tramos: [] };
  if (tipo === "separador") return texto.trim() ? (actual ?? { tipo: "separador" }) : { tipo: "separador" };
  if (!actual) {
    if (tipo === "lista" || tipo === "listaNumerada") return { tipo: "lista", ordenada: tipo === "listaNumerada", items: [[""].map(() => ({ texto: "" }))] };
    if (tipo === "tareas") return { tipo: "tareas", items: [{ hecha: false, tramos: [] }] };
    if (tipo === "cita") return { tipo: "cita", tramos: [] };
    if (tipo === "codigo") return { tipo: "codigo", texto: "" };
    return { tipo: "parrafo", tramos: [] };
  }
  if (tipo === "lista" || tipo === "listaNumerada") return { tipo: "lista", ordenada: tipo === "listaNumerada", items: ls.length ? ls : [[]] };
  if (tipo === "tareas") return { tipo: "tareas", items: ls.map((l) => ({ hecha: false, tramos: l })) };
  if (tipo === "cita") return { tipo: "cita", tramos: ls[0] ?? [] };
  if (tipo === "codigo") return { tipo: "codigo", texto };
  return { tipo: "parrafo", tramos: ls[0] ?? [] };
}
function aplicarMensaje(port: PuertoMensaje, payload: PayloadPublicacion): () => void {
  const antes = port.leer(); if (!antes) return () => undefined;
  if (payload.parte === "plantilla") {
    const tipos = payload.plantilla ?? [];
    const bloques = tipos.map((t, i) => convertir(antes.doc.bloques[i], t)).filter((b): b is BloqueDoc => b !== null);
    port.escribir({ ...antes, doc: { bloques: [...bloques, ...antes.doc.bloques.slice(tipos.length)] } });
  } else port.escribir({ ...antes, estilo: { ...(antes.estilo ?? {}), ...(payload.estilo ?? {}) } });
  return () => port.escribir(antes);
}
function aplicarPost(port: PuertoPost, payload: PayloadPublicacion, nuevoId: () => string): () => void {
  const antes = port.leer(); if (!antes) return () => undefined;
  if (payload.parte === "plantilla") {
    const tipos = (payload.plantilla ?? []).filter((t): t is LayoutBlockType => POST.has(t));
    const bloques = tipos.map((tipo, i) => {
      const actual = antes.blocks[i];
      if (actual) return { ...actual, type: tipo };
      return { id: nuevoId(), type: tipo, content: "", content2: "", content3: "", href: "",
        style: { fontSize: "md" as const, align: "left" as const, padding: "sm" as const, radius: "sm" as const }, history: [] };
    });
    port.escribir({ ...antes, blocks: [...bloques, ...antes.blocks.slice(tipos.length)] });
  } else if (payload.parte === "estilo") {
    const s = payload.estilo ?? {};
    const estilo: LayoutBlock["style"] = {};
    if (s.tamano) estilo.fontSize = s.tamano <= 14 ? "sm" : s.tamano <= 16 ? "md" : s.tamano <= 22 ? "lg" : "xl";
    if (s.alineacion) estilo.align = s.alineacion === "centro" ? "center" : s.alineacion === "derecha" ? "right" : "left";
    const c = colorValido(s.color); if (c) estilo.color = c;
    port.escribir({ ...antes, blocks: antes.blocks.map((b) => ({ ...b, style: { ...b.style, ...estilo } })) });
  } else {
    const bg = colorValido(payload.estilo?.fondo);
    port.escribir({ ...antes, preset: payload.preset ?? antes.preset,
      blocks: antes.blocks.map((b) => ({ ...b, style: { ...b.style, ...(bg ? { bg } : {}) } })) });
  }
  return () => port.escribir(antes);
}

function adaptador(familia: string, nombre: string, capturar: (c: string) => PayloadPublicacion | null, aplicar: (p: PayloadPublicacion) => () => void): AdaptadorFamilia<PayloadPublicacion> {
  return {
    familia, nombre, capturar,
    validar: (raw) => { const r = validarPayloadPublicacion(raw); return r.ok ? r : { ok: false, motivos: r.motivos }; },
    aplicar: (clave, payload) => { const p = parteDe(clave); const r = validarPayloadPublicacion(payload);
      return p && p.familia === familia && p.parte === payload.parte && r.ok ? { deshacer: aplicar(r.payload) } : { deshacer: () => undefined }; },
  };
}
/** Adaptador de `mensaje:<id>#estilo|plantilla|decoracion`; el borrador del editor llega por puerto. */
export function crearAdaptadorMensaje(deps: DepsPublicaciones): AdaptadorFamilia<PayloadPublicacion> {
  const port = deps.mensaje;
  return adaptador("mensaje", "Estilos y plantillas de mensajes",
    (c) => { const p = parteDe(c); return port && p?.familia === "mensaje" ? capturarMensaje(port, p.parte) : null; },
    (payload) => (port ? aplicarMensaje(port, payload) : () => undefined));
}
/** Adaptador de `post:<id>#estilo|plantilla|decoracion`; el compositor de publicaciones llega por puerto. */
export function crearAdaptadorPost(deps: DepsPublicaciones): AdaptadorFamilia<PayloadPublicacion> {
  const port = deps.post, nuevoId = deps.nuevoId ?? (() => `blk-${Math.random().toString(36).slice(2, 10)}`);
  return adaptador("post", "Estilos y plantillas de publicaciones",
    (c) => { const p = parteDe(c); return port && p?.familia === "post" ? capturarPost(port, p.parte) : null; },
    (payload) => (port ? aplicarPost(port, payload, nuevoId) : () => undefined));
}
/** Registra `mensaje:` y `post:` en el registro compartido de familias. */
export function registrarAdaptadoresPublicaciones(deps: DepsPublicaciones): void {
  registrarFamilia(crearAdaptadorMensaje(deps));
  registrarFamilia(crearAdaptadorPost(deps));
}
