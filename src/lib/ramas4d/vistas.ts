import { validarVariacion } from "@/lib/variaciones/validar";
export const CLAVE_VISTAS = "starseed.ramas4d.vistas.v1";
export const VERSION_VISTA = 2;
export const CLAVE_VARIACION_VISTA = "ramas4d:vista";
export type AmbitoVista = "persona" | "grupo";
export type PermisoCompartir = "lectura" | "edicion" | "herencia";
export type FormaVista = "estrella" | "planeta" | "cometa" | "orbita" | "constelacion" | "cristal";
export type TamanoEtiqueta = "compacto" | "normal" | "amplio";
export interface EstiloForma { forma: FormaVista; icono: string; color: string }
export interface Vista4D {
  version: number; id: string; nombre: string; ambito: AmbitoVista; grupoId: string; plantilla: string;
  capas: string[]; perspectiva: string; formas: Record<string, EstiloForma>; actualizada: number;
  colores: { acento: string; aristas: string; fondo: string }; fondo: string; sonidoEspacial: boolean;
  fisica: { gravedad: number; distancia: number; velocidad: number }; etiquetas: { visible: boolean; tamano: TamanoEtiqueta };
}
export interface ConfiguracionCompartida {
  esquema: "ramas4d:vista"; version: number; nombre: string; plantilla: string; capas: string[]; perspectiva: string;
  formas: Record<string, EstiloForma>; colores: Vista4D["colores"]; fisica: Vista4D["fisica"]; fondo: string;
  sonidoEspacial: boolean; etiquetas: Vista4D["etiquetas"]; permiso: PermisoCompartir;
}
const COLOR_TOKEN = /^var\(--[a-z0-9-]+\)(?:\s*,\s*var\(--[a-z0-9-]+\))?$/i;
const FORMAS: FormaVista[] = ["estrella", "planeta", "cometa", "orbita", "constelacion", "cristal"];
const PERMISOS: PermisoCompartir[] = ["lectura", "edicion", "herencia"];
const TAMANOS: TamanoEtiqueta[] = ["compacto", "normal", "amplio"];
const AMBITOS: AmbitoVista[] = ["persona", "grupo"];
const TIPOS = ["neurona", "cerebro", "carpeta", "archivo", "memoria", "agente", "proceso", "proyecto", "ola", "tarea"] as const;
const ICONOS: Record<string, string> = { neurona: "Sparkles", cerebro: "Brain", carpeta: "FolderOpen", archivo: "FileText", memoria: "BookOpen", agente: "Bot", proceso: "Workflow", proyecto: "FolderKanban", ola: "Waves", tarea: "ListTodo" };
const TOKENS = ["var(--primary)", "var(--accent)", "var(--trinity-azure)", "var(--trinity-violet)", "var(--trinity-emerald)", "var(--trinity-amber)"];
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const texto = (v: unknown, alt: string, max = 120): string => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : alt;
const numero = (v: unknown, alt: number, min: number, max: number): number => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : alt };
const colorToken = (v: unknown, alt: string): string => typeof v === "string" && COLOR_TOKEN.test(v.trim()) ? v.trim() : alt;
const lista = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 48)))].slice(0, 24) : [];
const estilo = (v: unknown, tipo: string, alt: string): EstiloForma => {
const x = obj(v); return { forma: FORMAS.find((f) => f === x.forma) ?? "planeta", icono: texto(x.icono ?? x.icon, ICONOS[tipo] ?? "Circle", 48), color: colorToken(x.color, alt) } };
function estilosPorTipo(v: unknown): Record<string, EstiloForma> {
const fuente = obj(v), salida: Record<string, EstiloForma> = {}; TIPOS.forEach((tipo, i) => { salida[tipo] = estilo(fuente[tipo], tipo, TOKENS[i % TOKENS.length]) });
for (const [tipo, valor] of Object.entries(fuente)) if (!salida[tipo]) salida[tipo] = estilo(valor, tipo, "var(--primary)"); return salida;
}
function desdeLegado(x: Record<string, unknown>, ahora: number): Partial<Vista4D> {
const f = obj(x.formas), fis = obj(x.fisica), et = obj(x.etiquetas), formas: Record<string, EstiloForma> = {};
for (const [tipo, valor] of Object.entries(f)) formas[tipo] = typeof valor === "string" ? { forma: "planeta", icono: ICONOS[tipo] ?? "Circle", color: colorToken(valor, "var(--primary)") } : estilo(valor, tipo, "var(--primary)");
  return {
    id: texto(x.id, "vista-principal", 64), nombre: texto(x.nombre, "Mi multiverso", 80),
    ambito: AMBITOS.find((a) => a === x.ambito), grupoId: texto(x.grupoId, "", 64),
    plantilla: texto(x.plantilla, "educacion", 48), capas: lista(x.capas), perspectiva: texto(x.perspectiva, "yo", 48),
    formas, colores: { acento: colorToken(x.colorAcento ?? x.color, "var(--primary)"), aristas: colorToken(x.colorAristas, "var(--trinity-cyan)"), fondo: colorToken(x.colorFondo, "var(--background)") },
    fisica: { gravedad: numero(x.gravedad ?? fis.gravedad, 0.5, 0, 2), distancia: numero(x.distancia ?? fis.distancia, 8, 1, 40), velocidad: numero(x.velocidad ?? fis.velocidad, 1, 0.1, 4) },
    fondo: colorToken(x.fondo, "var(--background)"), sonidoEspacial: typeof x.sonido === "boolean" ? x.sonido : x.sonidoEspacial === true,
    etiquetas: { visible: typeof x.etiquetas === "boolean" ? x.etiquetas : et.visible === true, tamano: TAMANOS.find((t) => t === et.tamano) ?? "normal" },
    actualizada: numero(x.actualizada ?? x.guardada, ahora, 0, Number.MAX_SAFE_INTEGER),
  };
}
export function crearVista(parcial?: Partial<Vista4D>, ahora = 0): Vista4D {
  const ambito = AMBITOS.find((a) => a === parcial?.ambito) ?? "persona";
  return {
    version: VERSION_VISTA, id: texto(parcial?.id, "vista-principal", 64), nombre: texto(parcial?.nombre, "Mi multiverso", 80),
    ambito, grupoId: ambito === "grupo" ? texto(parcial?.grupoId, "grupo", 64) : "",
    plantilla: texto(parcial?.plantilla, "educacion", 48), capas: lista(parcial?.capas), perspectiva: texto(parcial?.perspectiva, "yo", 48),
    formas: estilosPorTipo(parcial?.formas),
    colores: { acento: colorToken(parcial?.colores?.acento, "var(--primary)"), aristas: colorToken(parcial?.colores?.aristas, "var(--trinity-cyan)"), fondo: colorToken(parcial?.colores?.fondo, "var(--background)") },
    fisica: { gravedad: numero(parcial?.fisica?.gravedad, 0.5, 0, 2), distancia: numero(parcial?.fisica?.distancia, 8, 1, 40), velocidad: numero(parcial?.fisica?.velocidad, 1, 0.1, 4) },
    fondo: colorToken(parcial?.fondo, "var(--background)"), sonidoEspacial: parcial?.sonidoEspacial === true,
    etiquetas: { visible: parcial?.etiquetas?.visible !== false, tamano: TAMANOS.find((t) => t === parcial?.etiquetas?.tamano) ?? "normal" },
    actualizada: numero(parcial?.actualizada, ahora, 0, Number.MAX_SAFE_INTEGER),
  };
}
export function migrarVista(crudo: unknown, ahora = 0): Vista4D | null {
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return null;
  const x = crudo as Record<string, unknown>, version = typeof x.version === "number" ? Math.trunc(x.version) : 0;
  if (version < 0 || version > VERSION_VISTA) return null;
  return crearVista(version === VERSION_VISTA ? x as Partial<Vista4D> : desdeLegado(x, ahora), ahora);
}
export function codificarVistas(vistas: Vista4D[]): string {
  return JSON.stringify({ version: VERSION_VISTA, vistas });
}
export function decodificarVistas(crudo: string | null, ahora = 0): Vista4D[] {
  if (!crudo) return [];
  try {
    const dato: unknown = JSON.parse(crudo), objeto = obj(dato);
    const entradas = Array.isArray(objeto.vistas) ? objeto.vistas : Array.isArray(dato) ? dato : [];
    const vistas: Vista4D[] = [], indices = new Map<string, number>();
    for (const entrada of entradas) {
      const vista = migrarVista(entrada, ahora);
      if (!vista) continue;
      const previo = indices.get(vista.id);
      if (previo === undefined) { indices.set(vista.id, vistas.length); vistas.push(vista) }
      else vistas[previo] = vista;
    }
    return vistas;
  } catch { return [] }
}
export function configuracionCompartible(vista: Vista4D, permiso: PermisoCompartir): ConfiguracionCompartida {
  const formas: Record<string, EstiloForma> = {};
  for (const [tipo, forma] of Object.entries(vista.formas)) formas[tipo] = { ...forma };
return { esquema: "ramas4d:vista", version: VERSION_VISTA, nombre: vista.nombre, plantilla: vista.plantilla,
capas: [...vista.capas], perspectiva: vista.perspectiva, formas, colores: { ...vista.colores }, fisica: { ...vista.fisica },
fondo: vista.fondo, sonidoEspacial: vista.sonidoEspacial, etiquetas: { ...vista.etiquetas }, permiso: PERMISOS.find((p) => p === permiso) ?? "lectura" };
}
const PRIVADAS = ["id", "dueno", "grupoId", "ref", "contenido", "cuerpo", "textoPrivado", "secret", "password", "token", "apiKey", "url"];
function clavesProhibidas(v: unknown, ruta: string, encontradas: string[]): void {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) { v.forEach((x, i) => clavesProhibidas(x, `${ruta}[${i}]`, encontradas)); return }
  for (const [clave, valor] of Object.entries(v as Record<string, unknown>)) {
    if (PRIVADAS.includes(clave)) encontradas.push(`${ruta}.${clave}`);
    clavesProhibidas(valor, `${ruta}.${clave}`, encontradas);
  }
}
export function motivosCompartir(configuracion: ConfiguracionCompartida): string[] {
  const motivos: string[] = [];
  if (configuracion.version !== VERSION_VISTA) motivos.push("Versión: solo se comparten vistas de la versión actual");
  if (!PERMISOS.includes(configuracion.permiso)) motivos.push("Permiso: elige lectura, edición o herencia");
  if (!configuracion.nombre.trim()) motivos.push("Nombre: la vista compartida necesita un nombre");
  const validacion = validarVariacion(configuracion);
  if (!validacion.ok) motivos.push(...validacion.motivos);
  const prohibidas: string[] = [];
  clavesProhibidas(configuracion, "configuracion", prohibidas);
  for (const ruta of prohibidas) motivos.push(`Privacidad: «${ruta}» no puede viajar en una vista compartida`);
  return motivos;
}
