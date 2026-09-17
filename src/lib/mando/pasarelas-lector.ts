import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type EstadoPasarela = "escribe" | "sin_cupo" | "sin_clave" | "sin_canal"
    | "modelo_fuera" | "lenta" | "caida" | "fichaje";

export interface FilaPasarela {
    id: string; nombre: string; modelo: string;
    variable: string | null; tieneClave: boolean;
    estado: EstadoPasarela; necesitaPersona: boolean;
    enlace: string; accion: string;
    medidoHace: string;
}

export interface DatosPasarelas {
    estadoInforme: "actual" | "antiguo" | "ausente"; mensaje: string;
    medidoEn: string | null; medidoHaceMin: number | null;
    filas: FilaPasarela[];
}

const SEIS_HORAS_MIN = 6 * 60;
const ESTADOS: readonly EstadoPasarela[] = [
    "escribe", "sin_cupo", "sin_clave", "sin_canal", "modelo_fuera", "lenta", "caida", "fichaje",
];

const CATALOGO: Record<string, { nombre: string; enlace: string }> = {
    nvidia: { nombre: "NVIDIA Build (NIM)", enlace: "https://build.nvidia.com/" },
    openrouter: { nombre: "OpenRouter", enlace: "https://openrouter.ai/settings/keys" },
    groq: { nombre: "Groq", enlace: "https://console.groq.com/keys" },
    xkiro: { nombre: "xkiro", enlace: "https://api.xkiro.com/" },
    tokenrouter: { nombre: "TokenRouter", enlace: "https://api.tokenrouter.com/" },
    aihubmix: { nombre: "AIHubMix", enlace: "https://aihubmix.com/token" },
    apinex: { nombre: "apinex", enlace: "https://apinex.bond/airdrop?tab=quests" },
    deepseek: { nombre: "DeepSeek", enlace: "https://platform.deepseek.com/api_keys" },
    xai: { nombre: "xAI (Grok)", enlace: "https://console.x.ai/team/billing" },
    neurona: { nombre: "Neurona local (Ollama)", enlace: "https://ollama.com/library" },
    huggingface: { nombre: "Hugging Face", enlace: "https://huggingface.co/settings/tokens" },
};

const ACCIONES: Record<EstadoPasarela, { texto: string; enlace: boolean; humano: boolean }> = {
    escribe: { texto: "Escribe: déjala en la rotación.", enlace: false, humano: false },
    sin_cupo: { texto: "Sin cupo: apártala hasta que se reponga.", enlace: true, humano: false },
    sin_clave: { texto: "La clave falta o no vale: hay que renovarla.", enlace: true, humano: true },
    sin_canal: { texto: "No hay proveedor detrás: cambia el modelo.", enlace: false, humano: false },
    modelo_fuera: { texto: "El modelo salió del catálogo: quítalo de la rotación.", enlace: false, humano: false },
    lenta: { texto: "Acepta pero no emite: dale más margen o baja el ritmo.", enlace: false, humano: false },
    caida: { texto: "No responde: déjala fuera de la rotación.", enlace: true, humano: false },
    fichaje: { texto: "Pide el fichaje diario: entra y pulsa el botón.", enlace: true, humano: true },
};

function objeto(valor: unknown): Record<string, unknown> {
    return typeof valor === "object" && valor !== null && !Array.isArray(valor)
        ? valor as Record<string, unknown> : {};
}

function texto(valor: unknown): string {
    return typeof valor === "string" ? valor : "";
}

function estadoSeguro(valor: unknown): EstadoPasarela {
    return ESTADOS.includes(valor as EstadoPasarela) ? valor as EstadoPasarela : "caida";
}

function fraseEdad(minutos: number | null): string {
    if (minutos === null) return "fecha desconocida";
    if (minutos < 1) return "hace menos de un minuto";
    if (minutos < 60) return `hace ${minutos} min`;
    return `hace ${Math.floor(minutos / 60)} h`;
}

export function convertirInformePasarelas(
    informe: unknown,
    ahoraMs: number = Date.now(),
): DatosPasarelas {
    const raiz = objeto(informe);
    if (!Array.isArray(raiz.pasarelas)) {
        return { estadoInforme: "ausente", mensaje: "No hay informe de pasarelas disponible.", medidoEn: null, medidoHaceMin: null, filas: [] };
    }
    const medidoEn = texto(raiz.t) || null;
    const instante = medidoEn ? Date.parse(medidoEn.replace(" ", "T")) : NaN;
    const medidoHaceMin = Number.isFinite(instante)
        ? Math.max(0, Math.floor((ahoraMs - instante) / 60_000)) : null;
    const medidoHace = fraseEdad(medidoHaceMin);
    const filas = raiz.pasarelas.flatMap((entrada): FilaPasarela[] => {
        const dato = objeto(entrada);
        const id = texto(dato.clave);
        if (!id) return [];
        const ficha = CATALOGO[id] ?? { nombre: id, enlace: "" };
        const estado = estadoSeguro(dato.estado);
        const accion = ACCIONES[estado];
        return [{ id, nombre: ficha.nombre, modelo: texto(dato.modelo),
            variable: texto(dato.variable) || null, tieneClave: dato.tiene_clave === true,
            estado, necesitaPersona: accion.humano,
            enlace: accion.enlace ? ficha.enlace : "", accion: accion.texto, medidoHace }];
    });
    const antiguo = medidoHaceMin === null || medidoHaceMin > SEIS_HORAS_MIN;
    const mensaje = medidoHaceMin === null
        ? "El informe no tiene una fecha de medición válida."
        : `${antiguo ? "Informe antiguo" : "Informe actualizado"}: medido ${medidoHace}.`;
    return { estadoInforme: antiguo ? "antiguo" : "actual", mensaje, medidoEn, medidoHaceMin, filas };
}

export async function leerPasarelas(): Promise<DatosPasarelas> {
    try {
        const ruta = path.join(homedir(), ".starseed", "pasarelas-informe.json");
        return convertirInformePasarelas(JSON.parse(await readFile(ruta, "utf-8")) as unknown);
    } catch {
        return convertirInformePasarelas(null);
    }
}
