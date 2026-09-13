/**
 * Helpers PUROS del formulario de Ajustes Director (Ola 318 · p318H).
 * Sin I/O ni `"use client"`: solo listas y conversiones, para que
 * `ajustes-director.tsx` quede dentro del límite de líneas por escritura.
 */
import type { ConfigDirector } from "./director-config";

export interface TextosNumericos {
    espera_aprobacion_min: string; intervalo_s: string; trabajadores: string;
    tope_por_relanzamiento: string; reintentos_por_pasada: string; disco_min_gb: string;
    tope_haiku_dia: string; tope_sonnet_dia: string;
}
export interface CampoNumerico { clave: keyof TextosNumericos; etiqueta: string; ayuda: string }

export const CAMPOS_NUMERICOS: CampoNumerico[] = [
    { clave: "espera_aprobacion_min", etiqueta: "Espera de aprobación (min)", ayuda: "Minutos que una tarea revisada espera tu visto bueno." },
    { clave: "intervalo_s", etiqueta: "Intervalo del vigilante (s)", ayuda: "Cada cuántos segundos el vigilante revisa el enjambre." },
    { clave: "trabajadores", etiqueta: "Trabajadores", ayuda: "Agentes que el orquestador mantiene escribiendo a la vez." },
    { clave: "tope_por_relanzamiento", etiqueta: "Tope por relanzamiento", ayuda: "Máximo de tareas que un relanzamiento toma de golpe." },
    { clave: "reintentos_por_pasada", etiqueta: "Reintentos por pasada", ayuda: "Veces que se reintenta una tarea «sin cambios» antes de escalar." },
    { clave: "disco_min_gb", etiqueta: "Disco mínimo libre (GB)", ayuda: "Por debajo de este límite, el vigilante deja de relanzar." },
    { clave: "tope_haiku_dia", etiqueta: "Tope haiku/día (escalada)", ayuda: "Tareas escaladas al Claude barato permitidas por día." },
    { clave: "tope_sonnet_dia", etiqueta: "Tope sonnet/día (escalada)", ayuda: "Tareas escaladas al Claude medio permitidas por día." },
];
const CLAVES_ESCALADA = new Set<keyof TextosNumericos>(["tope_haiku_dia", "tope_sonnet_dia"]);

/** `ConfigDirector` → sus campos numéricos como texto, para pintar los inputs. */
export function textosDeConfig(c: ConfigDirector): TextosNumericos {
    return {
        espera_aprobacion_min: String(c.espera_aprobacion_min), intervalo_s: String(c.intervalo_s),
        trabajadores: String(c.trabajadores), tope_por_relanzamiento: String(c.tope_por_relanzamiento),
        reintentos_por_pasada: String(c.reintentos_por_pasada), disco_min_gb: String(c.disco_min_gb),
        tope_haiku_dia: String(c.escalada.tope_haiku_dia), tope_sonnet_dia: String(c.escalada.tope_sonnet_dia),
    };
}

/** Textos + booleanos + chips del formulario → el objeto crudo que valida `validar()`. */
export function entradaDeFormulario(
    textos: TextosNumericos, escaladaActiva: boolean, avisoCheckin: boolean, apartados: string[],
): Record<string, unknown> {
    const entrada: Record<string, unknown> = {
        proveedores_apartados: apartados, aviso_checkin: avisoCheckin,
        escalada: { activa: escaladaActiva, tope_haiku_dia: Number(textos.tope_haiku_dia), tope_sonnet_dia: Number(textos.tope_sonnet_dia) },
    };
    for (const { clave } of CAMPOS_NUMERICOS) {
        if (!CLAVES_ESCALADA.has(clave)) entrada[clave] = Number(textos[clave]);
    }
    return entrada;
}

export function agregarProveedor(lista: string[], nombre: string): string[] {
    const limpio = nombre.trim().toLowerCase();
    return limpio && !lista.includes(limpio) ? [...lista, limpio] : lista;
}
export function quitarProveedor(lista: string[], nombre: string): string[] {
    return lista.filter((p) => p !== nombre);
}
