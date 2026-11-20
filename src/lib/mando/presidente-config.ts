/**
 * Contrato puro del Director presidente autónomo y panel headless (cero `node:*`).
 * Espejo exacto de `scripts/puente/presidente_config.py`.
 */

export const PROVEEDORES_VALIDOS_PRESIDENTE = ["claude", "hermes", "agy", "chatgpt"] as const;
export type ProveedorPresidenteId = (typeof PROVEEDORES_VALIDOS_PRESIDENTE)[number];

export const CLAVES_CANALES_SYNC = ["hermes", "telegram", "astraura", "nube"] as const;
export type ClaveCanalSync = (typeof CLAVES_CANALES_SYNC)[number];

export interface ConfigPresidente {
    orden_proveedores: ProveedorPresidenteId[];
    proveedores_activos: Record<ProveedorPresidenteId, boolean>;
    timeouts_reintento_s: number[];
    respaldo_flota_gratis: boolean;
    modelo_flota_gratis: string;
    max_opus_dia: number;
    sincronizar_canales: Record<ClaveCanalSync, boolean>;
}

export const DEFAULTS_PRESIDENTE: ConfigPresidente = {
    orden_proveedores: ["claude", "hermes", "agy", "chatgpt"],
    proveedores_activos: {
        claude: true,
        hermes: true,
        agy: true,
        chatgpt: true,
    },
    timeouts_reintento_s: [120, 300, 600],
    respaldo_flota_gratis: true,
    modelo_flota_gratis: "auto",
    max_opus_dia: 40,
    sincronizar_canales: {
        hermes: true,
        telegram: true,
        astraura: true,
        nube: true,
    },
};

export interface EstadoProveedorPresidente {
    id: string;
    nombre: string;
    activo: boolean;
    disponible: boolean;
    estado: "listo" | "ocupado" | "agotado" | "pausado" | "apagado" | "desconocido";
    detalle: string;
    latenciaMs?: number | null;
}

export interface EstadoPasarelaGratis {
    clave: string;
    modelo: string;
    estado: string;
    http: number | null;
    segundos: number | null;
    tieneClave: boolean;
}

export interface EstadoCanalUnificado {
    id: string;
    nombre: string;
    sincronizado: boolean;
    estado: "activo" | "pausado" | "revision" | "desconectado";
    detalle: string;
}

export type FuenteRegistroHeadless =
    | "cartero"
    | "director"
    | "mando"
    | "enjambre"
    | "hermes-gateway"
    | "genesis-chats"
    | "tunel-metagenesis"
    | "pruebas";

export type AccionHeadlessPresidente =
    | "enrutar-hermes"
    | "reintentar-cola"
    | "buscar-capacidad"
    | "comprobar-pasarelas"
    | "refrescar-acciones"
    | "estado-pruebas"
    | "sincronizar-ides"
    | "probar-presidente";

export interface EstadoPresidenteRespuesta {
    generadoEn: string;
    config: ConfigPresidente;
    proveedores: EstadoProveedorPresidente[];
    flotaGratis: {
        vivos: number;
        total: number;
        pasarelas: EstadoPasarelaGratis[];
    };
    canales: EstadoCanalUnificado[];
    enCola: number;
    pruebasResumen?: string;
    registro?: {
        fuente: FuenteRegistroHeadless;
        lineas: string[];
    };
}

export const FUENTES_REGISTRO_HEADLESS: { id: FuenteRegistroHeadless; etiqueta: string; descripcion: string }[] = [
    { id: "cartero", etiqueta: "Cartero director", descripcion: "Cola y enrutamiento del Director presidente" },
    { id: "director", etiqueta: "Director autónomo", descripcion: "Decisiones e integración automática" },
    { id: "hermes-gateway", etiqueta: "Hermes Gateway", descripcion: "Servicio Hermes + Telegram + sesión local" },
    { id: "enjambre", etiqueta: "Enjambre Mac", descripcion: "Workers, tsc, vitest e integraciones" },
    { id: "mando", etiqueta: "Servidor MetaGenesis", descripcion: "Rutas y latencia del panel en :9002" },
    { id: "genesis-chats", etiqueta: "Sincronización Astraura", descripcion: "Espejo bidireccional con Astraura › Genesis" },
    { id: "tunel-metagenesis", etiqueta: "Túnel MetaGenesis", descripcion: "Exposición segura para contenedores remotos" },
    { id: "pruebas", etiqueta: "Director de pruebas", descripcion: "Compilaciones y verificación .55 / .56" },
];

