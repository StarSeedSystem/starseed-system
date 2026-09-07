/**
 * Catálogo de proveedores de inteligencia para el Mando (Ola 271)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un solo sitio con, para cada proveedor real de la flota: su base de API,
 * dónde se consigue la clave, su documentación, qué da gratis y si necesita
 * una cuenta que solo Alex puede abrir. Es un módulo PURO (sin I/O): lo
 * consumen `panel-flota.tsx` y el test. Nunca guarda claves reales, solo
 * nombres de variables de entorno y huellas.
 */

/** Estado de un proveedor según el catálogo y su salud. */
export type EstadoProveedor =
    | "activo"
    | "enfriandose"
    | "sinCupo"
    | "sinClave"
    | "porConseguir";

/** Resultado de `proveedoresDisponibles`: catálogo cruzado con la salud viva. */
export interface ProveedorDisponible extends ProveedorInfo {
    /** Estado deducido de la salud y de si tiene clave. */
    estado: EstadoProveedor;
    /** Claves conocidas (var · medio · huella), nunca sus valores. */
    claves: ClaveProveedor[];
    /** Variable de la clave activa, si hay una. */
    activa: string | null;
    /** Hasta cuándo queda sin cupo («AAAA-MM-DD HH:MM:SS»), si lo hay. */
    sinCupoHasta: string | null;
    /** La salud local tiene más de 30 min: chip «dato antiguo» en el panel. */
    datoAntiguo: boolean;
    /** Edad del dato de salud en minutos, si hay fecha que interpretar. */
    edadSaludMin: number | null;
}

/** Salud de claves tal y como la escribe `~/.starseed/salud-proveedores.json` (P9). */
export interface SaludClavesProveedor {
    /** Variable de entorno (nombre). */
    var: string;
    /** Medio donde vive la clave. */
    medio: string;
    /** Huella, nunca el valor. */
    huella: string;
    /** Hasta cuándo está agotada, si lo está. */
    agotada_hasta?: string | null;
}

/** Ficha de salud de un proveedor (solo los campos que este módulo necesita). */
export interface SaludProvEntrada {
    estado?: string | null;
    sin_cupo_hasta?: string | null;
    /** Momento del sondeo del supervisor («AAAA-MM-DD HH:MM:SS»); > 30 min = dato viejo. */
    t?: string | null;
    /** Algunos orquestadores lo escriben como `desde` en vez de `t`. */
    desde?: string | null;
    claves?: { claves?: SaludClavesProveedor[]; activa?: string | null; sin_cupo_hasta?: string | null } | null;
}

/** Foto de un proveedor en el bus (lo que ve el orquestador de la nube). */
export interface FotoProveedorBus {
    estado: string;
    /** Momento del latido (ISO), para saber si la foto es más nueva que la salud local. */
    t?: string | null;
}

/** Entrada nueva de `proveedoresDisponibles` (Ola 271 · M9B): salud + claves reales + bus. */
export interface ConsultaProveedores {
    salud: unknown;
    /** Claves presentes de verdad en la máquina, por proveedor (var · medio · huella). */
    clavesPresentes?: Record<string, Array<{ var: string; medio: string; huella: string }>>;
    /** Foto del bus por proveedor (el estado que ve el orquestador que está corriendo). */
    foto?: Record<string, FotoProveedorBus>;
    /** «Ahora» en ms (inyectable para los tests). */
    ahora?: number;
}

/** Resultado de clasificar un proveedor: estado y si el dato de salud está viejo. */
export interface ClasificacionProveedor {
    estado: EstadoProveedor;
    /** La salud local tiene más de 30 min y manda la foto del bus (o NADA dice «caído»). */
    datoAntiguo: boolean;
    /** Edad del dato de salud en minutos, si hay fecha que interpretar. */
    edadSaludMin: number | null;
}

/** Una clave de un proveedor: variable de entorno, medio y huella (nunca su valor). */
export interface ClaveProveedor {
    /** Nombre de la variable de entorno, p. ej. «NVIDIA_API_KEY». */
    var: string;
    /** Medio donde vive: «proceso», «~/.hermes/.env», «~/.starseed/env»… */
    medio: string;
    /** Huella (prefijo/longitud), nunca el valor: p. ej. «nvapi-…». */
    huella: string;
    /** Hasta cuándo está agotada («AAAA-MM-DD HH:MM:SS») o null si no lo está. */
    agotadaHasta: string | null;
}

