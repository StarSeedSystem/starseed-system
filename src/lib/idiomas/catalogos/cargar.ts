/**
 * IDI1115N · Carga el catálogo de un idioma desde el paquete (import dinámico: un trozo por idioma,
 * sin red en tiempo de pintado, también en las apps nativas con interfaz estática).
 * IMA12 · Los integrados (en, pt, fr) mandan; un paquete instalado cubre los demás códigos y solo
 * gana si la persona lo eligió (`preferirPaquete`). El almacén se INYECTA en las pruebas.
 */
import { crearCatalogo, type Catalogo, type DatosCatalogo } from "../catalogo";
import { crearAlmacenPaquetes, type AlmacenPaquetes } from "../paquete/almacen";
import type { PaqueteIdioma } from "../paquete/formato";

const CARGADORES: Record<string, () => Promise<{ default: DatosCatalogo }>> = {
    en: () => import("./en.json") as Promise<{ default: DatosCatalogo }>,
    pt: () => import("./pt.json") as Promise<{ default: DatosCatalogo }>,
    fr: () => import("./fr.json") as Promise<{ default: DatosCatalogo }>,
};

export interface OpcionesCatalogo {
    /** Almacén de paquetes instalados; se inyecta en las pruebas. */
    almacen?: AlmacenPaquetes;
    /** La persona eligió el paquete: gana sobre el integrado del mismo código. */
    preferirPaquete?: boolean;
}

const memoria = new Map<string, Catalogo>();
// El almacén se crea al primer uso (nunca al importar el módulo): sin tocar el DOM al pintar.
let almacenPorDefecto: AlmacenPaquetes | null = null;
const almacenDePorDefecto = (): AlmacenPaquetes => (almacenPorDefecto ??= crearAlmacenPaquetes());

async function cargarIntegrado(codigo: string): Promise<Catalogo | null> {
    const hecho = memoria.get(codigo);
    if (hecho) return hecho;
    try {
        const cat = crearCatalogo((await CARGADORES[codigo]()).default);
        memoria.set(codigo, cat);
        return cat;
    } catch { return null; }
}

function cargarPaquete(codigo: string, paquete: PaqueteIdioma): Catalogo | null {
    const clave = `paquete:${codigo}:${String(paquete.hash)}`;
    const hecho = memoria.get(clave);
    if (hecho) return hecho;
    try {
        const cat = crearCatalogo({ codigo, revisado: paquete.revisado?.estado === "revisado", entradas: paquete.entradas });
        memoria.set(clave, cat);
        return cat;
    } catch { return null; }
}

function leerDelAlmacen(almacen: AlmacenPaquetes, codigo: string): PaqueteIdioma | null {
    try { return almacen.leerPaquete(codigo); } catch { return null; }
}

export async function cargarCatalogo(codigo: string, opciones: OpcionesCatalogo = {}): Promise<Catalogo | null> {
    // Integrado primero: solo se consulta el paquete si no hay integrado o si la persona lo eligió.
    if (CARGADORES[codigo] && !opciones.preferirPaquete) return cargarIntegrado(codigo);
    const paquete = leerDelAlmacen(opciones.almacen ?? almacenDePorDefecto(), codigo);
    if (paquete) return cargarPaquete(codigo, paquete);
    return CARGADORES[codigo] ? cargarIntegrado(codigo) : null;
}

/** Integrados más los códigos con paquete instalado, sin repetir. */
export function idiomasConCatalogo(opciones: OpcionesCatalogo = {}): string[] {
    let paquetes: string[] = [];
    try {
        const almacen = opciones.almacen ?? almacenDePorDefecto();
        paquetes = almacen.listarPaquetes().filter((p) => typeof p?.codigo === "string").map((p) => p.codigo);
    } catch { paquetes = []; }
    return [...new Set([...Object.keys(CARGADORES), ...paquetes])];
}
