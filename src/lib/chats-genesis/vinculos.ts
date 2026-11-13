/**
 * Chats de Genesis · vínculos entre Chats y Genesis y su migración (GEN1113C, contrato §2.4, §3 y §7.3).
 *
 * Un chat no se copia: se le pone un VÍNCULO que dice en qué bandejas aparece (Chats, Genesis o las
 * dos), con qué nivel (Genesis, PoliGenesis, MetaGenesis) y, en PoliGenesis, de qué entidad.
 *
 * Todo lo de arriba es PURO (sin red, sin `node:*`, sin mutar la entrada). Abajo, el adaptador:
 *  · `user_settings.prefs.chatsGenesis` con `mergeUserPrefs` (parche atómico: nunca pisa el resto);
 *  · copia rápida en `localStorage["starseed.chats-genesis.v1"]` (la verdad es `prefs`);
 *  · `aurora_conversations.meta.genesis`, leyendo y fusionando `meta` (nunca se sustituye).
 *
 * Regla del proyecto: nada que una persona guardó se pierde al actualizar. `migrarPrefsChatsGenesis`
 * no devuelve nunca `null` y lo que no entiende va a `descartado`, que el adaptador guarda en
 * `prefs.chatsGenesisDescartado` (hasta 20 entradas con fecha) en la MISMA escritura que el resultado.
 */

import {
    BANDEJAS,
    CLAVE_LOCAL,
    CLAVE_PREFS,
    CLAVE_PREFS_DESCARTADO,
    MAX_DESCARTADO,
    MAX_TITULO,
    MAX_VINCULOS,
    NIVELES,
    PUENTES,
    prefsVacias,
    type Bandeja,
    type FuenteChat,
    type NivelGenesis,
    type PrefsChatsGenesis,
    type PuenteTelegram,
    type VinculoChat,
} from "./tipos";
// GEN1114E · la migración v1 → v2 pone el id del chat canónico (contrato GEN1114 §2.6)
import { RE_ID_CHAT } from "./tipos";
import { chatDeFuente, leerCopiaCanon, type CatalogoCanon } from "./canon";
import { ID_DIRECCION, PREFIJO_TELEGRAM } from "./alias-gen1113";

/** Lo que la migración no entendió: se guarda tal cual, con el motivo y dónde estaba. */
export interface Descarte {
    motivo: string;
    valor: unknown;
    vinculo?: string;
    campo?: string;
}

const EPOCA = "1970-01-01T00:00:00.000Z";
const RE_ID_ORIGEN = /^[^\s\u0000-\u001f]{1,200}$/;
const CLAVES_VINCULO = new Set(["v", "id", "fuente", "nivel", "entidad", "en", "titulo", "creado", "actualizado", "chat"]); // GEN1114E · + chat
const CLAVES_PREFS = new Set(["v", "vinculos", "conexiones"]);

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

function esIso(x: unknown): x is string {
    return typeof x === "string" && x.length <= 40 && Number.isFinite(Date.parse(x));
}

function textoId(x: unknown): x is string {
    return typeof x === "string" && RE_ID_ORIGEN.test(x);
}

function esNivel(x: unknown): x is NivelGenesis {
    return typeof x === "string" && (NIVELES as readonly string[]).includes(x);
}

/** Bandejas válidas, sin repetir y en orden canónico (chats, genesis). */
export function normalizarBandejas(x: unknown): Bandeja[] {
    if (!Array.isArray(x)) return [];
    return BANDEJAS.filter((b) => x.includes(b));
}

/** Una fuente con forma válida (copia limpia, sin campos de más) o null. */
export function fuenteValida(x: unknown): FuenteChat | null {
    if (!esObjeto(x)) return null;
    switch (x.tipo) {
        case "astraura":
            return textoId(x.convId) ? { tipo: "astraura", convId: x.convId } : null;
        case "direccion":
            return { tipo: "direccion" };
        case "puente":
            return typeof x.puente === "string" && (PUENTES as readonly string[]).includes(x.puente)
                ? { tipo: "puente", puente: x.puente as PuenteTelegram }
                : null;
        case "telegram-sincronizado":
            return textoId(x.chatId) ? { tipo: "telegram-sincronizado", chatId: x.chatId } : null;
        default:
            return null;
    }
}

