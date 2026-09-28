/**
 * App en vivo «Dashboard compartido» (2026-09-28) — contrato para el catálogo de apps en vivo.
 *
 * Un dashboard compartido es un espacio `os_spaces` (dueño, invitados con rol, lectura pública)
 * con el ACOMODO de widgets dentro de `doc.dashboard`, en el mismo formato de rejilla del
 * dashboard personal (`DashboardWidget`: tipo, x/y/w/h, talla, ajustes). Se abre en
 * `/dashboard-compartido/<id>` y pinta los MISMOS widgets con `GridArea`.
 *
 * Qué se comparte y qué no (y la interfaz lo dice): se comparte el ACOMODO y la CONFIGURACIÓN de
 * cada widget (qué widgets hay, dónde, de qué tamaño, con qué estilo). Los DATOS de dentro de cada
 * widget (tus notas, tus tareas, tu ubicación, tu cuenta) siguen siendo de quien mira: cada
 * persona ve el widget con sus propios datos.
 *
 * Fusión por WIDGET y por registro: cada widget guarda su posición, su talla, su configuración y
 * su borrado como registros con reloj (ver `./tabla/fusion`: gana el más reciente, con desempate
 * determinista). Dos personas que mueven widgets distintos conservan ambos movimientos; si mueven
 * el MISMO widget a la vez, gana la última escritura. Borrar deja una lápida (no resucita solo).
 *
 * Seguridad: NADIE ejecuta código de nadie. Los widgets forjados por IA (`AI_GENERATED`, que
 * llevan HTML propio) no entran en un dashboard compartido, se descartan al leer y las
 * configuraciones se sanean (sin `customHtml`, sin URLs `javascript:`/`data:text/html`, acotadas).
 *
 *   crear:      crearVivoDashboard(titulo)  → { refId, ruta }
 *   listarMios: listarMiosDashboard()
 *   entrada:    INFO_VIVO_DASHBOARD
 */
import type { DashboardWidget, WidgetType } from "@/components/dashboard/dashboard-types";
import { ganaReg, mismoReg } from "./tabla/fusion";
import { autorCorto, reg, type Ctx, type Reg } from "./tabla/modelo";
import { MotorColab, type DepsMotor } from "./tabla/motor-colab";
import {
    crearEspacioVivo,
    guardarEspacioCAS,
    leerEspacio,
    listarEspaciosVivos,
    miUid,
    puedoEditarEspacio,
    suscribirEspacio,
    type ResumenEspacio,
} from "./tabla/espacio";

export const INFO_VIVO_DASHBOARD = {
    etiqueta: "Dashboard compartido",
    descripcion: "Un tablero de widgets que se organiza entre varias personas, en vivo.",
    icono: "LayoutDashboard",
    color: "#007FFF",
} as const;

export function rutaDashboard(id: string): string {
    return `/dashboard-compartido/${encodeURIComponent(id)}`;
}

// ───────────────────────────── modelo ─────────────────────────────

export const FORMATO_DASHBOARD = 1;

export const LIMITES_DASHBOARD = {
    /** Widgets vivos a la vez. */
    widgets: 60,
    /** Entradas totales (vivas + lápidas) que se aceptan al leer un documento. */
    entradas: 240,
    /** Tamaño máximo de la configuración de un widget, en caracteres JSON. */
    bytesAjustes: 6000,
    columnas: 12,
    filas: 200,
} as const;

const DIA = 86_400_000;
const LAPIDAS_MS = 60 * DIA;

export interface CajaWidget {
    x: number;
    y: number;
    w: number;
    h: number;
}
export type TallaWidget = "S" | "M" | "L" | "XL";
export type AjustesWidget = Record<string, unknown>;

export interface WidgetCompartido {
    id: string;
    /** Tipo de widget (inmutable). */
    tipo: string;
    /** Marca de creación en ms (inmutable). */
    creado: number;
    pos: Reg<CajaWidget>;
    tam: Reg<TallaWidget | null>;
    cfg: Reg<AjustesWidget>;
    borrado?: Reg<boolean>;
}

