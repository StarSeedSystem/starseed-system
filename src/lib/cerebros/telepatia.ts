/**
 * Telepatía: vínculos puros entre cerebros, sin mezcla (CB1013E, §5).
 * Módulo PURO: sin red, sin disco, sin procesos.
 */

export const CONFIGURACIONES_TELEPATIA = [
    "servers",
    "runtimes",
    "skills",
    "storage",
    "apps",
    "moa",
    "channels",
    "conectores",
    "includes.personalities",
] as const;

export type ConfiguracionTelepatia = (typeof CONFIGURACIONES_TELEPATIA)[number];

export type DestinoTelepatia =
    | { tipo: "cerebro"; id: string }
    | { tipo: "grupo" | "comunidad" | "pagina"; id: string }
    | { tipo: "cuenta"; id: string };

export interface VinculoTelepatico {
    id: string;
    destino: DestinoTelepatia;
    alcance: {
        completo: boolean;
        memorias: string[];
        carpetas: string[];
        configuraciones: string[];
    };
    direccion: "enviar" | "recibir" | "ambas";
    acceso: "leer" | "escribir";
    auto: boolean;
    estado: "activo" | "pausado" | "pendiente";
    creadoEn: string;
    expiraEn?: string | null;
    ultimaSync?: string | null;
}

export function validarVinculo(
    v: unknown,
): { ok: true; vinculo: VinculoTelepatico } | { ok: false; motivo: string } {
    if (typeof v !== "object" || v === null) return { ok: false, motivo: "no es objeto" };
    const o = v as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id.trim() === "") return { ok: false, motivo: "falta id" };

    if (typeof o.destino !== "object" || o.destino === null) return { ok: false, motivo: "destino no es objeto" };
    const d = o.destino as Record<string, unknown>;
    if (typeof d.tipo !== "string") return { ok: false, motivo: "destino.tipo no es string" };
    const tiposDestino: string[] = ["cerebro", "grupo", "comunidad", "pagina", "cuenta"];
    if (!tiposDestino.includes(d.tipo)) return { ok: false, motivo: "destino.tipo inválido" };
    if (typeof d.id !== "string" || (d.id as string).trim() === "") return { ok: false, motivo: "destino.id vacío" };

    if (typeof o.alcance !== "object" || o.alcance === null) return { ok: false, motivo: "alcance no es objeto" };
    const a = o.alcance as Record<string, unknown>;
    if (typeof a.completo !== "boolean") return { ok: false, motivo: "alcance.completo debe ser boolean" };
    if (!a.completo) {
        const hayMem = Array.isArray(a.memorias) && a.memorias.length > 0;
        const hayCarp = Array.isArray(a.carpetas) && a.carpetas.length > 0;
        const hayConf = Array.isArray(a.configuraciones) && a.configuraciones.length > 0;
        if (!hayMem && !hayCarp && !hayConf) return { ok: false, motivo: "alcance vacío y no completo" };
    }
    if (Array.isArray(a.memorias)) {
        for (const m of a.memorias) if (typeof m !== "string") return { ok: false, motivo: "memorias: elemento no string" };
    }
    if (Array.isArray(a.carpetas)) {
        for (const c of a.carpetas) if (typeof c !== "string") return { ok: false, motivo: "carpetas: elemento no string" };
    }
    if (Array.isArray(a.configuraciones)) {
        const confLista = CONFIGURACIONES_TELEPATIA.map((c) => c);
        for (const c of a.configuraciones) {
            if (typeof c !== "string" || !confLista.includes(c as typeof confLista[number])) return { ok: false, motivo: "configuración fuera de la lista" };
        }
    }

    const direccionesValidas = ["enviar", "recibir", "ambas"];
    if (typeof o.direccion !== "string" || !direccionesValidas.includes(o.direccion as string)) return { ok: false, motivo: "direccion inválida" };
    const accesosValidos = ["leer", "escribir"];
    if (typeof o.acceso !== "string" || !accesosValidos.includes(o.acceso as string)) return { ok: false, motivo: "acceso inválido" };
    if (typeof o.auto !== "boolean") return { ok: false, motivo: "auto debe ser boolean" };
    const estadosValidos = ["activo", "pausado", "pendiente"];
    if (typeof o.estado !== "string" || !estadosValidos.includes(o.estado as string)) return { ok: false, motivo: "estado inválido" };
    if (typeof o.creadoEn !== "string" || o.creadoEn.trim() === "") return { ok: false, motivo: "creadoEn vacío" };
    if (isNaN(new Date(o.creadoEn).getTime())) return { ok: false, motivo: "creadoEn no es fecha ISO" };
    if ("expiraEn" in o && o.expiraEn !== null && o.expiraEn !== undefined) {
        if (typeof o.expiraEn !== "string" || o.expiraEn.trim() === "") return { ok: false, motivo: "expiraEn vacío" };
        if (isNaN(new Date(o.expiraEn).getTime())) return { ok: false, motivo: "expiraEn no es fecha ISO" };
    }
    if ("ultimaSync" in o && o.ultimaSync !== null && o.ultimaSync !== undefined) {
        if (typeof o.ultimaSync !== "string" || o.ultimaSync.trim() === "") return { ok: false, motivo: "ultimaSync vacío" };
        if (isNaN(new Date(o.ultimaSync).getTime())) return { ok: false, motivo: "ultimaSync no es fecha ISO" };
    }

    return { ok: true, vinculo: v as VinculoTelepatico };
}

