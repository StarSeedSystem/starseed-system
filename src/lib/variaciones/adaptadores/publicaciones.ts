// Familias «post» y «mensaje» (contrato: architecture/variaciones-publicas.md §5). Capturan solo
// estilos y plantillas del editor rico y del compositor: nunca el texto ni los destinatarios. Módulo
// PURO con el borrador inyectado; nada se aplica sin validar y deshacer devuelve el borrador previo.
import { leerClave } from "../clave-elemento";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";
import { PRESETS_LIENZO, validarEstilo, type PresetLienzo } from "@/lib/mensajeria/formato";
import type { BloqueDoc, DocRico, EstiloMensaje, TramoTexto } from "@/lib/mensajeria/formato-tipos";
import type { MainRatio } from "@/lib/publish/publish";

export type FamiliaContenido = "post" | "mensaje";
export type ParteContenido = "estilo" | "plantilla" | "decoracion";
export interface EstiloPublicacion { formato?: string; ratio?: MainRatio; mostrarVistaPrevia?: boolean }
export type EstiloContenido = EstiloMensaje & EstiloPublicacion;
export interface BloquePlantilla { tipo: BloqueDoc["tipo"]; nivel?: 1 | 2 | 3; ordenada?: boolean }
export interface PlantillaContenido { bloques?: BloquePlantilla[]; lienzo?: PresetLienzo }
export type PayloadContenido = EstiloContenido | PlantillaContenido;
/** El borrador actual que presta el anfitrión; el adaptador nunca guarda texto aquí. */
export interface BorradorContenido {
  estilo: EstiloContenido | null;
  doc: DocRico | null;
  lienzo: { ancho: number; alto: number } | null;
}
export interface PuertoBorrador {
  leer(familia: FamiliaContenido): BorradorContenido | null;
  guardar(familia: FamiliaContenido, borrador: BorradorContenido): void;
}
export type ResultadoPayload = { ok: true; payload: PayloadContenido } | { ok: false; motivos: string[] };

const PARTES: readonly ParteContenido[] = ["estilo", "plantilla", "decoracion"];
const CAMPOS: Record<FamiliaContenido, readonly (keyof EstiloContenido)[]> = {
  mensaje: ["fuente", "tamano", "color", "negrita", "cursiva", "alineacion"],
  post: ["formato", "ratio", "mostrarVistaPrevia"],
};
const DECORACION: readonly (keyof EstiloContenido)[] = ["colorMarco", "grosorMarco", "fondo", "animacionTexto", "animacionFondo"];
const TIPOS_BLOQUE: readonly BloqueDoc["tipo"][] = ["parrafo", "titulo", "lista", "tareas", "cita", "codigo", "separador"];
const RATIOS: readonly MainRatio[] = ["auto", "1:1", "4:5", "16:9", "libre"];
const PRIVADAS = new Set(["texto", "titulo", "title", "body", "cuerpo", "contenido", "content", "destinatarios",
  "destinos", "destinations", "perfiles", "profiles", "mentions", "menciones", "adjuntos", "attachments", "url",
  "urls", "html", "destinatario", "autor", "author", "handle", "email"]);
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const copia = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)) as T);
const mismo = (lista: readonly unknown[], v: unknown) => typeof v === "string" && lista.includes(v);

/** Rechaza cualquier clave que nombre texto, destinatarios o adjuntos, a cualquier profundidad. */
function motivosPrivados(v: unknown, ruta = "payload"): string[] {
  if (Array.isArray(v)) return v.flatMap((h, i) => motivosPrivados(h, `${ruta}[${i}]`));
  if (!esObjeto(v)) return [];
  return Object.entries(v).flatMap(([k, h]) => [
    ...(PRIVADAS.has(k.toLowerCase()) ? [`Privacidad: «${ruta}.${k}» es texto o datos del borrador`] : []),
    ...motivosPrivados(h, `${ruta}.${k}`),
  ]);
}

/** Campos de estilo: vocabulario cerrado de `validarEstilo` más los propios del compositor. */
function motivosCampos(permitidos: readonly (keyof EstiloContenido)[], p: Record<string, unknown>): string[] {
  const motivos = Object.keys(p).filter((k) => !(permitidos as readonly string[]).includes(k))
    .map((k) => `Estilo: «${k}» no es un campo de esta variación`);
  const sano = validarEstilo(p) ?? {};
  for (const k of permitidos) {
    if (!(k in p)) continue;
    const v = p[k];
    if (k === "formato" && !(typeof v === "string" && /^[a-z0-9][a-z0-9._-]{0,39}$/i.test(v))) motivos.push("Estilo: «formato» no es válido");
    else if (k === "ratio" && !mismo(RATIOS, v)) motivos.push("Estilo: «ratio» no es una proporción válida");
    else if ((k === "negrita" || k === "cursiva" || k === "mostrarVistaPrevia") && typeof v !== "boolean") motivos.push(`Estilo: «${String(k)}» debe ser booleano`);
    else if (!(k in sano) && k !== "negrita" && k !== "cursiva" && k !== "mostrarVistaPrevia" && k !== "formato" && k !== "ratio") motivos.push(`Estilo: «${String(k)}» no es válido`);
  }
  if (!permitidos.some((k) => k in p)) motivos.push("Estilo: la variación no cambia nada");
  return motivos;
}

