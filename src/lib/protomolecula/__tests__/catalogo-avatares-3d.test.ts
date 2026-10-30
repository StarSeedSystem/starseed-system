import { describe, expect, it } from "vitest";
import { CATALOGO_PROTOMOLECULA, herramientaPorId, respetaReglaDeLicencia, usoLicencia } from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

/*
 * Fichas de avatares 3D (AV1011H, datos verificados el 2026-10-11, contrato
 * architecture/astraura-avatares-3d.md §1): catorce fichas nuevas al final del
 * catálogo, la actualización del aviso de región de hunyuan3d y ninguna
 * duplicación de trellis, triposr ni hunyuan3d. Puro: sin red ni disco; solo
 * consulta el DATO exportado del catálogo. Todo lo no comprobado vive en
 * `sinComprobar`, y ninguna URL lleva parámetros de afiliado.
 */

const IDS = [
  "unimate", "image-to-3dlab", "unirig", "instant-meshes", "smart-remesh", "three-vrm",
  "characterstudio", "filigree3d", "btc3d", "meshy", "tripo", "3daistudio", "hi3d", "hitem3d",
] as const;

const ids = CATALOGO_PROTOMOLECULA.map((h) => h.id);

const ficha = (id: string): HerramientaProto => {
  const h = herramientaPorId(id);
  expect(h, `falta la ficha ${id}`).toBeDefined();
  return h as HerramientaProto;
};

describe("colocación y reglas transversales", () => {
  it("las catorce están, juntas al final, sin duplicarse ni duplicar a las previas de 3D", () => {
    const ultimas = ids.slice(ids.length - IDS.length);
    expect(ultimas).toEqual([...IDS]);
    expect(new Set(ids).size).toBe(ids.length);
    const previas = ["blender", "trellis", "triposr", "hunyuan3d", "mesh2motion"];
    for (const id of previas) expect(ids.filter((x) => x === id), id).toHaveLength(1);
  });

  it.each(IDS)("%s: licencia útil, motivo largo, fecha y sin afiliados", (id) => {
    const h = ficha(id);
    expect(h.licencia.trim().length, id).toBeGreaterThan(0);
    expect(h.motivo.trim().length, id).toBeGreaterThan(20);
    expect(h.verificado, id).toBe("2026-10-11");
    const texto = JSON.stringify(h);
    expect(texto, id).not.toMatch(/aff=|via=|utm_/);
    expect(respetaReglaDeLicencia(h), `${id}: ${h.licencia} como ${h.integracion}`).toBe(true);
  });

  it("ninguna integrable tiene licencia sin permiso y las faltas viven en sinComprobar", () => {
    for (const id of IDS) {
      const h = ficha(id);
      if (h.estado === "integrable") {
        expect(usoLicencia(h), id).not.toBe("sin-permiso");
        expect(h.licencia, id).not.toMatch(/^(LicenseRef-|NOASSERTION)/);
      }
      expect(h.sinComprobar?.length ?? 0, id).toBeGreaterThan(0);
    }
  });
});

describe("texto → movimiento · animado (unimate)", () => {
  it("proximamente con inferencia sin publicar, pesos HF sin licencia y código MIT del repo", () => {
    const h = ficha("unimate");
    expect(h.estado).toBe("proximamente");
    expect(h.tipo).toBe("modelo");
    expect(h.categoria).toBe("ia-generativa");
    expect(h.licencia).toBe("MIT");
    expect(h.licenciaPesos).toBe("NOASSERTION");
    expect(h.codigo).toBe("https://github.com/Friedrich-M/UniMate");
    expect(h.web).toBe("https://huggingface.co/Linzhan/UniMate");
    expect(h.integracion).toBe("servicio-local");
    expect(h.descripcion.toLowerCase()).toContain("no crea ni edita avatares");
    expect(h.motivo).toMatch(/Linzhan\/UniMate/);
    expect(h.sinComprobar).toEqual(expect.arrayContaining([expect.stringContaining("licencia de los pesos")]));
    expect(h.avisos).toEqual(expect.arrayContaining([expect.stringContaining("Pesos sin licencia declarada")]));
  });
});

