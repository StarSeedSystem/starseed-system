import { describe, expect, it } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  aPaqueteBiblioteca,
  herramientaPorId,
} from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

/**
 * Fichas de herramientas de avatares 3D (AV1011H, verificadas el 2026-10-11).
 * Contrato: architecture/astraura-avatares-3d.md §1. Pura: solo lee los datos
 * exportados del catálogo, sin red, disco ni procesos.
 */
const NUEVAS = [
  "unimate",
  "image-to-3dlab",
  "unirig",
  "instant-meshes",
  "smart-remesh",
  "three-vrm",
  "characterstudio",
  "filigree3d",
  "btc3d",
  "meshy",
  "tripo",
  "3daistudio",
  "hi3d",
  "hitem3d",
  "meta-horizon",
] as const;

/** Fichas que ya existían antes de esta tarea: no se duplican. */
const PREVIAS = ["trellis", "triposr", "hunyuan3d", "pixal3d"] as const;

const ids = CATALOGO_PROTOMOLECULA.map((h) => h.id);

function ficha(id: string): HerramientaProto {
  const h = herramientaPorId(id);
  expect(h, `falta la ficha ${id}`).toBeDefined();
  return h as HerramientaProto;
}

describe("colocación de las fichas de avatares 3D", () => {
  it("las quince están, juntas, justo después de `mesh2motion`", () => {
    const i = ids.indexOf("mesh2motion");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(ids.slice(i + 1, i + 1 + NUEVAS.length)).toEqual([...NUEVAS]);
  });

  it("ninguna id se repite y las previas siguen una sola vez", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...NUEVAS, ...PREVIAS]) {
      expect(ids.filter((x) => x === id), id).toHaveLength(1);
    }
  });

  it("todas están verificadas el 2026-10-11 y traen motivo, licencia y fuente", () => {
    for (const id of NUEVAS) {
      const h = ficha(id);
      expect(h.verificado, id).toBe("2026-10-11");
      expect(h.motivo.trim().length, id).toBeGreaterThan(20);
      expect(h.licencia.trim().length, id).toBeGreaterThan(0);
      expect(h.actualizacion.ref.trim().length, id).toBeGreaterThan(0);
      expect(h.codigo !== null || h.web !== null, `${id}: sin código ni web`).toBe(true);
    }
  });

  it("ninguna URL guarda parámetros de afiliado", () => {
    expect(JSON.stringify(CATALOGO_PROTOMOLECULA)).not.toMatch(/[?&](aff|via)=|utm_/i);
  });
});

describe("UniMate: texto a movimiento", () => {
  it("declara la inferencia no publicada y los pesos sin licencia, con su motivo", () => {
    const h = ficha("unimate");
    expect(h.estado).toBe("proximamente");
    expect(h.licencia).toBe("MIT");
    expect(h.licenciaPesos).toBe("NOASSERTION");
    expect(h.codigo).toBe("https://github.com/Friedrich-M/UniMate");
    expect(h.motivo).toMatch(/inferencia no está publicada/i);
    expect(h.motivo).toMatch(/no declaran licencia|sin licencia/i);
    expect((h.sinComprobar ?? []).join(" ")).toMatch(/inferencia/i);
    expect(h.descripcion).toMatch(/cualquier esqueleto/i);
  });

  it("no se presenta como motor listo ni como integrable", () => {
    const h = ficha("unimate");
    expect(h.estado).not.toBe("integrable");
    expect(aPaqueteBiblioteca(h).comingSoon).toBe(true);
  });
});

