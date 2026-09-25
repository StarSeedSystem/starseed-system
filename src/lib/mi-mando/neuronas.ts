/**
 * Mi Puente de Mando — lectura legible de las neuronas (PURO).
 * ─────────────────────────────────────────────────────────────────────────────
 * Una «neurona» es cada dispositivo con tu cuenta abierta (ver
 * src/lib/neurons/neurons.ts). Aquí se traduce lo técnico (capacidades,
 * permisos, última conexión) a frases cortas que cualquiera entiende. Solo
 * tipos importados: nada de red ni de navegador, para poder probarlo.
 */

import type { Neuron, NeuronCapabilities, NeuronKind, NeuronPermissions } from "@/lib/neurons/neurons";

export interface DefinicionPermiso {
    clave: keyof NeuronPermissions;
    etiqueta: string;
    /** Una línea: qué permite exactamente si está activado. */
    explicacion: string;
}

/** Los seis permisos de cada dispositivo, explicados en una línea. */
export const PERMISOS_NEURONA: readonly DefinicionPermiso[] = [
    { clave: "compute", etiqueta: "Potencia de IA", explicacion: "Deja que tus otros dispositivos usen la IA local de este." },
    { clave: "storage", etiqueta: "Almacenamiento", explicacion: "Guarda y comparte copias de tus archivos y memorias con tus otros dispositivos." },
    { clave: "sync", etiqueta: "Sincronización", explicacion: "Mantiene al día ajustes, contexto y memorias con tu cuenta." },
    { clave: "agent", etiqueta: "Agentes", explicacion: "Permite que tus agentes ejecuten tareas en este dispositivo." },
    { clave: "senses", etiqueta: "Sentidos", explicacion: "Permite usar micrófono, cámara o pantalla cuando tú lo pidas." },
    { clave: "wake", etiqueta: "Avisos", explicacion: "Recibe avisos y despertares enviados desde tus otros dispositivos." },
];

export const ETIQUETA_TIPO: Record<NeuronKind, string> = {
    desktop: "Ordenador de escritorio",
    laptop: "Portátil",
    mobile: "Móvil",
    tablet: "Tableta",
    server: "Servidor",
    other: "Dispositivo",
};

/** «ahora mismo», «hace 5 min», «hace 3 h», «hace 2 días», «sin registro». */
export function haceCuanto(iso: string | undefined, ahora = Date.now()): string {
    if (!iso) return "sin registro";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "sin registro";
    const ms = ahora - t;
    if (ms < 45_000) return "ahora mismo";
    const min = Math.floor(ms / 60_000);
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} día${d === 1 ? "" : "s"}`;
}

/**
 * Capacidades clave como etiquetas cortas: plataforma, memoria, gráficos para
 * IA y motores de IA locales. Solo lo que el dispositivo declaró de verdad.
 */
export function capacidadesLegibles(c: NeuronCapabilities | undefined | null): string[] {
    if (!c) return [];
    const out: string[] = [];
    if (c.platform && c.platform !== "desconocido" && c.platform !== "otro") out.push(c.platform);
    if (typeof c.memoryGb === "number" && c.memoryGb > 0) out.push(`${c.memoryGb} GB de RAM`);
    if (typeof c.cores === "number" && c.cores > 0) out.push(`${c.cores} núcleos`);
    if (c.webgpu) out.push("WebGPU (IA en el navegador)");
    if (c.chromeAi) out.push("IA integrada del navegador");
    if (c.ollama) out.push("Ollama");
    if (c.lmstudio) out.push("LM Studio");
    if (c.astraura158?.online) out.push("Astraura local");
    if (c.installedApp) out.push("App instalada");
    return out;
}

/** ¿Tiene algún motor de IA local? */
export function tieneIaLocal(c: NeuronCapabilities | undefined | null): boolean {
    return Boolean(c && (c.ollama || c.lmstudio || c.webgpu || c.chromeAi || c.astraura158?.online));
}

export interface ResumenNeuronas {
    total: number;
    enLinea: number;
    conIaLocal: number;
    /** Nombre de este dispositivo, si está en la lista. */
    esteDispositivo: string | null;
}

export function resumenNeuronas(lista: readonly Neuron[]): ResumenNeuronas {
    return {
        total: lista.length,
        enLinea: lista.filter((n) => n.online).length,
        conIaLocal: lista.filter((n) => tieneIaLocal(n.capabilities)).length,
        esteDispositivo: lista.find((n) => n.isThisDevice)?.name ?? null,
    };
}

/** Frase corta del resumen: «2 de 3 en línea». */
export function fraseResumenNeuronas(r: ResumenNeuronas): string {
    if (r.total === 0) return "Ningún dispositivo registrado todavía";
    return `${r.enLinea} de ${r.total} en línea`;
}

/** Nombre limpio para guardar (sin espacios de más, 1-60 caracteres) o null si no vale. */
export function nombreValido(nombre: string): string | null {
    const limpio = nombre.replace(/\s+/g, " ").trim().slice(0, 60);
    return limpio.length > 0 ? limpio : null;
}