/** Determinista: «astraura:<convId>», «direccion», «puente:<puente>», «tg:<chatId>». */
export function idDeVinculo(f: FuenteChat): string {
    switch (f.tipo) {
        case "astraura":
            return `astraura:${f.convId}`;
        case "direccion":
            return "direccion";
        case "puente":
            return `puente:${f.puente}`;
        case "telegram-sincronizado":
            return `tg:${f.chatId}`;
        default:
            throw new TypeError("fuente de chat desconocida");
    }
}

// ── migración (pura) ─────────────────────────────────────────────────────────────────────────

/** Un vínculo guardado → vínculo limpio, o null (y el original en `fuera`). Lo que sobra, también a `fuera`. */
function migrarVinculo(x: unknown, fuera: Descarte[], cat: CatalogoCanon | null = null): VinculoChat | null { // GEN1114E · + cat
    if (!esObjeto(x) || x.v !== 1) {
        fuera.push({ motivo: "vínculo sin forma o de otra versión", valor: x });
        return null;
    }
    const fuente = fuenteValida(x.fuente);
    const en = normalizarBandejas(x.en);
    if (!fuente || !esNivel(x.nivel) || en.length === 0) {
        fuera.push({ motivo: "vínculo sin fuente, nivel o bandeja válidos", valor: x });
        return null;
    }
    const id = idDeVinculo(fuente);
    const nivel = x.nivel;
    if (nivel === "poligenesis" && !textoId(x.entidad)) {
        fuera.push({ motivo: "vínculo de PoliGenesis sin entidad", valor: x, vinculo: id });
        return null;
    }
    const sobra = (campo: string, motivo: string) => fuera.push({ motivo, valor: x[campo], vinculo: id, campo });
    if (x.id !== undefined && x.id !== id) sobra("id", "id distinto del que da la fuente");
    if (nivel !== "poligenesis" && x.entidad !== undefined && x.entidad !== null) sobra("entidad", "entidad fuera de PoliGenesis");
    if (!Array.isArray(x.en) || x.en.length !== en.length) sobra("en", "bandejas repetidas o desconocidas");
    for (const k of Object.keys(x)) if (!CLAVES_VINCULO.has(k)) sobra(k, "campo desconocido");

    let titulo: string | undefined;
    if (typeof x.titulo === "string") {
        titulo = x.titulo.trim().slice(0, MAX_TITULO) || undefined;
        if (x.titulo.trim().length > MAX_TITULO) sobra("titulo", "título de más de 120 caracteres (recortado)");
    } else if (x.titulo !== undefined) sobra("titulo", "título que no es texto");

    if (x.creado !== undefined && !esIso(x.creado)) sobra("creado", "fecha no válida");
    if (x.actualizado !== undefined && !esIso(x.actualizado)) sobra("actualizado", "fecha no válida");
    const creado = esIso(x.creado) ? x.creado : esIso(x.actualizado) ? x.actualizado : EPOCA;
    const actualizado = esIso(x.actualizado) ? x.actualizado : creado;

    const v: VinculoChat = { v: 1, id, fuente, nivel, en, creado, actualizado };
    if (nivel === "poligenesis") v.entidad = x.entidad as string;
    if (titulo !== undefined) v.titulo = titulo;
    // GEN1114E · el id del chat canónico (§2.6): fijo para la dirección; para un puente, el guardado
    // si tiene forma de puente o, si no, el del catálogo (relación fija de §3.4). El `id` del vínculo
    // NO cambia. Un `chat` que no cuadra no se tira: va a descartado.
    const chat = chatDeVinculo(fuente, x.chat, cat);
    if (chat) v.chat = chat;
    if (x.chat !== undefined && x.chat !== chat) sobra("chat", "id de chat canónico que no cuadra con la fuente");
    return v;
}

/** GEN1114E · el id canónico de un vínculo de la dirección o de un puente (o undefined). */
function chatDeVinculo(fuente: FuenteChat, guardado: unknown, cat: CatalogoCanon | null): string | undefined {
    if (fuente.tipo === "direccion") return ID_DIRECCION;
    if (fuente.tipo !== "puente") return undefined;
    const delCatalogo = chatDeFuente(cat, `puente:${fuente.puente}`)?.id;
    if (delCatalogo) return delCatalogo;
    if (typeof guardado === "string" && RE_ID_CHAT.test(guardado) && guardado.startsWith(PREFIJO_TELEGRAM)) return guardado;
    return undefined;
}