export function clonarDefaultsPresidente(): ConfigPresidente {
    return {
        orden_proveedores: [...DEFAULTS_PRESIDENTE.orden_proveedores],
        proveedores_activos: { ...DEFAULTS_PRESIDENTE.proveedores_activos },
        timeouts_reintento_s: [...DEFAULTS_PRESIDENTE.timeouts_reintento_s],
        respaldo_flota_gratis: DEFAULTS_PRESIDENTE.respaldo_flota_gratis,
        modelo_flota_gratis: DEFAULTS_PRESIDENTE.modelo_flota_gratis,
        max_opus_dia: DEFAULTS_PRESIDENTE.max_opus_dia,
        sincronizar_canales: { ...DEFAULTS_PRESIDENTE.sincronizar_canales },
    };
}

export function validarConfigPresidente(
    raw: unknown,
): { ok: true; valor: ConfigPresidente } | { ok: false; errores: string[] } {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, errores: ["La configuración debe ser un objeto JSON"] };
    }
    const obj = raw as Record<string, unknown>;
    const errores: string[] = [];
    const base = clonarDefaultsPresidente();

    if ("orden_proveedores" in obj) {
        const lista = obj.orden_proveedores;
        if (
            !Array.isArray(lista) ||
            lista.length === 0 ||
            !lista.every(
                (p): p is ProveedorPresidenteId =>
                    typeof p === "string" &&
                    (PROVEEDORES_VALIDOS_PRESIDENTE as readonly string[]).includes(p),
            )
        ) {
            errores.push("'orden_proveedores' debe listar proveedores válidos");
        } else {
            const limpios: ProveedorPresidenteId[] = [];
            for (const p of lista) if (!limpios.includes(p)) limpios.push(p);
            for (const p of PROVEEDORES_VALIDOS_PRESIDENTE) if (!limpios.includes(p)) limpios.push(p);
            base.orden_proveedores = limpios;
        }
    }

    if ("proveedores_activos" in obj) {
        const pa = obj.proveedores_activos;
        if (!pa || typeof pa !== "object" || Array.isArray(pa)) {
            errores.push("'proveedores_activos' debe ser un objeto");
        } else {
            for (const [k, v] of Object.entries(pa as Record<string, unknown>)) {
                if (!(PROVEEDORES_VALIDOS_PRESIDENTE as readonly string[]).includes(k)) {
                    errores.push(`Proveedor desconocido en 'proveedores_activos': ${k}`);
                } else if (typeof v !== "boolean") {
                    errores.push(`'proveedores_activos.${k}' debe ser booleano`);
                } else {
                    base.proveedores_activos[k as ProveedorPresidenteId] = v;
                }
            }
        }
    }

    if ("timeouts_reintento_s" in obj) {
        const ts = obj.timeouts_reintento_s;
        if (
            !Array.isArray(ts) ||
            ts.length < 1 ||
            ts.length > 5 ||
            !ts.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 15 && n <= 1800)
        ) {
            errores.push("'timeouts_reintento_s' debe tener 1..5 enteros entre 15 y 1800 s");
        } else {
            base.timeouts_reintento_s = [...(ts as number[])];
        }
    }

    if ("respaldo_flota_gratis" in obj) {
        if (typeof obj.respaldo_flota_gratis !== "boolean") {
            errores.push("'respaldo_flota_gratis' debe ser booleano");
        } else {
            base.respaldo_flota_gratis = obj.respaldo_flota_gratis;
        }
    }

    if ("modelo_flota_gratis" in obj) {
        const m = obj.modelo_flota_gratis;
        if (typeof m !== "string" || !m.trim() || m.trim().length > 120) {
            errores.push("'modelo_flota_gratis' debe ser texto no vacío (≤120 chars)");
        } else {
            base.modelo_flota_gratis = m.trim();
        }
    }

    if ("max_opus_dia" in obj) {
        const v = obj.max_opus_dia;
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 200) {
            errores.push("'max_opus_dia' debe ser entero entre 0 y 200");
        } else {
            base.max_opus_dia = v;
        }
    }

    if ("sincronizar_canales" in obj) {
        const sc = obj.sincronizar_canales;
        if (!sc || typeof sc !== "object" || Array.isArray(sc)) {
            errores.push("'sincronizar_canales' debe ser un objeto");
        } else {
            for (const [k, v] of Object.entries(sc as Record<string, unknown>)) {
                if (!(CLAVES_CANALES_SYNC as readonly string[]).includes(k)) {
                    errores.push(`Canal desconocido en 'sincronizar_canales': ${k}`);
                } else if (typeof v !== "boolean") {
                    errores.push(`'sincronizar_canales.${k}' debe ser booleano`);
                } else {
                    base.sincronizar_canales[k as ClaveCanalSync] = v;
                }
            }
        }
    }

    if (errores.length > 0) return { ok: false, errores };
    return { ok: true, valor: base };
}