export interface DocDashboard {
    v: number;
    widgets: Record<string, WidgetCompartido>;
}

export function dashboardVacio(): DocDashboard {
    return { v: FORMATO_DASHBOARD, widgets: {} };
}

/** ¿Este doc de `os_spaces` es un dashboard compartido? */
export function esDocDashboard(doc: Record<string, unknown> | null | undefined): boolean {
    return !!doc && doc.vivo === "dashboard";
}

export function docDashboard(d: DocDashboard): Record<string, unknown> {
    return { vivo: "dashboard", v: FORMATO_DASHBOARD, dashboard: d };
}

// ───────────────────────────── saneamiento ─────────────────────────────

const RE_ID_WIDGET = /^[A-Za-z0-9_-]{6,64}$/;
const RE_TIPO = /^[A-Z][A-Z0-9_]{1,40}$/;
/** Widgets cuyo contenido es código de su autor: nunca se comparten. */
const TIPOS_EXCLUIDOS: ReadonlySet<string> = new Set(["AI_GENERATED"]);
const CLAVES_PROHIBIDAS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype", "customHtml", "srcDoc", "srcdoc"]);
const RE_ESPACIOS = new RegExp("[\\u0000-\\u0020\\u00a0\\u2028\\u2029]", "g");
const RE_PELIGRO = /^(?:javascript|vbscript|data:text\/html|data:application\/xhtml)/i;
const TALLAS: readonly string[] = ["S", "M", "L", "XL"];

export function tipoCompartible(tipo: unknown): tipo is string {
    return typeof tipo === "string" && RE_TIPO.test(tipo) && !TIPOS_EXCLUIDOS.has(tipo);
}

function limpiarValor(v: unknown, profundidad: number, presupuesto: { n: number }): unknown {
    if (presupuesto.n-- <= 0) return undefined;
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
    if (typeof v === "string") {
        // los navegadores ignoran tabuladores y saltos dentro de un esquema («java\tscript:»)
        const compacto = v.replace(RE_ESPACIOS, "");
        return RE_PELIGRO.test(compacto) ? undefined : v.slice(0, 2000);
    }
    if (profundidad >= 6) return undefined;
    if (Array.isArray(v)) {
        const salida: unknown[] = [];
        for (const x of v.slice(0, 50)) {
            const l = limpiarValor(x, profundidad + 1, presupuesto);
            if (l !== undefined) salida.push(l);
        }
        return salida;
    }
    if (typeof v === "object") {
        const salida: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 60)) {
            if (CLAVES_PROHIBIDAS.has(k) || k.length > 60) continue;
            const l = limpiarValor(val, profundidad + 1, presupuesto);
            if (l !== undefined) salida[k] = l;
        }
        return salida;
    }
    return undefined;
}

/** Deja la configuración de un widget lista para compartirse: datos planos, acotados y sin código. */
export function sanearAjustes(entrada: unknown): AjustesWidget {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return {};
    const limpio = limpiarValor(entrada, 0, { n: 600 });
    if (!limpio || typeof limpio !== "object" || Array.isArray(limpio)) return {};
    try {
        if (JSON.stringify(limpio).length > LIMITES_DASHBOARD.bytesAjustes) return {};
    } catch {
        return {};
    }
    return limpio as AjustesWidget;
}

function entero(n: unknown, min: number, max: number, def: number): number {
    if (typeof n !== "number" || !Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.round(n)));
}

export function sanearCaja(c: unknown): CajaWidget {
    const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const w = entero(o.w, 1, LIMITES_DASHBOARD.columnas, 4);
    const h = entero(o.h, 1, 40, 4);
    const x = entero(o.x, 0, LIMITES_DASHBOARD.columnas - w, 0);
    const y = entero(o.y, 0, LIMITES_DASHBOARD.filas, 0);
    return { x, y, w, h };
}