function migrarConexiones(x: unknown, fuera: Descarte[]): PrefsChatsGenesis["conexiones"] {
    const c: PrefsChatsGenesis["conexiones"] = {};
    if (x === undefined) return c;
    if (!esObjeto(x)) {
        fuera.push({ motivo: "conexiones sin forma", valor: x, campo: "conexiones" });
        return c;
    }
    const mal = (campo: string, valor: unknown) => fuera.push({ motivo: "conexión no válida", valor, campo: `conexiones.${campo}` });
    for (const [k, val] of Object.entries(x)) {
        if (val === undefined) continue;
        const o = esObjeto(val) ? val : null;
        if (!o || typeof o.activo !== "boolean") {
            mal(k, val);
            continue;
        }
        if (k === "genesis") {
            if (o.memoria !== undefined && typeof o.memoria !== "boolean") mal("genesis.memoria", o.memoria);
            c.genesis = { activo: o.activo, memoria: o.memoria === true };
            for (const extra of Object.keys(o)) if (extra !== "activo" && extra !== "memoria") mal(`genesis.${extra}`, o[extra]);
        } else if (k === "poligenesis") {
            const lista = Array.isArray(o.entidades) ? o.entidades : [];
            if (o.entidades !== undefined && !Array.isArray(o.entidades)) mal("poligenesis.entidades", o.entidades);
            const entidades = [...new Set(lista.filter(textoId))];
            if (Array.isArray(o.entidades) && entidades.length !== o.entidades.length) mal("poligenesis.entidades", o.entidades);
            c.poligenesis = { activo: o.activo, entidades };
            for (const extra of Object.keys(o)) if (extra !== "activo" && extra !== "entidades") mal(`poligenesis.${extra}`, o[extra]);
        } else if (k === "metagenesis") {
            c.metagenesis = { activo: o.activo };
            for (const extra of Object.keys(o)) if (extra !== "activo") mal(`metagenesis.${extra}`, o[extra]);
        } else mal(k, val);
    }
    return c;
}

/**
 * Cualquier cosa guardada (nada, una versión vieja, rota o futura) → `PrefsChatsGenesis` v1 válido.
 * PURA, nunca lanza y nunca devuelve null. Lo que no entiende va a `descartado` (nunca se tira):
 *  · una versión FUTURA (v > 1) se guarda entera en `descartado` y se rescatan los vínculos que
 *    llevan su propio `v: 1` válido;
 *  · repetidos (mismo id): queda el más reciente; si hay más de 500, los 500 más recientes.
 * Pasar el resultado otra vez por aquí lo deja igual y sin descartes.
 */
