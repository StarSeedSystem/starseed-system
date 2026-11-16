import type { PaqueteIdioma } from "./formato";
import { crearAlmacenPaquetes } from "./almacen";
import { normalizarTexto } from "../catalogo";
import { construirPaquete } from "./formato";

// Estado interno de la edición
let edicion: 
    { paquete: PaqueteIdioma; pendientes: Set<string>; completados: Set<string> } | null = null;

export function abrirEdicion(codigo: string, nombre: string): PaqueteIdioma {
    const alm = crearAlmacenPaquetes();
    const existente = alm.leerPaquete(codigo);
    if (existente) {
        // Si existe, usarla
        edicion = {
            paquete: existente,
            pendientes: new Set(),
            completados: new Set(Object.keys(existente.entradas)),
        };
    } else {
        const pkg: PaqueteIdioma = {
            formato: "starseed-idioma",
            version: 1,
            codigo,
            nombre,
            nombreIngles: undefined,
            dir: "ltr",
            autor: { nombre: "Editor" },
            creado: new Date().toISOString(),
            revisado: { estado: "automatico" },
            licencia: "MIT",
            base: "es",
            entradas: {},
            hash: "", // se re-calcula al guardar
        };
        edicion = { paquete: pkg, pendientes: new Set(), completados: new Set() };
    }
    return edicion.paquete;
}

export function paqueteEnEdicion(): PaqueteIdioma | null {
    return edicion?.paquete ?? null;
}

const LIMITE_PENDIENTES = 2000;
export function anadirPendiente(textoEspanol: string): void {
    const txt = normalizarTexto(textoEspanol);
    if (!txt) return;
    if (txt.length > 500) return;
    if (!edicion) return;
    if (edicion.completados.has(txt)) return; // ya traducido
    if (edicion.pendientes.has(txt)) return; // duplicado
    if (edicion.pendientes.size >= LIMITE_PENDIENTES) return;
    edicion.pendientes.add(txt);
}

export function pendientes(): string[] {
    return edicion ? Array.from(edicion.pendientes) : [];
}

export function completadas(): string[] {
    return edicion ? Array.from(edicion.completados) : [];
}

// Helper para guardar cambios y actualizar hash
async function guardarCambios(): Promise<void> {
    if (!edicion) return;
    const alm = crearAlmacenPaquetes();
    const nuevo = await construirPaquete({
        codigo: edicion.paquete.codigo,
        nombre: edicion.paquete.nombre,
        nombreIngles: edicion.paquete.nombreIngles,
        dir: edicion.paquete.dir,
        autor: edicion.paquete.autor,
        licencia: edicion.paquete.licencia,
        entradas: edicion.paquete.entradas,
        revisado: edicion.paquete.revisado,
        creado: edicion.paquete.creado,
    });
    edicion.paquete = nuevo;
    alm.guardarPaquete(nuevo);
}

export async function traducir(clave: string, valor: string): Promise<void> {
    if (!edicion) throw new Error("No hay paquete en edición");
    const txt = normalizarTexto(clave);
    if (!txt) throw new Error("clave vacía");
    edicion.paquete.entradas[txt] = valor;
    edicion.completados.add(txt);
    edicion.pendientes.delete(txt);
    await guardarCambios();
}

export function cerrarEdicion(): PaqueteIdioma | null {
    const pkg = edicion?.paquete ?? null;
    edicion = null;
    return pkg;
}

export async function publicarBorrador(): Promise<PaqueteIdioma | null> {
    if (!edicion) return null;
    const entradas = Object.entries(edicion.paquete.entradas).filter(([, v]) => v && v.length > 0);
    if (entradas.length === 0) return null;
    const nuevo = await construirPaquete({
        codigo: edicion.paquete.codigo,
        nombre: edicion.paquete.nombre,
        nombreIngles: edicion.paquete.nombreIngles,
        dir: edicion.paquete.dir,
        autor: edicion.paquete.autor,
        licencia: edicion.paquete.licencia,
        entradas: Object.fromEntries(entradas),
        revisado: { estado: "automatico" },
        creado: edicion.paquete.creado,
    });
    const alm = crearAlmacenPaquetes();
    alm.guardarPaquete(nuevo);
    return nuevo;
}
