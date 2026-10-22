// Familias «escritorio», «dock» y «app» de las variaciones públicas (architecture/variaciones-publicas.md §5). Módulo PURO: puertos inyectados, sin disco, DOM ni red; nunca viajan nombres de archivos ni URLs privadas.
import { validarVariacion } from "../validar";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import type { DockColor, DockIconKey, DockItemConfig } from "@/components/layout/dock-config";
export type ParcheDock = { id: string; label?: string; iconKey?: DockIconKey; color?: DockColor; enabled?: boolean };
export type ParcheApp = { id: string; accent?: string; short?: string };
export type PosicionIcono = { ref: string; x: number; y: number; page?: number };
export type ParcheEscritorio = { iconos: PosicionIcono[] };
export type IconoEscritorio = PosicionIcono & { id: string };
export type Movimiento = { id: string; x: number; y: number; page?: number };
export type PuertoDock = { leer(): DockItemConfig[]; guardar(items: DockItemConfig[]): void };
export type RegistroApps = Record<string, { accent?: string; short?: string }>;
export type PuertoApps = { existe(id: string): boolean; leer(): RegistroApps; guardar(r: RegistroApps): void };
export type PuertoEscritorio = { leer(): IconoEscritorio[]; mover(c: Movimiento[]): void };
const COLORES = ["neutral", "cyan", "crimson", "amber", "emerald", "purple"] as const;
const ACENTOS = new Set<string>([...COLORES, "violet", "azure"]);
const esId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(v);
const esTexto = (v: unknown, max = 60): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sobran = (o: Record<string, unknown>, ok: readonly string[]) => Object.keys(o).filter((k) => !ok.includes(k));
const idDe = (f: string, c: string) => { const [x, id] = c.split(":"); return x === f && id ? id : null; };
const fallo = (motivos: string[]) => ({ ok: false as const, motivos });
/** Valida un parche plano: id, sin campos ajenos ni datos privados, y con algún cambio. */
function validarPlano(familia: string, campos: Record<string, (v: unknown) => string | null>, p: unknown) {
  const v = validarVariacion(p); if (!v.ok) return fallo(v.motivos);
  if (!esObjeto(p)) return fallo([`${familia}: el payload debe ser un objeto`]);
  const m = sobran(p, ["id", ...Object.keys(campos)]).map((k) => `${familia}: «${k}» no es un campo de esta variación`);
  if (!esId(p.id)) m.push(`${familia}: el id no es válido`);
  let cambia = false;
  for (const [k, revisar] of Object.entries(campos)) {
    if (!(k in p)) continue;
    cambia = true; const error = revisar(p[k]); if (error) m.push(`${familia}: ${error}`);
  }
  if (!cambia) m.push(`${familia}: la variación no cambia nada`);
  return m.length ? fallo(m) : { ok: true as const, parche: p as never };
}
export const validarParcheDock = (p: unknown) => validarPlano("Dock", {
  label: (v) => (esTexto(v) ? null : "la etiqueta debe ser texto breve"),
  iconKey: (v) => (typeof v === "string" && /^[A-Z][A-Za-z]{2,30}$/.test(v) ? null : "el icono no es válido"),
  color: (v) => ((COLORES as readonly unknown[]).includes(v) ? null : "el color no es un token del OS"),
  enabled: (v) => (typeof v === "boolean" ? null : "«enabled» debe ser booleano"),
}, p);
export const validarParcheApp = (p: unknown) => validarPlano("App", {
  accent: (v) => (ACENTOS.has(v as string) ? null : "el acento debe ser un token del OS"),
  short: (v) => (esTexto(v, 24) ? null : "la etiqueta corta debe ser texto breve"),
}, p);
export function validarParcheEscritorio(p: unknown) {
  const v = validarVariacion(p); if (!v.ok) return fallo(v.motivos);
  if (!esObjeto(p) || !Array.isArray(p.iconos)) return fallo(["Escritorio: el payload debe traer «iconos»"]);
  const m = sobran(p, ["iconos"]).map((k) => `Escritorio: «${k}» no es un campo de una disposición`);
  if (p.iconos.length === 0 || p.iconos.length > 64) m.push("Escritorio: entre 1 y 64 iconos");
  p.iconos.forEach((o, i) => {
    if (!esObjeto(o)) { m.push(`Escritorio: el icono ${i} no es un objeto`); return; }
    const extra = sobran(o, ["ref", "x", "y", "page"]);
    if (extra.length) m.push(`Escritorio: el icono ${i} lleva datos privados (${extra.join(", ")})`);
    if (!esId(o.ref)) m.push(`Escritorio: la referencia ${i} no es válida`);
    if (typeof o.x !== "number" || !(o.x >= 0 && o.x <= 1)) m.push(`Escritorio: la x ${i} debe ir de 0 a 1`);
    if (typeof o.y !== "number" || !(o.y >= 0 && o.y <= 1)) m.push(`Escritorio: la y ${i} debe ir de 0 a 1`);
    if ("page" in o && !(Number.isInteger(o.page) && (o.page as number) >= 0 && (o.page as number) < 12)) m.push(`Escritorio: la página ${i} no es válida`);
  });
  return m.length ? fallo(m) : { ok: true as const, parche: p as unknown as ParcheEscritorio };
}
type Validador<P> = (p: unknown) => { ok: true; parche: P } | { ok: false; motivos: string[] };
function adaptador<P>(familia: string, validar: Validador<P>, capturar: (c: string) => P | null, aplicar: (c: string, p: P) => () => void): AdaptadorFamilia<P> {
  return { familia, nombre: familia, capturar, validar: (p) => { const r = validar(p); return r.ok ? { ok: true, payload: r.parche } : { ok: false, motivos: r.motivos }; }, aplicar: (c, p) => ({ deshacer: aplicar(c, p) }) };
}
function aplicarDock(puerto: PuertoDock, clave: string, payload: ParcheDock): () => void {
  const r = validarParcheDock(payload);
  if (!r.ok) throw new Error(`Variación del dock rechazada: ${r.motivos.join(" · ")}`);
  if (idDe("dock", clave) !== payload.id) throw new Error("Dock: la clave no coincide con el parche");
  const previos = puerto.leer();
  if (!previos.some((i) => i.id === payload.id)) throw new Error("Dock: el elemento no existe en este dock");
  puerto.guardar(previos.map((i) => (i.id === payload.id ? { ...i, ...payload } : i)));
  return () => puerto.guardar(previos);
}
function capturarDock(puerto: PuertoDock, clave: string): ParcheDock | null {
  const it = puerto.leer().find((i) => i.id === idDe("dock", clave));
  return it ? { id: it.id, label: it.label, iconKey: it.iconKey, color: it.color, enabled: it.enabled } : null;
}
function aplicarApp(puerto: PuertoApps, clave: string, payload: ParcheApp): () => void {
  const r = validarParcheApp(payload);
  if (!r.ok) throw new Error(`Variación de app rechazada: ${r.motivos.join(" · ")}`);
  if (idDe("app", clave) !== payload.id) throw new Error("App: la clave no coincide con el parche");
  if (!puerto.existe(payload.id)) throw new Error("App: la app no existe en el catálogo");
  const previos = puerto.leer();
  const cambios = { ...(payload.accent !== undefined ? { accent: payload.accent } : {}), ...(payload.short !== undefined ? { short: payload.short } : {}) };
  puerto.guardar({ ...previos, [payload.id]: { ...previos[payload.id], ...cambios } });
  return () => puerto.guardar(previos);
}
function capturarApp(puerto: PuertoApps, clave: string): ParcheApp | null {
  const id = idDe("app", clave); const actual = id ? puerto.leer()[id] : undefined;
  return actual ? { id: id as string, accent: actual.accent, short: actual.short } : null;
}
function aplicarEscritorio(puerto: PuertoEscritorio, clave: string, payload: ParcheEscritorio): () => void {
  const r = validarParcheEscritorio(payload);
  if (!r.ok) throw new Error(`Disposición de escritorio rechazada: ${r.motivos.join(" · ")}`);
  if (idDe("escritorio", clave) !== "iconos") throw new Error("Escritorio: la clave no es la disposición de iconos");
  const actuales = puerto.leer(); const previos: Movimiento[] = []; const cambios: Movimiento[] = [];
  for (const pos of payload.iconos) {
    const icono = actuales.find((i) => i.ref === pos.ref && !cambios.some((c) => c.id === i.id));
    if (!icono) continue;
    previos.push({ id: icono.id, x: icono.x, y: icono.y, ...(icono.page !== undefined ? { page: icono.page } : {}) });
    cambios.push({ id: icono.id, x: pos.x, y: pos.y, ...(pos.page !== undefined ? { page: pos.page } : {}) });
  }
  if (!cambios.length) throw new Error("Escritorio: ninguna referencia de la disposición existe aquí");
  puerto.mover(cambios);
  return () => puerto.mover(previos);
}
function capturarEscritorio(puerto: PuertoEscritorio, clave: string): ParcheEscritorio | null {
  if (idDe("escritorio", clave) !== "iconos") return null;
  const iconos = puerto.leer().filter((i) => esId(i.ref)).slice(0, 64)
    .map((i) => ({ ref: i.ref, x: i.x, y: i.y, ...(i.page ? { page: i.page } : {}) }));
  return iconos.length ? { iconos } : null;
}
export const crearAdaptadorDock = (puerto: PuertoDock): AdaptadorFamilia<ParcheDock> => adaptador("dock", validarParcheDock, (c) => capturarDock(puerto, c), (c, p) => aplicarDock(puerto, c, p));
export const crearAdaptadorApp = (puerto: PuertoApps): AdaptadorFamilia<ParcheApp> => adaptador("app", validarParcheApp, (c) => capturarApp(puerto, c), (c, p) => aplicarApp(puerto, c, p));
export const crearAdaptadorEscritorio = (puerto: PuertoEscritorio): AdaptadorFamilia<ParcheEscritorio> => adaptador("escritorio", validarParcheEscritorio, (c) => capturarEscritorio(puerto, c), (c, p) => aplicarEscritorio(puerto, c, p));
/** Registra las tres familias del escritorio, el dock y las apps en el clic derecho. */
export function registrarAdaptadoresEscritorio(puertos: { dock: PuertoDock; apps: PuertoApps; escritorio: PuertoEscritorio }): void { registrarFamilia(crearAdaptadorDock(puertos.dock)); registrarFamilia(crearAdaptadorApp(puertos.apps)); registrarFamilia(crearAdaptadorEscritorio(puertos.escritorio)); }