function leerReg<T>(raw: unknown, valida: (v: unknown) => T | undefined): Reg<T> | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const o = raw as Record<string, unknown>;
    if (typeof o.t !== "number" || !Number.isFinite(o.t) || o.t < 0) return undefined;
    if (typeof o.a !== "string" || o.a.length < 1 || o.a.length > 24) return undefined;
    const v = valida(o.v);
    return v === undefined ? undefined : { v, t: o.t, a: o.a };
}

/** Lee un documento de dashboard venido de fuera (servidor, borrador) sin fiarse de nada. */
export function normalizarDashboard(raw: unknown): DocDashboard {
    const base = dashboardVacio();
    if (!raw || typeof raw !== "object") return base;
    const ws = (raw as Record<string, unknown>).widgets;
    if (!ws || typeof ws !== "object") return base;
    const ids = Object.keys(ws as Record<string, unknown>).sort().slice(0, LIMITES_DASHBOARD.entradas);
    const salida: Record<string, WidgetCompartido> = {};
    for (const id of ids) {
        if (!RE_ID_WIDGET.test(id)) continue;
        const w = (ws as Record<string, unknown>)[id];
        if (!w || typeof w !== "object") continue;
        const o = w as Record<string, unknown>;
        if (!tipoCompartible(o.tipo)) continue;
        const pos = leerReg(o.pos, (v) => sanearCaja(v));
        if (!pos) continue;
        const tam = leerReg<TallaWidget | null>(o.tam, (v) => (v === null ? null : typeof v === "string" && TALLAS.includes(v) ? (v as TallaWidget) : undefined));
        const cfg = leerReg(o.cfg, (v) => sanearAjustes(v));
        const borrado = leerReg<boolean>(o.borrado, (v) => (typeof v === "boolean" ? v : undefined));
        const creado = typeof o.creado === "number" && Number.isFinite(o.creado) && o.creado >= 0 ? o.creado : pos.t;
        salida[id] = {
            id,
            tipo: o.tipo,
            creado,
            pos,
            tam: tam ?? { v: null, t: 0, a: "anonimo" },
            cfg: cfg ?? { v: {}, t: 0, a: "anonimo" },
            ...(borrado ? { borrado } : {}),
        };
    }
    return { v: FORMATO_DASHBOARD, widgets: salida };
}

// ───────────────────────────── fusión ─────────────────────────────

function fusionarRegistro<T>(a: Reg<T> | undefined, b: Reg<T> | undefined): Reg<T> | undefined {
    if (!b) return a;
    if (!a) return b;
    return ganaReg(b, a) ? b : a;
}

function fusionarWidget(a: WidgetCompartido, b: WidgetCompartido): WidgetCompartido {
    if (a === b) return a;
    const pos = fusionarRegistro(a.pos, b.pos)!;
    const tam = fusionarRegistro(a.tam, b.tam)!;
    const cfg = fusionarRegistro(a.cfg, b.cfg)!;
    const borrado = fusionarRegistro(a.borrado, b.borrado);
    // tipo y creación no cambian nunca; si dos copias discrepan (id repetido), gana el menor: determinista
    const tipo = a.tipo <= b.tipo ? a.tipo : b.tipo;
    const creado = Math.min(a.creado, b.creado);
    if (pos === a.pos && tam === a.tam && cfg === a.cfg && borrado === a.borrado && tipo === a.tipo && creado === a.creado) return a;
    return { id: a.id, tipo, creado, pos, tam, cfg, ...(borrado ? { borrado } : {}) };
}

/** Combina dos versiones del dashboard. Conmutativa, asociativa e idempotente; devuelve `a` si `b` no aporta nada. */
export function fusionarDashboards(a: DocDashboard, b: DocDashboard): DocDashboard {
    if (a === b) return a;
    let widgets = a.widgets;
    for (const id of Object.keys(b.widgets)) {
        const wb = b.widgets[id];
        const wa = widgets[id];
        const f = wa ? fusionarWidget(wa, wb) : wb;
        if (f !== wa) {
            if (widgets === a.widgets) widgets = { ...a.widgets };
            widgets[id] = f;
        }
    }
    return widgets === a.widgets ? a : { v: Math.max(a.v, b.v), widgets };
}