describe("image-to-3dlab: taller local en Mac Apple Silicon", () => {
  it("es integrable, servicio local, solo macOS y pide 32 GB", () => {
    const h = ficha("image-to-3dlab");
    expect(h.estado).toBe("integrable");
    expect(h.integracion).toBe("servicio-local");
    expect(h.medios.macos).toBe(true);
    expect(h.medios.windows).toBe(false);
    expect(h.medios.linux).toBe(false);
    expect(`${h.descripcion} ${h.motivo}`).toMatch(/32 GB/);
  });

  it("salida GLB con PBR y provenance.json", () => {
    const h = ficha("image-to-3dlab");
    expect(h.formatos.salida).toEqual(expect.arrayContaining(["glb", "json"]));
    expect(h.descripcion).toMatch(/GLB/i);
    expect(h.descripcion).toMatch(/PBR/i);
    expect(h.descripcion).toMatch(/provenance\.json/i);
    expect(aPaqueteBiblioteca(h).comingSoon).toBe(false);
  });

  it("avisa de la licencia de cada motor y de la región de Hunyuan", () => {
    const avisos = (ficha("image-to-3dlab").avisos ?? []).join(" ");
    expect(avisos).toMatch(/Hunyuan3D-MLX/);
    expect(avisos).toMatch(/UE|Unión Europea/);
    expect(avisos).toMatch(/Reino Unido/);
    expect(avisos).toMatch(/Corea del Sur/);
    expect(avisos).toMatch(/TRELLIS\.2/);
    expect(avisos).toMatch(/DINOv3/);
    expect(avisos).toMatch(/Stable Fast 3D/);
    expect(avisos).toMatch(/Stability/);
  });
});

describe("UniRig: esqueleto con NVIDIA", () => {
  it("es integrable, MIT y necesita GPU NVIDIA de 8 GB o más", () => {
    const h = ficha("unirig");
    expect(h.estado).toBe("integrable");
    expect(h.licencia).toBe("MIT");
    expect(h.licenciaPesos).toBe("MIT");
    expect(h.codigo).toBe("https://github.com/VAST-AI-Research/UniRig");
    expect(h.motivo).toMatch(/NVIDIA de 8 GB o más/);
  });

  it("acepta obj, fbx, glb y vrm y devuelve fbx o glb", () => {
    const h = ficha("unirig");
    expect(h.formatos.entrada).toEqual(expect.arrayContaining(["obj", "fbx", "glb", "vrm"]));
    expect(h.formatos.salida).toEqual(expect.arrayContaining(["fbx", "glb"]));
  });
});

describe("remallado y avatares VRM", () => {
  it("Instant Meshes es BSD-3-Clause, libre y se controla por línea de órdenes", () => {
    const h = ficha("instant-meshes");
    expect(h.licencia).toBe("BSD-3-Clause");
    expect(h.codigo).toBe("https://github.com/wjakob/instant-meshes");
    expect(h.estado).toBe("integrable");
    expect(h.integracion).toBe("app-nativa-puente");
    expect(h.control.via).toContain("cli");
  });

  it("Smart Remesh 3 es de pago (17 USD), GPL y solo enlace", () => {
    const h = ficha("smart-remesh");
    expect(h.estado).toBe("solo-enlace");
    expect(h.integracion).toBe("solo-enlace");
    expect(h.licencia).toMatch(/^GPL/);
    expect(h.web).toBe("https://superhivemarket.com/products/smart-remesh");
    expect(`${h.descripcion} ${h.motivo}`).toMatch(/17 USD/);
    expect(h.descripcion).toMatch(/4\.2/);
    expect(h.descripcion).toMatch(/5\.2/);
    expect((h.avisos ?? []).join(" ")).toMatch(/3DRedbox/);
    expect(aPaqueteBiblioteca(h).comingSoon).toBe(true);
  });

  it("three-vrm es MIT de pixiv y se enlaza como biblioteca JS", () => {
    const h = ficha("three-vrm");
    expect(h.licencia).toBe("MIT");
    expect(h.codigo).toBe("https://github.com/pixiv/three-vrm");
    expect(h.estado).toBe("integrable");
    expect(h.integracion).toBe("libreria-js");
    expect(h.medios.web).not.toBe("no");
    expect(h.formatos.entrada).toContain("vrm");
  });

  it("CharacterStudio es MIT de M3-org y se embebe como origen aparte", () => {
    const h = ficha("characterstudio");
    expect(h.licencia).toBe("MIT");
    expect(h.codigo).toBe("https://github.com/M3-org/CharacterStudio");
    expect(h.estado).toBe("integrable");
    expect(h.integracion).toBe("iframe-aislado");
    expect(h.formatos.salida).toEqual(expect.arrayContaining(["vrm", "glb"]));
  });
});

