/**
 * chat-herramientas · herramienta «Contenido vivo» (CVV1028I): mismo contrato
 * que el picker, migración a la versión 2 y petición del átomo `contenido-vivo`
 * a la Protomolécula. Todo puro: sin red, sin DOM y sin localStorage.
 */

import { describe, expect, it } from "vitest";
import {
  ATOMO_CONTENIDO_VIVO,
  HERRAMIENTAS_ASTRAURA_VIVO,
  HERRAMIENTAS_DEFAULTS_VERSION,
  HERRAMIENTAS_NUEVAS_DESDE_V1,
  HERRAMIENTA_CONTENIDO_VIVO,
  directivaAtomoContenidoVivo,
  migrarSeleccionHabilidades,
  peticionAtomoContenidoVivo,
} from "@/lib/astraura/chat-herramientas";

const CATALOGO = ["taste", "pm", "av-gen", "bonsai-engine", ATOMO_CONTENIDO_VIVO];

describe("herramienta Contenido vivo", () => {
  it("tiene la forma del picker: id, etiqueta y descripción exacta", () => {
    expect(HERRAMIENTA_CONTENIDO_VIVO.id).toBe("contenido-vivo");
    expect(HERRAMIENTA_CONTENIDO_VIVO.label).toBe("Contenido vivo");
    expect(HERRAMIENTA_CONTENIDO_VIVO.descripcion).toBe(
      "3D vivo, película de scroll y gráficos que se mueven, eligiendo entre lo local y los servicios conectados",
    );
    expect(HERRAMIENTA_CONTENIDO_VIVO.atomoId).toBe("contenido-vivo");
    expect(HERRAMIENTA_CONTENIDO_VIVO.systemPrompt).toContain("contenido-vivo");
  });

  it("viaja en el catálogo que suma al picker", () => {
    expect(HERRAMIENTAS_ASTRAURA_VIVO.map((h) => h.id)).toContain("contenido-vivo");
  });
});

describe("petición del átomo a la Protomolécula", () => {
  it("pide abrir el átomo contenido-vivo con un título", () => {
    expect(peticionAtomoContenidoVivo("Portada viva")).toEqual({
      accion: "abrir",
      herramienta: "contenido-vivo",
      titulo: "Portada viva",
    });
  });

  it("nunca manda un título vacío", () => {
    expect(peticionAtomoContenidoVivo("   ").titulo).toBe("Contenido vivo");
    expect(peticionAtomoContenidoVivo().titulo).toBe("Contenido vivo");
  });

  it("serializa la directiva que entiende el puente de agentes", () => {
    const directiva = directivaAtomoContenidoVivo("Gráfico vivo");
    expect(directiva.startsWith("[[ACCION: protomolecula ")).toBe(true);
    const json = directiva.slice("[[ACCION: protomolecula ".length, -2);
    expect(JSON.parse(json)).toEqual({
      accion: "abrir",
      herramienta: "contenido-vivo",
      titulo: "Gráfico vivo",
    });
  });
});

describe("migración a la versión 2", () => {
  it("la versión sube para que las cuentas ya creadas vean la herramienta", () => {
    expect(HERRAMIENTAS_DEFAULTS_VERSION).toBe(2);
    expect(HERRAMIENTAS_NUEVAS_DESDE_V1).toEqual(["contenido-vivo"]);
  });

  it("desde la versión 1 añade solo contenido-vivo, sin reencender lo apagado", () => {
    const r = migrarSeleccionHabilidades(["taste"], 1, CATALOGO);
    expect(r.version).toBe(2);
    expect(r.cambio).toBe(true);
    expect(r.seleccion).toEqual(["taste", "contenido-vivo"]);
    expect(r.seleccion).not.toContain("av-gen");
    expect(r.seleccion).not.toContain("bonsai-engine");
  });

  it("ya en la versión 2 respeta la selección íntegra", () => {
    const r = migrarSeleccionHabilidades(["taste"], 2, CATALOGO);
    expect(r.cambio).toBe(false);
    expect(r.seleccion).toEqual(["taste"]);
  });

  it("sin selección explícita («Todas») solo estampa la versión", () => {
    const r = migrarSeleccionHabilidades(undefined, 1, CATALOGO);
    expect(r.seleccion).toBeUndefined();
    expect(r.version).toBe(2);
    expect(r.cambio).toBe(true);
  });
});