export function migrarPrefsChatsGenesis(crudo: unknown, catalogo: CatalogoCanon | null = null): { prefs: PrefsChatsGenesis; descartado: unknown[] } { // GEN1114E · + catálogo opcional
    try {
        if (crudo === undefined || crudo === null) return { prefs: prefsVacias(), descartado: [] };
        if (!esObjeto(crudo)) return { prefs: prefsVacias(), descartado: [{ motivo: "no es un objeto", valor: crudo } satisfies Descarte] };
        const descartado: Descarte[] = [];
        const futura = typeof crudo.v === "number" && crudo.v > 2; // GEN1114E · la v2 ya es de esta app
        if (futura) descartado.push({ motivo: `versión ${crudo.v}, posterior a esta app`, valor: crudo });
        // De una versión futura ya está guardado el original entero: los detalles no se repiten.
        const fuera: Descarte[] = futura ? [] : descartado;
        if (!futura && crudo.v !== undefined && crudo.v !== 1 && crudo.v !== 2) fuera.push({ motivo: "versión no válida", valor: crudo.v, campo: "v" });
        for (const k of Object.keys(crudo)) if (!CLAVES_PREFS.has(k)) fuera.push({ motivo: "campo desconocido", valor: crudo[k], campo: k });

        const lista: unknown[] = Array.isArray(crudo.vinculos) ? crudo.vinculos : [];
        if (crudo.vinculos !== undefined && !Array.isArray(crudo.vinculos)) fuera.push({ motivo: "vínculos sin forma", valor: crudo.vinculos, campo: "vinculos" });

        const porId = new Map<string, VinculoChat>();
        for (const x of lista) {
            const v = migrarVinculo(x, fuera, catalogo);
            if (!v) continue;
            const previo = porId.get(v.id);
            if (!previo) porId.set(v.id, v);
            else {
                const gana = Date.parse(v.actualizado) > Date.parse(previo.actualizado) ? v : previo;
                fuera.push({ motivo: "vínculo repetido", valor: gana === v ? previo : v, vinculo: v.id });
                porId.set(v.id, gana);
            }
        }
        let vinculos = [...porId.values()];
        if (vinculos.length > MAX_VINCULOS) {
            const quedan = new Set(
                [...vinculos].sort((a, b) => Date.parse(b.actualizado) - Date.parse(a.actualizado)).slice(0, MAX_VINCULOS).map((v) => v.id),
            );
            for (const v of vinculos) if (!quedan.has(v.id)) fuera.push({ motivo: "más de 500 vínculos", valor: v, vinculo: v.id });
            vinculos = vinculos.filter((v) => quedan.has(v.id));
        }
        const conexiones = migrarConexiones(crudo.conexiones, fuera);
        return { prefs: { v: 2, vinculos, conexiones }, descartado }; // GEN1114E · siempre sale v2
    } catch {
        return { prefs: prefsVacias(), descartado: [{ motivo: "no se pudo leer", valor: crudo } satisfies Descarte] };
    }
}

// ── operaciones (puras) ──────────────────────────────────────────────────────────────────────

/**
 * Pone (o rehace) el vínculo de una fuente. `v.en` es el estado COMPLETO de bandejas que se quiere:
 * «Llevar a Genesis» sin quitarlo de Chats es `en: ["chats","genesis"]`; `en` vacío quita el vínculo.
 * Si ya existía: conserva `creado` y, si `v.titulo` no viene, el título que tenía.
 * Lanza TypeError con una fuente, nivel o entidad no válidos y RangeError al pasar de 500 vínculos.
 */
export function vincular(
    p: PrefsChatsGenesis,
    v: Omit<VinculoChat, "v" | "id" | "creado" | "actualizado">,
    ahora: string,
): PrefsChatsGenesis {
    const fuente = fuenteValida(v.fuente);
    if (!fuente) throw new TypeError("fuente de chat no válida");
    if (!esNivel(v.nivel)) throw new TypeError("nivel de Genesis no válido");
    if (v.nivel === "poligenesis" && !textoId(v.entidad)) throw new TypeError("un vínculo de PoliGenesis necesita su entidad");
    const id = idDeVinculo(fuente);
    const en = normalizarBandejas(v.en);
    if (en.length === 0) return cambiarBandejas(p, id, [], ahora);
    const previo = p.vinculos.find((x) => x.id === id);
    if (!previo && p.vinculos.length >= MAX_VINCULOS) throw new RangeError("ya hay 500 vínculos: quita alguno antes");
    const nuevo: VinculoChat = { v: 1, id, fuente, nivel: v.nivel, en, creado: previo?.creado ?? ahora, actualizado: ahora };
    if (previo?.chat) nuevo.chat = previo.chat; // GEN1114E · no se pierde el id canónico al rehacer
    else if (fuente.tipo === "direccion") nuevo.chat = ID_DIRECCION;
    if (v.nivel === "poligenesis") nuevo.entidad = v.entidad as string;
    const titulo = v.titulo !== undefined ? v.titulo.trim().slice(0, MAX_TITULO) : previo?.titulo;
    if (titulo) nuevo.titulo = titulo;
    const vinculos = previo ? p.vinculos.map((x) => (x.id === id ? nuevo : x)) : [...p.vinculos, nuevo];
    return { ...p, vinculos };
}

