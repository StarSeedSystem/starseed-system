/**
 * IDI1115N · Carga el catálogo de un idioma desde el paquete (import dinámico: un trozo por idioma,
 * sin red en tiempo de pintado, también en las apps nativas con interfaz estática).
 */
import { crearCatalogo, type Catalogo, type DatosCatalogo } from "../catalogo";
import { almacenPaquetes, type AlmacenPaquetes } from "../paquete/almacen";
import type { PaqueteIdioma } from "../paquete/formato";

export type FuentePaquetes = Pick<AlmacenPaquetes, "leerPaquete" | "listarPaquetes">;

const CARGADORES: Record<string, () => Promise<{ default: DatosCatalogo }>> = {
    en: () => import("./en.json") as Promise<{ default: DatosCatalogo }>,
    pt: () => import("./pt.json") as Promise<{ default: DatosCatalogo }>,
    fr: () => import("./fr.json") as Promise<{ default: DatosCatalogo }>,
};

const memoria = new Map<string, Catalogo>();
let fuentePaquetes: FuentePaquetes = almacenPaquetes;

export function inyectarFuentePaquetes(fuente: FuentePaquetes): void {
    fuentePaquetes = fuente;
    memoria.clear();
}

function entradasValidas(entradas: unknown): entradas is Record<string, string> {
    if (typeof entradas !== "object" || entradas === null || Array.isArray(entradas)) return false;
    return Object.entries(entradas as Record<string, unknown>).every(([clave, valor]) =>
        !["__proto__", "constructor", "prototype"].includes(clave) && typeof valor === "string");
}

function paqueteUtilizable(paquete: PaqueteIdioma | null): paquete is PaqueteIdioma {
    return paquete !== null
        && typeof paquete.codigo === "string"
        && paquete.codigo.length > 0
        && (paquete.revisado?.estado === "revisado" || paquete.revisado?.estado === "automatico")
        && entradasValidas(paquete.entradas);
}

export function codigosPaquetesInstalados(): string[] {
    try {
        return fuentePaquetes.listarPaquetes().filter(paqueteUtilizable).map((p) => p.codigo);
    } catch { return []; }
}

export async function cargarCatalogo(codigo: string, preferirPaquete = false): Promise<Catalogo | null> {
    const clave = `${preferirPaquete ? "paquete" : "primario"}:${codigo}`;
    const hecho = memoria.get(clave);
    if (hecho) return hecho;
    const cargador = CARGADORES[codigo];
    if (cargador && !preferirPaquete) {
        try {
            const cat = crearCatalogo((await cargador()).default);
            memoria.set(clave, cat);
            return cat;
        } catch { return null; }
    }
    try {
        const paquete = fuentePaquetes.leerPaquete(codigo);
        if (!paqueteUtilizable(paquete)) return null;
        const cat = crearCatalogo({
            codigo,
            revisado: paquete.revisado.estado === "revisado",
            entradas: paquete.entradas,
        });
        memoria.set(clave, cat);
        return cat;
    } catch { return null; }
}
