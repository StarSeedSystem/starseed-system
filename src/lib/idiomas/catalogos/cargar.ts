/**
 * IDI1115N · Carga el catálogo de un idioma: primero cargadores integrados (en, pt, fr),
 * luego paquetes instalados vía IMA11 (leerPaquete). Un paquete que falla al cargar devuelve null.
 * Las claves de un paquete externo se mapean a las claves españolas del OS con `mapearClaves`
 * (IMA10); la fuente se inyecta, o se trae bajo demanda de `fuente.json` (import perezoso: solo
 * cuando un paquete se carga, nunca para los idiomas integrados). Sin red en tiempo de pintado;
 * también en apps nativas con interfaz estática.
 */
import { crearCatalogo, type Catalogo, type DatosCatalogo } from "../catalogo";
import { crearAlmacenPaquetes, type AlmacenPaquetes } from "../paquete/almacen";
import { mapearClaves } from "../paquete/mapear";

const CARGADORES: Record<string, () => Promise<{ default: DatosCatalogo }>> = {
    en: () => import("./en.json") as Promise<{ default: DatosCatalogo }>,
    pt: () => import("./pt.json") as Promise<{ default: DatosCatalogo }>,
    fr: () => import("./fr.json") as Promise<{ default: DatosCatalogo }>,
};

const memoria = new Map<string, Catalogo>();
let almacen: AlmacenPaquetes = crearAlmacenPaquetes();

/** Las claves españolas del OS (las claves de `fuente.json`), inyectadas o leídas bajo demanda. */
let clavesFuente: Record<string, unknown> | null = null;

/**
 * Inyecta las claves españolas del OS (el JSON puede ser enorme y el módulo puro no lo importa);
 * null las olvida y la siguiente carga vuelve a leerlas.
 */
export function inyectarClavesFuente(claves: Record<string, unknown> | null): void {
    clavesFuente = claves;
}

async function clavesDelOs(): Promise<Record<string, unknown>> {
    if (clavesFuente) return clavesFuente;
    try {
        const modulo = (await import("./fuente.json")) as {
            default: { claves: Record<string, unknown> };
        };
        clavesFuente = modulo.default.claves;
    } catch {
        clavesFuente = {}; // si la fuente no se puede leer, el mapeo se limita a las claves exactas
    }
    return clavesFuente;
}

export function _reiniciarAlmacen(a?: AlmacenPaquetes): void {
    almacen = a ?? crearAlmacenPaquetes();
}

export async function cargarCatalogo(
    codigo: string,
    opciones?: { preferirPaquete?: boolean }
): Promise<Catalogo | null> {
    const hecho = memoria.get(codigo);
    if (hecho) return hecho;

    const cargador = CARGADORES[codigo];
    if (cargador && !opciones?.preferirPaquete) {
        try {
            const cat = crearCatalogo((await cargador()).default);
            memoria.set(codigo, cat);
            return cat;
        } catch { return null; }
    }

    const paquete = almacen.leerPaquete(codigo);
    if (paquete) {
        try {
            const mapeo = mapearClaves(paquete.entradas, await clavesDelOs());
            const datos: DatosCatalogo = {
                codigo: paquete.codigo,
                revisado: paquete.revisado.estado === "revisado",
                // el mapeo añade las claves españolas (normalizadas o resueltas por el valor
                // fuente); las entradas originales se conservan para no perder cobertura
                entradas: { ...paquete.entradas, ...mapeo.entradas },
            };
            const cat = crearCatalogo(datos);
            memoria.set(codigo, cat);
            return cat;
        } catch { return null; }
    }

    return null;
}

export function _limpiarCache(): void {
    memoria.clear();
}

const INTEGRADOS = new Set(["en", "pt", "fr"]);

export function estadoCatalogo(codigo: string): "revisado" | "automatico" | "ninguno" {
    if (!INTEGRADOS.has(codigo) && !almacen.leerPaquete(codigo)) return "ninguno";
    const paquete = almacen.leerPaquete(codigo);
    if (paquete) return paquete.revisado.estado;
    return "automatico";
}
