/**
 * Rescate RTART1025Ld (rama nube/40908516823), adaptado a la API de hoy:
 * `scanItemInput` escanea los campos de texto de un ítem con los patrones
 * generales del escáner de seguridad (no hay tipos `sesion_epic` ni
 * `descarga_rare` propios de Epic/Rare — la guarda de Epic vive en
 * `validarSinCredencialesEpic` y la de descargas en `esUrlPermitidaRare`,
 * ambas de `src/lib/artcraft/juegos-pc.ts`, ya probadas allí). Aquí se fija
 * el contrato que SÍ mantiene hoy: ítem limpio sin hallazgos y ningún
 * secreto con su valor completo en los hallazgos.
 */
import { describe, expect, it } from "vitest";
import { scanItemInput } from "../entity-library";

const VALOR = ["Abc123de", "f9Xy8Zq7", "0203"].join("");

describe("scanItemInput · los campos de un ítem se escanean al guardar/compartir", () => {
  it("un ítem limpio no añade hallazgos", () => {
    expect(scanItemInput({ title: "Notas", note: "plan del lanzador", content: "nada sensible", url: "https://example.com" })).toEqual([]);
  });

  it("un secreto en el contenido: hallazgo crítico, enmascarado, con ruta del campo", () => {
    const hallazgos = scanItemInput({ title: "user.json", content: ["clave: sk-ant-", VALOR].join("") });
    expect(hallazgos.some((h) => h.type === "clave_api_anthropic")).toBe(true);
    expect(hallazgos.some((h) => h.severity === "critical" && h.path === "content")).toBe(true);
    expect(JSON.stringify(hallazgos)).not.toContain(VALOR.slice(0, 10));
  });
});
