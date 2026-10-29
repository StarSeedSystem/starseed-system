import { describe, expect, it } from "vitest";
import { CATALOGO_PROTOMOLECULA, herramientaPorId } from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

/** Guardia AV1011H: fichas verificadas el 2026-10-11 para avatares 3D. Pura: solo lee datos exportados. */
const IDS = [
  "unimate", "image-to-3dlab", "unirig", "instant-meshes", "smart-remesh",
  "three-vrm", "characterstudio", "filigree3d", "btc3d", "meshy", "tripo",
  "3daistudio", "hi3d", "hitem3d", "meta-horizon",
] as const;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_AFILIADO = /[?&](aff|via|utm_[a-z]+)=/i;
const ficha = (id: string): HerramientaProto => {
  const h = herramientaPorId(id);
  if (!h) throw new Error(`Falta la ficha ${id}`);
  return h;
};
const nuevas = (): HerramientaProto[] => IDS.map((id) => ficha(id));

describe("AV1011H · fichas de avatares 3D", () => {
  it("cada id existe una sola vez, con fecha, sin duplicar las anteriores", () => {
    for (const id of IDS) {
      expect(CATALOGO_PROTOMOLECULA.filter((h) => h.id === id), id).toHaveLength(1);
      expect(ficha(id).verificado, id).toMatch(RE_FECHA);
      expect(ficha(id).verificado, id).toBe("2026-10-11");
    }
    for (const id of ["trellis", "triposr", "hunyuan3d"]) {
      expect(CATALOGO_PROTOMOLECULA.filter((h) => h.id === id), id).toHaveLength(1);
    }
  });

  it("UniMate es texto a movimiento, con el código MIT y la inferencia pendiente", () => {
    const h = ficha("unimate");
    expect(h).toMatchObject({ estado: "proximamente", licencia: "MIT", codigo: "https://github.com/Friedrich-M/UniMate" });
    expect(h.web).toBe("https://huggingface.co/Linzhan/UniMate");
    expect(h.descripcion).toMatch(/texto en movimiento|texto a movimiento/i);
    expect(`${h.motivo} ${(h.sinComprobar ?? []).join(" ")}`).toMatch(/inferencia/i);
    expect((h.sinComprobar ?? []).join(" ")).toMatch(/pesos/i);
    expect(h.formatos.entrada).toContain("texto");
  });

  it("image-to-3dlab es servicio local de Mac Apple Silicon con GLB y procedencia", () => {
    const h = ficha("image-to-3dlab");
    expect(h).toMatchObject({ estado: "integrable", integracion: "servicio-local" });
    expect(h.medios.macos).toBe(true);
    expect(h.medios.windows || h.medios.linux).toBe(false);
    expect(h.formatos.salida).toContain("glb");
    expect(`${h.descripcion} ${(h.avisos ?? []).join(" ")}`).toMatch(/provenance/i);
    const avisos = (h.avisos ?? []).join(" ");
    for (const motor of ["Hunyuan3D-MLX", "TRELLIS.2", "Stable Fast 3D"]) expect(avisos, motor).toContain(motor);
    expect(avisos).toMatch(/UE.*Reino Unido.*Corea del Sur/i);
  });

  it("UniRig riggea con NVIDIA y acepta OBJ, FBX, GLB y VRM", () => {
    const h = ficha("unirig");
    expect(h).toMatchObject({ estado: "integrable", licencia: "MIT", codigo: "https://github.com/VAST-AI-Research/UniRig" });
    expect(h.formatos.entrada).toEqual(expect.arrayContaining(["obj", "fbx", "glb", "vrm"]));
    expect(h.formatos.salida).toEqual(expect.arrayContaining(["fbx", "glb"]));
    expect(h.motivo).toMatch(/NVIDIA/i);
  });

  it("Instant Meshes es libre (BSD-3) y Smart Remesh queda solo como enlace de pago", () => {
    expect(ficha("instant-meshes")).toMatchObject({ estado: "integrable", licencia: "BSD-3-Clause" });
    expect(ficha("instant-meshes").codigo).toBe("https://github.com/wjakob/instant-meshes");
    const s = ficha("smart-remesh");
    expect(s).toMatchObject({ estado: "solo-enlace", integracion: "solo-enlace", licencia: "GPL-3.0" });
    expect(s.motivo).toMatch(/17 USD/);
    expect(s.descripcion).toMatch(/Blender 4\.2–5\.2/);
    expect((s.avisos ?? []).join(" ")).toMatch(/3DRedbox/i);
  });

  it("three-vrm y CharacterStudio son librerías MIT de pixiv y M3-org", () => {
    for (const id of ["three-vrm", "characterstudio"] as const) {
      expect(ficha(id), id).toMatchObject({ licencia: "MIT", estado: "integrable" });
      expect(ficha(id).codigo, id).toMatch(/^https:\/\/github\.com\//);
    }
    expect(ficha("three-vrm").codigo).toBe("https://github.com/pixiv/three-vrm");
    expect(ficha("characterstudio").codigo).toBe("https://github.com/M3-org/CharacterStudio");
  });

  it("Filigree3D y BTC3D son solo artículo y no prometen código", () => {
    for (const id of ["filigree3d", "btc3d"] as const) {
      const h = ficha(id);
      expect(h.estado, id).toBe("proximamente");
      expect(h.codigo, id).toBeNull();
      expect(h.web, id).toMatch(/^https:\/\/arxiv\.org\/abs\/2609\./);
      expect((h.sinComprobar ?? []).join(" "), id).toMatch(/código de inferencia/i);
    }
  });

  it("los servicios quedan como enlace y Hitem3D avisa del enlace equivocado", () => {
    for (const id of ["meshy", "tripo", "3daistudio", "hi3d", "hitem3d", "meta-horizon"] as const) {
      const h = ficha(id);
      expect(h.estado, id).toBe("solo-enlace");
      expect(h.integracion, id).toBe("solo-enlace");
      expect(h.licencia, id).toBe("NOASSERTION");
    }
    expect(ficha("meshy").motivo).toMatch(/100 créditos\/mes/);
    expect(ficha("meshy").motivo).toMatch(/CC BY 4\.0/);
    expect((ficha("tripo").sinComprobar ?? []).join(" ")).toMatch(/precios/i);
    expect(ficha("hitem3d").web).toBeNull();
    expect((ficha("hitem3d").sinComprobar ?? []).join(" ")).toMatch(/3daistudio/i);
    expect(ficha("meta-horizon").web).toBe("https://developers.meta.com/horizon");
  });

  it("ninguna ficha nueva lleva parámetros de afiliado", () => {
    for (const h of nuevas()) {
      for (const url of [h.codigo, h.web, h.actualizacion.ref]) {
        if (url) expect(url, h.id).not.toMatch(RE_AFILIADO);
      }
    }
  });

  it("Hunyuan3D 2 avisa de que sus pesos no cubren la UE, el Reino Unido ni Corea del Sur", () => {
    const avisos = (ficha("hunyuan3d").avisos ?? []).join(" ");
    for (const region of ["Unión Europea", "Reino Unido", "Corea del Sur"]) expect(avisos).toContain(region);
  });
});
