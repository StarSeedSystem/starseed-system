/**
 * (OFF1108A) Instantánea local de la cuenta: lo que la app necesita para arrancar y funcionar SIN internet
 * después de cerrarla y volver a abrirla (prueba de campo 08-11, tableta Android sin Wi‑Fi).
 *
 * Supabase sigue siendo la fuente de verdad. Esto es una copia versionada, por secciones, que se escribe
 * cuando hay datos buenos EN LÍNEA y se lee en un arranque en frío sin red.
 *
 * Secciones (cada una con su cuenta, su fecha y su versión de formato; se pisan por separado):
 *   · `perfil`    fila del perfil (nombre, @handle, ajustes públicos del perfil) y el avatar como blob.
 *   · `neuronas`  filas de `neuron_devices` de la cuenta: id, nombre, tipo, capacidades, permisos, vistos.
 *   · `huellas`   neurona → huella `id:…` de la identidad de malla, SOLO de neuronas que ya probaron ser de
 *                 la cuenta (prueba HMAC de faro, certificado o vínculo). Sin internet, un saludo firmado con
 *                 esa huella desde esa neurona vale como «es de mi cuenta».
 *   · `cerebros`  cerebros de la cuenta (id, nombre, fecha), para la pertenencia.
 *
 * Reglas que no se saltan:
 *   · NUNCA tokens ni claves: `sinSecretos` quita por nombre (token, secret, password, api_key, private,
 *     clave_faro, hmac, jwt…) y por forma (JWT, 64 hex) antes de escribir. La sesión sigue donde Supabase la
 *     guarda; la clave de faro sigue en `antenas.json` de la app (y en los ajustes privados de la cuenta).
 *   · Se lee solo si la cuenta coincide con la recordada (`uid-recordado`); otra cuenta no ve lo de esta.
 *   · Cierre de sesión MANUAL: `olvidarInstantanea()` lo borra todo.
 *
 * Puro salvo `almacenInstantanea()` (IndexedDB con respaldo en memoria, el de la identidad IDN1108A).
 */

import { almacenIdentidad, type AlmacenKV } from "@/lib/identidad/almacen";

export const VERSION_INSTANTANEA = 1;
const PREFIJO = `cuenta-snap:v${VERSION_INSTANTANEA}:`;

export type Seccion = "perfil" | "neuronas" | "huellas" | "cerebros" | "avatar";
const SECCIONES: readonly Seccion[] = ["perfil", "neuronas", "huellas", "cerebros", "avatar"];

/** Sobre de cada sección guardada. */
export interface SobreSeccion<T> {
    v: number;
    uid: string;
    en: number;
    datos: T;
}

export interface NeuronaGuardada {
    id: string;
    name?: unknown;
    kind?: unknown;
    capabilities?: unknown;
    permissions?: unknown;
    last_seen_at?: unknown;
    created_at?: unknown;
}

export interface CerebroGuardado {
    id: string;
    name?: unknown;
    updated_at?: unknown;
}

export interface AvatarGuardado {
    /** La URL remota de la que salió (para saber si cambió). */
    url: string;
    tipo: string;
    bytes: ArrayBuffer;
}

/** neurona → huella probada de la misma cuenta. */
export type HuellasCuenta = Record<string, { huella: string; en: number }>;

/* ══════════════════════════ Sin secretos (puro) ══════════════════════════ */

const NOMBRE_SECRETO = /token|secret|passw|api[_-]?key|private|privad|clave|hmac|jwt|cookie|refresh|bearer|authorization|credential/i;
const FORMA_JWT = /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*$/;
const FORMA_CLAVE_HEX = /^[0-9a-f]{64}$/i;

function esSecreto(valor: unknown): boolean {
    return typeof valor === "string" && (FORMA_JWT.test(valor) || FORMA_CLAVE_HEX.test(valor));
}

