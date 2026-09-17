// src/lib/mando/neuronas.ts
// -----------------------------------------------------------------------------
// Medidor «Neuronas conectadas»: a cada dispositivo vinculado, qué sabe hacer.
//
// SEGURIDAD (NE1b · 2026-09-17). De aquí a la UI solo viajan NOMBRES de variable
// de entorno, nunca valores y nunca cadenas arbitrarias que un agente haya metido
// en `variable`. `variableSegura` es el último filtro antes de la pantalla: si un
// agente confunde el nombre con el valor (clásico), ese secreto se OMITE, no se
// publica tal cual. Nada de abrir el campo a cualquier string.
// -----------------------------------------------------------------------------

type TipoNeurona = "esta máquina" | "nube" | "motor local";

interface PasarelaNeurona {
    clave?: unknown;
    modelo?: unknown;
    variable?: unknown;
    tiene_clave?: unknown;
    estado?: unknown;
}

export interface InformeNeuronas {
    t?: unknown;
    pasarelas?: unknown;
}

export interface ProcesoNeurona {
    tarea?: string;
    donde?: string;
    modelo?: string;
    minutos?: number;
    vistoEn?: string;
}

interface FilaNeurona {
    id: string;
    titulo: string;
    estado: string;
    tipo: TipoNeurona;
    responde: boolean;
    modelos: string[];
    procesos: number;
    desde: string;
    ultimaSenal: string;
    sinSenalMinutos: number;
    aviso?: string;
    credenciales: Array<{ variable: string; presente: boolean }>;
    acciones: [];
}

type Acumulada = Omit<FilaNeurona, "estado" | "responde" | "sinSenalMinutos" | "aviso"> & {
    escriben: boolean;
};

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const fechaMs = (valor: string): number => {
    const ms = Date.parse(valor.includes("T") ? valor : valor.replace(" ", "T"));
    return Number.isFinite(ms) ? ms : 0;
};

/**
 * Un nombre de variable de entorno válido: mayúsculas, dígitos y guion bajo,
 * 64 caracteres como tope. Todo lo demás —un valor, una ruta, un string con
 * minúsculas o guiones de datos— es un secreto o un error y se descarta.
 */
const VARIABLE_SEGURA = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Devuelve el nombre solo si es de entorno; cadena vacía en cualquier otro caso. */
export function variableSegura(valor: unknown): string {
    const nombre = texto(valor);
    return VARIABLE_SEGURA.test(nombre) ? nombre : "";
}

function identidad(donde: string): { id: string; titulo: string; tipo: TipoNeurona } {
    const normal = donde.toLowerCase();
    if (!normal || normal === "mac") return { id: "mac", titulo: "Esta Mac", tipo: "esta máquina" };
    if (["local", "neurona", "ollama"].includes(normal)) {
        return { id: "motor-local", titulo: "Motor local · Ollama", tipo: "motor local" };
    }
    if (normal === "nube") return { id: "nube", titulo: "Nube", tipo: "nube" };
    const etiqueta = donde.replace(/[^A-Za-zÀ-ÿ0-9 _-]/g, "").trim().slice(0, 48) || "Medio remoto";
    const id = `nube-${normal.replace(/[^a-z0-9-]+/g, "-")}`;
    return { id, titulo: etiqueta, tipo: "nube" };
}

export function construirFilasNeuronas(
    informe: InformeNeuronas,
    procesos: ProcesoNeurona[],
    ahora: string,
): FilaNeurona[] {
    const ahoraMs = fechaMs(ahora);
    const marcaInforme = texto(informe.t);
    const mapa = new Map<string, Acumulada>();
    const obtener = (donde: string, vistoEn: string): Acumulada => {
        const meta = identidad(donde);
        const previa = mapa.get(meta.id);
        if (previa) return previa;
        const nueva: Acumulada = {
            ...meta, modelos: [], procesos: 0, desde: vistoEn, ultimaSenal: vistoEn,
            credenciales: [], acciones: [], escriben: false,
        };
        mapa.set(meta.id, nueva);
        return nueva;
    };

    obtener("mac", ahora).escriben = true;
    const pasarelas = Array.isArray(informe.pasarelas) ? informe.pasarelas : [];
    for (const cruda of pasarelas) {
        if (typeof cruda !== "object" || cruda === null) continue;
        const p = cruda as PasarelaNeurona;
        const clave = texto(p.clave);
        const fila = obtener(clave === "neurona" ? "neurona" : "nube", marcaInforme);
        const modelo = texto(p.modelo);
        if (modelo && !fila.modelos.includes(modelo)) fila.modelos.push(modelo);
        fila.escriben ||= texto(p.estado) === "escribe";
        const variable = variableSegura(p.variable);
        if (variable && !fila.credenciales.some((c) => c.variable === variable)) {
            fila.credenciales.push({ variable, presente: p.tiene_clave === true });
        }
    }

    for (const proceso of procesos) {
        const vistoEn = proceso.vistoEn || ahora;
        const fila = obtener(proceso.donde || "mac", vistoEn);
        fila.procesos += 1;
        fila.escriben = true;
        const modelo = texto(proceso.modelo);
        if (modelo && !fila.modelos.includes(modelo)) fila.modelos.push(modelo);
        const inicio = new Date(Math.max(0, fechaMs(vistoEn) - Math.max(0, proceso.minutos ?? 0) * 60_000)).toISOString();
        if (!fila.desde || fechaMs(inicio) < fechaMs(fila.desde)) fila.desde = inicio;
        if (fechaMs(vistoEn) > fechaMs(fila.ultimaSenal)) fila.ultimaSenal = vistoEn;
    }

    return [...mapa.values()].map((fila) => {
        const sinSenalMinutos = fila.ultimaSenal && ahoraMs
            ? Math.max(0, Math.floor((ahoraMs - fechaMs(fila.ultimaSenal)) / 60_000)) : 0;
        const responde = fila.escriben && sinSenalMinutos <= 10;
        const aviso = sinSenalMinutos > 10 ? `Sin señal desde hace ${sinSenalMinutos} min` : undefined;
        const { escriben: _escriben, ...datos } = fila;
        void _escriben;
        return { ...datos, responde, sinSenalMinutos, estado: aviso ?? (responde ? "responde" : "no responde"), aviso };
    });
}