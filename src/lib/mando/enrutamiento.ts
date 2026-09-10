/**
 * Enrutamiento visible de la flota (2026-09-09 · Ola 301 · RT2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO (sin red ni disco) que contesta lo que el Mando no sabía decir de
 * un vistazo: quién escribe AHORA, quién entra cuando el activo se agote y POR
 * QUÉ. Lo consumen la pestaña «Flota» y el «Taller del agente», para que la
 * lógica de la cadena no viva dentro de un componente y se pueda probar sola.
 *
 * Nota del enjambre: RT1 iba a dejar aquí `planDeRuta`; como esa rama no llegó
 * a integrarse, RT2 lo escribe con la misma firma acordada
 * (`planDeRuta(modelos, salud, clavesPresentes, papel)`), sin tocar nada más.
 *
 * Aquí NUNCA entra el valor de una clave: solo qué proveedores tienen una.
 */

import type { ModeloDisponible, SaludProveedor } from "@/lib/mando/modelos-disponibles";

/** Estados que la cadena sabe distinguir (`mudo` = responde vacío: cuenta como muerto). */
export type EstadoRuta = "vivo" | "sin_cupo" | "mudo" | "caido" | "sin_clave" | "desconocido";

/** Los tres papeles de la cadena, en el orden en que se enseñan en columnas. */
export type PapelRuta = "escritor" | "revisor" | "director";

/** Un eslabón: un modelo concreto con su sitio en la cadena y su estado. */
export interface EslabonRuta {
    /** `proveedor/modelo`, tal como se le pide al motor. */
    id: string;
    proveedor: string;
    nombre: string;
    /** Sitio en la cadena, empezando por 1. */
    posicion: number;
    estado: EstadoRuta;
    /** Es el que trabaja ahora mismo. */
    activo: boolean;
    /** Entra si el activo se agota. */
    siguiente: boolean;
    /** Motivo que dio el supervisor del enjambre, si lo dio. */
    motivo: string | null;
}

/** Plan de un papel: la cadena entera, quién manda, quién releva y por qué. */
export interface PlanRuta {
    papel: PapelRuta;
    cadena: EslabonRuta[];
    activo: EslabonRuta | null;
    siguiente: EslabonRuta | null;
    porque: string;
}

/** Resumen corto de toda la flota («escriben 2 de 11 modelos») con los tres planes. */
export interface ResumenFlota {
    escriben: number;
    total: number;
    frase: string;
    planes: PlanRuta[];
}

/** Orden de los papeles: primero quien escribe, luego quien revisa, luego quien dirige. */
export const PAPELES: readonly PapelRuta[] = ["escritor", "revisor", "director"] as const;

/** Etiqueta legible de cada estado: la UI no debe inventarse estos textos. */
export const TEXTO_ESTADO_RUTA: Record<EstadoRuta, string> = {
    vivo: "vivo",
    sin_cupo: "sin cupo",
    mudo: "mudo",
    caido: "caído",
    sin_clave: "sin clave",
    desconocido: "desconocido",
};

/** Título de cada columna del enrutamiento planeado. */
export const TEXTO_PAPEL_RUTA: Record<PapelRuta, string> = {
    escritor: "Escritores",
    revisor: "Revisores",
    director: "Directores",
};

/** Aviso fijo del estado `mudo`: se repite igual en Flota y en el Taller. */
export const AVISO_MUDO = "responde vacío: cuenta como muerto";

/** «AAAA-MM-DD HH:MM:SS» del supervisor → ms; null si la fecha no se puede leer. */
function fechaSupervisor(t: string | null | undefined): number | null {
    if (!t) return null;
    const ms = Date.parse(t.replace(" ", "T") + (t.length <= 19 ? "Z" : ""));
    return Number.isFinite(ms) ? ms : null;
}

/**
 * ¿Pertenece este modelo a ese papel de la cadena? Se respeta lo que ya declara
 * el catálogo vivo: `escritor` marca a quien escribe código (nunca los que solo
 * valen para Markdown), `revisor` a quien revisa y los generales o locales son
 * los que dirigen, porque son los que deciden y reparten trabajo.
 */
