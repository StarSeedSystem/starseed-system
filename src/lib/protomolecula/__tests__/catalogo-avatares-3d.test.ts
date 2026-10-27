import { describe, expect, it } from "vitest";
import { CATALOGO_PROTOMOLECULA, aPaqueteBiblioteca, herramientaPorId } from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

/** Fichas de avatares 3D que pide AV1011H (datos verificados el 2026-10-11). */
const NUEVAS = [
  "unimate", "image-to-3dlab", "unirig", "instant-meshes", "smart-remesh",
  "three-vrm", "characterstudio", "filigree3d", "btc3d", "meshy",
  "tripo", "3daistudio", "hi3d", "hitem3d", "meta-horizon",
] as const;

/** Fichas que ya existían antes de esta tarea: no se duplican. */
const PREVIAS = ["trellis", "triposr", "hunyuan3d"] as const;

const ids = CATALOGO_PROTOMOLECULA.map((h) => h.id);

const ficha = (id: string): HerramientaProto => {
  const h = herramientaPorId(id);
  expect(h, `falta la ficha ${id}`).toBeDefined();
  return h as HerramientaProto;
};

describe("colocación de las fichas de avatares 3D", () => {
  it("están las quince, una sola vez, y no se duplican las previas", () => {
    for (const id of NUEVAS) expect(ids.filter((x) => x === id), id).toHaveLength(1);
    for (const id of PREVIAS) expect(ids.filter((x) => x === id), id).toHaveLength(1);
  });

  it("cada ficha trae licencia, motivo, verificación y fuente de versión", () => {
    for (const id of NUEVAS) {
      const h = ficha(id);
      expect(h.licencia.trim().length, id).toBeGreaterThan(0);
      expect(h.motivo.trim().length, id).toBeGreaterThan(20);
      expect(h.verificado, id).toBe("2026-10-11");
      expect(h.actualizacion.ref.trim().length, id).toBeGreaterThan(0);
    }
  });

  it("ninguna URL lleva parámetros de afiliado ni de seguimiento", () => {
    const texto = JSON.stringify(NUEVAS.map(ficha));
    expect(texto).not.toMatch(/[?&](aff|via)=|utm_/i);
  });
});

