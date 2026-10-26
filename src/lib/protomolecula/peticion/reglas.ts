/**
 * Petición a la Protomolécula · REGLAS LOCALES sin IA (Ola 1026P · P3).
 * Las peticiones obvias («hazme un cubo 3D girando», «cambia el fondo», «ábrelo en una pizarra», «hazlo en una rama»)
 * se resuelven aquí, gratis y al instante. Cada paso pasa por el MISMO validador estricto que el plan de una IA.
 * Lo que las reglas no entienden se devuelve en `sinResolver` (nunca se adivina). Módulo PURO: sin React ni red.
 */
import type { ContextoProto, EntidadProto, ModoEdicion, OperacionPedida, PeticionProto, TipoEntidadProto } from "./contrato";
import { validarPaso, type OpcionesValidacion } from "./esquema";

const MAPA: Record<string, string> = { á: "a", à: "a", ä: "a", â: "a", é: "e", è: "e", ë: "e", ê: "e", í: "i", ì: "i", ï: "i", î: "i", ó: "o", ò: "o", ö: "o", ô: "o", ú: "u", ù: "u", ü: "u", û: "u", ñ: "n" };
/** Minúsculas y sin tildes, CARÁCTER A CARÁCTER (misma longitud: los índices valen para el texto original). */
export const plano = (t: string): string => t.toLowerCase().replace(/[àáâäèéêëìíîïòóôöùúûüñ]/g, (c) => MAPA[c] ?? c);

const RAMA = /\b(?:en|como|a modo de)\s+(?:una\s+)?rama\b|\brama aparte\b|\bsin tocar (?:el )?original\b|\bno (?:toques|modifiques|cambies) (?:el )?original\b|\bbifurca/;
const DIRECTO = /\b(?:directamente|directo|sobre el original|en el original|en el mismo|sobre este mismo)\b/;

/** Lo que dice el texto sobre cómo editar, junto con lo que eligió la persona en la interfaz (rama manda). */
export function opcionesDePeticion(p: Pick<PeticionProto, "texto" | "modo">): OpcionesValidacion {
  const n = plano(p.texto ?? "");
  if (RAMA.test(n)) return { modo: "rama" };
  return { modo: p.modo, pideDirecto: DIRECTO.test(n) };
}

/** Parte la petición en cláusulas («… y luego ábrelo en una pizarra»). Los índices valen para el original. */
function clausulas(texto: string): string[] {
  const n = plano(texto);
  const sep = /\s*(?:;|,\s*(?=(?:y\s+)?(?:luego|despues|abre|abrelo|abrela|mandalo|pasalo|ponlo)\b)|\s+y\s+(?:luego|despues)\s+|\s+(?:luego|despues)\s+|\s+y\s+(?=(?:abre|abrelo|abrela|mandalo|mandala|pasalo|pasala|ponlo|ponla)\b))\s*/g;
  const trozos: string[] = [];
  let desde = 0, m: RegExpExecArray | null;
  while ((m = sep.exec(n)) !== null) {
    if (m[0].length === 0) { sep.lastIndex++; continue; }
    trozos.push(texto.slice(desde, m.index));
    desde = m.index + m[0].length;
  }
  trozos.push(texto.slice(desde));
  return trozos.map((t) => t.trim()).filter(Boolean);
}

