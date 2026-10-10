import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leerCatalogo } from "@/lib/astraura/capas/catalogo";
import type { EstadoCapasDisco } from "../tipos";
import { nombreLocal, planDescargaNativa, urlDescarga } from "../capas-nativas";

const catalogo = leerCatalogo(JSON.parse(readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8")));
const GB = 1024 ** 3;
const disco = (presupuesto: number | null, instaladas: EstadoCapasDisco["instaladas"] = []): EstadoCapasDisco => ({
  dir: "/x/capas",
  libre_bytes: presupuesto == null ? null : 100 * GB,
  ocupado_bytes: instaladas.reduce((s, c) => s + c.bytes, 0),
  presupuesto_bytes: presupuesto,
  instaladas,
});

describe("capas en el disco de la app nativa", () => {
  it("sin medir el disco no se planea nada", () => {
    const p = planDescargaNativa(catalogo, disco(null));
    expect(p.ok).toBe(false);
    expect(p.descargar).toEqual([]);
  });

  it("con 8 GB baja reflejo, memoria, palabra, razón y voz: solo con SHA y medio nativo", () => {
    const p = planDescargaNativa(catalogo, disco(8 * GB));
    expect(p.ok).toBe(true);
    expect(p.descargar.map((d) => d.capa)).toEqual(["reflejo", "memoria", "palabra", "razon", "voz"]);
    for (const d of p.descargar) {
      expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(d.url.startsWith("https://huggingface.co/")).toBe(true);
      expect(nombreLocal(d.nombre)).toBe(d.nombre);
    }
    expect(p.bytesNuevos).toBeLessThanOrEqual(8 * GB);
    expect(p.restanteBytes).toBe(8 * GB - p.bytesNuevos);
  });

  it("con poco disco elige lo que cabe y dice por qué salta lo demás", () => {
    const p = planDescargaNativa(catalogo, disco(500 * 1024 ** 2));
    expect(p.descargar[0].id).toBe("needle3-reflejo");
    const saltadas = p.saltadas.map((s) => s.capa);
    expect(saltadas).toContain("razon");
    expect(p.saltadas.find((s) => s.capa === "razon")?.motivo).toMatch(/No cabe: la más ligera necesita \d+ MB/);
  });

  it("lo ya instalado no se vuelve a bajar", () => {
    const p = planDescargaNativa(catalogo, disco(8 * GB, [{ nombre: "needle3.cact", bytes: 35_335_380 }]));
    expect(p.ya).toEqual([{ id: "needle3-reflejo", capa: "reflejo", nombre: "needle3.cact" }]);
    expect(p.descargar.some((d) => d.capa === "reflejo")).toBe(false);
  });

  it("URL directa de Hugging Face y nombres seguros", () => {
    const needle = catalogo.capas.find((c) => c.id === "needle3-reflejo");
    expect(urlDescarga(needle as never)).toBe("https://huggingface.co/Cactus-Compute/needle3/resolve/main/needle3.cact");
    expect(nombreLocal("onnx/model_q2.onnx")).toBe("onnx__model_q2.onnx");
    expect(nombreLocal("../x")).toBeNull();
  });
});
