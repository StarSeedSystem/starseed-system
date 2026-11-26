import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { cambioAutomatico, reencolar, type TareaAnalizar } from "../reintento-inteligente";
import { CAPACIDADES, IDS_CAPACIDADES } from "../../integrations/agent-reach-comandos";

// CAP1119 · la tarea CAP-skill-agent-reach-uso se cerró «rechazada» tres veces.
// Estas pruebas atan una reparación a cada objeción literal: el README declarado
// se versiona (dejó de estar ignorado), su ejemplo es público y de solo lectura,
// y una tarea rechazada no se repite: se repara con una sucesora distinta.
const RAIZ = path.resolve(__dirname, "../../../..");
const RUTA_README = ".agent/skills/agent-reach/README.md";
const leer = (relativa: string): string => readFileSync(path.join(RAIZ, relativa), "utf8");

const OBJECION_NUBE =
  "reabierta por el director: devuelta de la nube: su run terminó · la nube dijo «rechazada»";
const OBJECION_CERRADA = "otra ola ya la cerró (rechazada según progreso.json) → no la repito";

const TAREA: TareaAnalizar = {
  id: "CAP-skill-agent-reach-uso",
  ola: "CAP1119",
  archivos: [RUTA_README],
  estado: "rechazada",
  nota: OBJECION_CERRADA,
  modelo: "nvidia/nemotron-3-ultra",
  revisor: "bloqueante",
};

/** Lee el bloque ```json de entradas de ejemplo del README. */
function ejemplos(): Record<string, Record<string, unknown>> {
  const bloque = leer(RUTA_README).match(/```json\s*([\s\S]*?)```/);
  if (!bloque) throw new Error("El README no trae el bloque json de ejemplos.");
  const datos: unknown = JSON.parse(bloque[1]);
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new Error("El bloque de ejemplos no es un objeto JSON.");
  }
  return datos as Record<string, Record<string, unknown>>;
}

describe("CAP1119 · reparación de las tres objeciones de CAP-skill-agent-reach-uso", () => {
  it("objeción 1 (2026-11-23 02:26:39): el README declarado se versiona y la corrección es literal", () => {
    const ignore = leer(".gitignore").split("\n").map((linea) => linea.trim());
    for (const patron of [
      "!.agent/",
      ".agent/*",
      "!.agent/skills/",
      ".agent/skills/*",
      "!.agent/skills/agent-reach/",
    ]) {
      expect(ignore, `falta ${patron} en .gitignore`).toContain(patron);
    }

    expect(existsSync(path.join(RAIZ, RUTA_README))).toBe(true);
    const readme = leer(RUTA_README);
    expect(readme).toContain("2026-11-23 02:26:39");
    expect(readme).toContain(OBJECION_NUBE);

    const cambio = cambioAutomatico(
      { ...TAREA, nota: OBJECION_NUBE },
      { eventos: `2026-11-23 02:26:39 CAP-skill-agent-reach-uso rechazada · ${OBJECION_NUBE}` },
    );
    expect(cambio).toContain("Corrige cada punto de esta objeción literal y añade una prueba para cada uno");
    expect(cambio).toContain(OBJECION_NUBE);
  });

  it("objeción 2 (2026-11-23 16:21:16): la nota idéntica queda documentada y el ejemplo es público y de solo lectura", () => {
    const readme = leer(RUTA_README);
    expect(readme).toContain("2026-11-23 16:21:16");
    expect(readme).toContain(OBJECION_NUBE);
    expect(readme).toContain("NEED_LOGIN_BLOQUEADO");

    for (const [capacidad, cuerpo] of Object.entries(ejemplos())) {
      expect(IDS_CAPACIDADES, `${capacidad} no es una capacidad real`).toContain(capacidad);
      expect(
        CAPACIDADES[capacidad as keyof typeof CAPACIDADES]?.conSesion,
        `${capacidad} pide sesión`,
      ).toBeFalsy();
      expect(Object.keys(cuerpo).length, `${capacidad} no trae entrada`).toBeGreaterThan(0);
    }
  });

  it("objeción 3 (2026-11-24 23:21:02): una rechazada no se repite, se repara con una sucesora distinta", () => {
    const readme = leer(RUTA_README);
    expect(readme).toContain("2026-11-24 23:21:02");
    expect(readme).toContain(OBJECION_CERRADA);
    expect(readme).toContain("progreso.json");
    expect(readme).toContain("no la repito");

    const cambio = cambioAutomatico(TAREA, {
      eventos: `2026-11-24 23:21:02 CAP-skill-agent-reach-uso rechazada · ${OBJECION_CERRADA}`,
    });
    const progreso = { [TAREA.id]: { estado: "rechazada" } };
    const sucesora = reencolar(TAREA, cambio, progreso, ["codex/gpt-5.6-sol"]);

    expect(sucesora.id).toBe("CAP-skill-agent-reach-usob");
    expect(sucesora.id).not.toBe(TAREA.id);
    expect(sucesora.prompt).toContain(OBJECION_CERRADA);
    expect(sucesora.prompt).toContain("Corrige cada punto");
    expect(sucesora.modelo).not.toBe(TAREA.modelo);
    expect(sucesora).not.toHaveProperty("revisor");
  });
});
