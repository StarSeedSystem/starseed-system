/**
 * Bots/dots de Astraura · ACCIONES sobre el OS (BOT1011). Contrato: architecture/astraura-bots.md §6.
 *
 * Vocabulario CERRADO con el que un bot cambia el OS. Es la frontera de desconfianza: un modelo
 * puede alucinar cualquier cosa; solo entra lo que esté aquí y pase `validarAccion`. Nada se
 * ejecuta en el núcleo: el código es siempre un CANDIDATO (`codigo.proponer`) y lo único que
 * «ejecuta» un bot corre en SU computadora aislada (`computadora.ejecutar`). Cada acción declara
 * cómo se deshace. PURO: sin React, sin red, sin `node:*`, sin reloj.
 */
import { pareceCodigo } from "@/lib/nucleo/ui-spec";
import { CLAVES_PROHIBIDAS } from "@/lib/nucleo/paquete-sistema";
import type { Sentido } from "./tipos";

export const TIPOS_ACCION = [
    "navegar", "abrir-app", "capa-pantalla", "widget.añadir", "widget.mover", "widget.quitar",
    "pizarra.operar", "dashboard.editar", "escritorio.organizar", "pagina.editar", "ajuste.proponer",
    "ui.proponer", "protomolecula.operar", "xr.intencion", "codigo.proponer", "computadora.ejecutar",
    "mensaje.enviar", "publicacion.borrador", "tarea.crear", "memoria.recordar", "notificar",
    "imagen.generar",
    "robot.caminar", "robot.girar", "robot.emocion", "robot.bailar", "robot.negacion", "robot.alto",
] as const;
export type TipoAccion = (typeof TIPOS_ACCION)[number];

type Campo = "texto" | "codigo" | "ruta" | "id" | "numero" | "json" | "bool";
export type Riesgo = "bajo" | "medio" | "alto";
/** `inverso`: otra acción lo repone · `retirar`: se retira lo enviado · `no`: irreversible · `nada`: no deja huella. */
export type Deshacer = "inverso" | "retirar" | "no" | "nada";

export interface MetaAccion {
  riesgo: Riesgo;
  /** Cambia algo que perdura (y que, en un bot de entidad, es de todos). */
  persistente: boolean;
  /** Un invitado (externo o AG-UI) puede pedirla. */
  invitado: boolean;
  sentido?: Sentido;
  deshacer: Deshacer;
  campos: Record<string, Campo>;
  obligatorios: readonly string[];
  /** A qué módulo existente se traduce (el adaptador la lleva allí). */
  via: string;
}

const m = (
  riesgo: Riesgo, persistente: boolean, invitado: boolean, deshacer: Deshacer, via: string,
  campos: Record<string, Campo>, obligatorios: string[], sentido?: Sentido,
): MetaAccion => ({ riesgo, persistente, invitado, deshacer, via, campos, obligatorios, sentido });