export function dashboardsIguales(a: DocDashboard, b: DocDashboard): boolean {
    return fusionarDashboards(a, b) === a && fusionarDashboards(b, a) === b;
}

/** Quita las lápidas de más de 60 días (determinista: todas las copias podan lo mismo). */
export function podarDashboard(d: DocDashboard, ahora: number): DocDashboard {
    let salida: Record<string, WidgetCompartido> | null = null;
    for (const [id, w] of Object.entries(d.widgets)) {
        if (w.borrado?.v && ahora - w.borrado.t > LAPIDAS_MS) {
            salida ??= { ...d.widgets };
            delete salida[id];
        }
    }
    return salida ? { v: d.v, widgets: salida } : d;
}

export function maxTiempoDashboard(d: DocDashboard): number {
    let max = 0;
    for (const w of Object.values(d.widgets)) {
        for (const r of [w.pos, w.tam, w.cfg, w.borrado]) if (r && r.t > max) max = r.t;
        if (w.creado > max) max = w.creado;
    }
    return max;
}

// ───────────────────────────── vista: de registros a widgets ─────────────────────────────

const cacheLista = new WeakMap<DocDashboard, { dashboardId: string; lista: DashboardWidget[] }>();
const cacheWidget = new WeakMap<WidgetCompartido, { dashboardId: string; w: DashboardWidget }>();

function comoWidget(w: WidgetCompartido, dashboardId: string): DashboardWidget {
    const hit = cacheWidget.get(w);
    if (hit && hit.dashboardId === dashboardId) return hit.w;
    const out: DashboardWidget = {
        id: w.id,
        dashboard_id: dashboardId,
        widget_type: w.tipo as WidgetType,
        layout: { ...w.pos.v, i: w.id },
        settings: w.cfg.v,
        created_at: new Date(w.creado).toISOString(),
        ...(w.tam.v ? { size: w.tam.v } : {}),
    };
    cacheWidget.set(w, { dashboardId, w: out });
    return out;
}

/** Widgets vivos del dashboard, en orden de lectura. La MISMA lista mientras el doc no cambie. */
export function aWidgets(d: DocDashboard, dashboardId: string): DashboardWidget[] {
    const hit = cacheLista.get(d);
    if (hit && hit.dashboardId === dashboardId) return hit.lista;
    const vivos = Object.values(d.widgets)
        .filter((w) => !w.borrado?.v)
        .sort((a, b) => a.pos.v.y - b.pos.v.y || a.pos.v.x - b.pos.v.x || (a.id < b.id ? -1 : 1));
    const lista = vivos.map((w) => comoWidget(w, dashboardId));
    cacheLista.set(d, { dashboardId, lista });
    return lista;
}

export function contarVivos(d: DocDashboard): number {
    let n = 0;
    for (const w of Object.values(d.widgets)) if (!w.borrado?.v) n += 1;
    return n;
}

export function puedeAnadirWidget(d: DocDashboard): boolean {
    return contarVivos(d) < LIMITES_DASHBOARD.widgets;
}

// ───────────────────────────── ediciones ─────────────────────────────

function estable(v: unknown): string {
    if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "";
    if (Array.isArray(v)) return `[${v.map(estable).join(",")}]`;
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${estable(o[k])}`)
        .join(",")}}`;
}

