/**
 * IMA6 · Validación de paquetes de idioma al instalar.
 * Módulo PURO: sin red, sin disco, sin procesos.
 */

import { LIMITES, hashDe, type PaqueteIdioma } from "./formato";
import { indicesUsados, type Patron, compilarPatron } from "../formato";

const BCP47 = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const CONTROLES = /[\u0000-\u001F\u202A-\u202E\u2066-\u2069\u200B-\u200F]/g;
const PROHIBIDOS = /<+[a-zA-Z]|&#|javascript:|data:/i;
const CLAVES_PROHIBIDAS = /^(?:__proto__|constructor|prototype)$/;

function esObjetoSinPrototipo(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Object.prototype.hasOwnProperty.call(v, "constructor");
}

function validarFormato(p: unknown): p is { formato: "starseed-idioma"; version: 1 } {
    return p && typeof p === "object" && (p as Record<string, unknown>).formato === "starseed-idioma" && (p as Record<string, unknown>).version === 1;
}

function validarCodigo(c: unknown): boolean {
    return typeof c === "string" && BCP47.test(c);
}

function validarDir(d: unknown): d is "ltr" | "rtl" {
    return d === "ltr" || d === "rtl";
}

function validarEstado(e: unknown): boolean {
    return e === "automatico" || e === "revisado";
}

function contieneMarcadoresIguales(valor: string, indice: number): boolean {
    if (!valor) return false;
    const marcadores = /\d+/g;
    const coincidencias = [...valor.matchAll(marcadores)];
    return coincidencias.some((m) => Number(m[0]) === indice);
}

function extrerMarcadores(texto: string): Set<number> {
    const marcadores: number[] = [];
    const regex = /\{\s*(\d+)\s*[,\}]/g;
    let m;
    while ((m = regex.exec(texto)) !== null) {
        marcadores.push(Number(m[1]));
    }
    return new Set(marcadores);
}

function marcadoresCoinciden(clave: string, valor: string): boolean {
    const marcadoresClave = extrerMarcadores(clave);
    const marcadoresValor = extrerMarcadores(valor);
    const pluralClave = clave.includes(", plural");
    const pluralValor = valor.includes(", plural");
    if (pluralClave !== pluralValor) return false;
    const mismosMarcadores = marcadoresClave.size === marcadoresValor.size &&
        [...marcadoresClave].every((m) => marcadoresValor.has(m));
    if (!mismosMarcadores) return false;
    if (pluralClave && pluralValor) {
        const pluralesClave = clave.includes("one {") || clave.includes("other {");
        const pluralesValor = valor.includes("one {") || valor.includes("other {");
        return pluralesClave === pluralesValor;
    }
    return true;
}

function contieneCaracteresInvalidos(texto: string): boolean {
    return CONTROLES.test(texto) || PROHIBIDOS.test(texto);
}

function claveInvalida(clave: string): boolean {
    return CLAVES_PROHIBIDAS.test(clave);
}

function validarEntrada(clave: string, valor: string): { ok: boolean; error?: string } {
    if (!valor || typeof valor !== "string" || valor.trim() === "") {
        return { ok: false, error: "El valor de la entrada está vacío." };
    }
    if (claveInvalida(clave)) {
        return { ok: false, error: `Clave prohibida '${clave}'.` };
    }
    if (!marcadoresCoinciden(clave, valor)) {
        return { ok: false, error: `Marcadores no coinciden entre clave y valor. ` };
    }
    if (contieneCaracteresInvalidos(valor) || contieneCaracteresInvalidos(clave)) {
        return { ok: false, error: "El valor o clave contiene caracteres no permitidos (HTML, control, dirección oculta)." };
    }
    return { ok: true };
}

async function validarEntradaCompleta(
    clave: string,
    valor: string,
    entradas: Record<string, string>,
    clavesRechazadas: string[],
    entradasRechazadas: string[]
): Promise<boolean> {
    if (!valor || typeof valor !== "string" || valor.trim() === "") {
        entradasRechazadas.push(clave);
        return false;
    }
    if (claveInvalida(clave)) {
        entradasRechazadas.push(clave);
        return false;
    }
    const marcadoresClave = extrerMarcadores(clave);
    const marcadoresValor = extrerMarcadores(valor);
    const pluralClave = clave.includes(", plural");
    const pluralValor = valor.includes(", plural");
    if (pluralClave !== pluralValor) {
        entradasRechazadas.push(clave);
        return false;
    }
    const mismosMarcadores = marcadoresClave.size === marcadoresValor.size &&
        [...marcadoresClave].every((m) => marcadoresValor.has(m));
    if (!mismosMarcadores) {
        entradasRechazadas.push(clave);
        return false;
    }
    if (contieneCaracteresInvalidos(valor) || contieneCaracteresInvalidos(clave)) {
        entradasRechazadas.push(clave);
        return false;
    }
    return true;
}