/** Copia profunda SIN campos que parezcan secretos (por nombre o por forma). Pura; no muta. */
export function sinSecretos<T>(valor: T, profundidad = 0): T {
    if (profundidad > 8) return undefined as T;
    if (Array.isArray(valor)) return valor.map((x) => sinSecretos(x, profundidad + 1)).filter((x) => x !== undefined) as unknown as T;
    if (valor && typeof valor === "object") {
        if (valor instanceof ArrayBuffer || ArrayBuffer.isView(valor)) return valor;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
            if (NOMBRE_SECRETO.test(k) || esSecreto(v)) continue;
            const limpio = sinSecretos(v, profundidad + 1);
            if (limpio !== undefined) out[k] = limpio;
        }
        return out as T;
    }
    return esSecreto(valor) ? (undefined as T) : valor;
}

/** ¿Queda algo con forma de secreto en este valor? (para pruebas y para vigilar lo que se va a escribir). Pura. */
export function contieneSecretos(valor: unknown, profundidad = 0): boolean {
    if (profundidad > 8) return false;
    if (Array.isArray(valor)) return valor.some((x) => contieneSecretos(x, profundidad + 1));
    if (valor && typeof valor === "object") {
        if (valor instanceof ArrayBuffer || ArrayBuffer.isView(valor)) return false;
        return Object.entries(valor as Record<string, unknown>).some(([k, v]) => NOMBRE_SECRETO.test(k) || contieneSecretos(v, profundidad + 1));
    }
    return esSecreto(valor);
}

/* ══════════════════════════ Reducciones puras ══════════════════════════ */

/** Lo mínimo útil de una fila de `neuron_devices` (sin lo que no hace falta sin internet). Pura. */
export function neuronaParaGuardar(fila: Record<string, unknown>): NeuronaGuardada | null {
    const id = typeof fila.id === "string" ? fila.id : null;
    if (!id) return null;
    return sinSecretos({
        id,
        name: fila.name,
        kind: fila.kind,
        capabilities: fila.capabilities,
        permissions: fila.permissions,
        last_seen_at: fila.last_seen_at,
        created_at: fila.created_at,
    });
}

/** Une huellas nuevas con las que había: gana la más reciente por neurona; se queda con las `max` últimas. Pura. */
export function fusionarHuellas(previas: HuellasCuenta, nuevas: HuellasCuenta, max = 64): HuellasCuenta {
    const todas: HuellasCuenta = { ...previas };
    for (const [n, h] of Object.entries(nuevas)) {
        const p = todas[n];
        if (!p || h.en >= p.en) todas[n] = h;
    }
    const orden = Object.entries(todas).sort((a, b) => b[1].en - a[1].en).slice(0, max);
    return Object.fromEntries(orden);
}

/**
 * Huellas que merece la pena recordar a partir de las ligaduras vivas: solo las que PROBARON ser de la
 * cuenta (`porCuenta`: prueba HMAC de faro o certificado) y, si se conocen, de neuronas de la cuenta. Pura.
 */
export function huellasAprendidas(
    ligaduras: ReadonlyArray<{ neurona: string; huella: string; porCuenta?: boolean; at?: number }>,
    opciones: { conocidas?: readonly string[]; ahora?: number } = {},
): HuellasCuenta {
    const out: HuellasCuenta = {};
    const conocidas = opciones.conocidas && opciones.conocidas.length ? new Set(opciones.conocidas) : null;
    for (const l of ligaduras) {
        if (!l.porCuenta || !/^id:/.test(l.huella) || !l.neurona) continue;
        if (conocidas && !conocidas.has(l.neurona)) continue;
        out[l.neurona] = { huella: l.huella, en: l.at ?? opciones.ahora ?? Date.now() };
    }
    return out;
}

/**
 * Las huellas de la cuenta como «vínculos mínimos»: así el saludo de una neurona ya probada se acepta sin
 * servidor por el camino de siempre (`aceptarHola`: vínculo con esa huella). Pura.
 */
export function huellasComoVinculos(
    huellas: HuellasCuenta,
    uid: string | null,
    nombres: Readonly<Record<string, string>> = {},
): Array<{ neurona: string; nombre: string; huella: string; cuenta?: string }> {
    return Object.entries(huellas).map(([neurona, h]) => ({
        neurona,
        nombre: nombres[neurona] ?? "Neurona de tu cuenta",
        huella: h.huella,
        ...(uid ? { cuenta: uid } : {}),
    }));
}