export const META_ACCION: Record<TipoAccion, MetaAccion> = {
  navegar: m("bajo", false, true, "inverso", "aurora/actions#navegar", { ruta: "ruta" }, ["ruta"]),
  "abrir-app": m("bajo", false, true, "retirar", "app-catalog", { app: "id", modo: "id" }, ["app"]),
  "capa-pantalla": m("bajo", false, true, "retirar", "screen-overlay", { forma: "id", objetivo: "id", texto: "texto", uiSpec: "json" }, ["forma"], "pantalla"),
  "widget.añadir": m("medio", true, false, "inverso", "aurora/actions#agregar_widget", { tablero: "id", tipo: "id", ajustes: "json" }, ["tablero", "tipo"]),
  "widget.mover": m("bajo", true, false, "inverso", "dashboard", { id: "id", x: "numero", y: "numero", w: "numero", h: "numero" }, ["id", "x", "y"]),
  "widget.quitar": m("medio", true, false, "inverso", "dashboard", { id: "id" }, ["id"]),
  "pizarra.operar": m("medio", true, false, "inverso", "salas/sincronia-sala", { pizarra: "id", operaciones: "json" }, ["pizarra", "operaciones"]),
  "dashboard.editar": m("medio", true, false, "inverso", "dashboards-sync", { tablero: "id", cambios: "json" }, ["tablero", "cambios"]),
  "escritorio.organizar": m("bajo", true, false, "inverso", "desktop", { escritorio: "id", disposicion: "json" }, ["escritorio", "disposicion"]),
  "pagina.editar": m("alto", true, false, "inverso", "genesis/operaciones", { pagina: "id", cambios: "json" }, ["pagina", "cambios"]),
  "ajuste.proponer": m("medio", true, false, "inverso", "astraura/ui-acciones", { campo: "id", valor: "json" }, ["campo", "valor"]),
  "ui.proponer": m("medio", true, false, "inverso", "nucleo/ui-spec", { uiSpec: "json", motivo: "texto" }, ["uiSpec"]),
  "protomolecula.operar": m("medio", true, false, "inverso", "protomolecula §5.1", { molecula: "id", accion: "id", args: "json" }, ["accion"]),
  "xr.intencion": m("medio", false, true, "nada", "xr/intenciones-voz", { frase: "texto" }, ["frase"]),
  "codigo.proponer": m("bajo", false, true, "nada", "candidato", { destino: "texto", lenguaje: "id", codigo: "codigo", motivo: "texto" }, ["destino", "codigo"]),
  "computadora.ejecutar": m("medio", false, false, "no", "computadora del bot", { orden: "codigo", motivo: "texto" }, ["orden"]),
  "mensaje.enviar": m("alto", true, false, "retirar", "mensajeria", { canal: "id", texto: "texto" }, ["canal", "texto"], "red"),
  "publicacion.borrador": m("medio", true, true, "inverso", "lienzo universal", { destino: "id", texto: "texto", bloques: "json" }, ["texto"]),
  "tarea.crear": m("medio", true, false, "inverso", "genesis/poligenesis", { titulo: "texto", criterios: "json", director: "id", origen: "id" }, ["titulo", "criterios"]),
  "memoria.recordar": m("bajo", true, false, "inverso", "brains/memory", { alcance: "id", texto: "texto" }, ["alcance", "texto"]),
   notificar: m("bajo", false, true, "retirar", "notificaciones", { texto: "texto", a: "id" }, ["texto"]),
    "imagen.generar": m("bajo", false, false, "nada", "aurora/actions#generar_imagen", { prompt: "texto", opciones: "numero", necesita: "texto", referencia: "texto", comercial: "bool" }, ["prompt"]),
    "robot.caminar": m("medio", true, false, "inverso", "robot-pato#caminar", {}, []),
    "robot.girar": m("medio", true, false, "inverso", "robot-pato#girar", {}, []),
    "robot.emocion": m("medio", true, false, "inverso", "robot-pato#emocion", {}, []),
    "robot.bailar": m("medio", true, false, "inverso", "robot-pato#bailar", {}, []),
    "robot.negacion": m("medio", true, false, "inverso", "robot-pato#negacion", {}, []),
    "robot.alto": m("bajo", true, false, "nada", "robot-pato#alto", {}, []),
};

export interface AccionBot {
  tipo: TipoAccion;
  args: Record<string, string | number | boolean | object>;
}

/** Rutas del núcleo intocable: ningún candidato de código las tiene por destino. */
export const NUCLEO_INTOCABLE = [
  "src/lib/nucleo/", "src/lib/astraura-bots/permisos", "src/lib/sharing/access", "supabase/migrations/",
  "middleware.ts", ".env", ".github/",
] as const;

export const MAX_TEXTO = 2000;
export const MAX_CODIGO = 20_000;
export const MAX_JSON = 20_000;
const PATRON_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const PATRON_RUTA = /^\/(?!\/)[A-Za-z0-9\-_/.?=&%]*$/;
/** Patrones de secreto reales (los de «token»/«password» sueltos sobran en un mensaje humano). */
const SECRETOS = CLAVES_PROHIBIDAS.filter((r) => !r.test("token api key password"));