describe("taller · generar (image-to-3dlab) y riggear (unirig)", () => {
  it("image-to-3dlab: integrable, servicio-local en Mac Apple Silicon, GLB + provenance y tres motores con su licencia", () => {
    const h = ficha("image-to-3dlab");
    expect(h.estado).toBe("integrable");
    expect(h.licencia).toBe("Apache-2.0");
    expect(h.codigo).toBe("https://github.com/Bingeljell/image-to-3dlab");
    expect(h.web).toBe("https://assetfurnace.com");
    expect(h.tipo).toBe("app");
    expect(h.origen).toBe("github");
    expect(h.integracion).toBe("servicio-local");
    expect(h.descripcion).toMatch(/Mac Apple Silicon/);
    expect(h.descripcion).toMatch(/32 GB/);
    expect(h.descripcion).toMatch(/provenance\.json/);
    expect(h.formatos.salida).toContain("glb");
    expect(h.medios).toMatchObject({ macos: true, windows: false, linux: false });
    const avisos = (h.avisos ?? []).join(" ");
    expect(avisos).toMatch(/Hunyuan3D-MLX/);
    expect(avisos).toMatch(/Unión Europea, el Reino Unido y Corea del Sur/);
    expect(avisos).toMatch(/TRELLIS\.2/);
    expect(avisos).toMatch(/DINOv3/);
    expect(avisos).toMatch(/Stable Fast 3D/);
    expect(avisos).toMatch(/Stability/);
  });

  it("unirig: integrable, MIT, GPU NVIDIA ≥ 8 GB, obj/fbx/glb/vrm → fbx/glb", () => {
    const h = ficha("unirig");
    expect(h.estado).toBe("integrable");
    expect(h.licencia).toBe("MIT");
    expect(h.codigo).toBe("https://github.com/VAST-AI-Research/UniRig");
    expect(h.formatos.entrada).toEqual(expect.arrayContaining(["obj", "fbx", "glb", "vrm"]));
    expect(h.formatos.salida).toEqual(expect.arrayContaining(["fbx", "glb"]));
    expect(h.motivo).toMatch(/GPU NVIDIA de 8 GB o más/);
    expect(h.medios.macos).toBe(false);
    expect(h.medios.servidor).toBe(true);
  });
});

describe("taller · remallar (instant-meshes y smart-remesh)", () => {
  it("instant-meshes: BSD-3-Clause, integrable por defecto y gratis, como programa de escritorio aparte", () => {
    const h = ficha("instant-meshes");
    expect(h.estado).toBe("integrable");
    expect(h.licencia).toBe("BSD-3-Clause");
    expect(h.codigo).toBe("https://github.com/wjakob/instant-meshes");
    expect(h.integracion).toBe("app-nativa-puente");
    expect(h.tipo).toBe("app");
    expect(h.descripcion).toMatch(/Smart Remesh/);
    expect(h.motivo).toMatch(/por defecto/);
    expect(h.motivo.toLowerCase()).toMatch(/gratis/);
    expect(h.medios).toMatchObject({ macos: true, windows: true, linux: true });
    expect(h.sinComprobar).toEqual(expect.arrayContaining([expect.stringContaining("formatos exactos")]));
  });

  it("smart-remesh: solo-enlace, GPL y de pago (17 USD), con la alternativa gratuita dicho", () => {
    const h = ficha("smart-remesh");
    expect(h.estado).toBe("solo-enlace");
    expect(h.integracion).toBe("solo-enlace");
    expect(h.licencia).toBe("GPL-3.0");
    expect(h.tipo).toBe("servicio");
    expect(h.origen).toBe("otro");
    expect(h.codigo).toBeNull();
    expect(h.web).toBe("https://superhivemarket.com/products/smart-remesh");
    expect(h.descripcion).toMatch(/Blender 4\.2–5\.2/);
    expect(h.descripcion).toMatch(/3DRedbox Studio/);
    expect(h.motivo).toMatch(/17 USD/);
    expect(h.motivo).toMatch(/Instant Meshes/);
    expect(h.motivo).toMatch(/QuadriFlow/);
    expect((h.avisos ?? []).join(" ")).toMatch(/GPL/);
  });
});

describe("mostrar VRM y componer piezas (three-vrm y characterstudio)", () => {
  it("three-vrm: MIT, librería-js de pixiv, vía gratis para un VRM vivo en el navegador", () => {
    const h = ficha("three-vrm");
    expect(h.estado).toBe("integrable");
    expect(h.licencia).toBe("MIT");
    expect(h.tipo).toBe("libreria");
    expect(h.origen).toBe("github");
    expect(h.codigo).toBe("https://github.com/pixiv/three-vrm");
    expect(h.integracion).toBe("libreria-js");
    expect(h.medios.web).toBe("embebible");
    expect(h.formatos.entrada).toContain("vrm");
    expect(h.descripcion).toMatch(/VRM 1\.0/);
    expect(h.actualizacion).toMatchObject({ fuente: "npm", ref: "@pixiv/three-vrm", ultimaVersion: null, fechaVersion: null });
    expect(h.motivo).toMatch(/gratis/);
  });

  it("characterstudio: MIT, M3-org, patrón de piezas y exportación VRM/GLB", () => {
    const h = ficha("characterstudio");
    expect(h.estado).toBe("integrable");
    expect(h.licencia).toBe("MIT");
    expect(h.codigo).toBe("https://github.com/M3-org/CharacterStudio");
    expect(h.tipo).toBe("app");
    expect(h.integracion).toBe("app-nativa-puente");
    expect(h.descripcion).toMatch(/piezas intercambiables/);
    expect(h.descripcion).toMatch(/VRM y GLB/);
    expect(h.motivo).toMatch(/patrón de piezas/);
  });
});