function esDelPapel(m: ModeloDisponible, papel: PapelRuta): boolean {
    if (papel === "escritor") {
        return (m.escritor === true || m.papel === "escritor") && m.soloMarkdown !== true;
    }
    if (papel === "revisor") return m.papel === "revisor";
    return m.papel === "local" || m.papel === "general";
}

/**
 * Estado real de un modelo cruzando tres fuentes: la salud del supervisor del
 * enjambre, la salud que ya trae el catálogo y las claves realmente presentes
 * en la máquina. `mudo` es propio de esta ola: un proveedor que contesta vacío
 * engaña más que uno caído, así que se le nombra aparte.
 */
function estadoDe(
    m: ModeloDisponible,
    salud: Record<string, SaludProveedor>,
    clavesPresentes: readonly string[],
    ahora: number,
): { estado: EstadoRuta; motivo: string | null } {
    const s = salud[m.proveedor];
    const motivo = s?.motivo ?? null;

    const sinCupo = fechaSupervisor(s?.sinCupoHasta ?? null);
    if (sinCupo !== null && sinCupo > ahora) return { estado: "sin_cupo", motivo };

    const crudo = (s?.estado ?? m.salud ?? "desconocido").toLowerCase();
    if (crudo.includes("cupo") || crudo.includes("agotad") || crudo.includes("429")) {
        return { estado: "sin_cupo", motivo };
    }
    if (crudo.includes("mudo") || crudo.includes("vac") || /vac[íi]o/.test(motivo ?? "")) {
        return { estado: "mudo", motivo };
    }
    if (crudo.includes("sin-clave") || crudo.includes("sin_clave")) {
        return { estado: "sin_clave", motivo };
    }
    if (crudo.includes("caid") || crudo.includes("error") || crudo.includes("muert")) {
        return { estado: "caido", motivo };
    }
    // Sin señal de salud: si el catálogo dice que falta la clave y la máquina
    // tampoco la tiene, el eslabón no puede entrar aunque «parezca» disponible.
    if (m.salud === "sin-clave" && !clavesPresentes.includes(m.proveedor)) {
        return { estado: "sin_clave", motivo };
    }
    if (crudo.includes("vivo") || crudo === "ok" || crudo.includes("activo")) {
        return { estado: "vivo", motivo };
    }
    return { estado: "desconocido", motivo };
}

/** «2 sin cupo · 1 mudo · 1 sin clave»: quiénes quedan fuera y por qué. */
function resumenFuera(fuera: readonly EslabonRuta[]): string {
    const cuenta = new Map<EstadoRuta, number>();
    for (const e of fuera) cuenta.set(e.estado, (cuenta.get(e.estado) ?? 0) + 1);
    return [...cuenta.entries()]
        .map(([estado, n]) => `${n} ${TEXTO_ESTADO_RUTA[estado]}`)
        .join(" · ");
}

/** El verbo del papel, para que la frase de «por qué» suene a español y no a tabla. */
const VERBO_PAPEL: Record<PapelRuta, string> = {
    escritor: "Escribe",
    revisor: "Revisa",
    director: "Dirige",
};

/** La frase de `porque`: quién manda, quién releva y cuántos quedan fuera. */
function porqueDe(
    papel: PapelRuta,
    cadena: readonly EslabonRuta[],
    activo: EslabonRuta | null,
    siguiente: EslabonRuta | null,
): string {
    if (cadena.length === 0) return "Todavía no hay ningún modelo declarado para este papel.";

    const partes: string[] = [];
    if (activo) {
        partes.push(`${VERBO_PAPEL[papel]} ${activo.id} porque es el primero vivo de la cadena.`);
    } else {
        partes.push("Nadie ocupa este papel ahora mismo: ningún eslabón de la cadena está vivo.");
    }
    if (siguiente) {
        partes.push(`Si se agota entra ${siguiente.id} (${TEXTO_ESTADO_RUTA[siguiente.estado]}).`);
    } else if (activo) {
        partes.push("No hay relevo detrás: si se agota, este papel se queda sin nadie.");
    }
    const fuera = cadena.filter((e) => e.estado !== "vivo");
    if (fuera.length > 0) partes.push(`Fuera ${fuera.length}: ${resumenFuera(fuera)}.`);
    return partes.join(" ");
}

