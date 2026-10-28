import { describe, it, expect } from "vitest";
import { componerVideo } from "@/lib/video-html/herramienta-componer";
import { manejarAccionProtomolecula } from "@/lib/protomolecula/accion-agente";

describe("componerVideo", () => {
  it("compone desde la plantilla StarSeed sin GSAP y queda lista para render", () => {
    const r = componerVideo({ pedido: "Hola StarSeed" });
    expect(r.html).toContain('data-composition-id="main"');
    expect(r.html).toContain('data-no-timeline');
    expect(r.html).toContain('data-width="1280"');
    expect(r.html).toContain('data-height="720"');
    expect(r.html).toContain('data-duration="3"');
    expect(r.html).not.toMatch(/gsap/i);
    expect(r.avisos).toEqual([]);
    expect(r.siguiente).toBe("render");
    expect(r.peticionVoz).toBeUndefined();
  });

  it("mapea los formatos a sus dimensiones sin tocar el contenido", () => {
    const vertical = componerVideo({ pedido: "Vertical", formato: "vertical" });
    const cuadrado = componerVideo({ pedido: "Cuadrado", formato: "cuadrado" });
    const cuatroK = componerVideo({ pedido: "Cuatro K", formato: "4k" });
    expect(vertical.html).toContain('data-width="720"');
    expect(vertical.html).toContain('data-height="1280"');
    expect(cuadrado.html).toContain('data-width="720"');
    expect(cuadrado.html).toContain('data-height="720"');
    expect(cuatroK.html).toContain('data-width="3840"');
    expect(cuatroK.html).toContain('data-height="2160"');
    expect([vertical, cuadrado, cuatroK].every((r) => r.siguiente === "render")).toBe(true);
  });

  it("acota la duración al rango y avisa para pasar por lint", () => {
    const corta = componerVideo({ pedido: "Corta", duracion: 0 });
    const larga = componerVideo({ pedido: "Larga", duracion: 9999 });
    expect(corta.html).toContain('data-duration="1"');
    expect(larga.html).toContain('data-duration="600"');
    expect(corta.avisos.join(" ")).toContain("fuera de rango");
    expect(larga.siguiente).toBe("lint");
  });

  it("un formato desconocido cae a horizontal y lo dice", () => {
    const r = componerVideo({ pedido: "Raro", formato: "panorámica-extrema" });
    expect(r.html).toContain('data-width="1280"');
    expect(r.avisos.join(" ")).toContain("No conozco el formato");
    expect(r.siguiente).toBe("lint");
  });

  it("un pedido vacío usa la plantilla base y avisa", () => {
    const r = componerVideo({ pedido: "   " });
    expect(r.html).toContain("StarSeed OS");
    expect(r.avisos.join(" ")).toContain("pedido venía vacío");
    expect(r.siguiente).toBe("lint");
  });

  it("escapa el HTML del pedido", () => {
    const r = componerVideo({ pedido: '<script>alert("x")</script>' });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&#60;script&#62;");
  });

  it("devuelve la petición de voz a la puerta única sin llamarla", () => {
    const r = componerVideo({ pedido: "Con narración", voz: "  Bienvenida a StarSeed.  " });
    expect(r.peticionVoz).toEqual({ texto: "Bienvenida a StarSeed.", contexto: "lectura" });
    expect(r.avisos.join(" ")).toContain("puerta única de voz");
    expect(r.siguiente).toBe("lint");
  });

  it("conserva la persona de la voz y no pide nada si el texto viene vacío", () => {
    const conPersona = componerVideo({ pedido: "Con persona", voz: { texto: "Hola", persona: "aurora" } });
    expect(conPersona.peticionVoz).toEqual({ texto: "Hola", contexto: "lectura", persona: "aurora" });
    const vacia = componerVideo({ pedido: "Sin voz", voz: "   " });
    expect(vacia.peticionVoz).toBeUndefined();
    expect(vacia.siguiente).toBe("render");
  });
});

describe("acción de agente video.componer", () => {
  it("compone sin molécula abierta y devuelve la composición con su siguiente paso", () => {
    const r = manejarAccionProtomolecula({ accion: "video.componer", pedido: "Un vídeo de bienvenida" });
    expect(r.ok).toBe(true);
    expect(r.message).toContain("Compuse la composición");
    expect(r.message).toContain("renderizarla en la malla");
    expect(r.message).toContain('data-no-timeline');
    expect(r.message).not.toMatch(/gsap/i);
    expect(r.status).toBe("Componiendo vídeo…");
  });

  it("si hay narración la pide a la puerta única y pasa por lint", () => {
    const r = manejarAccionProtomolecula({ accion: "video.componer", pedido: "Anuncio", voz: { texto: "Escucha esto.", persona: "aurora" } });
    expect(r.ok).toBe(true);
    expect(r.message).toContain("validarla con lint");
    expect(r.message).toContain("Pedí la narración a la puerta única de voz");
    expect(r.message).toContain("(13 caracteres)");
  });

  it("sin pedido no inventa una composición", () => {
    const r = manejarAccionProtomolecula({ accion: "video.componer" });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Falta «pedido»");
  });
});