describe("solo artículo o solo enlace: nada se simula", () => {
  it("Filigree3D y BTC3D son próximamente, sin código, con su artículo", () => {
    const filigree = ficha("filigree3d");
    const btc = ficha("btc3d");
    for (const h of [filigree, btc]) {
      expect(h.estado, h.id).toBe("proximamente");
      expect(h.codigo, h.id).toBeNull();
      expect((h.sinComprobar ?? []).join(" "), h.id).toMatch(/código/i);
      expect(h.descripcion, h.id).toMatch(/Solo hay artículo/i);
    }
    expect(filigree.web).toBe("https://arxiv.org/abs/2609.34900");
    expect(btc.web).toBe("https://arxiv.org/abs/2609.39709");
    expect(aPaqueteBiblioteca(filigree).comingSoon).toBe(true);
    expect(aPaqueteBiblioteca(btc).comingSoon).toBe(true);
  });

  it("Meshy es solo enlace, con 100 créditos al mes y salida CC BY 4.0", () => {
    const h = ficha("meshy");
    expect(h.estado).toBe("solo-enlace");
    expect(h.integracion).toBe("solo-enlace");
    expect(h.web).toBe("https://www.meshy.ai");
    expect(h.descripcion).toMatch(/100 créditos al mes/);
    expect(h.descripcion).toMatch(/CC BY 4\.0/);
    expect((h.avisos ?? []).join(" ")).toMatch(/atribución/);
  });

  it("Tripo es solo enlace y declara precios y licencia sin comprobar", () => {
    const h = ficha("tripo");
    expect(h.estado).toBe("solo-enlace");
    expect(h.web).toBe("https://www.tripo3d.ai");
    const pendiente = (h.sinComprobar ?? []).join(" ");
    expect(pendiente).toMatch(/precios/i);
    expect(pendiente).toMatch(/licencia de salida/i);
  });

  it("3DAIStudio, Hi3D y Meta Horizon son solo enlace con su motivo", () => {
    expect(ficha("3daistudio")).toMatchObject({ estado: "solo-enlace", web: "https://www.3daistudio.com" });
    expect(ficha("hi3d")).toMatchObject({ estado: "solo-enlace", web: "https://www.hi3d.ai" });
    const horizon = ficha("meta-horizon");
    expect(horizon.estado).toBe("solo-enlace");
    expect(horizon.web).toBe("https://developers.meta.com/horizon");
    expect(`${horizon.descripcion} ${horizon.motivo}`).toMatch(/cerrada|sin API pública/i);
  });

  it("Hitem3D deja la web vacía y avisa de que el enlace era de 3DAIStudio", () => {
    const h = ficha("hitem3d");
    expect(h.estado).toBe("solo-enlace");
    expect(h.web).toBeNull();
    expect((h.sinComprobar ?? []).join(" ")).toMatch(/3DAIStudio/i);
    expect(`${h.descripcion} ${h.motivo}`).toMatch(/3DAIStudio/i);
  });
});

describe("Hunyuan3D: aviso de región", () => {
  it("nombra la Unión Europea, el Reino Unido y Corea del Sur en sus avisos", () => {
    const avisos = (ficha("hunyuan3d").avisos ?? []).join(" ");
    expect(avisos).toMatch(/Unión Europea/);
    expect(avisos).toMatch(/Reino Unido/);
    expect(avisos).toMatch(/Corea del Sur/);
  });
});
