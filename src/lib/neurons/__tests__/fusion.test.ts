/** Fusión de neuronas: reetiquetado de ajustes, ficha fundida y medios (2026-10-09). */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/sync/realtime-sync", () => ({ sendAccountBroadcast: async () => undefined }));

import { fichaFundida, fundirPrincipalGana, mediosDeFila, reetiquetarId } from "../fusion";
import { combinarCapacidades } from "../neurons";
import { destinoDeAlias } from "../fusion-alias";
import { fusionarMedios, clasificarMedio, navegadorDe } from "../medio";

describe("reetiquetarId", () => {
  it("mueve las entradas del id viejo al nuevo; si el nuevo ya tenía algo, gana el nuevo y el viejo rellena", () => {
    const V = "51d9da9e-3fd6-4fc9-a95e-39096cdda8e1";
    const N = "62d50afc-6354-414c-9835-028f525b9d4a";
    const prefs = {
      names: { [V]: "Mac Chrome", [N]: "Neurona macOS" },
      permissions: { [V]: { agent: false, senses: false }, [N]: { agent: true } },
      settings: { [V]: { role: "servidor", notes: "la del escritorio" } },
    };
    const r = reetiquetarId(prefs, V, N);
    expect(r.cambiado).toBe(true);
    expect(r.valor).toEqual({
      names: { [N]: "Neurona macOS" },
      permissions: { [N]: { agent: true, senses: false } },
      settings: { [N]: { role: "servidor", notes: "la del escritorio" } },
    });
    expect(r.movidas.map((m) => m.ruta[0])).toEqual(["names", "permissions", "settings"]);
  });
  it("cambia también referencias en textos y claves compuestas, sin repetidos en listas", () => {
    const v = { "configurar-neurona:viejo": "hecho", destino: "viejo", ids: ["viejo", "nuevo", "otro"] };
    expect(reetiquetarId(v, "viejo", "nuevo").valor).toEqual({ "configurar-neurona:nuevo": "hecho", destino: "nuevo", ids: ["nuevo", "otro"] });
  });
  it("no toca nada si el id no aparece", () => {
    const v = { a: 1, b: ["x"] };
    const r = reetiquetarId(v, "viejo", "nuevo");
    expect(r.cambiado).toBe(false);
    expect(r.valor).toBe(v);
  });
});

describe("fundirPrincipalGana", () => {
  it("gana el principal en profundidad y el secundario rellena", () => {
    expect(fundirPrincipalGana({ a: 1, b: { c: 2 } }, { a: 9, b: { c: 9, d: 3 }, e: 4 })).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
  });
});

describe("ficha fundida y medios", () => {
  const ahora = Date.parse("2026-10-09T23:00:00Z");
  it("una fila vieja sin medios aporta su navegador como medio", () => {
    expect(mediosDeFila({ id: "x", capabilities: { platform: "macOS", browser: "Chrome 152" }, last_seen_at: "2026-09-28T13:03:04Z" })).toEqual({
      "fila-x": { tipo: "navegador", etiqueta: "Chrome 152", navegador: "Chrome 152", visto: "2026-09-28T13:03:04Z" },
    });
    expect(mediosDeFila({ id: "n", capabilities: { platform: "macOS", browser: "" }, last_seen_at: "2026-10-09T22:31:06Z" })["fila-n"].tipo).toBe("app-nativa");
  });
  it("la principal conserva sus rasgos; las absorbidas rellenan huecos y suman sus medios", () => {
    const f = fichaFundida(
      { id: "p", capabilities: { platform: "macOS", browser: "Chrome 154", cores: 8, memoryGb: 8 }, last_seen_at: "2026-10-09T22:22:20Z" },
      [{ id: "n", capabilities: { platform: "macOS", browser: "", cores: 8, gpuRenderer: "Apple GPU", maquina: "abc" }, last_seen_at: "2026-10-09T22:31:06Z" }],
      ahora,
    );
    expect(f.browser).toBe("Chrome 154");
    expect(f.memoryGb).toBe(8);
    expect(f.maquina).toBe("abc");
    expect(Object.keys(f.medios ?? {}).sort()).toEqual(["fila-n", "fila-p"]);
  });
  it("combinarCapacidades: lo vacío del medio no pisa lo que otro medio vio", () => {
    const r = combinarCapacidades({ platform: "macOS", memoryGb: 8, browser: "Chrome 154" }, { platform: "macOS", browser: "", memoryGb: undefined });
    expect(r.memoryGb).toBe(8);
    expect(r.browser).toBe("Chrome 154");
  });
  it("fusionarMedios: unión por id, el más reciente gana, olvida los de más de 60 días", () => {
    const m = fusionarMedios(
      { a: { tipo: "navegador", etiqueta: "A", visto: "2026-10-01T00:00:00Z" }, viejo: { tipo: "navegador", etiqueta: "V", visto: "2026-07-01T00:00:00Z" } },
      { a: { tipo: "navegador", etiqueta: "A2", visto: "2026-10-09T00:00:00Z" }, b: { tipo: "app-nativa", etiqueta: "B", visto: "2026-10-08T00:00:00Z" } },
      ahora,
    );
    expect(Object.keys(m)).toEqual(["a", "b"]);
    expect(m.a.etiqueta).toBe("A2");
  });
});

describe("alias de fusión", () => {
  it("sigue la cadena A→B→C y no se cuelga con ciclos", () => {
    expect(destinoDeAlias("A", { A: { a: "B", ts: 1 }, B: { a: "C", ts: 2 } })).toBe("C");
    expect(destinoDeAlias("A", { A: { a: "B", ts: 1 }, B: { a: "A", ts: 2 } })).toBe("B");
    expect(destinoDeAlias("Z", {})).toBe("Z");
  });
});

describe("medio", () => {
  it("clasifica cada forma de abrir el OS", () => {
    const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
    expect(clasificarMedio({ ua: chrome, host: "localhost:9002", tauri: false, standalone: false })).toMatchObject({ tipo: "local", etiqueta: "Chrome 154 · localhost:9002" });
    expect(clasificarMedio({ ua: chrome, host: "starseed-os.vercel.app", tauri: false, standalone: true })).toMatchObject({ tipo: "app-instalada" });
    expect(clasificarMedio({ ua: "x AppleWebKit/605", host: "starseed-os.vercel.app", tauri: true, standalone: false })).toMatchObject({ tipo: "app-nativa" });
    expect(navegadorDe("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0 Mobile/15E148 Safari/604.1")).toBe("Chrome 154");
    expect(navegadorDe("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1")).toBe("Safari 18");
  });
});