export const tieneSecreto = (s: string): boolean => SECRETOS.some((r) => r.test(s));
export const tocaNucleo = (destino: string): boolean =>
  NUCLEO_INTOCABLE.some((p) => destino.replace(/^\.?\//, "").startsWith(p));

function validarCampo(tipo: Campo, v: unknown): { ok: true; v: string | number | boolean | object } | { ok: false; por: string } {
  switch (tipo) {
    case "texto": case "codigo": {
      if (typeof v !== "string" || !v.trim()) return { ok: false, por: "debe ser texto no vacío" };
      const max = tipo === "codigo" ? MAX_CODIGO : MAX_TEXTO;
      if (v.length > max) return { ok: false, por: `supera ${max} caracteres` };
      if (tipo === "texto" && pareceCodigo(v)) return { ok: false, por: "parece código (solo cabe en un candidato)" };
      return { ok: true, v: v.trim() };
    }
    case "ruta":
      return typeof v === "string" && PATRON_RUTA.test(v) && !v.includes("..")
        ? { ok: true, v } : { ok: false, por: "no es una ruta interna del OS" };
    case "id":
      return typeof v === "string" && PATRON_ID.test(v) ? { ok: true, v } : { ok: false, por: "no es un identificador válido" };
    case "numero":
      return typeof v === "number" && Number.isFinite(v) ? { ok: true, v } : { ok: false, por: "no es un número" };
    case "bool":
      return typeof v === "boolean" ? { ok: true, v } : { ok: false, por: "no es sí/no" };
    case "json": {
      if (typeof v !== "object" || v === null) return { ok: false, por: "debe ser un objeto o una lista" };
      const s = JSON.stringify(v);
      if (s.length > MAX_JSON) return { ok: false, por: `supera ${MAX_JSON} caracteres` };
      if (pareceCodigo(s)) return { ok: false, por: "lleva código incrustado" };
      return { ok: true, v };
    }
  }
}

/** Valida con desconfianza. Campo desconocido → se descarta (y se dice). Nunca lanza. */
export function validarAccion(bruto: unknown): { accion: AccionBot | null; problemas: string[] } {
  const problemas: string[] = [];
  if (typeof bruto !== "object" || bruto === null) return { accion: null, problemas: ["La acción no es un objeto."] };
  const { tipo, args } = bruto as { tipo?: unknown; args?: unknown };
  if (typeof tipo !== "string" || !(TIPOS_ACCION as readonly string[]).includes(tipo)) {
    return { accion: null, problemas: [`Acción desconocida: ${String(tipo)}.`] };
  }
  const meta = META_ACCION[tipo as TipoAccion];
  const entrada = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  const limpio: AccionBot["args"] = {};
  for (const [k, v] of Object.entries(entrada)) {
    const campo = meta.campos[k];
    if (!campo) { problemas.push(`Campo «${k}» descartado: no es de ${tipo}.`); continue; }
    const r = validarCampo(campo, v);
    if (!r.ok) { problemas.push(`Campo «${k}» ${r.por}.`); continue; }
    limpio[k] = r.v;
  }
  for (const o of meta.obligatorios) if (!(o in limpio)) problemas.push(`Falta «${o}».`);
  if (tieneSecreto(JSON.stringify(limpio))) problemas.push("Lleva algo con forma de clave o de ruta del disco.");
  if (tipo === "codigo.proponer" && typeof limpio.destino === "string" && tocaNucleo(limpio.destino)) {
    problemas.push("El destino es del núcleo intocable: editable sí, ejecutable no.");
  }
  const fatal = problemas.some((p) => !p.includes("descartado"));
  return { accion: fatal ? null : { tipo: tipo as TipoAccion, args: limpio }, problemas };
}

/** Lo que había antes, para construir el deshacer (lo da quien aplica). */
export interface Previo { ruta?: string; widget?: object; valor?: object; idCreado?: string; idEnviado?: string }

export type ResultadoDeshacer = { accion: AccionBot } | { retirar: string } | { irreversible: string } | { nada: true };

/** Cómo se deshace una acción ya aplicada. Nunca inventa: sin el `previo` necesario, lo dice. */
export function deshacer(a: AccionBot, previo: Previo): ResultadoDeshacer {
  const meta = META_ACCION[a.tipo];
  if (meta.deshacer === "nada") return { nada: true };
  if (meta.deshacer === "no") return { irreversible: "Lo hecho en la computadora del bot no se deshace: se restaura su copia." };
  if (meta.deshacer === "retirar") {
    return previo.idEnviado ? { retirar: previo.idEnviado } : { irreversible: "No consta qué se envió." };
  }
  switch (a.tipo) {
    case "navegar": return previo.ruta ? { accion: { tipo: "navegar", args: { ruta: previo.ruta } } } : { nada: true };
    case "widget.añadir": return previo.idCreado ? { accion: { tipo: "widget.quitar", args: { id: previo.idCreado } } } : { irreversible: "No consta el widget creado." };
    case "widget.quitar": return previo.widget ? { accion: { tipo: "widget.añadir", args: { ...(previo.widget as Record<string, string>) } } } : { irreversible: "Falta la copia del widget." };
    default:
      return previo.valor ? { accion: { tipo: a.tipo, args: { ...a.args, ...(previo.valor as Record<string, string>) } } } : { irreversible: "Falta el estado anterior." };
  }
}