/** Información editorial de un proveedor del catálogo. */
export interface ProveedorInfo {
    id: string;
    nombre: string;
    /** URL base de la API (raíz, sin `/chat/completions`). */
    base: string;
    /** Dónde se consigue la clave. */
    panelClaves: string;
    /** Documentación de la API. */
    docs: string;
    /** Qué da gratis, en una frase. */
    gratis: string;
    /** True si hace falta una cuenta (que solo Alex crea hoy). */
    requiereCuenta: boolean;
    /** True si responde gratis sin clave (a cupo reducido). */
    sinClaveOk?: boolean;
    /** Variables de entorno conocidas para este proveedor. */
    variables: string[];
}

/** Catálogo fijo de proveedores (los verificados en `memory/orquestacion-economica.md` §5). */
export const PROVEEDORES_CATALOGO: ProveedorInfo[] = [
    {
        id: "nim",
        nombre: "NVIDIA NIM",
        base: "https://integrate.api.nvidia.com/v1",
        panelClaves: "https://build.nvidia.com",
        docs: "https://build.nvidia.com",
        gratis: "82 modelos gratuitos con clave comunitaria (~40 req/min).",
        requiereCuenta: true,
        variables: ["NVIDIA_API_KEY", "NVIDIA_SHARED_KEY"],
    },
    {
        id: "xkiro",
        nombre: "xKiro",
        base: "https://api.xkiro.com/v1",
        panelClaves: "https://xkiro.com",
        docs: "https://xkiro.com",
        gratis: "40 modelos gratuitos con tool-calling; 5M tokens/día.",
        requiereCuenta: true,
        variables: ["XKIRO_API_KEY"],
    },
    {
        id: "aihubmix",
        nombre: "AIHubMix",
        base: "https://aihubmix.com/v1",
        panelClaves: "https://aihubmix.com",
        docs: "https://aihubmix.com",
        gratis: "54 modelos gratuitos de 412 (revisor principal).",
        requiereCuenta: true,
        variables: ["AIHUBMIX_API_KEY"],
    },
    {
        id: "tokenrouter",
        nombre: "TokenRouter",
        base: "https://api.tokenrouter.com/v1",
        panelClaves: "https://tokenrouter.com",
        docs: "https://tokenrouter.com",
        gratis: "Modelos `:free` de relevo (glm-5.3, nemotron-3-nano).",
        requiereCuenta: true,
        variables: ["TOKENROUTER_API_KEY"],
    },
    {
        id: "openrouter",
        nombre: "OpenRouter · :free",
        base: "https://openrouter.ai/api/v1",
        panelClaves: "https://openrouter.ai/keys",
        docs: "https://openrouter.ai/api/v1",
        gratis: "50 peticiones/día con modelos `:free`.",
        requiereCuenta: true,
        variables: ["OPENROUTER_API_KEY", "OPENROUTER_SHARED_KEY"],
    },
    {
        id: "gemini",
        nombre: "Google Gemini",
        base: "https://generativelanguage.googleapis.com",
        panelClaves: "https://aistudio.google.com/app/apikey",
        docs: "https://aistudio.google.com",
        gratis: "flash-lite a ~15 req/min (última reserva).",
        requiereCuenta: true,
        variables: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "NEXT_PUBLIC_GOOGLE_API_KEY"],
    },
    {
        id: "llm7",
        nombre: "LLM7.io",
        base: "https://api.llm7.io/v1",
        panelClaves: "https://llm7.io",
        docs: "https://llm7.io",
        gratis: "gpt-oss y minimax-m2.7 sin clave (10 req/min).",
        requiereCuenta: false,
        variables: ["LLM7_API_KEY"],
    },
    {
        id: "freetheai",
        nombre: "FreeTheAi",
        base: "https://api.freetheai.xyz/v1",
        panelClaves: "FreeTheAi en Discord",
        docs: "https://api.freetheai.xyz/v1",
        gratis: "60+ modelos; clave por Discord, 250 llamadas/día.",
        requiereCuenta: true,
        variables: ["FREETHEAI_API_KEY"],
    },
    {
        id: "groq",
        nombre: "Groq",
        base: "https://api.groq.com/openai/v1",
        panelClaves: "https://console.groq.com/keys",
        docs: "https://console.groq.com",
        gratis: "por confirmar",
        requiereCuenta: true,
        variables: ["GROQ_API_KEY"],
    },
    {
        id: "cerebras",
        nombre: "Cerebras",
        base: "https://api.cerebras.ai/v1",
        panelClaves: "https://cloud.cerebras.ai",
        docs: "https://cloud.cerebras.ai",
        gratis: "por confirmar",
        requiereCuenta: true,
        variables: [],
    },
    {
        id: "cloudflare",
        nombre: "Cloudflare Workers AI",
        base: "https://api.cloudflare.com/client/v4/accounts",
        panelClaves: "https://dash.cloudflare.com",
        docs: "https://dash.cloudflare.com",
        gratis: "por confirmar",
        requiereCuenta: true,
        variables: [],
    },
    {
        id: "sambanova",
        nombre: "SambaNova",
        base: "https://api.sambanova.ai/v1",
        panelClaves: "https://cloud.sambanova.ai",
        docs: "https://cloud.sambanova.ai",
        gratis: "por confirmar",
        requiereCuenta: true,
        variables: [],
    },
    {
        id: "modelscope",
        nombre: "ModelScope",
        base: "https://api-inference.modelscope.cn/v1",
        panelClaves: "https://modelscope.cn",
        docs: "https://modelscope.cn",
        gratis: "por confirmar",
        requiereCuenta: true,
        variables: [],
    },
    {
        id: "zai",
        nombre: "Z.ai",
        base: "https://api.z.ai/api/paas/v4",
        panelClaves: "https://z.ai",
        docs: "https://z.ai",
        gratis: "por confirmar",
        requiereCuenta: true,
        variables: [],
    },
    {
        id: "opencode-zen",
        nombre: "OpenCode Zen",
        base: "https://opencode.ai/zen",
        panelClaves: "https://opencode.ai/zen",
        docs: "https://opencode.ai/zen",
        gratis: "por confirmar",
        requiereCuenta: true,
        variables: [],
    },
];