describe("artículos en vigía (filigree3d y btc3d) y servicios solo-enlace", () => {
  it("filigree3d: proximamente, solo artículo (arXiv 2609.34900), sin código ni pesos enlazados", () => {
    const h = ficha("filigree3d");
    expect(h.estado).toBe("proximamente");
    expect(h.tipo).toBe("recurso");
    expect(h.origen).toBe("otro");
    expect(h.codigo).toBeNull();
    expect(h.web).toBe("https://arxiv.org/abs/2609.34900");
    expect(h.licencia).toBe("NOASSERTION");
    expect(h.descripcion).toMatch(/2048³/);
    expect(h.descripcion).toMatch(/4096³/);
    expect(h.motivo).toMatch(/vigía/);
    expect(h.sinComprobar).toEqual(expect.arrayContaining([expect.stringContaining("código de inferencia")]));
  });

  it("btc3d: proximamente, solo artículo (arXiv 2609.39709), etapa «detallar» del taller", () => {
    const h = ficha("btc3d");
    expect(h.estado).toBe("proximamente");
    expect(h.tipo).toBe("recurso");
    expect(h.web).toBe("https://arxiv.org/abs/2609.39709");
    expect(h.codigo).toBeNull();
    expect(h.descripcion).toMatch(/teselas/);
    expect(h.motivo).toMatch(/detallar/);
  });

  it.each(["meshy", "tripo", "3daistudio", "hi3d", "hitem3d"] as const)(
    "%s: servicio solo-enlace, sin API verificada y con URL limpia",
    (id) => {
      const h = ficha(id);
      expect(h.estado).toBe("solo-enlace");
      expect(h.integracion).toBe("solo-enlace");
      expect(h.tipo).toBe("servicio");
      expect(h.origen).toBe("otro");
      expect(h.licencia).toBe("NOASSERTION");
      expect(h.descripcion.length).toBeGreaterThan(30);
    },
  );

  it("meshy: plan gratis de 100 créditos con salida CC BY 4.0 y atribución", () => {
    const h = ficha("meshy");
    expect(h.web).toBe("https://www.meshy.ai");
    expect(h.descripcion).toMatch(/100 créditos/);
    expect(h.descripcion).toMatch(/CC BY 4\.0/);
    expect((h.avisos ?? []).join(" ")).toMatch(/atribución visible/);
    expect(h.motivo).toMatch(/procedencia/);
    expect(h.sinComprobar).toEqual(expect.arrayContaining([expect.stringContaining("API disponible")]));
  });

  it("tripo: precios y licencia de salida sin comprobar, con sus modelos abiertos en la ficha", () => {
    const h = ficha("tripo");
    expect(h.web).toBe("https://www.tripo3d.ai");
    expect(h.sinComprobar).toEqual(expect.arrayContaining(["precios", "licencia de la salida", "API y sus condiciones"]));
    expect(h.descripcion).toMatch(/TripoSR y TripoSG/);
  });

  it("hitem3d: sin web (el enlace recibido apuntaba a 3daistudio) y lo dice", () => {
    const h = ficha("hitem3d");
    expect(h.web).toBeNull();
    expect(h.codigo).toBeNull();
    expect(h.sinComprobar).toEqual(expect.arrayContaining([expect.stringContaining("3daistudio")]));
    expect(h.motivo).toMatch(/3DAIStudio/);
  });
});

describe("fichas previas actualizadas · hunyuan3d", () => {
  it("cubre el aviso de región (UE, Reino Unido y Corea del Sur) sin tocar su estado", () => {
    const h = ficha("hunyuan3d");
    expect(h.estado).toBe("solo-enlace");
    expect(h.integracion).toBe("solo-enlace");
    const avisos = (h.avisos ?? []).join(" ");
    expect(avisos).toMatch(/región/);
    expect(avisos).toMatch(/Unión Europea, el Reino Unido y Corea del Sur/);
  });
});