export async function validarPaquete(
    bruto: unknown,
    opciones: { digest?: string; desdeOS?: boolean } = {}
): Promise<{ ok: true; paquete: PaqueteIdioma; avisos: string[] } | { ok: false; errores: string[] }> {
    const errores: string[] = [];
    const avisos: string[] = [];
    const entradasRechazadas: string[] = [];
    const clavesRechazadas: string[] = [];

    if (!bruto || typeof bruto !== "object") {
        return { ok: false, errores: ["El paquete no es un objeto válido."] };
    }

    const p = bruto as Record<string, unknown>;

    if (!validarFormato(p)) {
        errores.push("`formato` debe ser 'starseed-idioma' y `version` debe ser 1.");
    }

    if (!validarCodigo(p.codigo)) {
        errores.push("`codigo` no cumple con la norma BCP-47.");
    }

    if (p.dir !== "ltr" && p.dir !== "rtl") {
        errores.push("`dir` debe ser 'ltr' o 'rtl'.");
    }

    if (!p.autor || typeof p.autor !== "object") {
        errores.push("`autor` es obligatorio.");
    } else {
        if (!p.autor.nombre || typeof p.autor.nombre !== "string") {
            errores.push("`autor.nombre` es obligatorio.");
        } else if (p.autor.nombre.length > 80) {
            errores.push("`autor.nombre` no puede tener más de 80 caracteres.");
        }
    }

    if (!validarEstado(p.revisado?.estado)) {
        errores.push("`revisado.estado` debe ser 'automatico' o 'revisado'.");
    }

    if (p.entradas === undefined || typeof p.entradas !== "object") {
        errores.push("`entradas` es obligatorio y debe ser un objeto.");
    } else {
        const entradas = p.entradas as Record<string, unknown>;
        const claveCount = Object.keys(entradas).length;
        if (claveCount > LIMITES.entradas) {
            errores.push(`Demasiadas entradas (${claveCount} > ${LIMITES.entradas}).`);
        }

        for (const [clave, valor] of Object.entries(entradas)) {
            if (!validarEntradaCompleta(clave, String(valor), entradas, clavesRechazadas, entradasRechazadas)) {
                const resultado = validarEntrada(clave, String(valor));
                if (resultado.error) {
                    entradasRechazadas.push(`${clave}: ${resultado.error}`);
                }
            }
        }

        if (entradasRechazadas.length > 0) {
            const porcentajeRechazadas = (entradasRechazadas.length / Math.max(1, claveCount)) * 100;
            if (porcentajeRechazadas > 20) {
                errores.push(`Demasiado porcentaje de entradas rechazadas (${porcentajeRechazadas.toFixed(1)}%).`);
            }
        }
    }

    if (p.hash !== undefined) {
        if (!opciones.digest) {
            avisos.push("Se omitirá la verificación de hash (digest no proporcionado).");
        } else if (p.formato === "starseed-idioma" && p.version === 1 && typeof p.hash === "string") {
            const hashCalculado = await hashDe({
                formato: "starseed-idioma",
                version: 1,
                codigo: p.codigo || "",
                nombre: p.nombre || "",
                nombreIngles: p.nombreIngles,
                dir: p.dir as "ltr" | "rtl",
                autor: p.autor || { nombre: "" },
                creado: p.creado || "",
                revisado: p.revisado || { estado: "automatico" },
                licencia: p.licencia || "",
                base: "es",
                entradas: p.entradas || {},
            });
            if (p.hash !== hashCalculado) {
                errores.push("El hash del paquete no coincide con el hash calculado.");
            }
        }
    }

    if (opciones.desdeOS !== false && p.revisado?.estado === "revisado") {
        avisos.push("Paquete proveniente del OS se mantiene como 'revisado'.");
    } else if (p.revisado?.estado === "revisado") {
        avisos.push("Paquete proveniente de fuera: se degrada a 'automatico'.");
        p = { ...p, revisado: { ...p.revisado, estado: "automatico" } };
    }

    if (errores.length > 0) {
        return { ok: false, errores };
    }

    const paquete: PaqueteIdioma = Object.create(null) as PaqueteIdioma;
    paquete.formato = "starseed-idioma";
    paquete.version = 1;
    paquete.codigo = p.codigo;
    paquete.nombre = p.nombre;
    paquete.nombreIngles = p.nombreIngles;
    paquete.dir = p.dir;
    paquete.autor = p.autor;
    paquete.creado = p.creado;
    paquete.revisado = p.revisado || { estado: "automatico" };
    paquete.licencia = p.licencia;
    paquete.base = "es";
    paquete.entradas = Object.create(null) as Record<string, string>;
    for (const [k, v] of Object.entries(p.entradas as Record<string, string>)) {
        paquete.entradas[k] = v;
    }
    paquete.hash = p.hash || "";

    return { ok: true, paquete, avisos };
}