/** Plantilla: tipos de bloque y tamaño de lienzo; ni una letra del contenido. */
function motivosPlantilla(p: Record<string, unknown>): string[] {
  const motivos = Object.keys(p).filter((k) => k !== "bloques" && k !== "lienzo").map((k) => `Plantilla: «${k}» no es un campo de una plantilla`);
  if ("bloques" in p) {
    if (!Array.isArray(p.bloques) || p.bloques.length < 1 || p.bloques.length > 200) motivos.push("Plantilla: entre 1 y 200 bloques");
    else p.bloques.forEach((b, i) => {
      if (!esObjeto(b) || !TIPOS_BLOQUE.includes(b.tipo as BloqueDoc["tipo"])) { motivos.push(`Plantilla: el bloque ${i} no es válido`); return; }
      if (Object.keys(b).some((k) => !["tipo", "nivel", "ordenada"].includes(k))) motivos.push(`Plantilla: el bloque ${i} lleva datos privados`);
      if ("nivel" in b && (b.tipo !== "titulo" || ![1, 2, 3].includes(b.nivel as number))) motivos.push(`Plantilla: el nivel del bloque ${i} no es válido`);
      if ("ordenada" in b && (b.tipo !== "lista" || typeof b.ordenada !== "boolean")) motivos.push(`Plantilla: «ordenada» del bloque ${i} no es válido`);
    });
  }
  if ("lienzo" in p && !mismo(PRESETS_LIENZO.map((x) => x.id), p.lienzo)) motivos.push("Plantilla: el lienzo no es un tamaño del OS");
  if (!("bloques" in p) && !("lienzo" in p)) motivos.push("Plantilla: la variación no cambia nada");
  return motivos;
}

/** Valida sin conocer la familia (la interfaz del registro no recibe la clave). */
export function validarPayloadContenido(payload: unknown): ResultadoPayload {
  const base = validarVariacion(payload);
  if (!base.ok) return { ok: false, motivos: base.motivos };
  if (!esObjeto(payload)) return { ok: false, motivos: ["La variación debe ser un objeto JSON plano"] };
  const esPlantilla = "bloques" in payload || "lienzo" in payload;
  const motivos = [...motivosPrivados(payload), ...(esPlantilla ? motivosPlantilla(payload)
    : motivosCampos([...CAMPOS.mensaje, ...CAMPOS.post, ...DECORACION], payload))];
  return motivos.length ? { ok: false, motivos } : { ok: true, payload: payload as unknown as PayloadContenido };
}

/** Validación estricta al aplicar: la parte de la clave decide el vocabulario. */
function validarPara(familia: FamiliaContenido, parte: ParteContenido, payload: unknown): ResultadoPayload {
  if (!esObjeto(payload)) return { ok: false, motivos: ["La variación debe ser un objeto JSON plano"] };
  const base = validarVariacion(payload);
  const motivos = base.ok ? [] : [...base.motivos];
  motivos.push(...motivosPrivados(payload), ...(parte === "plantilla" ? motivosPlantilla(payload)
    : motivosCampos(parte === "decoracion" ? DECORACION : CAMPOS[familia], payload)));
  return motivos.length ? { ok: false, motivos } : { ok: true, payload: payload as unknown as PayloadContenido };
}

/** `post:<id>#<parte>` o `mensaje:<id>#<parte>`; `null` si falta la parte o la familia no coincide. */
function partesDeClave(clave: string, familia: FamiliaContenido): { id: string; parte: ParteContenido } | null {
  const leida = leerClave(clave);
  if (!leida) return null;
  const [f, resto = ""] = leida.split(":", 2);
  const [id, parte = ""] = resto.split("#", 2);
  if (f !== familia || !id || !(PARTES as readonly string[]).includes(parte)) return null;
  return { id, parte: parte as ParteContenido };
}

function esqueleto(b: BloqueDoc): BloquePlantilla {
  if (b.tipo === "titulo") return { tipo: b.tipo, nivel: b.nivel };
  if (b.tipo === "lista") return { tipo: b.tipo, ordenada: b.ordenada };
  return { tipo: b.tipo };
}

