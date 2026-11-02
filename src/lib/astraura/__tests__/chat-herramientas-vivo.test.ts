/**
 * chat-herramientas-vivo — «Contenido vivo» en el picker (CVV1028 · §2 y §3).
 * Solo funciones puras: forma, catálogo, petición del átomo y migración v2.
 */

import { describe, expect, it } from "vitest";
import type { SkillCapability } from "@/ai/astraura/skills";
import {
  DESCRIPCION_CONTENIDO_VIVO,
  HABILIDADES_UNIVERSO_LEGADO,
  HERRAMIENTA_CONTENIDO_VIVO,
  HERRAMIENTAS_DEFAULTS_VERSION,
  ID_HERRAMIENTA_CONTENIDO_VIVO,
  habilidadesConContenidoVivo,
  migrarSeleccionHabilidades,
  peticionAtomoContenidoVivo,
  peticionAtomoDeHerramienta,
} from "@/lib/astraura/chat-herramientas";

const OTRA: SkillCapability = {
  id: "taste",
  label: "Taste",
  systemPrompt: "Criterio de diseño.",
};

describe("herramienta «Contenido vivo»", () => {
  it("tiene la forma del picker y la descripción pedida", () => {
    expect(HERRAMIENTA_CONTENIDO_VIVO.id).toBe("contenido-vivo");
    expect(HERRAMIENTA_CONTENIDO_VIVO.label).toBe("Contenido vivo");
    expect(HERRAMIENTA_CONTENIDO_VIVO.descripcion).toBe(DESCRIPCION_CONTENIDO_VIVO);
    expect(HERRAMIENTA_CONTENIDO_VIVO.descripcion).toBe(
      "3D vivo, película de scroll y gráficos que se mueven, eligiendo entre lo local y los servicios conectados",
    );
    expect(HERRAMIENTA_CONTENIDO_VIVO.defaultOn).toBe(true);
    expect(HERRAMIENTA_CONTENIDO_VIVO.systemPrompt).toContain(DESCRIPCION_CONTENIDO_VIVO);
    expect(HERRAMIENTA_CONTENIDO_VIVO.routing).toEqual({});
  });

  it("al usarla, el prompt pide el átomo contenido-vivo a la Protomolécula", () => {
    expect(HERRAMIENTA_CONTENIDO_VIVO.systemPrompt).toContain("contenido-vivo");
    expect(HERRAMIENTA_CONTENIDO_VIVO.systemPrompt).toContain("Protomolécula");
    expect(HERRAMIENTA_CONTENIDO_VIVO.systemPrompt).toContain(
      '[[ACCION: protomolecula {"accion":"abrir","herramienta":"contenido-vivo"}]]',
    );
  });

  it("no inventa claves ni cambia el id del átomo", () => {
    expect(ID_HERRAMIENTA_CONTENIDO_VIVO).toBe("contenido-vivo");
    expect(HERRAMIENTA_CONTENIDO_VIVO.id).toBe(ID_HERRAMIENTA_CONTENIDO_VIVO);
  });
});

describe("habilidadesConContenidoVivo", () => {
  it("añade la herramienta sin mutar el catálogo de base", () => {
    const base = [OTRA];
    const resultado = habilidadesConContenidoVivo(base);
    expect(base).toEqual([OTRA]);
    expect(resultado).toEqual([OTRA, HERRAMIENTA_CONTENIDO_VIVO]);
    expect(resultado).not.toBe(base);
  });

  it("no la duplica si el catálogo ya la trae", () => {
    const base = [OTRA, HERRAMIENTA_CONTENIDO_VIVO];
    const resultado = habilidadesConContenidoVivo(base);
    expect(resultado.filter((h) => h.id === ID_HERRAMIENTA_CONTENIDO_VIVO)).toHaveLength(1);
    expect(resultado).toEqual(base);
  });

  it("conserva una habilidad distinta que se llame parecido", () => {
    const parecida: SkillCapability = { id: "contenido-vivo-3d", label: "Otra", systemPrompt: "" };
    expect(habilidadesConContenidoVivo([parecida]).map((h) => h.id)).toEqual(["contenido-vivo-3d", "contenido-vivo"]);
  });
});

describe("peticionAtomoContenidoVivo / peticionAtomoDeHerramienta", () => {
  it("pide a la Protomolécula el átomo contenido-vivo", () => {
    expect(peticionAtomoContenidoVivo()).toEqual({ accion: "abrir", herramienta: "contenido-vivo" });
  });

  it("acepta un título, lo recorta y lo acota a 80 caracteres", () => {
    expect(peticionAtomoContenidoVivo("  Mi publicación  ")).toEqual({ accion: "abrir", herramienta: "contenido-vivo", titulo: "Mi publicación" });
    const largo = "x".repeat(120);
    expect(peticionAtomoContenidoVivo(largo).titulo).toHaveLength(80);
  });

  it("solo responde por «contenido-vivo»; otras herramientas no piden átomo", () => {
    expect(peticionAtomoDeHerramienta("contenido-vivo", "Viva")).toEqual({
      accion: "abrir",
      herramienta: "contenido-vivo",
      titulo: "Viva",
    });
    expect(peticionAtomoDeHerramienta("taste")).toBeNull();
    expect(peticionAtomoDeHerramienta("contenido-vivo-3d")).toBeNull();
  });
});

describe("migración v2 de la selección de habilidades", () => {
  const CATALOGO = [...HABILIDADES_UNIVERSO_LEGADO, "av-gen", ID_HERRAMIENTA_CONTENIDO_VIVO];

  it("las cuentas migradas en v1 reciben «Contenido vivo» sin perder lo decidido", () => {
    const r = migrarSeleccionHabilidades(["taste"], 1, CATALOGO);
    expect(HERRAMIENTAS_DEFAULTS_VERSION).toBe(2);
    expect(r.version).toBe(2);
    expect(r.cambio).toBe(true);
    expect(r.seleccion).toEqual(["taste", ID_HERRAMIENTA_CONTENIDO_VIVO]);
    expect(r.seleccion).not.toContain("av-gen");
    expect(r.seleccion).not.toContain("pm");
  });

  it("una cuenta ya en v2 manda: si apagó «Contenido vivo», se respeta", () => {
    const r = migrarSeleccionHabilidades(["taste"], 2, CATALOGO);
    expect(r).toEqual({ seleccion: ["taste"], version: 2, cambio: false });
  });

  it("sin selección explícita («Todas») solo estampa la versión", () => {
    const r = migrarSeleccionHabilidades(undefined, 1, CATALOGO);
    expect(r).toEqual({ seleccion: undefined, version: 2, cambio: true });
  });
});
