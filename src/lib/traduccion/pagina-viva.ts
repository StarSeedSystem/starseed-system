/**
 * Traducción · página entera EN VIVO (TRD1020C, repos-libreria-1020d.md §4).
 * Conecta `pagina.ts` (recogerTextos/aplicar/observar/restaurar) con un cliente de
 * traducción por lotes: recoge los nodos visibles, traduce por lotes, guarda el
 * original de cada nodo, marca `lang` y sigue los textos nuevos que aparezcan.
 * El cliente llega INYECTADO (misma forma que el de LibreTranslate de TRD1020A),
 * así que este módulo es puro y sus pruebas no tocan la red.
 */

import { crearLotes } from "./libretranslate";
import { aplicar, observar, recogerTextos, restaurar, type TextoRecogido } from "./pagina";

type LotePedido = { q: string[]; source: string; target: string; format: string };
export interface ClienteTraduccion {
    traducir(pedido: LotePedido): Promise<{ translatedText: string | string[] }>;
}

/** Límite de caracteres por petición: el servidor de la malla lo agradece. */
const LOTE = 4_000;

/** Traduce en LOTES los textos de la raíz y devuelve el mapa original → traducción. */
async function traducirLotes(
    cliente: ClienteTraduccion,
    textos: string[],
    idioma: string,
): Promise<Record<string, string>> {
    const unicos = Array.from(new Set(textos.map((t) => t.trim()).filter(Boolean)));
    const salida: Record<string, string> = {};
    for (const grupo of crearLotes(unicos, LOTE)) {
        const respuesta = await cliente.traducir({ q: grupo, source: "auto", target: idioma, format: "text" });
        const trozos = Array.isArray(respuesta.translatedText) ? respuesta.translatedText : [respuesta.translatedText];
        grupo.forEach((original, j) => {
            const traduccion = trozos[j];
            if (typeof traduccion === "string" && traduccion && traduccion !== original) salida[original] = traduccion;
        });
    }
    return salida;
}

export interface PaginaViva {
    /** Queda listo cuando el primer lote intentó aplicarse (con o sin traducción). */
    listo: Promise<void>;
    /** Detiene la observación y devuelve todo el texto (y los atributos) como estaba. */
    parar: () => void;
}

/**
 * Traduce la raíz entera y sigue los textos nuevos con MutationObserver, sin
 * volver a traducir lo ya traducido (lo decide `aplicar` con su WeakMap).
 * Un fallo de la API deja el texto como estaba: el traducir de nuevo es gratis.
 */
export function crearPaginaViva(opciones: { cliente: ClienteTraduccion; raiz: ParentNode; idioma: string }): PaginaViva {
    const { cliente, raiz, idioma } = opciones;
    let parado = false;
    const volverTraducir = async (nodos: TextoRecogido[]): Promise<void> => {
        if (parado || nodos.length === 0) return;
        try {
            const traducciones = await traducirLotes(cliente, nodos.map((n) => n.texto), idioma);
            if (!parado) aplicar(nodos, traducciones, idioma);
        } catch {
            // Sin servicio de traducción (apagado o sin túnel): el texto se queda como estaba.
        }
    };
    const vueltaInicial: Promise<void> = volverTraducir(recogerTextos(raiz));
    const pararObservacion = observar(raiz, (nuevos) => { void volverTraducir(nuevos); });
    return {
        listo: vueltaInicial,
        parar: () => {
            parado = true;
            pararObservacion();
            restaurar(raiz);
        },
    };
}