function capturar(familia: FamiliaContenido, clave: string, puerto: PuertoBorrador): PayloadContenido | null {
  const k = partesDeClave(clave, familia);
  const b = k ? puerto.leer(familia) : null;
  if (!k || !b) return null;
  if (k.parte === "plantilla") {
    const bloques = b.doc?.bloques.map(esqueleto) ?? [];
    const lienzo = b.lienzo ? PRESETS_LIENZO.find((p) => p.ancho === b.lienzo?.ancho && p.alto === b.lienzo?.alto)?.id : undefined;
    return bloques.length || lienzo ? { ...(bloques.length ? { bloques } : {}), ...(lienzo ? { lienzo } : {}) } : null;
  }
  const salida: Record<string, unknown> = {};
  for (const campo of k.parte === "decoracion" ? DECORACION : CAMPOS[familia]) if (b.estilo?.[campo] !== undefined) salida[campo] = b.estilo[campo];
  return Object.keys(salida).length ? salida as EstiloContenido : null;
}

function lineasDe(b: BloqueDoc): TramoTexto[][] {
  if (b.tipo === "lista") return b.items;
  if (b.tipo === "tareas") return b.items.map((i) => i.tramos);
  if (b.tipo === "codigo") return [[{ texto: b.texto }]];
  if (b.tipo === "separador") return [[]];
  return [b.tramos];
}

function bloqueDesde(patron: BloquePlantilla, tramos: TramoTexto[]): BloqueDoc {
  switch (patron.tipo) {
    case "titulo": return { tipo: "titulo", nivel: patron.nivel ?? 1, tramos };
    case "lista": return { tipo: "lista", ordenada: patron.ordenada === true, items: [tramos] };
    case "tareas": return { tipo: "tareas", items: [{ hecha: false, tramos }] };
    case "cita": return { tipo: "cita", tramos };
    case "codigo": return { tipo: "codigo", texto: tramos.map((t) => t.texto).join("") };
    case "separador": return { tipo: "separador" };
    default: return { tipo: "parrafo", tramos };
  }
}

/** Cambia la forma de los bloques y CONSERVA todo el texto del borrador. */
function aplicarEstructura(doc: DocRico | null, bloques: BloquePlantilla[]): DocRico | null {
  if (!bloques.length) return doc;
  const lineas = doc ? doc.bloques.flatMap(lineasDe) : [];
  const total = Math.max(lineas.length, bloques.length);
  return { bloques: Array.from({ length: total }, (_, i) => bloqueDesde(bloques[i % bloques.length], lineas[i] ?? [])) };
}

function aplicar(familia: FamiliaContenido, clave: string, payload: PayloadContenido, puerto: PuertoBorrador): { deshacer: () => void } {
  const k = partesDeClave(clave, familia);
  if (!k) throw new Error(`${familia}: la clave no tiene una parte de estilo, plantilla o decoración`);
  const revisado = validarPara(familia, k.parte, payload);
  if (!revisado.ok) throw new Error(`Variación de ${familia} rechazada: ${revisado.motivos.join(" · ")}`);
  const previo = copia(puerto.leer(familia) ?? { estilo: null, doc: null, lienzo: null });
  if (k.parte === "plantilla") {
    const p = revisado.payload as PlantillaContenido;
    const preset = PRESETS_LIENZO.find((x) => x.id === p.lienzo);
    puerto.guardar(familia, { ...previo, doc: aplicarEstructura(previo.doc, p.bloques ?? []), lienzo: preset ? { ancho: preset.ancho, alto: preset.alto } : previo.lienzo });
  } else {
    puerto.guardar(familia, { ...previo, estilo: { ...(previo.estilo ?? {}), ...(revisado.payload as EstiloContenido) } });
  }
  return { deshacer: () => { puerto.guardar(familia, copia(previo)); } };
}

/** Adaptadores de `post:` y `mensaje:`; el anfitrión los registra con `registrarAdaptadoresContenido`. */
export function crearAdaptadoresContenido(puerto: PuertoBorrador): AdaptadorFamilia<PayloadContenido>[] {
  const nombres: Record<FamiliaContenido, string> = { post: "Publicaciones", mensaje: "Mensajes" };
  return (["post", "mensaje"] as const).map((familia) => ({
    familia, nombre: nombres[familia],
    capturar: (clave: string) => capturar(familia, clave, puerto),
    validar: validarPayloadContenido,
    aplicar: (clave: string, payload: PayloadContenido) => aplicar(familia, clave, payload, puerto),
  }));
}

export function registrarAdaptadoresContenido(puerto: PuertoBorrador): void {
  for (const adaptador of crearAdaptadoresContenido(puerto)) registrarFamilia(adaptador);
}