/** Une los vínculos reales con los de la instantánea; los reales mandan (misma neurona → el real). Pura. */
export function unirVinculos<V extends { neurona: string }>(reales: readonly V[], cacheados: readonly V[]): V[] {
    const vistos = new Set(reales.map((v) => v.neurona));
    return [...reales, ...cacheados.filter((v) => !vistos.has(v.neurona))];
}

/* ══════════════════════════ Almacén ══════════════════════════ */

export interface Instantanea {
    escribir<T>(seccion: Seccion, uid: string, datos: T, ahora?: number): Promise<void>;
    /** La sección de ESA cuenta (null si no hay o es de otra). */
    leer<T>(seccion: Seccion, uid: string): Promise<SobreSeccion<T> | null>;
    olvidar(): Promise<void>;
}

export function crearInstantanea(almacen: AlmacenKV): Instantanea {
    return {
        async escribir(seccion, uid, datos, ahora = Date.now()) {
            if (!uid) return;
            // Los avatares son bytes: no se tocan; el resto pasa por el filtro de secretos.
            const limpio = seccion === "avatar" ? datos : sinSecretos(datos);
            try {
                await almacen.escribir(PREFIJO + seccion, { v: VERSION_INSTANTANEA, uid, en: ahora, datos: limpio } satisfies SobreSeccion<unknown>);
            } catch {
                /* sin almacenamiento: esta sesión sigue con la memoria */
            }
        },
        async leer<T>(seccion: Seccion, uid: string) {
            try {
                const s = await almacen.leer<SobreSeccion<T>>(PREFIJO + seccion);
                if (!s || s.v !== VERSION_INSTANTANEA || s.uid !== uid || !s.datos) return null;
                return s;
            } catch {
                return null;
            }
        },
        async olvidar() {
            try {
                for (const s of SECCIONES) await almacen.borrar(PREFIJO + s);
            } catch {
                /* */
            }
        },
    };
}

let porDefecto: Instantanea | null = null;
export function instantaneaCuenta(): Instantanea {
    return (porDefecto ??= crearInstantanea(almacenIdentidad()));
}
/** Solo pruebas. */
export function _ponerInstantaneaParaPruebas(i: Instantanea | null): void {
    porDefecto = i;
}

/* ══════════════════════════ Atajos que usan los consumidores ══════════════════════════ */

/** Guarda las filas de `neuron_devices` buenas (en línea). No espera: nunca estorba a quien llama. */
export function guardarNeuronas(uid: string | null, filas: ReadonlyArray<Record<string, unknown>>): void {
    if (!uid || !filas.length) return;
    const datos = filas.map(neuronaParaGuardar).filter((x): x is NeuronaGuardada => !!x);
    if (datos.length) void instantaneaCuenta().escribir("neuronas", uid, datos);
}

/** Las filas guardadas, con la forma de `neuron_devices`. */
export async function leerNeuronas(uid: string | null): Promise<Array<Record<string, unknown>> | null> {
    if (!uid) return null;
    const s = await instantaneaCuenta().leer<NeuronaGuardada[]>("neuronas", uid);
    return s && Array.isArray(s.datos) && s.datos.length ? (s.datos as unknown as Array<Record<string, unknown>>) : null;
}

export async function leerHuellas(uid: string | null): Promise<HuellasCuenta> {
    if (!uid) return {};
    const s = await instantaneaCuenta().leer<HuellasCuenta>("huellas", uid);
    return s?.datos && typeof s.datos === "object" ? s.datos : {};
}

export async function recordarHuellas(uid: string | null, nuevas: HuellasCuenta): Promise<HuellasCuenta> {
    if (!uid) return {};
    const previas = await leerHuellas(uid);
    if (!Object.keys(nuevas).length) return previas;
    const todas = fusionarHuellas(previas, nuevas);
    // Si no cambió nada, no se reescribe.
    const igual = Object.keys(todas).length === Object.keys(previas).length && Object.entries(todas).every(([n, h]) => previas[n]?.huella === h.huella);
    if (!igual) await instantaneaCuenta().escribir("huellas", uid, todas);
    return todas;
}

export async function olvidarInstantanea(): Promise<void> {
    await instantaneaCuenta().olvidar();
}