/** Normaliza a texto no vacío, o null. */
function texto(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Convierte una entrada de salud (claves) a claves normalizadas, nunca valores. */
function clavesDe(claves: SaludProvEntrada["claves"]): ClaveProveedor[] {
    if (!claves || !Array.isArray(claves.claves)) return [];
    return claves.claves.map((c) => ({
        var: texto(c.var) ?? "",
        medio: texto(c.medio) ?? "",
        huella: texto(c.huella) ?? "",
        agotadaHasta: texto(c.agotada_hasta),
    }));
}

/** Fecha del supervisor («AAAA-MM-DD HH:MM:SS», hora de la máquina) → ms, o null. */
function msDeFechaSupervisor(t: string | null | undefined): number | null {
    if (!t) return null;
    const ms = Date.parse(t.replace(" ", "T") + (t.length <= 19 ? "Z" : ""));
    return Number.isFinite(ms) ? ms : null;
}

/** Un proveedor se considera «caído» con estos estados, vengan de la salud o del bus. */
function esCaido(estado: string | null | undefined): boolean {
    return estado === "caido" || estado === "agotado";
}

/**
 * Clasificación honesta de un proveedor (Ola 271 · M9B). Regla:
 *  - Sin clave presente (ni en la máquina ni en la salud) y sin `sinClaveOk` → porConseguir.
 *  - Con clave y `sin_cupo_hasta` futuro → sinCupo.
 *  - Con clave y estado «caido» en salud RECIENTE o en la foto del bus → enfriandose.
 *  - Si la salud tiene más de 30 min → `datoAntiguo` y se prefiere la foto del bus si es
 *    más nueva; si no hay foto más nueva, la salud vieja NO condena (se descarta).
 *  - Si nada de lo anterior → activo.
 */
export function clasificarProveedor(
    info: ProveedorInfo,
    entrada: SaludProvEntrada | null,
    clavesPresentes: ClaveProveedor[],
    foto: FotoProveedorBus | null | undefined,
    ahora: number,
): ClasificacionProveedor {
    const clavesSalud = clavesDe(entrada?.claves ?? null);
    const tieneClave = clavesPresentes.length > 0 || clavesSalud.length > 0;
    const sinClaveOk = info.sinClaveOk ?? !info.requiereCuenta;

    // Edad del dato de salud: más de 30 min = «dato antiguo» que no condena por sí solo.
    const msSalud = msDeFechaSupervisor(entrada?.t ?? entrada?.desde);
    const edadSaludMin = msSalud !== null ? Math.max(0, Math.floor((ahora - msSalud) / 60_000)) : null;
    const datoAntiguo = msSalud !== null && ahora - msSalud > 30 * 60_000;

    if (!tieneClave) {
        return { estado: sinClaveOk ? "sinClave" : "porConseguir", datoAntiguo, edadSaludMin };
    }

    const sinCupoHasta = texto(entrada?.claves?.sin_cupo_hasta) ?? texto(entrada?.sin_cupo_hasta);
    if (sinCupoHasta) {
        const ms = msDeFechaSupervisor(sinCupoHasta);
        // Solo condena si es futuro (o una fecha ilegible: más vale cautela).
        if (ms === null || ms > ahora) {
            return { estado: "sinCupo", datoAntiguo, edadSaludMin };
        }
    }

    // Fuente del estado: la foto del bus si la salud está vieja y la foto es más nueva.
    const msFoto = foto?.t ? Date.parse(foto.t) : null;
    const fotoMasNueva =
        foto != null && datoAntiguo && (msSalud === null || msFoto === null || msFoto > msSalud);
    const estadoSalud = datoAntiguo && !fotoMasNueva ? null : (entrada?.estado ?? null);
    const estadoEfectivo = fotoMasNueva ? foto?.estado : (estadoSalud ?? foto?.estado ?? null);
    if (esCaido(estadoEfectivo)) {
        return { estado: "enfriandose", datoAntiguo, edadSaludMin };
    }
    return { estado: "activo", datoAntiguo, edadSaludMin };
}

/**
 * Cruza el catálogo con la salud del supervisor y devuelve cada proveedor con su
 * estado, sus claves (nombres y huellas, nunca valores) y cuál está activa.
 * Firma antigua (solo salud) mantenida como sobrecarga; la nueva recibe además las
 * claves presentes de verdad en la máquina y la foto del bus (Ola 271 · M9B).
 */
export function proveedoresDisponibles(salud: unknown, catalogo?: ProveedorInfo[]): ProveedorDisponible[];
export function proveedoresDisponibles(consulta: ConsultaProveedores, catalogo?: ProveedorInfo[]): ProveedorDisponible[];
export function proveedoresDisponibles(
    consultaOSalud: unknown | ConsultaProveedores,
    catalogo: ProveedorInfo[] = PROVEEDORES_CATALOGO,
): ProveedorDisponible[] {
    // Sobrecarga: la consulta nueva se distingue por llevar la clave `salud`.
    const esConsulta =
        typeof consultaOSalud === "object" &&
        consultaOSalud !== null &&
        "salud" in (consultaOSalud as Record<string, unknown>);
    const consulta: ConsultaProveedores = esConsulta
        ? (consultaOSalud as ConsultaProveedores)
        : { salud: consultaOSalud };
    const d = typeof consulta.salud === "object" && consulta.salud !== null && !Array.isArray(consulta.salud)
        ? (consulta.salud as Record<string, unknown>)
        : {};
    const ahora = consulta.ahora ?? Date.now();

    return catalogo.map((info) => {
        const entrada = (d[info.id] ?? null) as SaludProvEntrada | null;
        // Las presentes no conocen su agotamiento (lo sabe el supervisor): null.
        const presentes: ClaveProveedor[] = (consulta.clavesPresentes?.[info.id] ?? []).map((c) => ({
            var: c.var,
            medio: c.medio,
            huella: c.huella,
            agotadaHasta: null,
        }));
        const saludClaves = clavesDe(entrada?.claves ?? null);
        // Presentes primero (son las que valen: están en ESTA máquina), luego las que
        // anunció el supervisor, sin repetir por var+medio.
        const claves: ClaveProveedor[] = [...presentes];
        const vistas = new Set(presentes.map((c) => `${c.var}|${c.medio}`));
        for (const c of saludClaves) {
            const llave = `${c.var}|${c.medio}`;
            if (!vistas.has(llave)) {
                vistas.add(llave);
                claves.push(c);
            }
        }
        const activa = texto(entrada?.claves?.activa) ?? presentes[0]?.var ?? null;
        const sinCupoHasta = texto(entrada?.claves?.sin_cupo_hasta) ?? texto(entrada?.sin_cupo_hasta);
        const clasificacion = clasificarProveedor(
            info,
            entrada,
            presentes,
            consulta.foto?.[info.id] ?? null,
            ahora,
        );
        return { ...info, ...clasificacion, claves, activa, sinCupoHasta };
    });
}