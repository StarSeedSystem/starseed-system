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
    "active-projects-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "activity-summary-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "ai-generated-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "app-launcher-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "aurora-last-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "badges-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "brains-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "calculator-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "camera-quick-widget.tsx",
    // Faltan estados y usa emojis como iconos; Olas 306 y 308.
    "cartera-starseed.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "clock-date-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "collab-projects-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "communities-widget.tsx",
    // Conserva rastros de datos de ejemplo; Ola 307.
    "cultural-feed-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "data/official-data-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "documents-widget.tsx",
    // Faltan estados y conserva relleno; Olas 306 y 307.
    "economic-overview-widget.tsx",
    // Faltan estados y conserva relleno; Olas 306 y 307.
    "explore-network-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "federated-entities-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen2/agora-causal-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen2/akashic-codex-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen2/astraura-cortex-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen2/immersion-portal-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen2/liquid-delegation-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen2/mesh-radar-widget.tsx",
    // Faltan estados y conserva relleno; Olas 306 y 307.
    "gen2/natal-chart-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen2/oikos-metabolism-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen2/skill-tree-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen2/sovereign-node-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen3/civic-alchemy-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen3/food-oracle-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen3/regen-tracer-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen3/vital-flow-audit-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/barter-market-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/creative-studio-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/elder-council-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/energy-grid-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/energy-map-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/identity-vault-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/mentor-match-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/multiverse-hub-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/oracle-predict-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/restorative-court-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen4/universal-library-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen5/abundance-radar-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen5/crypto-shield-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen5/flow-director-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen5/habitat-core-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen5/idea-forge-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen5/merit-gallery-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen5/project-swarm-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen5/serendipity-lens-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen5/society-pulse-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "gen5/transit-flow-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "immersive-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "internet-radar-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "learning-path-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "live-data-widget.tsx",
    // Faltan estados y conserva relleno; Olas 306 y 307.
    "map-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "media/audiomorphic-bg-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "media/media-control-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "media/music-player-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "media/omnifrecuencias-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "media/radio-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "memories-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "mental-coherence-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "messages-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "my-events-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "my-groups-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "my-pages-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "network-feed-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "nexus-quick-access-widget.tsx",
    // Faltan estados y conserva relleno; Olas 306 y 307.
    "political-summary-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "quick-access-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "quick-notes-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "recent-activity-widget.tsx",
    // Falta el contrato completo de estados; Ola 306.
    "recent-gallery-widget.tsx",
    // Conserva rastros de datos de ejemplo; Ola 307.
    "relevant-posts-widget.tsx",
    // Conserva rastros de datos de ejemplo; Ola 307.
    "social-radar-widget.tsx",
    // Conserva rastros de datos de ejemplo; Ola 307.
    "space/space-weather-app.tsx",
    // Conserva rastros de datos de ejemplo; Ola 307.
    "space/space-weather-widget.tsx",
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
    // Falta el contrato completo de estados; Ola 306.
    "vaults-widget.tsx",
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