/**
 * Plan de un papel: la cadena en el orden declarado por el catálogo (que ya es
 * el orden de preferencia), el primero vivo como `activo`, el siguiente vivo
 * como relevo y, si no queda ninguno vivo, el primer `desconocido` como
 * candidato — mejor probar suerte que dejar el papel huérfano.
 */
export function planDeRuta(
    modelos: readonly ModeloDisponible[],
    salud: Record<string, SaludProveedor>,
    clavesPresentes: readonly string[],
    papel: PapelRuta,
    ahora: number = Date.now(),
): PlanRuta {
    const cadena: EslabonRuta[] = [];
    for (const m of modelos) {
        if (!esDelPapel(m, papel)) continue;
        const { estado, motivo } = estadoDe(m, salud, clavesPresentes, ahora);
        cadena.push({
            id: m.id,
            proveedor: m.proveedor,
            nombre: m.nombre,
            posicion: cadena.length + 1,
            estado,
            activo: false,
            siguiente: false,
            motivo,
        });
    }

    const vivos = cadena.filter((e) => e.estado === "vivo");
    const activo = vivos[0] ?? null;
    const relevo = activo
        ? (vivos[1] ?? cadena.find((e) => e.estado === "desconocido") ?? null)
        : (cadena.find((e) => e.estado === "desconocido") ?? null);
    const siguiente = relevo && relevo !== activo ? relevo : null;

    if (activo) activo.activo = true;
    if (siguiente) siguiente.siguiente = true;

    return { papel, cadena, activo, siguiente, porque: porqueDe(papel, cadena, activo, siguiente) };
}

/**
 * Resumen de toda la flota para cabeceras («escriben 2 de 11 modelos») con los
 * tres planes ya calculados, para que el Taller no repita el cálculo.
 */
export function resumenDeFlota(
    modelos: readonly ModeloDisponible[],
    salud: Record<string, SaludProveedor>,
    clavesPresentes: readonly string[],
    ahora: number = Date.now(),
): ResumenFlota {
    const planes = PAPELES.map((p) => planDeRuta(modelos, salud, clavesPresentes, p, ahora));
    const escritores = planes.find((p) => p.papel === "escritor");
    const escriben = escritores ? escritores.cadena.filter((e) => e.estado === "vivo").length : 0;
    const total = modelos.length;
    return { escriben, total, frase: `escriben ${escriben} de ${total} modelos`, planes };
}

/**
 * Salud por proveedor a partir del catálogo vivo: cada modelo trae adjunta la
 * ficha de su proveedor, así que basta con quedarse con la primera de cada uno.
 */
export function saludDesdeCatalogo(modelos: readonly ModeloDisponible[]): Record<string, SaludProveedor> {
    const salud: Record<string, SaludProveedor> = {};
    for (const m of modelos) {
        if (m.saludDetalle && !salud[m.proveedor]) salud[m.proveedor] = m.saludDetalle;
    }
    return salud;
}

/**
 * Chip de posición para la tarjeta de un proveedor: «escritor 1.º», «revisor
 * 3.º» o «director» (dirigir no se numera: manda quien esté vivo). Se devuelve
 * el primer papel en el que ese proveedor aparece, siguiendo el orden `PAPELES`.
 */
export function etiquetaPosicion(planes: readonly PlanRuta[], proveedor: string): string | null {
    for (const plan of planes) {
        const eslabon = plan.cadena.find((e) => e.proveedor === proveedor);
        if (!eslabon) continue;
        if (plan.papel === "director") return "director";
        return `${plan.papel} ${eslabon.posicion}.º`;
    }
    return null;
}
