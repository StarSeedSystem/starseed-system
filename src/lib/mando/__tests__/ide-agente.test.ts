import { describe, it, expect } from "vitest";
import {
    sanearHref,
    describirIde,
    tonoIde,
    fraseAlternativas,
    enlacesDe,
    sanearIde,
    sanearAlternativas,
    sanearProceso,
    type IdeInfo,
    type AlternativaIde,
    type ProcesoInfo,
} from "../ide-agente";
import { sanearLatido, type TareaLatida } from "../latido-remoto";

describe("ide-agente (pure tests)", () => {
    it("descarta enlaces maliciosos o XSS y conserva esquemas permitidos", () => {
        expect(sanearHref("javascript:alert(1)")).toBe("");
        expect(sanearHref("//evil.com/phish")).toBe("");
        expect(sanearHref("data:text/html,hack")).toBe("");
        expect(sanearHref("/api/mando/agente/1/log")).toBe("/api/mando/agente/1/log");
        expect(sanearHref("codex://threads/xyz")).toBe("codex://threads/xyz");
        expect(sanearHref("https://starseed-os.vercel.app")).toBe("https://starseed-os.vercel.app");
    });

    it("describe y evalua el tono de la ficha de IDE", () => {
        const fullIde: IdeInfo = {
            motor: "opencode", origen: "Mac", entorno: "local", pid: 1234,
            servidor: "maggasukha.local", medioId: "m1", enLinea: true,
            estado: "ocupado", venceEnS: 300, worktree: "/wt/MD1b",
        };
        expect(describirIde({ ide: fullIde })).toBe("opencode · Mac (maggasukha.local)");
        expect(tonoIde({ ide: fullIde })).toBe("verde");
        expect(tonoIde({ ide: { ...fullIde, estado: "colgado" } })).toBe("ambar");
        expect(describirIde({})).toBe("sin IDE registrado");
        expect(tonoIde({})).toBe("gris");
    });

    it("calcula frase de alternativas y genera enlaces seguros", () => {
        const alts: AlternativaIde[] = [
            { id: "a1", motor: "codex", origen: "Mac", libres: 1, otroServidor: false },
            { id: "a2", motor: "opencode", origen: "nube", libres: 2, otroServidor: true },
        ];
        expect(fraseAlternativas({ alternativas: alts })).toBe("2 medios pueden seguirla (1 en otro servidor)");
        expect(fraseAlternativas({ alternativas: [] })).toBe("sin relevo disponible");

        const proc: ProcesoInfo = {
            log: "logs/a1.log", enVivo: "/api/mando/agente/a1/log",
            sesion: "s1", enlaceIde: "codex://threads/a1",
        };
        const links = enlacesDe({ proceso: proc });
        expect(links).toHaveLength(2);
        expect(links[0]).toEqual({ etiqueta: "Log en vivo", href: "/api/mando/agente/a1/log" });
        expect(links[1]).toEqual({ etiqueta: "Abrir en Codex", href: "codex://threads/a1" });

        const malProc: ProcesoInfo = { log: "", enVivo: "javascript:alert(1)", sesion: "", enlaceIde: "//evil" };
        expect(enlacesDe({ proceso: malProc })).toHaveLength(0);
    });

    it("sanea latido remoto con ficha de IDE completa y limpia campos", () => {
        const rawLatido = {
            maquina: "mac-alex", cola: "ola344", ola: "344", at: Date.now(),
            orquestadorVivo: true, trabajadores: 1, cuentas: { integradas: 1 },
            enCurso: [{
                id: "MD1b", fase: "escritura", modelo: "gpt-4o", minutos: 5,
                ide: { motor: "opencode", origen: "mac", enLinea: true, estado: "ocupado" },
                alternativas: [{ id: "alt1", motor: "codex", otroServidor: true }],
                proceso: { enVivo: "/api/log", enlaceIde: "javascript:alert(1)" },
            }],
        };
        const saneado = sanearLatido(rawLatido);
        expect(saneado).not.toBeNull();
        const t = saneado!.enCurso[0];
        expect(t.ide?.motor).toBe("opencode");
        expect(t.alternativas).toHaveLength(1);
        expect(t.proceso?.enVivo).toBe("/api/log");
        expect(t.proceso?.enlaceIde).toBe("");
    });
});