/** Cambia las bandejas de un vínculo. `en` vacío ⇒ quita el vínculo. Un id que no existe deja todo igual. */
export function cambiarBandejas(p: PrefsChatsGenesis, id: string, en: Bandeja[], ahora: string): PrefsChatsGenesis {
    if (!p.vinculos.some((x) => x.id === id)) return p;
    const limpias = normalizarBandejas(en);
    if (limpias.length === 0) return { ...p, vinculos: p.vinculos.filter((x) => x.id !== id) };
    return { ...p, vinculos: p.vinculos.map((x) => (x.id === id ? { ...x, en: limpias, actualizado: ahora } : x)) };
}

/** Los vínculos que aparecen en una bandeja (y, si se pide, de un nivel y una entidad), en el orden guardado. */
export function chatsEn(p: PrefsChatsGenesis, b: Bandeja, nivel?: NivelGenesis, entidad?: string): VinculoChat[] {
    return p.vinculos.filter(
        (x) => x.en.includes(b) && (nivel === undefined || x.nivel === nivel) && (entidad === undefined || x.entidad === entidad),
    );
}

/** El vínculo de una fuente, si lo hay. */
export function vinculoDe(p: PrefsChatsGenesis, f: FuenteChat): VinculoChat | null {
    const id = idDeVinculo(f);
    return p.vinculos.find((x) => x.id === id) ?? null;
}

/** §3.3: la primera vez que un miembro abre la pestaña, `conexiones.metagenesis = {activo: true}`. Si ya hay valor, igual. */
export function conMetaGenesisInicial(p: PrefsChatsGenesis): PrefsChatsGenesis {
    if (p.conexiones.metagenesis) return p;
    return { ...p, conexiones: { ...p.conexiones, metagenesis: { activo: true } } };
}

/**
 * `meta` de una conversación con `meta.genesis` puesto (o quitado con `g = null` o `en` vacío), sin
 * tocar ninguna otra clave. Devuelve null si `meta` existe y no es un objeto: entonces no se escribe.
 */
export function fusionarMetaGenesis(
    meta: unknown,
    g: { nivel: NivelGenesis; entidad?: string | null; en: Bandeja[] } | null,
): Record<string, unknown> | null {
    if (meta !== null && meta !== undefined && !esObjeto(meta)) return null;
    const fuera: Record<string, unknown> = { ...(meta ?? {}) };
    const en = g ? normalizarBandejas(g.en) : [];
    if (!g || en.length === 0) {
        delete fuera.genesis;
        return fuera;
    }
    if (!esNivel(g.nivel)) throw new TypeError("nivel de Genesis no válido");
    fuera.genesis = g.nivel === "poligenesis" && textoId(g.entidad) ? { nivel: g.nivel, entidad: g.entidad, en } : { nivel: g.nivel, en };
    return fuera;
}

// ── adaptador (no puro) ──────────────────────────────────────────────────────────────────────

/** Lo poco de Supabase que usa el adaptador (se puede pasar uno de mentira en las pruebas). */
export interface SupabaseMinimo {
    from(tabla: string): {
        select(columnas: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } };
        update(v: Record<string, unknown>): { eq(c: string, v: string): { eq(c: string, v: string): PromiseLike<{ error: unknown }> } };
    };
}

export interface AlmacenLocal {
    getItem(clave: string): string | null;
    setItem(clave: string, valor: string): void;
}

