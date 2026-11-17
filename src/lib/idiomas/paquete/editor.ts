/**
 * IMA15 · Editor del paquete de idioma en curso (contrato A3 del traductor universal).
 * Módulo PURO: sin red ni `node:*`; el almacén se INYECTA y todo va con try/catch.
 * `publicarBorrador()` devuelve `hash: ""`: el SHA-256 lo calcula `hashDe()` (asíncrono) al instalar.
 * Nunca certifica revisión humana: `revisado.estado` es siempre «automatico».
 */
import { normalizarTexto } from "../catalogo";
import { direccionDe } from "../idiomas";
import type { PaqueteIdioma } from "./formato";

export const CLAVE_EDITOR = "starseed.idiomas.editor.v1" as const;
export const TOPE_ENTRADAS = 2_000 as const;
export const MAX_TEXTO = 500 as const;

export interface AlmacenEditor { getItem(clave: string): string | null; setItem(clave: string, valor: string): void; removeItem(clave: string): void }
export interface PaqueteEnEdicion { codigo: string; nombre: string }
export interface EntradaTraducida { clave: string; valor: string }
export type ResultadoAnadir = "anadida" | "vacia" | "demasiado-larga" | "duplicada" | "tope" | "sin-edicion";

interface Entradas { [clave: string]: string | null }
interface EstadoEditor { codigo: string; nombre: string; entradas: Entradas }

function almacen(a?: AlmacenEditor | null): AlmacenEditor | null {
    if (a !== undefined) return a;
    try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function leerEstado(a?: AlmacenEditor | null): EstadoEditor | null {
    try {
        const s = almacen(a);
        const bruto = s ? JSON.parse(s.getItem(CLAVE_EDITOR) ?? "null") as unknown : null;
        if (!esObjeto(bruto) || typeof bruto.codigo !== "string" || !bruto.codigo || typeof bruto.nombre !== "string") return null;
        const entradas: Entradas = {};
        const crudas: Record<string, unknown> = esObjeto(bruto.entradas) ? bruto.entradas : {};
        for (const [clave, valor] of Object.entries(crudas)) {
            if (clave !== "__proto__" && clave !== "constructor" && clave !== "prototype" && (typeof valor === "string" || valor === null)) entradas[clave] = valor;
        }
        return { codigo: bruto.codigo, nombre: bruto.nombre, entradas };
    } catch { return null; }
}
function guardarEstado(estado: EstadoEditor, a?: AlmacenEditor | null): boolean {
    try { const s = almacen(a); if (!s) return false; s.setItem(CLAVE_EDITOR, JSON.stringify(estado)); return true; } catch { return false; }
}

/** Abre el paquete en edición con las claves pendientes vacías. */
export function abrirEdicion(codigo: string, nombre: string, a?: AlmacenEditor | null): boolean {
    const c = codigo.trim(); const n = nombre.trim();
    return c && n ? guardarEstado({ codigo: c, nombre: n, entradas: {} }, a) : false;
}
/** Lo que hay abierto ahora; null si no hay edición. */
export function paqueteEnEdicion(a?: AlmacenEditor | null): PaqueteEnEdicion | null {
    const e = leerEstado(a); return e ? { codigo: e.codigo, nombre: e.nombre } : null;
}
/** Suma un texto español como pendiente (normalizado; ignora vacíos, repetidos, >500 y el tope de 2.000). */
export function anadirPendiente(textoEspanol: string, a?: AlmacenEditor | null): ResultadoAnadir {
    const clave = normalizarTexto(textoEspanol);
    if (!clave) return "vacia";
    if (clave.length > MAX_TEXTO) return "demasiado-larga";
    const estado = leerEstado(a);
    if (!estado) return "sin-edicion";
    if (Object.prototype.hasOwnProperty.call(estado.entradas, clave)) return "duplicada";
    if (Object.keys(estado.entradas).length >= TOPE_ENTRADAS) return "tope";
    estado.entradas[clave] = null;
    return guardarEstado(estado, a) ? "anadida" : "sin-edicion";
}
/** Traduce una clave ya abierta; un valor vacío no cambia nada. */
export function traducir(clave: string, valor: string, a?: AlmacenEditor | null): boolean {
    const k = normalizarTexto(clave); const v = valor.trim();
    if (!k || !v) return false;
    const estado = leerEstado(a);
    if (!estado || !Object.prototype.hasOwnProperty.call(estado.entradas, k)) return false;
    estado.entradas[k] = v;
    return guardarEstado(estado, a);
}
/** Claves que esperan traducción, en el orden en que se añadieron. */
export function pendientes(a?: AlmacenEditor | null): string[] {
    const e = leerEstado(a);
    return e ? Object.entries(e.entradas).filter(([, v]) => v === null).map(([k]) => k) : [];
}
/** Traducciones ya escritas, en el orden en que se añadieron. */
export function completadas(a?: AlmacenEditor | null): EntradaTraducida[] {
    const e = leerEstado(a);
    return e ? Object.entries(e.entradas)
        .filter((par): par is [string, string] => typeof par[1] === "string")
        .map(([clave, valor]) => ({ clave, valor })) : [];
}
/** Cierra la edición y borra su clave local. */
export function cerrarEdicion(a?: AlmacenEditor | null): boolean {
    try {
        const s = almacen(a); if (!s || leerEstado(a) === null) return false;
        s.removeItem(CLAVE_EDITOR); return true;
    } catch { return false; }
}
/** Paquete con SOLO las entradas traducidas; null sin edición o sin nada traducido. */
export function publicarBorrador(a?: AlmacenEditor | null, ahora: () => string = () => new Date().toISOString()): PaqueteIdioma | null {
    const e = leerEstado(a);
    if (!e) return null;
    const entradas: Record<string, string> = {};
    for (const { clave, valor } of completadas(a)) entradas[clave] = valor;
    if (Object.keys(entradas).length === 0) return null;
    return {
        formato: "starseed-idioma", version: 1, codigo: e.codigo, nombre: e.nombre,
        dir: direccionDe(e.codigo), autor: { nombre: "Sin autor" }, creado: ahora(),
        revisado: { estado: "automatico" }, licencia: "sin-declarar", base: "es",
        entradas, hash: "",
    };
}
