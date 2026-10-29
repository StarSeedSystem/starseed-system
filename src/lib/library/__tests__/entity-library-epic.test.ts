/**
 * Biblioteca por entidad · guarda de Epic y descargas de Rare (artcraft-y-rare.md §5.3).
 * `scanItemInput` es puro; solo se mockea el cliente de Supabase para poder importar el módulo.
 * Ninguna cadena con forma de clave vive aquí: se monta en tiempo de ejecución.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) }, from: () => ({}) }),
}));

import { scanItemInput } from "@/lib/library/entity-library";

const VALOR = ["Abc123de", "f9Xy8Zq7", "0203"].join("");

describe("scanItemInput · sesión de Epic (artcraft-y-rare.md §5.3)", () => {
  it("un ítem limpio no añade hallazgos de Epic ni de descargas de Rare", () => {
    const hallazgos = scanItemInput({ title: "Notas", note: "plan del lanzador", content: "nada sensible", url: "https://example.com" });
    expect(hallazgos.some((h) => h.type === "sesion_epic")).toBe(false);
    expect(hallazgos.some((h) => h.type === "descarga_rare")).toBe(false);
  });

  it("access_token en el contenido: hallazgo de Epic sin repetir el valor", () => {
    const contenido = ["{\"access_token\":\"", VALOR, "\"}"].join("");
    const hallazgos = scanItemInput({ title: "user.json", content: contenido });
    expect(hallazgos.some((h) => h.type === "sesion_epic")).toBe(true);
    expect(JSON.stringify(hallazgos)).not.toContain(VALOR.slice(0, 10));
  });

  it("una descarga remota de Rare o ProtonDB se marca como bloqueada hasta fijar SHA", () => {
    for (const url of ["https://raredevs.github.io/wring/workarounds.json", "https://protondb.com/api/v1/x"]) {
      const hallazgos = scanItemInput({ title: "Rare", url });
      expect(hallazgos.some((h) => h.type === "descarga_rare")).toBe(true);
    }
  });

  it("las releases de Rare en GitHub no se marcan", () => {
    const hallazgos = scanItemInput({ title: "Rare", url: "https://github.com/RareDevs/Rare/releases/latest" });
    expect(hallazgos.some((h) => h.type === "descarga_rare")).toBe(false);
  });
});
