/**
 * El panel (TypeScript) y el script del agente (Python) aplican las MISMAS reglas sobre el MISMO directorio:
 * qué sitios admiten redacción y en cuáles podría enviar el agente tras la aprobación. Si se separan, el panel
 * enseñaría una cosa y el agente haría otra. Esta prueba ejecuta scripts/sociales/metageminis.py y compara.
 * (Se salta, diciéndolo, si en esta máquina no hay python3.)
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { DIRECTORIO } from "../directorio";
import { puedeEnviarElAgente, puedeRedactar } from "../consulta";

const CARPETA = path.join(__dirname, "..", "..", "..", "..", "scripts", "sociales");
const PY = spawnSync("python3", ["--version"], { encoding: "utf8" });
const hayPython = PY.status === 0;

const GUION = `
import json, sys
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
import metageminis as mg
sitios = mg.cargar_directorio()
print(json.dumps({s["id"]: [mg.puede_redactar(s), mg.puede_enviar_el_agente(s)] for s in sitios}))
`;

describe.skipIf(!hayPython)("paridad con scripts/sociales/metageminis.py", () => {
  const r = hayPython ? spawnSync("python3", ["-B", "-c", GUION, CARPETA], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } }) : null;

  it("el script de Python carga el directorio sin fallar", () => {
    expect(r?.status, r?.stderr).toBe(0);
  });

  it("lee exactamente los mismos sitios que el panel", () => {
    const py = JSON.parse(r!.stdout) as Record<string, [boolean, boolean]>;
    expect(Object.keys(py).sort()).toEqual(DIRECTORIO.map((s) => s.id).sort());
  });

  it("coincide en qué sitios admiten redacción y en cuáles puede enviar el agente", () => {
    const py = JSON.parse(r!.stdout) as Record<string, [boolean, boolean]>;
    const distintos = DIRECTORIO.filter((s) => py[s.id][0] !== puedeRedactar(s) || py[s.id][1] !== puedeEnviarElAgente(s)).map((s) => s.id);
    expect(distintos, `reglas distintas entre consulta.ts y metageminis.py en: ${distintos.join(", ")}`).toEqual([]);
  });
});