const VERBO_CREAR = /\b(?:haz|hazme|hacer|crea|creame|crear|genera|generame|generar|dame|quiero|necesito|pon|ponme|construye|modela|dibuja|dibujame|pinta|disena)\b/;
const VERBO_IMAGEN = /\b(?:genera|generame|generar|crea|creame|crear|hazme|haz|dibuja|dibujame|pinta|disena|dame|quiero|necesito)\b/;
const NOMBRE_IMAGEN = /\b(?:imagen|imagenes|ilustracion|foto|fotografia|dibujo|cartel|poster|logo|logotipo|banner|portada|miniatura)\b/;
const PRIMITIVA = /\b(?:cubo|esfera|cilindro|cono|toro|donut|piramide|prisma)\b/;
const ANIMADO = /\b(?:gira|girando|giratori[oa]|rota|rotando|rotatori[oa]|anima|animad[oa]|animacion|moviendose|se mueve|movimiento|flota|flotando|late|latiendo|pulsa|pulsando|orbita|orbitando|rebota|rebotando)\b/;
const VERBO_FONDO = /\b(?:cambia|cambiar|cambiale|pon|poner|ponme|ponle|aplica|aplicar|usa|quiero|dame|haz|hazme|actualiza|renueva|mejora|cambialo)\b/;
const VERBO_ABRIR = /\b(?:abre|abrir|abrelo|abrela|abrelos|mandalo|mandala|pasalo|pasala|llevalo|llevala|envialo|muestralo|muestrala|ponlo|ponla)\b/;
const PRONOMBRE_ABRIR = /\b(?:abrelo|abrela|abrelos|mandalo|mandala|pasalo|pasala|llevalo|llevala|envialo|muestralo|muestrala|ponlo|ponla)\b/;
const VERBO_EDITAR = /\b(?:cambia|cambiar|cambiale|edita|editar|modifica|modificar|reescribe|reescribir|actualiza|corrige|traduce|resume|acorta|alarga|renombra|pon|ponle|sustituye|reemplaza|mejora|amplia|ampliar|simplifica|quita|elimina|borra|anade|agrega)\b/;
const VERBO_DICTAR = /^(?:sube|baja|aumenta|reduce|disminuye|pon|ponle|ajusta|activa|desactiva|mueve|cambia|silencia|apaga|enciende)\b/;
const VERBO_INSERTAR = /\b(?:inserta|insertar|incluye|incrusta|adjunta|anade|agrega|mete|comparte|pon|ponla|ponlo|manda|envia)\b/;
const VERBO_PROPONER = /\b(?:propon|proponer|propone|sugiere|sugerir|solicita|pide)\b/;

const TIPOS_ENTIDAD = new Set<string>(["perfil", "grupo", "comunidad", "pagina", "publicacion", "mensaje", "archivo", "pizarra", "escritorio", "widget", "molecula"]);

/** Sobre qué actúa una edición: la selección si es una entidad, si no la entidad de la pantalla. */
export function objetivoDelContexto(ctx: ContextoProto): EntidadProto | null {
  if (ctx.seleccion && TIPOS_ENTIDAD.has(ctx.seleccion.tipo)) {
    const nombre = ctx.entidad && ctx.entidad.tipo === ctx.seleccion.tipo && ctx.entidad.id === ctx.seleccion.id ? ctx.entidad.nombre : undefined;
    return { tipo: ctx.seleccion.tipo as TipoEntidadProto, id: ctx.seleccion.id, ...(nombre ? { nombre } : {}) };
  }
  return ctx.entidad ?? null;
}

function formatoDe(n: string): "1:1" | "4:5" | "9:16" | "16:9" | undefined {
  if (/9:16|\bvertical\b|\bstor(?:y|ies)\b|\breel\b|\btiktok\b/.test(n)) return "9:16";
  if (/16:9|\bhorizontal\b|\bbanner\b|\bpanoram|\byoutube\b/.test(n)) return "16:9";
  if (/4:5/.test(n)) return "4:5";
  if (/1:1|\bcuadrad/.test(n)) return "1:1";
  return undefined;
}

/** Quita «hazme un/una…» del principio para que la descripción sea el objeto, no la orden. */
function sinOrden(o: string): string {
  const r = o.replace(/^\s*(?:por favor,?\s*)?(?:haz(?:me)?|crea(?:me)?|genera(?:me)?|dame|quiero|necesito|constru[iy]e|modela|dibuja(?:me)?|pinta|pon(?:me)?)\s+(?:(?:unas|unos|una|un|el|la)\s+)?/i, "").trim();
  return r || o.trim();
}
const sinModo = (o: string): string => o
  .replace(/(?:,?\s*y\s+)?(?:h[aá]zl[oa]|apl[ií]cal[oa])?\s*(?:\b(?:en|como|a modo de)\s+(?:una\s+)?rama(?:\s+aparte)?\b|\bdirectamente\b)/gi, "")
  .replace(/\s{2,}/g, " ").replace(/[,\s]+$/, "").trim() || o.trim();

