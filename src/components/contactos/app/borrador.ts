/**
 * borrador — estado del formulario del editor de contactos y su validación (PURO).
 * `borradorDesde` → lo que pinta el formulario; `entradaDesde` → la `ContactoEntrada` que
 * recibe el almacén; `validarBorrador` → mensajes amables por campo.
 */

import { nuevoId } from "@/lib/contactos/modelo";
import type {
    Contacto,
    ContactoEntrada,
    PerfilInstantanea,
    TipoRelacion,
    VisibilidadContacto,
} from "@/lib/contactos/tipos";
import { normalizarUrl } from "@/components/contactos/app/vista";

export const ETIQUETAS_TELEFONO = ["móvil", "casa", "trabajo", "otro"] as const;
export const ETIQUETAS_CORREO = ["casa", "trabajo", "otro"] as const;

export interface FilaDato {
    id: string;
    /** Etiqueta final («móvil», «casa»… o la personalizada). */
    etiqueta: string;
    /** true cuando la etiqueta no es una de las predefinidas. */
    personalizada: boolean;
    valor: string;
}

export interface FilaEnlace {
    id: string;
    titulo: string;
    url: string;
}

export type ModoCumple = "ninguno" | "completo" | "sinAnio";

export interface Borrador {
    nombre: string;
    apodo: string;
    descripcion: string;
    relacion: TipoRelacion;
    relacionDetalle: string;
    telefonos: FilaDato[];
    correos: FilaDato[];
    enlaces: FilaEnlace[];
    organizacion: string;
    cargo: string;
    direccion: string;
    cumpleModo: ModoCumple;
    /** «AAAA-MM-DD» (modo completo). */
    cumpleFecha: string;
    /** «1»…«31» (modo sin año). */
    cumpleDia: string;
    /** «1»…«12» (modo sin año). */
    cumpleMes: string;
    categorias: string[];
    listas: string[];
    visibilidad: VisibilidadContacto;
    favorito: boolean;
    userId: string | null;
    username: string | null;
    perfil: PerfilInstantanea | null;
}

function filaDato(etiqueta: string, valor: string, predefinidas: readonly string[], id?: string): FilaDato {
    const e = (etiqueta || "").trim() || predefinidas[0];
    return { id: id || nuevoId(), etiqueta: e, personalizada: !predefinidas.includes(e), valor };
}

export function filaTelefonoVacia(): FilaDato {
    return filaDato("móvil", "", ETIQUETAS_TELEFONO);
}
export function filaCorreoVacia(): FilaDato {
    return filaDato("casa", "", ETIQUETAS_CORREO);
}
export function filaEnlaceVacia(): FilaEnlace {
    return { id: nuevoId(), titulo: "", url: "" };
}

/** Estado inicial del formulario a partir de un contacto existente o de una entrada parcial. */
export function borradorDesde(c?: Contacto | ContactoEntrada | null): Borrador {
    const cumple = c?.cumpleanos ?? "";
    let cumpleModo: ModoCumple = "ninguno";
    let cumpleFecha = "";
    let cumpleDia = "";
    let cumpleMes = "";
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cumple);
    if (m) {
        cumpleModo = "completo";
        cumpleFecha = cumple;
    } else {
        m = /^--(\d{2})-(\d{2})$/.exec(cumple);
        if (m) {
            cumpleModo = "sinAnio";
            cumpleMes = String(Number(m[1]));
            cumpleDia = String(Number(m[2]));
        }
    }
    return {
        nombre: c?.nombre ?? "",
        apodo: c?.apodo ?? "",
        descripcion: c?.descripcion ?? "",
        relacion: c?.relacion ?? "amistad",
        relacionDetalle: c?.relacionDetalle ?? "",
        telefonos: (c?.telefonos ?? []).map((t) => filaDato(t.etiqueta, t.valor, ETIQUETAS_TELEFONO, t.id)),
        correos: (c?.correos ?? []).map((t) => filaDato(t.etiqueta, t.valor, ETIQUETAS_CORREO, t.id)),
        enlaces: (c?.enlaces ?? []).map((e) => ({ id: e.id || nuevoId(), titulo: e.titulo, url: e.url })),
        organizacion: c?.organizacion ?? "",
        cargo: c?.cargo ?? "",
        direccion: c?.direccion ?? "",
        cumpleModo,
        cumpleFecha,
        cumpleDia,
        cumpleMes,
        categorias: [...(c?.categorias ?? [])],
        listas: [...(c?.listas ?? [])],
        visibilidad: c?.visibilidad ?? "privada",
        favorito: c?.favorito ?? false,
        userId: c?.userId ?? null,
        username: c?.username ?? null,
        perfil: c?.perfil ?? null,
    };
}

