/**
 * IDI1115N · Carga el catálogo de un idioma desde el paquete (import dinámico: un trozo por idioma,
 * sin red en tiempo de pintado, también en las apps nativas con interfaz estática).
 */
import { crearCatalogo, type Catalogo, type DatosCatalogo } from "../catalogo";
import { almacenPaquetes } from "../paquete/almacen";

const CARGADORES: Record<string, () => Promise<{ default: DatosCatalogo }>> = {
    en: () => import("./en.json") as Promise<{ default: DatosCatalogo }>,
    pt: () => import("./pt.json") as Promise<{ default: DatosCatalogo }>,
    fr: () => import("./fr.json") as Promise<{ default: DatosCatalogo }>,
};

const memoria = new Map<string, Catalogo>();
export async function cargarCatalogo(codigo: string, preferirPaquete: boolean = false): Promise<Catalogo | null> {
    const hecho = memoria.get(codigo);
    if (hecho) return hecho;
    const cargador = CARGADORES[codigo];
    if (!cargador) {
        if (preferirPaquete) {
            return null;
        }
        const paquete = almacenPaquetes.leerPaquete(codigo);
        if (!paquete) return null;
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
    try {
        const cat = crearCatalogo((await cargador()).default);
        memoria.set(codigo, cat);
        return cat;
    } catch { return null; }
}