/** «Hazlo en una rama» / «directamente» solos: modifican una petición, no son una petición. */
export function esSoloModo(texto: string): boolean {
  const n = plano(texto).replace(/[.!¡¿?,]/g, " ").replace(/\s+/g, " ").trim();
  return /^(?:(?:y|pero|mejor)\s+)?(?:(?:hazlo|hazla|aplicalo|aplicala|ponlo|ponla)\s+)?(?:(?:en|como|a modo de)\s+(?:una\s+)?rama(?:\s+aparte)?|directamente|directo|sin tocar el original)$/.test(n);
}
const citado = (o: string): string | undefined => /["«“]([^"»”]{1,80})["»”]/.exec(o)?.[1];

/** Una cláusula → el paso bruto que le toca, o null si las reglas no la entienden. */
function pasoDeClausula(o: string, ctx: ContextoProto): Record<string, unknown> | null {
  const n = plano(o);
  const ent = objetivoDelContexto(ctx);

  if (VERBO_ABRIR.test(n)) {
    const donde = /\bpizarra\b/.test(n) ? "pizarra" : /\blienzo\b/.test(n) ? "lienzo" : /\bprotomolecula\b|\bmolecula\b/.test(n) ? "protomolecula"
      : /\bxr\b|\bvr\b|realidad (?:virtual|aumentada)/.test(n) ? "xr" : null;
    if (donde) {
      const que = PRONOMBRE_ABRIR.test(n) ? undefined : citado(o);
      return { tipo: "abrir-en", donde, ...(que ? { que } : {}) };
    }
  }
  if (VERBO_PROPONER.test(n) && /\b(?:metagenesis|desarrolladores|al sistema|al os|funcionalidad|funcion nueva)\b/.test(n)) {
    return { tipo: "proponer-metagenesis", que: sinModo(o) };
  }
  const hay3d = /\b3d\b|tridimension/.test(n) || PRIMITIVA.test(n);
  const imagen = NOMBRE_IMAGEN.test(n);
  if (hay3d && VERBO_CREAR.test(n) && (!imagen || /\b(?:objeto|modelo|malla|figura)\b/.test(n))) {
    return { tipo: "crear-objeto-3d", descripcion: sinOrden(o), animado: ANIMADO.test(n) };
  }
  if (imagen && VERBO_IMAGEN.test(n)) {
    const formato = formatoDe(n);
    return { tipo: "generar-imagen", descripcion: sinOrden(o), ...(formato ? { formato } : {}) };
  }
  if (/\bfondo\b/.test(n) && VERBO_FONDO.test(n)) return { tipo: "fondo", descripcion: sinModo(o) };
  if (ctx.entidad && ["mensaje", "publicacion"].includes(ctx.entidad.tipo) && VERBO_INSERTAR.test(n) && /\b(?:molecula|protomolecula|bloque|resultado)\b/.test(n)) {
    return { tipo: "insertar-en", destino: ctx.entidad, que: sinModo(o) };
  }
  const moleculaActiva = ctx.entidad?.tipo === "molecula" || ctx.seleccion?.tipo === "molecula";
  if (moleculaActiva && VERBO_DICTAR.test(n)) return { tipo: "dictar-molecula", orden: o.trim() };
  if (ent && VERBO_EDITAR.test(n)) return { tipo: "editar-entidad", objetivo: ent, cambio: sinModo(o) };
  return null;
}

export interface ResultadoReglas { pasos: OperacionPedida[]; sinResolver: string[] }

/** Aplica las reglas a toda la petición. Cada cláusula resuelta pasa por el validador estricto. */
export function aplicarReglas(texto: string, ctx: ContextoProto, opts?: OpcionesValidacion): ResultadoReglas {
  const pasos: OperacionPedida[] = [];
  const sinResolver: string[] = [];
  const hechas = new Set<string>();
  for (const c of clausulas(texto)) {
    const bruto = pasoDeClausula(c, ctx);
    const v = bruto ? validarPaso(bruto, ctx, opts) : null;
    if (v?.ok) {
      const clave = JSON.stringify(v.paso);
      if (!hechas.has(clave)) { hechas.add(clave); pasos.push(v.paso); }
    } else sinResolver.push(c);
  }
  return { pasos, sinResolver };
}

export type { ModoEdicion };
