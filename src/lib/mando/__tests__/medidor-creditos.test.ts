import { describe, it, expect } from "vitest";
import { detalleDeMedidor, configuracionPorDefecto, medidoresVisibles } from "@/lib/mando/medidores";
import type { DocCreditos } from "../creditos-pago";

describe("medidor-creditos", () => {
    it("detalle con ejemplo §3: 2 filas (claude ok, codex peligro)", () => {
        const doc: DocCreditos = {
            version: 1,
            t: "2026-10-06T18:05:00-06:00",
            medidores: {
                claude: {
                    id: "claude",
                    proveedor: "anthropic",
                    nombre: "Claude · plan",
                    tipo: "plan",
                    plan: "suscripción",
                    ventanas: [
                        { id: "sesion", etiqueta: "Sesión (5 h)", usado_pct: 23, reinicia: "2026-10-06T18:10:00-06:00" },
                        { id: "semana", etiqueta: "Semana (todos los modelos)", usado_pct: 41, reinicia: "2026-10-10T04:00:00-06:00" },
                    ],
                    saldo: null,
                    extras: {},
                    fuente: "terminal: claude -p /usage",
                    leido: "2026-10-06T18:05:00-06:00",
                    ok: true,
                    enlace: "https://claude.ai/settings/usage",
                },
                codex: {
                    id: "codex",
                    proveedor: "openai",
                    nombre: "ChatGPT · Codex",
                    tipo: "plan",
                    plan: "plus",
                    ventanas: [
                        { id: "5h", etiqueta: "5 horas", usado_pct: 0, reinicia: "2026-10-06T22:58:40-06:00" },
                        { id: "semana", etiqueta: "Semana", usado_pct: 100, reinicia: "2026-10-09T22:12:51-06:00" },
                    ],
                    saldo: { valor: 0, unidad: "créditos" },
                    extras: {
                        bloqueado: "rate_limit_reached",
                        uso_normal: false,
                        reinicios_gratis: 1,
                        reinicio_gratis_vence: "2026-10-29T12:10:00-06:00",
                    },
                    fuente: "terminal: codex app-server",
                    leido: "2026-10-06T17:00:00-06:00",
                    ok: true,
                    enlace: "https://chatgpt.com/codex/settings/usage",
                },
            },
        };
        const detalle = detalleDeMedidor("creditos" as import("@/lib/mando/medidores").ClaveMedidor, { creditosPago: doc }, Date.parse("2026-10-06T18:05:00-06:00"));
        expect(detalle.titulo).toBe("Créditos de pago");
        expect(detalle.filas.length).toBe(2);
        expect(detalle.filas[0].id).toBe("claude");
        expect(detalle.filas[0].estado).toBe("ok");
        expect(detalle.filas[1].id).toBe("codex");
        expect(detalle.filas[1].estado).toBe("peligro");
    });

    it("con null da vacio", () => {
        const detalle = detalleDeMedidor("creditos" as import("@/lib/mando/medidores").ClaveMedidor, { creditosPago: null });
        expect(detalle.filas.length).toBe(0);
        expect(detalle.vacio).toBeTruthy();
    });

    it("medidoresVisibles incluye creditos justo detrás de credito-claude", () => {
        const visibles = medidoresVisibles(configuracionPorDefecto());
        const idxClaude = visibles.indexOf("credito-claude" as import("@/lib/mando/medidores").ClaveMedidor);
        const idxCreditos = visibles.indexOf("creditos" as import("@/lib/mando/medidores").ClaveMedidor);
        expect(idxClaude).toBeGreaterThanOrEqual(0);
        expect(idxCreditos).toBe(idxClaude + 1);
    });
});