function mismaCaja(a: CajaWidget, b: CajaWidget): boolean {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function nuevoIdWidget(): string {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    } catch {
        /* sin crypto */
    }
    return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface NuevoWidget {
    id?: string;
    tipo: string;
    pos: CajaWidget;
    size?: TallaWidget | null;
    ajustes?: unknown;
}

function crearWidget(n: NuevoWidget, c: Ctx): WidgetCompartido | null {
    if (!tipoCompartible(n.tipo)) return null;
    const id = n.id && RE_ID_WIDGET.test(n.id) ? n.id : nuevoIdWidget();
    if (!RE_ID_WIDGET.test(id)) return null;
    return {
        id,
        tipo: n.tipo,
        creado: c.t,
        pos: reg(sanearCaja(n.pos), c),
        tam: reg(n.size && TALLAS.includes(n.size) ? n.size : null, c),
        cfg: reg(sanearAjustes(n.ajustes), c),
    };
}

/** Añade un widget. Devuelve el doc sin cambios si el tipo no se puede compartir o no caben más. */
export function anadirWidget(d: DocDashboard, n: NuevoWidget, c: Ctx): { doc: DocDashboard; id: string | null } {
    if (!puedeAnadirWidget(d)) return { doc: d, id: null };
    const w = crearWidget(n, c);
    if (!w || d.widgets[w.id]) return { doc: d, id: null };
    return { doc: { v: d.v, widgets: { ...d.widgets, [w.id]: w } }, id: w.id };
}

/**
 * Traduce «el dashboard ahora es esta lista de widgets» (lo que entrega `GridArea` en
 * `setWidgets`) a cambios por registro: solo se escribe lo que de verdad cambió. Lo que ya no
 * está en la lista queda con lápida; lo nuevo se añade; una lápida ajena nunca se resucita aquí.
 */
export function aplicarWidgets(d: DocDashboard, siguiente: readonly DashboardWidget[], c: Ctx): DocDashboard {
    let widgets = d.widgets;
    const tocar = () => {
        if (widgets === d.widgets) widgets = { ...d.widgets };
        return widgets;
    };
    const vistos = new Set<string>();
    let vivos = contarVivos(d);
    for (const n of siguiente) {
        if (!n || typeof n.id !== "string") continue;
        vistos.add(n.id);
        const actual = d.widgets[n.id];
        if (!actual) {
            if (vivos >= LIMITES_DASHBOARD.widgets) continue;
            const nuevo = crearWidget(
                { id: n.id, tipo: n.widget_type, pos: n.layout, size: n.size ?? null, ajustes: n.settings },
                c,
            );
            if (nuevo) {
                tocar()[nuevo.id] = nuevo;
                vivos += 1;
            }
            continue;
        }
        if (actual.borrado?.v) continue; // borrado por alguien: no resucita por un estado desfasado
        const caja = sanearCaja(n.layout);
        const talla: TallaWidget | null = n.size && TALLAS.includes(n.size) ? n.size : null;
        const ajustes = sanearAjustes(n.settings);
        const cambiaPos = !mismaCaja(actual.pos.v, caja);
        const cambiaTam = actual.tam.v !== talla;
        const cambiaCfg = estable(actual.cfg.v) !== estable(ajustes);
        if (!cambiaPos && !cambiaTam && !cambiaCfg) continue;
        tocar()[actual.id] = {
            ...actual,
            ...(cambiaPos ? { pos: reg(caja, c) } : {}),
            ...(cambiaTam ? { tam: reg(talla, c) } : {}),
            ...(cambiaCfg ? { cfg: reg(ajustes, c) } : {}),
        };
    }
    for (const w of Object.values(d.widgets)) {
        if (w.borrado?.v || vistos.has(w.id)) continue;
        tocar()[w.id] = { ...w, borrado: reg(true, c) };
    }
    return widgets === d.widgets ? d : { v: d.v, widgets };
}

/** Deshacer/rehacer colaborativo: solo se revierte lo que este paso cambió y nadie ha tocado después. */
export function invertirPasoDashboard(paso: { antes: DocDashboard; despues: DocDashboard }, actual: DocDashboard, c: Ctx): DocDashboard {
    let widgets = actual.widgets;
    const ids = new Set([...Object.keys(paso.antes.widgets), ...Object.keys(paso.despues.widgets)]);
    for (const id of ids) {
        const a = paso.antes.widgets[id];
        const d = paso.despues.widgets[id];
        const cur = actual.widgets[id];
        if (!cur) continue;
        let nuevo = cur;
        if (!a && d) {
            // el paso lo creó: se entierra si nadie más lo ha tocado
            if (!cur.borrado?.v && mismoReg(cur.pos, d.pos) && mismoReg(cur.cfg, d.cfg) && mismoReg(cur.tam, d.tam)) nuevo = { ...cur, borrado: reg(true, c) };
        } else if (a && d) {
            const cambios: Partial<WidgetCompartido> = {};
            if (!mismoReg(a.pos, d.pos) && mismoReg(cur.pos, d.pos)) cambios.pos = reg(a.pos.v, c);
            if (!mismoReg(a.tam, d.tam) && mismoReg(cur.tam, d.tam)) cambios.tam = reg(a.tam.v, c);
            if (!mismoReg(a.cfg, d.cfg) && mismoReg(cur.cfg, d.cfg)) cambios.cfg = reg(a.cfg.v, c);
            if (!mismoReg(a.borrado, d.borrado) && mismoReg(cur.borrado, d.borrado)) cambios.borrado = reg(a.borrado?.v ?? false, c);
            if (Object.keys(cambios).length) nuevo = { ...cur, ...cambios };
        }
        if (nuevo !== cur) {
            if (widgets === actual.widgets) widgets = { ...actual.widgets };
            widgets[id] = nuevo;
        }
    }
    return widgets === actual.widgets ? actual : { v: actual.v, widgets };
}

// ───────────────────────────── sembrar desde el dashboard personal ─────────────────────────────

/** Claves del dashboard personal que sí viajan al compartido (solo estilo; nunca datos personales). */
const AJUSTES_SEMBRABLES = ["styleVariant", "trinityNode", "bloqueado"] as const;

const LS_DASHBOARDS = "starseed_dashboards";
const LS_WIDGETS = "starseed_widgets";

export interface DashboardLocal {
    id: string;
    nombre: string;
    widgets: number;
}

function leerLS<T>(clave: string): T | null {
    try {
        if (typeof localStorage === "undefined") return null;
        const raw = localStorage.getItem(clave);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

/** Los tableros del dashboard personal de este dispositivo (para «Crear desde mi dashboard»). */
export function listarDashboardsLocales(): DashboardLocal[] {
    const lista = leerLS<unknown[]>(LS_DASHBOARDS);
    const mapa = leerLS<Record<string, unknown[]>>(LS_WIDGETS) ?? {};
    if (!Array.isArray(lista)) return [];
    const salida: DashboardLocal[] = [];
    for (const d of lista) {
        if (!d || typeof d !== "object") continue;
        const o = d as Record<string, unknown>;
        if (typeof o.id !== "string") continue;
        const ws = Array.isArray(mapa[o.id]) ? mapa[o.id] : [];
        const n = ws.filter((w) => w && typeof w === "object" && tipoCompartible((w as Record<string, unknown>).widget_type)).length;
        salida.push({ id: o.id, nombre: typeof o.name === "string" && o.name ? o.name.slice(0, 60) : "Dashboard", widgets: n });
    }
    return salida;
}

/** Copia el ACOMODO (tipo, sitio, talla y estilo) de un tablero personal; nunca datos ni código. */
export function widgetsSembrables(brutos: unknown): NuevoWidget[] {
    if (!Array.isArray(brutos)) return [];
    const salida: NuevoWidget[] = [];
    for (const b of brutos) {
        if (!b || typeof b !== "object") continue;
        const o = b as Record<string, unknown>;
        if (!tipoCompartible(o.widget_type)) continue;
        const layout = sanearCaja(o.layout);
        const ajustes: AjustesWidget = {};
        const origen = o.settings && typeof o.settings === "object" ? (o.settings as Record<string, unknown>) : {};
        for (const k of AJUSTES_SEMBRABLES) if (origen[k] !== undefined) ajustes[k] = origen[k];
        salida.push({
            tipo: o.widget_type,
            pos: layout,
            size: typeof o.size === "string" && TALLAS.includes(o.size) ? (o.size as TallaWidget) : null,
            ajustes: sanearAjustes(ajustes),
        });
        if (salida.length >= LIMITES_DASHBOARD.widgets) break;
    }
    return salida;
}

export function dashboardDesdeLocal(idLocal: string, c: Ctx): DocDashboard {
    const mapa = leerLS<Record<string, unknown[]>>(LS_WIDGETS);
    let doc = dashboardVacio();
    for (const n of widgetsSembrables(mapa?.[idLocal])) doc = anadirWidget(doc, n, c).doc;
    return doc;
}

// ───────────────────────────── crear y listar ─────────────────────────────

export async function crearVivoDashboard(titulo: string, opciones: { desdeLocal?: string | null } = {}): Promise<{ refId: string; ruta: string }> {
    const uid = await miUid();
    const c: Ctx = { t: Date.now(), a: autorCorto(uid) };
    const inicial = opciones.desdeLocal ? dashboardDesdeLocal(opciones.desdeLocal, c) : dashboardVacio();
    const id = await crearEspacioVivo("dashboard", titulo.trim() || "Dashboard compartido", docDashboard(inicial));
    return { refId: id, ruta: rutaDashboard(id) };
}

export async function listarMiosDashboard(): Promise<{ refId: string; titulo: string; ruta: string }[]> {
    const lista = await listarEspaciosVivos("dashboard");
    return lista.filter((e) => e.esMio).map((e) => ({ refId: e.refId, titulo: e.titulo, ruta: rutaDashboard(e.refId) }));
}

/** Los míos y los compartidos conmigo (para la lista de `/dashboard-compartido`). */
export async function listarDashboardsVivos(): Promise<ResumenEspacio[]> {
    return listarEspaciosVivos("dashboard");
}

// ───────────────────────────── motor ─────────────────────────────

const PREFIJO_BORRADOR = "starseed.vivo.borrador.dashboard.";

function borradorLocal(id: string): NonNullable<DepsMotor<DocDashboard>["borrador"]> {
    return {
        leer: () => {
            try {
                const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(PREFIJO_BORRADOR + id);
                return raw ? normalizarDashboard(JSON.parse(raw)) : null;
            } catch {
                return null;
            }
        },
        escribir: (d) => {
            try {
                if (typeof localStorage === "undefined") return;
                if (d) localStorage.setItem(PREFIJO_BORRADOR + id, JSON.stringify(d));
                else localStorage.removeItem(PREFIJO_BORRADOR + id);
            } catch {
                /* sin almacenamiento o sin cuota: se sigue sin borrador */
            }
        },
    };
}

export function depsDashboard(espacioId: string, uid: string | null): DepsMotor<DocDashboard> {
    return {
        cargar: () => leerEspacio(espacioId),
        guardar: (doc, rev) => guardarEspacioCAS(espacioId, doc, rev),
        suscribir: (cb) => suscribirEspacio(espacioId, cb),
        puedeEditar: puedoEditarEspacio,
        autor: autorCorto(uid),
        validar: (doc) => (esDocDashboard(doc) ? null : "Este espacio no es un dashboard compartido."),
        extraer: (doc) => podarDashboard(normalizarDashboard(doc.dashboard), Date.now()),
        fusionar: (a, b) => podarDashboard(fusionarDashboards(a, b), Date.now()),
        incrustar: (base, d) => ({ ...base, vivo: "dashboard", v: FORMATO_DASHBOARD, dashboard: d }),
        maxTiempo: maxTiempoDashboard,
        invertirPaso: invertirPasoDashboard,
        borrador: borradorLocal(espacioId),
    };
}

export function crearMotorDashboard(espacioId: string, uid: string | null): MotorColab<DocDashboard> {
    return new MotorColab<DocDashboard>(depsDashboard(espacioId, uid));
}