function diasDelMes(mes: number, anio = 2024): number {
    return new Date(anio, mes, 0).getDate();
}

/** «AAAA-MM-DD», «--MM-DD» o undefined. */
export function cumpleDeBorrador(b: Borrador): string | undefined {
    if (b.cumpleModo === "completo") return /^\d{4}-\d{2}-\d{2}$/.test(b.cumpleFecha) ? b.cumpleFecha : undefined;
    if (b.cumpleModo === "sinAnio") {
        const mes = Number(b.cumpleMes);
        const dia = Number(b.cumpleDia);
        if (!mes || !dia) return undefined;
        return `--${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    }
    return undefined;
}

/** La `ContactoEntrada` que recibe el almacén (sin visibilidad: esa se reconcilia aparte). */
export function entradaDesde(b: Borrador): ContactoEntrada {
    return {
        nombre: b.nombre.trim(),
        apodo: b.apodo,
        descripcion: b.descripcion,
        relacion: b.relacion,
        relacionDetalle: b.relacionDetalle,
        telefonos: b.telefonos
            .filter((t) => t.valor.trim())
            .map((t) => ({ id: t.id, etiqueta: t.etiqueta.trim() || "otro", valor: t.valor.trim() })),
        correos: b.correos
            .filter((t) => t.valor.trim())
            .map((t) => ({ id: t.id, etiqueta: t.etiqueta.trim() || "otro", valor: t.valor.trim() })),
        enlaces: b.enlaces
            .filter((e) => e.url.trim())
            .map((e) => {
                // Se respeta lo escrito; solo se completa el esquema si falta («ana.org» → https).
                const t = e.url.trim();
                const url = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
                return { id: e.id, titulo: e.titulo.trim() || tituloPorDefecto(url), url };
            }),
        organizacion: b.organizacion,
        cargo: b.cargo,
        direccion: b.direccion,
        cumpleanos: cumpleDeBorrador(b),
        categorias: [...b.categorias],
        listas: [...b.listas],
        favorito: b.favorito,
        userId: b.userId,
        username: b.username,
        perfil: b.perfil,
    };
}

function tituloPorDefecto(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "Enlace";
    }
}

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Errores por campo (clave → mensaje). Vacío = se puede guardar. */
export function validarBorrador(b: Borrador): Record<string, string> {
    const errores: Record<string, string> = {};
    if (!b.nombre.trim()) errores.nombre = "Ponle un nombre para poder guardarlo.";
    else if (b.nombre.trim().length > 120) errores.nombre = "Ese nombre es demasiado largo (máximo 120 caracteres).";

    for (const t of b.telefonos) {
        const v = t.valor.trim();
        if (!v) continue;
        const digitos = v.replace(/\D/g, "");
        if (digitos.length < 3 || /[^\d\s+().\-/]/.test(v)) {
            errores[`telefono:${t.id}`] = "Ese teléfono no parece válido: usa solo números, espacios, + o guiones.";
        }
    }
    for (const c of b.correos) {
        const v = c.valor.trim();
        if (v && !RE_CORREO.test(v)) errores[`correo:${c.id}`] = "Ese correo no parece válido (falta la @ o el dominio).";
    }
    for (const e of b.enlaces) {
        const v = e.url.trim();
        if (v && !normalizarUrl(v)) errores[`enlace:${e.id}`] = "Solo se admiten enlaces web (http o https) completos.";
        if (!v && e.titulo.trim()) errores[`enlace:${e.id}`] = "Falta la dirección del enlace.";
    }

    if (b.cumpleModo === "completo") {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b.cumpleFecha);
        if (!m) errores.cumple = "Elige la fecha completa del cumpleaños.";
        else {
            const anio = Number(m[1]);
            const hoy = new Date();
            if (anio < 1900 || new Date(anio, Number(m[2]) - 1, Number(m[3])) > hoy) {
                errores.cumple = "Esa fecha de nacimiento no encaja (entre 1900 y hoy).";
            }
        }
    } else if (b.cumpleModo === "sinAnio") {
        const mes = Number(b.cumpleMes);
        const dia = Number(b.cumpleDia);
        if (!mes || !dia) errores.cumple = "Elige el día y el mes del cumpleaños.";
        else if (dia > diasDelMes(mes)) errores.cumple = "Ese mes no tiene tantos días.";
    }
    return errores;
}