describe("fichas verificadas de avatares 3D", () => {
  it("UniMate: MIT, pesos sin licencia declarada y estado honesto (no se enciende sola)", () => {
    const h = ficha("unimate");
    expect(h.tipo).toBe("modelo");
    expect(h.licencia).toBe("MIT");
    expect(h.codigo).toBe("https://github.com/Friedrich-M/UniMate");
    expect(h.web).toBe("https://huggingface.co/Linzhan/UniMate");
    expect(h.estado).toBe("proximamente");
    expect(h.integracion).toBe("servicio-local");
    expect((h.sinComprobar ?? []).join(" ")).toMatch(/licencia.*pesos|pesos.*licencia/i);
    expect(h.descripcion).toMatch(/cualquier esqueleto/i);
    expect(h.descripcion).toMatch(/No crea ni edita avatares/i);
  });

  it("image-to-3dlab: local en Mac, GLB con PBR y procedencia de licencias por resultado", () => {
    const h = ficha("image-to-3dlab");
    expect(h.estado).toBe("integrable");
    expect(h.integracion).toBe("servicio-local");
    expect(h.medios.macos).toBe(true);
    expect(h.medios.windows).toBe(false);
    expect(h.formatos.salida).toContain("glb");
    expect(h.formatos.salida).toContain("json");
    const texto = `${h.descripcion} ${(h.avisos ?? []).join(" ")}`;
    expect(texto).toMatch(/provenance\.json/);
    expect(texto).toMatch(/Hunyuan3D-MLX/);
    expect(texto).toMatch(/TRELLIS\.2/);
    expect(texto).toMatch(/Stable Fast 3D/);
    expect(texto).toMatch(/Unión Europea|UE/);
    expect(texto).toMatch(/Stability/);
  });

  it("UniRig: MIT, NVIDIA de 8 GB o más y los formatos del encargo", () => {
    const h = ficha("unirig");
    expect(h.licencia).toBe("MIT");
    expect(h.estado).toBe("integrable");
    expect(h.formatos.entrada).toEqual(expect.arrayContaining(["obj", "fbx", "glb", "vrm"]));
    expect(h.formatos.salida).toEqual(expect.arrayContaining(["fbx", "glb"]));
    expect(`${h.descripcion} ${h.motivo}`).toMatch(/NVIDIA.*8 GB|8 GB.*NVIDIA/);
  });

  it("Instant Meshes: BSD-3-Clause y programa aparte en CPU", () => {
    const h = ficha("instant-meshes");
    expect(h.licencia).toBe("BSD-3-Clause");
    expect(h.estado).toBe("integrable");
    expect(h.integracion).toBe("app-nativa-puente");
    expect(h.medios.linux).toBe(true);
    expect(h.control.via).toContain("cli");
  });

  it("Smart Remesh: de pago, GPL y sin uso sin ventana documentado", () => {
    const h = ficha("smart-remesh");
    expect(h.estado).toBe("solo-enlace");
    expect(h.integracion).toBe("solo-enlace");
    expect(h.licencia).toBe("GPL-3.0-or-later");
    expect(h.codigo).toBeNull();
    expect(h.web).toBe("https://superhivemarket.com/products/smart-remesh");
    expect(h.motivo).toMatch(/17 USD/);
    expect(h.descripcion).toMatch(/Blender 4\.2–5\.2/);
    expect((h.sinComprobar ?? []).join(" ")).toMatch(/sin ventana/i);
  });

  it("three-vrm y CharacterStudio: MIT, con enlace verificado y sin montar lo que falta", () => {
    const vrm = ficha("three-vrm");
    expect(vrm.licencia).toBe("MIT");
    expect(vrm.codigo).toBe("https://github.com/pixiv/three-vrm");
    expect(vrm.tipo).toBe("libreria");
    expect(vrm.integracion).toBe("libreria-js");
    expect(vrm.estado).toBe("integrable");

    const studio = ficha("characterstudio");
    expect(studio.licencia).toBe("MIT");
    expect(studio.codigo).toBe("https://github.com/M3-org/CharacterStudio");
    expect(studio.integracion).toBe("iframe-aislado");
    expect(studio.motivo).toMatch(/todavía no está montado/i);
  });

  it("Filigree3D y BTC3D: solo artículo, sin código ni pesos enlazados", () => {
    for (const [id, url] of [["filigree3d", "https://arxiv.org/abs/2609.34900"], ["btc3d", "https://arxiv.org/abs/2609.39709"]] as const) {
      const h = ficha(id);
      expect(h.estado).toBe("proximamente");
      expect(h.codigo).toBeNull();
      expect(h.web).toBe(url);
      expect(h.motivo).toMatch(/artículo/i);
      expect((h.sinComprobar ?? []).join(" ")).toMatch(/código.*sin publicar|sin publicar/i);
    }
  });

  it("los servicios de pago solo se enlazan y dicen lo que no está comprobado", () => {
    const meshy = ficha("meshy");
    expect(meshy.estado).toBe("solo-enlace");
    expect(meshy.web).toBe("https://www.meshy.ai");
    const textoMeshy = `${meshy.descripcion} ${(meshy.avisos ?? []).join(" ")}`;
    expect(textoMeshy).toMatch(/100 créditos/);
    expect(textoMeshy).toMatch(/CC BY 4\.0/);
    expect(meshy.avisos?.join(" ")).toMatch(/atribución/i);

    const tripo = ficha("tripo");
    expect(tripo.estado).toBe("solo-enlace");
    expect(tripo.web).toBe("https://www.tripo3d.ai");
    expect((tripo.sinComprobar ?? []).join(" ")).toMatch(/licencia de salida/);

    expect(ficha("3daistudio").web).toBe("https://www.3daistudio.com");
    expect(ficha("hi3d").web).toBe("https://www.hi3d.ai");
    expect(ficha("3daistudio").estado).toBe("solo-enlace");
    expect(ficha("hi3d").estado).toBe("solo-enlace");
  });

  it("Hitem3D: sin web propia, con el aviso de que el enlace apuntaba a 3DAIStudio", () => {
    const h = ficha("hitem3d");
    expect(h.estado).toBe("solo-enlace");
    expect(h.web).toBeNull();
    expect((h.sinComprobar ?? []).join(" ")).toMatch(/3daistudio/i);
  });

  it("Meta Horizon: plataforma cerrada, sin API pública ni pesos", () => {
    const h = ficha("meta-horizon");
    expect(h.estado).toBe("solo-enlace");
    expect(h.tipo).toBe("servicio");
    expect(h.codigo).toBeNull();
    expect(h.web).toBe("https://developers.meta.com/horizon");
    const texto = `${h.descripcion} ${h.motivo}`;
    expect(texto).toMatch(/sin API pública/i);
    expect(texto).toMatch(/pesos/i);
  });

  it("Hunyuan3D conserva su aviso de región y no se duplica", () => {
    const h = ficha("hunyuan3d");
    const avisos = (h.avisos ?? []).join(" ");
    expect(avisos).toMatch(/Unión Europea/);
    expect(avisos).toMatch(/Reino Unido/);
    expect(avisos).toMatch(/Corea del Sur/);
  });
});

describe("puente a la Biblioteca de las fichas nuevas", () => {
  it("cada ficha se convierte con id propio y un enlace externo no vacío", () => {
    for (const id of NUEVAS) {
      const p = aPaqueteBiblioteca(ficha(id));
      expect(p.id, id).toBe(`proto-${id}`);
      expect(p.payload.externalUrl, id).toBeTruthy();
    }
  });
});
