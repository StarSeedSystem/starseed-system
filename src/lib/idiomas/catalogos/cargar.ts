/**
 * IDI1115N · Carga el catálogo de un idioma: primero cargadores integrados (en, pt, fr),
 * luego paquetes instalados vía IMA11 (leerPaquete). Un paquete que falla al cargar devuelve null.
 * Sin red en tiempo de pintado; también en apps nativas con interfaz estática.
 */
import { crearCatalogo, type Catalogo, type DatosCatalogo } from "../catalogo";
import { crearAlmacenPaquetes, type AlmacenPaquetes } from "../paquete/almacen";

const CARGADORES: Record<string, () => Promise<{ default: DatosCatalogo }>> = {
    en: () => import("./en.json") as Promise<{ default: DatosCatalogo }>,
    pt: () => import("./pt.json") as Promise<{ default: DatosCatalogo }>,
    fr: () => import("./fr.json") as Promise<{ default: DatosCatalogo }>,
};

const memoria = new Map<string, Catalogo>();
let almacen: AlmacenPaquetes = crearAlmacenPaquetes();

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
            const datos: DatosCatalogo = {
                codigo: paquete.codigo,
                revisado: paquete.revisado.estado === "revisado",
                entradas: paquete.entradas,
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
