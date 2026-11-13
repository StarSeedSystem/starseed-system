/**
 * AST1113A · `/agent`: un solo indicador de agentes, con datos reales.
 *
 * Alex (13-11): «hay 2 indicadores de agentes activos los cuales dicen informacion diferente … quita los de
 * Astraura 1.58-bit · astraura-158/auto 2 agentes de la parte superior y deja los otros de 6 procesos activos ·
 * 8 agentes vivos · 0 aprobaciones pendientes pero que sean los datos reales».
 *
 * `page.tsx` no se puede montar en jsdom (arrastra medio sistema), así que, como GEN1113E y GEN1114F, aquí se lee
 * su código. La tira en sí se monta de verdad en `components/astraura/__tests__/presencia-real-tira.test.tsx` y
 * su lógica se prueba en `lib/mando/__tests__/presencia-real.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(__dirname, "..", "..");
const PAGINA = readFileSync(path.join(SRC, "app", "(app)", "agent", "page.tsx"), "utf8");
const TIRA = readFileSync(path.join(SRC, "components", "astraura", "astraura-158-presence.tsx"), "utf8");
const SUPERFICIE = readFileSync(path.join(SRC, "components", "agent", "chat-surface.tsx"), "utf8");

const CABECERA = PAGINA.slice(PAGINA.indexOf('data-testid="cabecera-agente"'), PAGINA.indexOf('data-testid="presencia-agente"'));

describe("la fila del título ya no lleva chips", () => {
    it("ni el del proveedor ni «N agentes» (la lista de demostración que siempre decía 2)", () => {
        expect(CABECERA.length).toBeGreaterThan(100);
        expect(CABECERA).not.toMatch(/data-testid="chip-proveedor"/);
        expect(CABECERA).not.toMatch(/agents\.length\}\s*agentes/);
        expect(CABECERA).not.toMatch(/<Badge/);
        expect(PAGINA).not.toMatch(/chipProveedorAbierto|activeProviderInfo/);
    });

    it("los botones de configurar siguen en su sitio", () => {
        expect(CABECERA).toContain('aria-label="Configurar Neurona"');
        expect(CABECERA).toContain('aria-label="Configurar IA"');
    });
});

describe("el motor y el modelo siguen a la vista, junto al chat", () => {
    it("ChatSurface pinta «proveedor · modelo» (o cómo configurarlo) encima del hilo", () => {
        const i = SUPERFICIE.indexOf('data-testid="chip-motor-chat"');
        expect(i).toBeGreaterThan(0);
        const chip = SUPERFICIE.slice(i, i + 1600);
        expect(chip).toContain("{activeProviderConfig.label} · {activeProviderConfig.defaultModel}");
        expect(SUPERFICIE.slice(i, i + 3000)).toContain("Configura un proveedor de IA →");
        // Está en la fila de botones del chat, antes del hilo (ScrollArea).
        expect(i).toBeLessThan(SUPERFICIE.indexOf("<ScrollArea className=\"flex-1 p-2.5 sm:p-4\""));
    });

    it("la pestaña Chat de /agent monta ese ChatSurface", () => {
        expect(PAGINA).toMatch(/<TabsContent value="chat" className=\{TAB_FILL_CHAT\}>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<ChatSurface \/>/);
    });
});

describe("la tira de presencia: siempre, con su sitio reservado", () => {
    it("se pinta en todas las secciones y tamaños, sin `empty:hidden` ni `max-lg:hidden`", () => {
        expect(PAGINA).toMatch(/<div data-testid="presencia-agente" className="shrink-0 min-h-9 sm:min-h-8 w-full max-w-full">\s*<Astraura158PresenceBar \/>\s*<\/div>/);
        const envoltorio = PAGINA.slice(PAGINA.indexOf('data-testid="presencia-agente"'), PAGINA.indexOf("<Astraura158PresenceBar />"));
        expect(envoltorio).not.toMatch(/hidden|esSeccionChat/);
    });

    it("la tira mide lo mismo que su sitio (36 px en móvil, 32 px desde sm) y no se parte en dos líneas", () => {
        expect(TIRA).toMatch(/className="flex h-9 sm:h-8 w-full max-w-full items-center gap-2 overflow-hidden/);
        expect(TIRA).toMatch(/whitespace-nowrap/);
        // Siempre pinta algo: no hay `return null` en la tira (solo en el punto de la orbe).
        const tira = TIRA.slice(TIRA.indexOf("export function Astraura158PresenceBar"), TIRA.indexOf("export function Astraura158PresenceDot"));
        expect(tira).not.toMatch(/return null/);
    });

    it("no queda otra forma de contar: nada del backend 1.58 ni heurísticas propias", () => {
        expect(TIRA).not.toMatch(/fetchAstraura158Processes|fetchAstraura158Swarm|total_active_agents|sumPendingLike|deriveCounts/);
        expect(TIRA).toContain('"/api/mando/medidores?clave=en-curso"');
        expect(TIRA).toContain('"/api/mando/medidores?clave=agentes"');
        expect(TIRA).toContain('"/api/mando/aprobaciones"');
        expect(TIRA).toContain('from "@/lib/mando/presencia-real"');
    });
});
