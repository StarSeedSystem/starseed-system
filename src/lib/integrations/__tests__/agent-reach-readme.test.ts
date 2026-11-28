import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * CAP-skill-agent-reach-usob · la objeción que reabrió la tarea decía que el run
 * terminaba sin dejar la documentación («rechazada») y que otra ola la cerraba
 * sin repetirla. Estas pruebas leen el README del disco y demuestran que el
 * entregable existe, que se puede usar y que respeta las reglas de la casa.
 */
const RAIZ = path.resolve(__dirname, "../../../..");
const RUTA = path.join(RAIZ, ".agent", "skills", "agent-reach", "README.md");
const leer = (): string => readFileSync(RUTA, "utf8");

describe("CAP-skill-agent-reach-usob · reparación 1 y 2 (run terminó · nube «rechazada»)", () => {
    it("el README existe y no es un esqueleto vacío", () => {
        expect(existsSync(RUTA)).toBe(true);
        expect(leer().trim().length).toBeGreaterThan(1200);
    });

    it("trae un ejemplo de uso ejecutable con el CLI, no solo la descripción", () => {
        const texto = leer();
        expect(texto).toContain("agent-reach channels");
        expect(texto).toContain("agent-reach web search");
        expect(texto).toContain("agent-reach read ");
        expect(texto).toContain("agent-reach github read");
        expect(texto).toContain("agent-reach youtube subtitle");
    });

    it("documenta la instalación correcta y no manda a pip ni a npx", () => {
        const texto = leer();
        expect(texto).toContain(
            "uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip",
        );
        expect(texto).not.toContain("pip install agent-reach");
        expect(texto).not.toContain("npx agent-reach");
    });
});

describe("CAP-skill-agent-reach-usob · reparación 3 («otra ola la cerró → no la repito»)", () => {
    it("la copia está en esta ola y enlaza a los archivos reales de la skill", () => {
        const texto = leer();
        expect(texto).toContain("SKILL.md");
        expect(texto).toContain("references/capabilities.md");
        expect(texto).toContain("references/sessions.md");
        expect(texto).toContain("references/maintenance.md");
    });

    it("deja las reglas de la casa: solo lectura, canales públicos y cero secretos", () => {
        const texto = leer();
        expect(texto.toLowerCase()).toContain("solo lectura");
        expect(texto).toContain("NEED_LOGIN_BLOQUEADO");
        expect(texto).toContain("/api/agent-reach/");
        expect(texto).toContain("JSON");
        expect(texto).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=/);
        expect(texto).not.toContain("/Users/");
    });
});
