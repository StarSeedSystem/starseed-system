import { describe, expect, it } from "vitest";

import { agentesDeClaudeNube, instanteDe, tareaEnClaudeNube, TEXTO_CLAUDE_NUBE } from "../agentes-claude-nube";
import { detalleDeMedidor } from "../medidores";

const AHORA = Date.parse("2026-10-22T12:00:00Z");
const viva = { estado: "reasignada", medio: "claude-nube" };
const sesion = (extra: Record<string, unknown> = {}) => ({
    tarea: "XR1",
    sesion: "session_01",
    url: "https://claude.ai/code/session_01",
    rama_pedida: "nube/cc-20261022/ola/XR1",
    modelo: "claude-opus",
    coste_usd: 3,
    t: "2026-10-22T11:35:00Z",
    ...extra,
});

describe("agentesDeClaudeNube", () => {
    it("una sesión viva es UN agente escribiendo, con su URL y su medio", () => {
        const a = agentesDeClaudeNube({ sesiones: [sesion()] }, { XR1: viva }, AHORA);
        expect(a).toHaveLength(1);
        expect(a[0]).toMatchObject({
            tarea: "XR1",
            fase: "escribiendo",
            donde: "claude-nube",
            url: "https://claude.ai/code/session_01",
        });
    });

    it("una sesión ya traída a main no cuenta (progreso cerrado o registro terminado)", () => {
        expect(agentesDeClaudeNube({ sesiones: [sesion()] }, { XR1: { estado: "integrada", medio: "claude-nube" } }, AHORA)).toEqual([]);
        expect(agentesDeClaudeNube({ sesiones: [sesion({ estado: "traida" })] }, { XR1: viva }, AHORA)).toEqual([]);
        // El lanzador la cierra con `final` (traída o devuelta) aunque el progreso siga prestado.
        expect(agentesDeClaudeNube({ sesiones: [sesion({ final: "traida" })] }, { XR1: viva }, AHORA)).toEqual([]);
        expect(agentesDeClaudeNube({ sesiones: [sesion({ final: "devuelta" })] }, { XR1: viva }, AHORA)).toEqual([]);
        // Reasignada, pero a otro medio: no es de Claude.
        expect(agentesDeClaudeNube({ sesiones: [sesion()] }, { XR1: { estado: "reasignada", medio: "oracle" } }, AHORA)).toEqual([]);
    });

    it("sin registro, o con un registro ilegible, no hay agentes fantasma", () => {
        expect(agentesDeClaudeNube(null, { XR1: viva }, AHORA)).toEqual([]);
        expect(agentesDeClaudeNube({}, { XR1: viva }, AHORA)).toEqual([]);
        expect(agentesDeClaudeNube({ sesiones: "x" }, { XR1: viva }, AHORA)).toEqual([]);
        expect(agentesDeClaudeNube({ sesiones: [null, 3, { tarea: "" }] }, { XR1: viva }, AHORA)).toEqual([]);
    });

    it("los minutos salen de t (ISO, segundos o ms de época)", () => {
        expect(agentesDeClaudeNube({ sesiones: [sesion()] }, { XR1: viva }, AHORA)[0].minutos).toBe(25);
        expect(agentesDeClaudeNube({ sesiones: [sesion({ t: (AHORA - 10 * 60_000) / 1000 })] }, { XR1: viva }, AHORA)[0].minutos).toBe(10);
        expect(agentesDeClaudeNube({ sesiones: [sesion({ t: AHORA - 3 * 60_000 })] }, { XR1: viva }, AHORA)[0].minutos).toBe(3);
        expect(agentesDeClaudeNube({ sesiones: [sesion({ t: "nunca" })] }, { XR1: viva }, AHORA)[0].minutos).toBe(0);
    });

    it("el modelo es el de la sesión, y «claude» si no lo anotó", () => {
        expect(agentesDeClaudeNube({ sesiones: [sesion()] }, { XR1: viva }, AHORA)[0].modelo).toBe("claude-opus");
        expect(agentesDeClaudeNube({ sesiones: [sesion({ modelo: "" })] }, { XR1: viva }, AHORA)[0].modelo).toBe("claude");
    });

    it("dos sesiones de la misma tarea (un relanzamiento) son un solo agente: la más reciente", () => {
        const a = agentesDeClaudeNube(
            { sesiones: [sesion({ sesion: "vieja", t: "2026-10-22T09:00:00Z" }), sesion({ sesion: "nueva" })] },
            { XR1: viva },
            AHORA,
        );
        expect(a).toHaveLength(1);
        expect(a[0].sesion).toBe("nueva");
    });
});

describe("en el medidor «Agentes»", () => {
    it("una fila por sesión viva, escribiendo, con el texto del crédito y la URL", () => {
        const latidos = agentesDeClaudeNube({ sesiones: [sesion()] }, { XR1: viva }, AHORA);
        const d = detalleDeMedidor("agentes", { latidos, escritores: {} });
        expect(d.filas).toHaveLength(1);
        expect(d.filas[0].estado).toBe("escribiendo");
        expect(d.filas[0].porque).toContain(TEXTO_CLAUDE_NUBE);
        expect(d.filas[0].porque).toContain("https://claude.ai/code/session_01");
        expect(d.filas[0].quien).toContain("Claude en la nube");
        expect(d.filas[0].desde).toBe("25 min");
        expect(JSON.stringify(d.filas)).not.toContain("undefined");
    });
});

describe("piezas", () => {
    it("tareaEnClaudeNube exige reasignada Y medio claude-nube", () => {
        expect(tareaEnClaudeNube(viva)).toBe(true);
        expect(tareaEnClaudeNube(undefined)).toBe(false);
        expect(tareaEnClaudeNube({ estado: "reasignada" })).toBe(false);
    });

    it("instanteDe no inventa una fecha", () => {
        expect(Number.isNaN(instanteDe(undefined))).toBe(true);
        expect(instanteDe(1_700_000_000)).toBe(1_700_000_000_000);
    });
});
