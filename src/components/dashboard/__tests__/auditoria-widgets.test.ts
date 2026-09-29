import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { faltaDatoReal } from "../calidad-widget";
import "./widget-manifest-completo.test";

const RAIZ_WIDGETS = "src/components/dashboard/widgets";

type Incumplimiento = "estados" | "relleno" | "emoji";

interface AuditoriaArchivo {
    archivo: string;
    incumplimientos: Incumplimiento[];
}

// Cada excepción documenta su deuda y la ola que debe retirarla.
const EXCEPCIONES = new Set<string>([
    // Falta el contrato completo de estados; Ola 306.
    "app-launcher-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "aurora-last-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "calculator-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "clock-date-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "media/audiomorphic-bg-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "my-events-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "quick-access-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "quick-notes-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "system-status-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "tasks-quick-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "theme-manager-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "theme-selector-widget.tsx",
    // Faltan estados y conserva relleno; Olas 306 y 307.
    "universal-opener-widget.tsx",
]);

function archivosTsx(directorio: string): string[] {
    return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
        const ruta = join(directorio, entrada.name);
        if (entrada.isDirectory()) {
            return entrada.name === "__tests__" ? [] : archivosTsx(ruta);
        }
        if (!entrada.isFile() || !entrada.name.endsWith(".tsx") || entrada.name.endsWith(".module.css.tsx")) {
            return [];
        }
        return [ruta];
    });
}

function exportaWidget(contenido: string): boolean {
    return /export\s+(?:default\s+)?(?:function|const|class)\s+\w*(?:Widget|App)\b/.test(contenido);
}

function tieneEstadosHonestos(contenido: string): boolean {
    if (/\bMarcoWidget\b/.test(contenido)) return true;
    const carga = /\b(?:loading|cargando)\b/i.test(contenido);
    const vacio = /\b(?:empty|vac[ií]o)\b/i.test(contenido);
    const error = /\b(?:error|catch|fail\w*|fallo\w*)\b/i.test(contenido);
    return carga && vacio && error;
}

function contieneRelleno(contenido: string): boolean {
    const rastros = contenido.match(/\b(?:lorem\w*|mocks?|dummy|ejemplos?|samples?)\b/giu) ?? [];
    return rastros.some((rastro) => faltaDatoReal(rastro));
}

function contieneEmojiComoIcono(contenido: string): boolean {
    const sinComentarios = contenido
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    return /[\u{1F000}-\u{1FAFF}]/u.test(sinComentarios);
}

function auditarArchivo(ruta: string): AuditoriaArchivo {
    const contenido = readFileSync(ruta, "utf8");
    const incumplimientos: Incumplimiento[] = [];
    if (!tieneEstadosHonestos(contenido)) incumplimientos.push("estados");
    if (contieneRelleno(contenido)) incumplimientos.push("relleno");
    if (contieneEmojiComoIcono(contenido)) incumplimientos.push("emoji");
    return { archivo: relative(RAIZ_WIDGETS, ruta), incumplimientos };
}

describe("auditoría automática de widgets", () => {
    it("mantiene el listón y una lista de excepciones exacta", () => {
        const auditorias = archivosTsx(RAIZ_WIDGETS)
            .map((ruta) => ({ ruta, contenido: readFileSync(ruta, "utf8") }))
            .filter(({ contenido }) => exportaWidget(contenido))
            .map(({ ruta }) => auditarArchivo(ruta));
        const incumplen = auditorias.filter(({ incumplimientos }) => incumplimientos.length > 0);
        const detectados = new Set(incumplen.map(({ archivo }) => archivo));
        const fallos = incumplen
            .filter(({ archivo }) => !EXCEPCIONES.has(archivo))
            .map(({ archivo, incumplimientos }) => `${archivo}: ${incumplimientos.join(", ")}`);
        for (const excepcion of EXCEPCIONES) {
            if (!detectados.has(excepcion)) fallos.push(`${excepcion}: excepción obsoleta; el widget ya cumple`);
        }
        expect(fallos.sort().join("\n"), "Fallos de la auditoría de widgets").toBe("");
    });
});
