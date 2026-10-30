/**
 * Medidores REMOTOS (IND1029F · MetaGenesis autónoma).
 * ═════════════════════════════════════════════════════════════════════════════
 * Sin este módulo, Genesis de una neurona sin los archivos (la publicada, otra
 * neurona, un móvil) quedaba sin cifras cuando `reunir()` no podía llenar nada:
 * los medidores solo sabían leer el disco de la Mac.
 *
 * Ahora toma la última FOTO que el líder dejó en la puerta de datos del A1
 * (`arriendo.foto`, la escribe `scripts/puente/nodo_metagenesis.py` con
 * `nodo_metagenesis_logica.foto`: nodos, quién dirige, cuentas de lo que hay)
 * y la marca «desde <neurona>, hace N min». Sin foto: se DICE, nunca se
 * inventa un número.
 *
 * Este módulo es PURO (sin red, sin `node:*`): valida con desconfianza lo que
 * llega de la puerta (una respuesta de otro servidor) y tampoco lleva claves
 * ni rutas de disco. Lo puro aquí; el fetch y el JWT van en la ruta.
 */

import { detalleDeMedidor, type ClaveMedidor, type DetalleMedidor } from "./medidores";

/** Una foto más vieja que esto no se sirve como si fuera de ahora. */
export const TTL_FOTO_MS = 30 * 60_000;

/** Qué es una foto del líder, ya saneada: solo números y textos acotados. */
export interface FotoLider {
    lider: string;
    medio: string;
    /** Milisegundos desde épsilon Unix; lo compara `fresca`. */
    ts: number;
    autonomia: boolean;
    /** Modo seco: ensaya, no actúa (el `modo` de la foto del nodo). */
    seco: boolean;
    /** Cuentas del trabajo tal como las publicó el líder («listas»: «24»…). */
    medidores: Record<string, string>;
}

export type LecturaLider = { foto: FotoLider; desde: string; haceMin: number; fresca: boolean };

/** Recursos de VM/DV en español: lo que se muestra con «desde <neurona>». */
const MEDIOS: Record<string, string> = {
    mac: "la Mac",
    "oracle-a1": "el A1 de Oracle",
    neurona: "una neurona",
    "nube-cowork": "la nube",
    "gh-actions": "GitHub Actions",
};

/** Nombre legible del medio que publicó la foto (o su id de nodo, sin adornos). */
function nombreDeMedio(medio: unknown, lider: string): string {
    const m = typeof medio === "string" && medio in MEDIOS ? medio : "";
    const id = lider.replace(/^nodo:/, "").slice(0, 40) || "alojamiento desconocido";
    return m ? MEDIOS[m] : id;
}

function texto(v: unknown, tope: number): string {
    return typeof v === "string" ? v.slice(0, tope) : "";
}

/**
 * PURA. De la respuesta de `GET /v1/metagenesis/arriendo` a la foto del líder,
 * con la edad y el medio, o `null` si lo que llega no se parece. Una foto
 * hecha en un minuto vale por exactamente eso; lo demás de la respuesta no
 * interesa, y lo que se lee se limpia por si algo se coló.
 */
export function fotoLiderDeRespuesta(resp: unknown, ahora = Date.now()): LecturaLider | null {
    const d = typeof resp === "object" && resp !== null && !Array.isArray(resp) ? (resp as Record<string, unknown>) : {};
    const arriendo = typeof d.arriendo === "object" && d.arriendo !== null ? (d.arriendo as Record<string, unknown>) : {};
    const f = typeof arriendo.foto === "object" && arriendo.foto !== null && !Array.isArray(arriendo.foto)
        ? (arriendo.foto as Record<string, unknown>)
        : null;
    if (!f) return null;
    const tsBruto = Number(f.ts);
    const ts = Number.isFinite(tsBruto) && tsBruto > 1e9 ? Math.round(tsBruto * (tsBruto < 1e12 ? 1000 : 1)) : 0;
    if (!ts) return null;
    const lider = texto(f.lider, 60);
    const nodos = Array.isArray(d.nodos) ? d.nodos : [];
    const medioDelLider = nodos.find(
        (n): n is Record<string, unknown> => typeof n === "object" && n !== null && (n as { nodo?: unknown }).nodo === f.lider,
    )?.medio;
    const medidores: Record<string, string> = {};
    for (const [k, v] of Object.entries(typeof f.medidores === "object" && f.medidores !== null ? (f.medidores as Record<string, unknown>) : {})) {
        const clave = k.replace(/[^a-z0-9-]/gi, "").slice(0, 40);
        const valor = v == null ? "" : String(v).slice(0, 40);
        if (clave && valor) medidores[clave] = valor;
    }
    const edad = Math.max(0, ahora - ts);
    return {
        foto: {
            lider,
            medio: texto(medioDelLider, 40),
            ts,
            autonomia: f.autonomia === false ? false : true,
            seco: f.modo === "seco",
            medidores,
        },
        desde: nombreDeMedio(medioDelLider, lider),
        haceMin: Math.floor(edad / 60_000),
        fresca: edad < TTL_FOTO_MS,
    };
}

/** «desde <neurona>, hace N min»: la marca que pide el contrato. */
export function marcaDeFoto(l: LecturaLider): string {
    return `desde ${l.desde}, hace ${l.haceMin} ${l.haceMin === 1 ? "minuto" : "minutos"}`;
}

/**
 * PURA. El detalle que la ruta sirve cuando lo local falta: una vista sincera
 * de la foto del líder (sin filas ni porcentajes inventados) para `clave`,
 * con el título de siempre del medidor y acción ninguna (la foto es de solo
 * lectura).
 */
export function detalleRemotoDe(clave: ClaveMedidor, lectura: LecturaLider | null): DetalleMedidor {
    const base = detalleDeMedidor(clave, {});
    if (!lectura) {
        return {
            ...base,
            resumen: "sin foto en la puerta",
            filas: [],
            acciones: [],
            vacio: "Ningún líder dejó su foto en la puerta de datos: no hay cifras remotas (y tampoco se inventan).",
        };
    }
    const cuenta = Object.entries(lectura.foto.medidores)
        .map(([k, v]) => `${k} ${v}`)
        .slice(0, 8)
        .join(" · ");
    const modo = lectura.foto.seco ? "ensayando (modo seco)" : lectura.foto.autonomia ? "autónoma" : "en pausa";
    return {
        ...base,
        resumen: `Foto del líder de MetaGenesis, ${marcaDeFoto(lectura)}${lectura.fresca ? "" : " (dato antiguo)"}${cuenta ? `: ${cuenta}` : ""}`,
        filas: [],
        acciones: [],
        vacio: `MetaGenesis ${modo}; el detalle de cada medidor vive en el disco de la neurona que dirige.`,
    };
}

