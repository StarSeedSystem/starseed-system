/**
 * Ajustes del Director (Ola 318 · p318E) — módulo PURO, sin `node:fs`.
 * Espejo TypeScript de `scripts/puente/config_director.py`: mismos campos,
 * valores por defecto y reglas de validación (enteros >= 0, booleanos, listas
 * de cadenas). Lo usan `config/route.ts` y `accion/route.ts`; ellos hacen la
 * I/O, este archivo solo valida y fusiona.
 *
 * idéntico a config_director.py; si cambias uno, cambia el otro
 */

export interface EscaladaConfig {
    tope_haiku_dia: number;
    tope_sonnet_dia: number;
    activa: boolean;
}

export interface ConfigDirector {
    espera_aprobacion_min: number;
    intervalo_s: number;
    trabajadores: number;
    tope_por_relanzamiento: number;
    reintentos_por_pasada: number;
    escalada: EscaladaConfig;
    proveedores_apartados: string[];
    aviso_checkin: boolean;
    disco_min_gb: number;
}

// idéntico a config_director.py; si cambias uno, cambia el otro
export const DEFAULTS: ConfigDirector = {
    espera_aprobacion_min: 10,
    intervalo_s: 180,
    trabajadores: 5,
    tope_por_relanzamiento: 20,
    reintentos_por_pasada: 3,
    escalada: { tope_haiku_dia: 20, tope_sonnet_dia: 5, activa: true },
    proveedores_apartados: [],
    aviso_checkin: true,
    disco_min_gb: 5,
};

const CLAVES_ENTERO = [
    "espera_aprobacion_min", "intervalo_s", "trabajadores",
    "tope_por_relanzamiento", "reintentos_por_pasada", "disco_min_gb",
] as const;

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function esEnteroNoNegativo(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}
function esListaCadenas(v: unknown): v is string[] {
    return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function erroresEscalada(v: unknown): string[] {
    if (!esObjeto(v)) return ["'escalada' debe ser un objeto"];
    const errores: string[] = [];
    if ("tope_haiku_dia" in v && !esEnteroNoNegativo(v.tope_haiku_dia)) errores.push("'escalada.tope_haiku_dia' debe ser un entero >= 0");
    if ("tope_sonnet_dia" in v && !esEnteroNoNegativo(v.tope_sonnet_dia)) errores.push("'escalada.tope_sonnet_dia' debe ser un entero >= 0");
    if ("activa" in v && typeof v.activa !== "boolean") errores.push("'escalada.activa' debe ser un booleano");
    return errores;
}

/**
 * Valida solo las claves presentes en `entrada` (como `validar(d)` en Python)
 * y, si no hay errores, fusiona lo recibido sobre `DEFAULTS` (como
 * `cargar()`). Mensajes en español con el nombre exacto del campo.
 */
export function validar(entrada: unknown): { ok: true; valor: ConfigDirector } | { ok: false; errores: string[] } {
    if (!esObjeto(entrada)) return { ok: false, errores: ["la configuración debe ser un objeto"] };

    const errores: string[] = [];
    for (const clave of CLAVES_ENTERO) {
        if (clave in entrada && !esEnteroNoNegativo(entrada[clave])) errores.push(`'${clave}' debe ser un entero >= 0`);
    }
    if ("proveedores_apartados" in entrada && !esListaCadenas(entrada.proveedores_apartados)) {
        errores.push("'proveedores_apartados' debe ser una lista de cadenas de texto");
    }
    if ("aviso_checkin" in entrada && typeof entrada.aviso_checkin !== "boolean") {
        errores.push("'aviso_checkin' debe ser un booleano");
    }
    if ("escalada" in entrada) errores.push(...erroresEscalada(entrada.escalada));

    if (errores.length > 0) return { ok: false, errores };
    return { ok: true, valor: fusionar(DEFAULTS, entrada) };
}

function fusionarEscalada(base: EscaladaConfig, parcial: unknown): EscaladaConfig {
    const obj = esObjeto(parcial) ? parcial : {};
    return {
        tope_haiku_dia: esEnteroNoNegativo(obj.tope_haiku_dia) ? obj.tope_haiku_dia : base.tope_haiku_dia,
        tope_sonnet_dia: esEnteroNoNegativo(obj.tope_sonnet_dia) ? obj.tope_sonnet_dia : base.tope_sonnet_dia,
        activa: typeof obj.activa === "boolean" ? obj.activa : base.activa,
    };
}

/**
 * Fusión superficial: cada campo de `parcial` reemplaza al de `base` solo si
 * tiene el tipo correcto; si no, se conserva el de `base` (que puede ser
 * `DEFAULTS` o una configuración ya guardada). Nunca lanza.
 */
export function fusionar(base: ConfigDirector, parcial: unknown): ConfigDirector {
    const obj = esObjeto(parcial) ? parcial : {};
    return {
        espera_aprobacion_min: esEnteroNoNegativo(obj.espera_aprobacion_min) ? obj.espera_aprobacion_min : base.espera_aprobacion_min,
        intervalo_s: esEnteroNoNegativo(obj.intervalo_s) ? obj.intervalo_s : base.intervalo_s,
        trabajadores: esEnteroNoNegativo(obj.trabajadores) ? obj.trabajadores : base.trabajadores,
        tope_por_relanzamiento: esEnteroNoNegativo(obj.tope_por_relanzamiento) ? obj.tope_por_relanzamiento : base.tope_por_relanzamiento,
        reintentos_por_pasada: esEnteroNoNegativo(obj.reintentos_por_pasada) ? obj.reintentos_por_pasada : base.reintentos_por_pasada,
        escalada: fusionarEscalada(base.escalada, obj.escalada),
        proveedores_apartados: esListaCadenas(obj.proveedores_apartados) ? obj.proveedores_apartados : base.proveedores_apartados.slice(),
        aviso_checkin: typeof obj.aviso_checkin === "boolean" ? obj.aviso_checkin : base.aviso_checkin,
        disco_min_gb: esEnteroNoNegativo(obj.disco_min_gb) ? obj.disco_min_gb : base.disco_min_gb,
    };
}
