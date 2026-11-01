/**
 * MVD1027E · la cápsula Memvid como destino de sincronía del cerebro.
 * Solo funciones puras exportadas: la normalización con el destino nuevo, la
 * huella SHA-256 y el plan de archivos nuevos o cambiados. Sin red ni disco.
 */
import { describe, expect, it } from "vitest";
import {
  huellaCapsula,
  normalizeMemoryDestinations,
  planCapsulaCerebro,
  uriCapsula,
} from "@/lib/brains/memory-destinations";

describe("normalizeMemoryDestinations · destino cápsula (MVD1027E)", () => {
  it("sin configuración: cápsula apagada por defecto y lo demás como siempre", () => {
    const destinos = normalizeMemoryDestinations(undefined);
    expect(destinos.capsula.enabled).toBe(false);
    expect(destinos.local).toEqual({ enabled: true });
    expect(destinos.starseed).toEqual({ enabled: true });
    expect(destinos.external).toEqual([]);
    expect(destinos.p2p.enabled).toBe(false);
  });

  it("acepta { capsula: { enabled: true, huellas } } sin romper lo ya guardado", () => {
    const destinos = normalizeMemoryDestinations({
      starseed: { enabled: false },
      external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }],
      p2p: { enabled: true, label: "PC de casa" },
      capsula: { enabled: true, huellas: { "soul.md": "ab01" }, ultimaSincronia: "2026-10-27T00:00:00.000Z" },
    });
    expect(destinos.capsula.enabled).toBe(true);
    expect(destinos.capsula.huellas).toEqual({ "soul.md": "ab01" });
    expect(destinos.capsula.ultimaSincronia).toBe("2026-10-27T00:00:00.000Z");
    expect(destinos.starseed).toEqual({ enabled: false });
    expect(destinos.external).toEqual([{ id: "ext1", url: "https://x.example", label: "Mi servidor" }]);
    expect(destinos.p2p.enabled).toBe(true);
  });

  it("una config guardada SIN cápsula conserva sus datos y la cápsula sale apagada", () => {
    const destinos = normalizeMemoryDestinations({
      external: [{ id: "ext1", url: "https://x.example", label: "Servidor" }],
      p2p: { enabled: false },
    });
    expect(destinos.capsula).toEqual({ enabled: false });
    expect(destinos.external).toEqual([{ id: "ext1", url: "https://x.example", label: "Servidor" }]);
  });

  it("una cápsula con enabled fuera de boolean sale apagada, no rota", () => {
    expect(normalizeMemoryDestinations({ capsula: { enabled: "sí" } }).capsula.enabled).toBe(false);
  });
});

describe("huellaCapsula · SHA-256", () => {
  it("da 64 hex, determinista y distinto para contenido distinto", async () => {
    const a = await huellaCapsula("Memoria del cerebro: plan de la semana");
    const b = await huellaCapsula("Memoria del cerebro: plan de la semana");
    const c = await huellaCapsula("Memoria del cerebro: plan de la SIGUIENTE semana");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });
});

describe("planCapsulaCerebro · solo archivos nuevos o cambiados", () => {
  it("sin huellas guardadas incluye todo, con su uri mv2://cerebro/...", async () => {
    const plan = await planCapsulaCerebro("cerebro-1", [
      { name: "soul.md", content: "Identidad del cerebro" },
      { name: "memoria.md", content: "Recuerda esto" },
    ]);
    expect(plan.enviar.map((p) => p.archivo)).toEqual(["soul.md", "memoria.md"]);
    expect(plan.enviar[0].uri).toBe("mv2://cerebro/cerebro-1/soul.md");
    expect(plan.enviar[0].huella).toMatch(/^[0-9a-f]{64}$/);
  });

  it("deja fuera lo sin cambios (misma huella) y mete el cambiado y el nuevo", async () => {
    const huellaSoul = await huellaCapsula("Identidad del cerebro");
    const huellaVieja = await huellaCapsula("MEMORIA VIEJA");
    const plan = await planCapsulaCerebro(
      "cerebro-1",
      [
        { name: "soul.md", content: "Identidad del cerebro" },
        { name: "memoria.md", content: "Recuerda otra cosa" },
        { name: "sueno.md", content: "Un sueño nuevo" },
        { name: "vacio.md", content: "   " },
      ],
      { "soul.md": huellaSoul, "memoria.md": huellaVieja },
    );
    expect(plan.enviar.map((p) => p.archivo)).toEqual(["memoria.md", "sueno.md"]);
  });

  it("sin archivos o sin contenido no hay nada que enviar", async () => {
    expect((await planCapsulaCerebro("cerebro-1", [])).enviar).toEqual([]);
    expect((await planCapsulaCerebro("cerebro-1", null)).enviar).toEqual([]);
  });
});

describe("uriCapsula", () => {
  it("construye mv2://cerebro/<id>/<archivo>", () => {
    expect(uriCapsula("abc", "memoria.md")).toBe("mv2://cerebro/abc/memoria.md");
  });
});