export function normalizarVinculos(
    config: Record<string, unknown> | null | undefined,
): VinculoTelepatico[] {
    if (typeof config !== "object" || config === null) return [];
    const raw = (config as Record<string, unknown>).telepatia;
    if (!Array.isArray(raw)) return [];
    const result: VinculoTelepatico[] = [];
    for (const item of raw) {
        const r = validarVinculo(item);
        if (r.ok) result.push(r.vinculo);
    }
    return result;
}

export function conVinculo(
    config: Record<string, unknown> | null | undefined,
    v: VinculoTelepatico,
): Record<string, unknown> {
    const base = config !== null && typeof config === "object" ? { ...(config as Record<string, unknown>) } : {};
    const actuales = normalizarVinculos(base);
    const sinEste = actuales.filter((item) => item.id !== v.id);
    return { ...base, telepatia: [...sinEste, v] };
}

export function sinVinculo(
    config: Record<string, unknown> | null | undefined,
    id: string,
): Record<string, unknown> {
    if (typeof config !== "object" || config === null) return {};
    const actuales = normalizarVinculos(config);
    const filtrados = actuales.filter((item) => item.id !== id);
    return { ...config, telepatia: filtrados };
}

export function estaCaducado(v: VinculoTelepatico, ahora: number): boolean {
    if (v.expiraEn !== null && v.expiraEn !== undefined && v.expiraEn !== "") {
        const exp = new Date(v.expiraEn).getTime();
        if (!isNaN(exp) && ahora > exp) return true;
    }
    return false;
}

export interface OrigenEstado {
    archivos: Array<{ name: string; content: string; updated_at?: string | null }>;
    prefs: Record<string, unknown>;
}

export interface DestinoEstado {
    archivos: Array<{ name: string; content: string; updated_at?: string | null }>;
    prefs: Record<string, unknown>;
}

export interface OperacionPlan {
    tipo: "archivo" | "config" | "carpeta";
    nombre: string;
    de: "origen" | "destino";
    a: "origen" | "destino";
}

function masNuevo(o?: { updated_at?: string | null } | null, d?: { updated_at?: string | null } | null): "o" | "d" | "igual" | "sin_medida" {
    const oStr = o?.updated_at ?? null;
    const dStr = d?.updated_at ?? null;
    if (!oStr && !dStr) return "sin_medida";
    if (!oStr && dStr) return "d";
    if (oStr && !dStr) return "o";
    if (oStr === dStr) return "igual";
    const oMs = new Date(oStr!).getTime();
    const dMs = new Date(dStr!).getTime();
    if (isNaN(oMs) && isNaN(dMs)) return "sin_medida";
    if (isNaN(oMs)) return "d";
    if (isNaN(dMs)) return "o";
    return oMs >= dMs ? "o" : "d";
}

function archivoExisteEn(nombre: string, arr: Array<{ name: string; content: string; updated_at?: string | null }>): { content: string; updated_at?: string | null } | null {
    for (const a of arr) if (a.name === nombre) return a;
    return null;
}

