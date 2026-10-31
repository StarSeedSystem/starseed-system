// ════════════════════════════════════════════════════════════════════════════
// Protomolécula · fichas de avatares 3D verificadas (AV1011H, parte 2)
// ----------------------------------------------------------------------------
// Prueba que las fichas de `architecture/astraura-avatares-3d.md` (§1 y §4)
// están en el catálogo, sin duplicar a las que ya existían, con su licencia y
// sus avisos de región, y que la cadena del taller (generar → remallar →
// riggear → detallar → animar) tiene su ficha. Solo funciones puras del
// catálogo: entrada → salida.
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  herramientaPorId,
  type HerramientaProto,
} from "../catalogo-herramientas";

const todas = CATALOGO_PROTOMOLECULA;
const ficha = (id: string): HerramientaProto => {
  const h = herramientaPorId(id);
  if (!h) throw new Error(`falta la ficha ${id} en el catálogo`);
  return h as HerramientaProto;
};

describe("avatares 3D · fichas verificadas contra el contrato (astraura-avatares-3d.md §1)", () => {
  it("las quince fichas existen una sola vez, sin pisar a las que ya había y con fecha de verificación ISO", () => {
    const ids = [
      "unimate", "image-to-3dlab", "unirig", "instant-meshes", "smart-remesh",
      "three-vrm", "characterstudio", "filigree3d", "btc3d", "meshy", "tripo",
      "3daistudio", "hi3d", "hitem3d", "meta-horizon",
    ] as const;
    for (const id of ids) expect(todas.filter((h) => h.id === id), id).toHaveLength(1);
    for (const id of ids) expect(ficha(id).verificado, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No se duplican las herramientas de imagen → 3D que ya estaban.
    const previas = ["trellis", "triposr", "hunyuan3d", "pixal3d"];
    for (const previa of previas) expect(todas.filter((h) => h.id === previa), previa).toHaveLength(1);
    expect((ids as readonly string[]).some((id) => previas.includes(id))).toBe(false);
    // Las correcciones del vigía del §1 se marcan en su día real.
    expect(ficha("unimate").verificado).toBe("2026-10-20");
    expect(ficha("filigree3d").verificado).toBe("2026-10-20");
    expect(ficha("btc3d").verificado).toBe("2026-10-20");
  });

  it("la cadena del taller del §4 tiene su ficha por etapa y ninguna etapa pesada promete correr en la A1", () => {
    // generar: taller local en Mac Apple Silicon (fase F: servicio «taller-3d»).
    const generar = ficha("image-to-3dlab");
    expect(generar.estado).toBe("integrable");
    expect(generar.integracion).toBe("servicio-local");
    expect(generar.medios.macos).toBe(true);
    expect(generar.descripcion).toMatch(/32 GB/);
    // remallar: Instant Meshes es el remallador por defecto y gratuito (frente a Smart Remesh, de pago).
    expect(ficha("instant-meshes").estado).toBe("integrable");
    expect(ficha("instant-meshes").descripcion).toMatch(/por defecto/);
    expect(ficha("instant-meshes").licencia).toBe("BSD-3-Clause");
    // riggear: UniRig necesita una neurona con NVIDIA; Mac de 8 GB y A1 quedan fuera.
    expect(ficha("unirig").estado).toBe("integrable");
    expect((ficha("unirig").avisos ?? []).join(" ")).toMatch(/NVIDIA/);
    // detallar y animar: solo artículo / pesos no comerciales → vigía, no promesa de integra.
    expect(ficha("btc3d").estado).toBe("proximamente");
    expect(ficha("btc3d").control.notas).toMatch(/No hay implementación publicada/);
    expect(ficha("unimate").estado).toBe("proximamente");
    // Mostrar y mover VRM en el navegador queda cubierto por three-vrm (librería enlazable).
    expect(ficha("three-vrm")).toMatchObject({ estado: "integrable", integracion: "libreria-js", tipo: "libreria" });
    // El remallado de pago es decisión de Alex y mientras tanto va a solo-enlace.
    expect(ficha("smart-remesh")).toMatchObject({ estado: "solo-enlace", licencia: "GPL-3.0" });
    expect(ficha("smart-remesh").descripcion).toMatch(/17 USD/);
    expect(ficha("smart-remesh").descripcion).toMatch(/Blender 4\.2/);
  });

  it("unimate anima pero no crea avatares, con pesos CC BY-NC y Linzhan/UniMate en el aviso", () => {
    const h = ficha("unimate");
    expect(h.tipo).toBe("modelo");
    expect(h.licencia).toBe("MIT");
    expect(h.licenciaPesos).toContain("CC BY-NC 4.0");
    expect(h.codigo).toBe("https://github.com/Friedrich-M/UniMate");
    expect(h.descripcion).toMatch(/cualquier esqueleto/);
    expect(h.descripcion).toMatch(/No crea ni edita avatares/);
    expect((h.avisos ?? []).join(" ")).toContain("Linzhan/UniMate");
    expect((h.avisos ?? []).join(" ")).toMatch(/NO comerciales?/i);
    expect(h.motivo).toMatch(/VGUNIA/);
    expect(h.motivo).toMatch(/no se activa por defecto/);
    // Lo que el vigía no pudo leer queda confesado en sinComprobar, no inventado.
    expect((h.sinComprobar ?? []).join(" ")).toMatch(/VRAM/);
  });

  it("image-to-3dlab declara sus tres motores y hereda el aviso de región que hunyuan3d ya trae", () => {
    const h = ficha("image-to-3dlab");
    expect(h.descripcion).toMatch(/Hunyuan3D-MLX/);
    expect(h.descripcion).toMatch(/TRELLIS\.2/);
    expect(h.descripcion).toMatch(/Stable Fast 3D/);
    expect(h.formatos.salida.join(" ")).toMatch(/procedencia|provenance/i);
    // El aviso de región de Tencent (UE, Reino Unido y Corea del Sur) viaja en la ficha del taller.
    expect((h.avisos ?? []).join(" ")).toMatch(/UE|Unión Europea/);
    expect((h.avisos ?? []).join(" ")).toMatch(/Corea del Sur/);
    // Y hunyuan3d, la ficha del motor directo, trae el mismo aviso de región (excluye la UE).
    const hunyuan = ficha("hunyuan3d");
    expect(hunyuan.descripcion).toMatch(/Unión Europea/);
    expect(hunyuan.descripcion).toMatch(/Reino Unido/);
    expect(hunyuan.descripcion).toMatch(/Corea del Sur/);
    expect(hunyuan.estado).toBe("solo-enlace");
    expect(hunyuan.motivo).toMatch(/excluye/i);
  });
});