/** Inyección para pruebas. En la app no se pasa nada. */
export interface OpcionesAdaptador {
    cliente?: SupabaseMinimo;
    uid?: () => Promise<string | null>;
    almacen?: AlmacenLocal | null;
    merge?: (parche: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
    ahora?: () => number;
    /** Aviso a otras pestañas y aparatos tras marcar una conversación. */
    avisar?: (convId: string) => void;
    /** GEN1114E · catálogo para poner el id canónico a los puentes; por defecto, la copia del aparato. */
    catalogo?: CatalogoCanon | null;
}

/** GEN1114E · el catálogo que usa la migración: el pasado o la copia guardada en el aparato. */
function catalogoDe(op: OpcionesAdaptador | undefined, almacen: AlmacenLocal | null): CatalogoCanon | null {
    if (op?.catalogo !== undefined) return op.catalogo;
    return leerCopiaCanon(almacen)?.catalogo ?? null;
}

function almacenNavegador(): AlmacenLocal | null {
    try {
        return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
    } catch {
        return null;
    }
}

async function clienteDe(op?: OpcionesAdaptador): Promise<SupabaseMinimo> {
    if (op?.cliente) return op.cliente;
    return (await import("@/utils/supabase/client")).createClient() as unknown as SupabaseMinimo;
}

async function uidDe(op?: OpcionesAdaptador): Promise<string | null> {
    if (op?.uid) return op.uid();
    return (await import("@/lib/consumo/usuario")).uidActual();
}

async function mergeDe(op: OpcionesAdaptador | undefined, parche: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    if (op?.merge) return op.merge(parche);
    return (await import("@/lib/sync/user-prefs")).mergeUserPrefs(parche);
}

function errorTexto(e: unknown): string {
    if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
    return String(e);
}

/** La copia rápida del aparato (o vacías). Síncrona: para pintar antes de que conteste Supabase. */
export function leerCopiaLocalChatsGenesis(almacen: AlmacenLocal | null = almacenNavegador()): PrefsChatsGenesis {
    try {
        const crudo = almacen?.getItem(CLAVE_LOCAL);
        return migrarPrefsChatsGenesis(crudo ? (JSON.parse(crudo) as { prefs?: unknown }).prefs : undefined, catalogoDe(undefined, almacen)).prefs; // GEN1114E
    } catch {
        return prefsVacias();
    }
}

function guardarCopiaLocal(almacen: AlmacenLocal | null, prefs: PrefsChatsGenesis, ahora: number): void {
    try {
        almacen?.setItem(CLAVE_LOCAL, JSON.stringify({ prefs, en: ahora }));
    } catch {
        /* almacén lleno o bloqueado: la verdad sigue en la cuenta */
    }
}

/**
 * GEN1114E · ¿Hay que escribir la v2 tras leer? Solo si lo guardado tenía algo (vínculos o
 * conexiones) y era v1, o si la migración puso el id canónico a algún vínculo que no lo tenía.
 * (No se compara el JSON entero: `jsonb` reordena las claves y se escribiría en cada lectura.)
 */
export function hayQueSubirV2(guardado: unknown, prefs: PrefsChatsGenesis): boolean {
    if (!esObjeto(guardado)) return false;
    const conAlgo = prefs.vinculos.length > 0 || Object.keys(prefs.conexiones).length > 0;
    if (!conAlgo) return false;
    if (guardado.v !== 2) return true;
    const antes = Array.isArray(guardado.vinculos) ? guardado.vinculos.filter((v) => esObjeto(v) && typeof v.chat === "string").length : 0;
    return prefs.vinculos.filter((v) => v.chat).length > antes;
}

/**
 * Descartes de una lectura que aún no llegaron a la cuenta. La siguiente `guardarPrefsChatsGenesis`
 * los manda en el MISMO parche atómico: así nunca se escribe el resultado migrado sin su original.
 */
let descartePendiente: unknown[] | null = null;

/**
 * Lee `user_settings.prefs.chatsGenesis` (solo esa clave y la de descartes: una lectura pequeña),
 * la migra y deja la copia local. Si la migración descartó algo, lo guarda en
 * `prefs.chatsGenesisDescartado` junto con el resultado (un solo parche). Sin sesión o sin red,
 * devuelve la copia local. Nunca lanza.
 */
export async function leerPrefsChatsGenesis(op?: OpcionesAdaptador): Promise<PrefsChatsGenesis> {
    const almacen = op?.almacen !== undefined ? op.almacen : almacenNavegador();
    const ahora = op?.ahora ?? (() => Date.now());
    try {
        const uid = await uidDe(op);
        if (!uid) return leerCopiaLocalChatsGenesis(almacen);
        const sb = await clienteDe(op);
        const { data, error } = await sb
            .from("user_settings")
            .select(`prefs:prefs->${CLAVE_PREFS}, descartado:prefs->${CLAVE_PREFS_DESCARTADO}`)
            .eq("user_id", uid)
            .maybeSingle();
        if (error) throw error;
        const fila = (esObjeto(data) ? data : {}) as { prefs?: unknown; descartado?: unknown };
        const { prefs, descartado } = migrarPrefsChatsGenesis(fila.prefs, catalogoDe(op, almacen)); // GEN1114E
        if (descartado.length > 0) {
            const previos = Array.isArray(fila.descartado) ? fila.descartado : fila.descartado == null ? [] : [fila.descartado];
            const lista = [...previos, { t: new Date(ahora()).toISOString(), de: CLAVE_PREFS, valores: descartado }].slice(-MAX_DESCARTADO);
            descartePendiente = lista;
            const r = await mergeDe(op, { [CLAVE_PREFS]: prefs, [CLAVE_PREFS_DESCARTADO]: lista }).catch(() => ({ ok: false }));
            if (r.ok) descartePendiente = null;
        } else if (hayQueSubirV2(fila.prefs, prefs)) {
            // GEN1114E · v1 → v2 (§5.3): se escribe solo cuando hay algo que guardar, en un parche.
            await mergeDe(op, { [CLAVE_PREFS]: prefs }).catch(() => ({ ok: false }));
        }
        guardarCopiaLocal(almacen, prefs, ahora());
        return prefs;
    } catch {
        return leerCopiaLocalChatsGenesis(almacen);
    }
}

/**
 * Guarda los vínculos y conexiones de la cuenta con `mergeUserPrefs({ chatsGenesis: p })` (nunca pisa
 * el resto de `prefs`). La copia local se escribe antes. Lanza Error si la cuenta no lo guardó, para
 * que la interfaz pueda decirlo (la copia local queda).
 */
export async function guardarPrefsChatsGenesis(p: PrefsChatsGenesis, op?: OpcionesAdaptador): Promise<void> {
    const almacen = op?.almacen !== undefined ? op.almacen : almacenNavegador();
    const ahora = op?.ahora ?? (() => Date.now());
    const { prefs } = migrarPrefsChatsGenesis(p, catalogoDe(op, almacen)); // GEN1114E
    guardarCopiaLocal(almacen, prefs, ahora());
    const parche: Record<string, unknown> = { [CLAVE_PREFS]: prefs };
    const pendiente = descartePendiente;
    if (pendiente) parche[CLAVE_PREFS_DESCARTADO] = pendiente;
    const r = await mergeDe(op, parche).catch((e: unknown) => ({ ok: false, error: errorTexto(e) }));
    if (!r.ok) throw new Error(`No se guardaron los chats de Genesis en tu cuenta: ${r.error ?? "sin respuesta"}`);
    if (pendiente && descartePendiente === pendiente) descartePendiente = null;
}

/**
 * Pone o quita `aurora_conversations.meta.genesis`. LEE `meta`, fusiona y escribe el `meta` entero
 * resultante (como `meta.config` en conversations.ts): nunca sustituye `meta`. Si la lectura falla,
 * no escribe nada y lanza.
 */
export async function marcarConversacionGenesis(
    convId: string,
    g: { nivel: NivelGenesis; entidad?: string | null; en: Bandeja[] } | null,
    op?: OpcionesAdaptador,
): Promise<void> {
    if (!textoId(convId)) throw new TypeError("id de conversación no válido");
    const uid = await uidDe(op);
    if (!uid) throw new Error("Inicia sesión para llevar chats a Genesis");
    const sb = await clienteDe(op);
    const { data, error } = await sb.from("aurora_conversations").select("meta").eq("id", convId).maybeSingle();
    if (error) throw new Error(`No se pudo leer el chat: ${errorTexto(error)}`);
    if (!esObjeto(data)) throw new Error("No se encontró el chat");
    const meta = fusionarMetaGenesis(data.meta, g);
    if (!meta) throw new Error("El chat tiene datos que esta app no entiende: no se cambió nada");
    const { error: e2 } = await sb.from("aurora_conversations").update({ meta }).eq("id", convId).eq("user_id", uid);
    if (e2) throw new Error(`No se pudo guardar el chat: ${errorTexto(e2)}`);
    if (op?.avisar) op.avisar(convId);
    else {
        try {
            const { emitChange, AI_CHATS_TOPIC } = await import("@/lib/sync/live-signal");
            void emitChange(AI_CHATS_TOPIC, { id: convId, data: { convId, kind: "conversation" } });
        } catch {
            /* el aviso es comodidad: Realtime trae el cambio igual */
        }
    }
}