export function planSincronizacion(
    v: VinculoTelepatico,
    origen: OrigenEstado,
    destino: DestinoEstado,
): OperacionPlan[] {
    // Vínculo inactivo, pendiente o caducado → plan vacío.
    if (v.estado !== "activo") return [];
    if (v.expiraEn !== null && v.expiraEn !== undefined && v.expiraEn !== "") {
        const expMs = new Date(v.expiraEn).getTime();
        if (!isNaN(expMs) && Date.now() > expMs) return [];
    }

    const resultado: OperacionPlan[] = [];

    // Alcance completo o solo los nombrados.
    const alcance = v.alcance;
    const esCompleto = alcance.completo === true;

    // Operaciones por archivo (memorias).
    const archivosOr = Array.isArray(origen.archivos) ? origen.archivos : [];
    const archivosDest = Array.isArray(destino.archivos) ? destino.archivos : [];

    const nombresArchivo: string[] = esCompleto
        ? archivosOr.map((a) => a.name)
        : (Array.isArray(alcance.memorias) ? alcance.memorias : []);
    for (const nombre of nombresArchivo) {
        const oArc = archivoExisteEn(nombre, archivosOr);
        const dArc = archivoExisteEn(nombre, archivosDest);
        if (!oArc && !dArc) continue;
        const nuevo = masNuevo(oArc ?? null, dArc ?? null);

        // Dirección y acceso determinan qué operaciones se generan.
        // 'enviar' = solo origen → destino; 'recibir' = solo destino → origen; 'ambas' = ambas.
        // 'leer' = el otro lado solo lee → nunca operaciones destino → origen.
        const acceso = v.acceso;
        const dir = v.direccion;

        // Regla: acceso 'leer' → nunca operaciones destino → origen.
        if (v.direccion === "enviar" || v.direccion === "ambas") {
            if (nuevo === "o") {
                resultado.push({ tipo: "archivo", nombre, de: "origen", a: "destino" });
            } else if (nuevo === "d" && v.acceso === "escribir") {
                resultado.push({ tipo: "archivo", nombre, de: "destino", a: "origen" });
            }
        }
        if (v.direccion === "recibir") {
            if (nuevo === "d") {
                resultado.push({ tipo: "archivo", nombre, de: "destino", a: "origen" });
            }
        }
        // Reglas de nunca borrar: no añadimos ninguna operación de borrado.
    }

    // Operaciones de carpeta.
    const carpetas = esCompleto ? [] : (Array.isArray(alcance.carpetas) ? alcance.carpetas : []);
    // Si completo, no hay carpetas nombradas; si no completo, una por carpeta nombrada.
    // Si alcance.completo, podríamos incluir carpetas nombradas? El contrato dice: alcance completo → todos los archivos y todas las configuraciones; si no, solo los nombrados.
    // Para carpetas: cada carpeta nombrada genera una operación 'carpeta'.
    for (const carpeta of carpetas) {
        if (carpeta.trim() === "") continue;
        // Dirección y acceso determinan sentido.
        if (v.direccion === "enviar" || v.direccion === "ambas") {
            resultado.push({ tipo: "carpeta", nombre: carpeta, de: "origen", a: "destino" });
        }
        if ((v.direccion === "recibir" || v.direccion === "ambas") && v.acceso === "escribir") {
            resultado.push({ tipo: "carpeta", nombre: carpeta, de: "destino", a: "origen" });
        }
    }

    // Operaciones de configuración.
    const configuraciones = esCompleto ? CONFIGURACIONES_TELEPATIA.map((c) => c) : (Array.isArray(alcance.configuraciones) ? alcance.configuraciones : []);
    // Copiamos configuraciones del destino al origen o viceversa según dirección/acceso.
    for (const conf of configuraciones) {
        if (v.direccion === "enviar" || v.direccion === "ambas") {
            resultado.push({ tipo: "config", nombre: conf, de: "origen", a: "destino" });
        }
        if ((v.direccion === "recibir" || v.direccion === "ambas") && v.acceso === "escribir") {
            resultado.push({ tipo: "config", nombre: conf, de: "destino", a: "origen" });
        }
    }

    return resultado;
}
