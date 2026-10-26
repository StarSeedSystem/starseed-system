// Pruebas del adaptador de publicaciones y mensajes (estilos del editor).
// Sin red: las dependencias se inyectan (contrato §5).
import { describe, it, expect, beforeEach } from "vitest";
import { __resetRegistros, familiasRegistradas } from "../../familias";
import {
  crearAdaptadorPostEstilo,
  crearAdaptadorPostPlantilla,
  crearAdaptadorPostDecoracion,
  crearAdaptadorMensajeEditor,
  registrarAdaptadoresPublicaciones,
  validarPayloadPostEstilo,
  validarPayloadPostPlantilla,
  validarPayloadPostDecoracion,
  validarPayloadMensaje,
  type DepsPublicaciones,
  type PayloadPostEstilo,
  type PayloadPostPlantilla,
  type PayloadPostDecoracion,
  type PayloadMensajeEditor,
} from "../publicaciones";
import type { LayoutDoc } from "@/components/publish/layout-builder";

function estiloValido(): PayloadPostEstilo["estilo"] {
  return {
    fuente: "inter",
    tamano: 16,
    color: "#ffffff",
    colorMarco: "#7C5CFF",
    grosorMarco: 2,
    fondo: "violeta",
    animacionTexto: "aparecer",
    animacionFondo: "aurora",
    alineacion: "centro",
    negrita: true,
    cursiva: false,
  };
}

function layoutValido(): LayoutDoc {
  return {
    mode: "bloques",
    preset: "post",
    blocks: [
      {
        id: "blk-1",
        type: "texto",
        content: "Hola mundo",
        style: { fontSize: "md", align: "left", padding: "sm", radius: "sm" },
        history: [],
      },
    ],
    freeCode: { html: "", css: "", js: "" },
  };
}

function decoracionValida(): Record<string, unknown> {
  return { borde: "gradiente", particulas: true };
}

function depsCon(datos: {
  postEstilo?: Record<string, PayloadPostEstilo["estilo"]>;
  postPlantilla?: Record<string, LayoutDoc>;
  postDecoracion?: Record<string, Record<string, unknown>>;
  mensajeEstilo?: PayloadPostEstilo["estilo"] | null;
  mensajeLayout?: LayoutDoc | null;
} = {}): DepsPublicaciones {
  return {
    leerEstiloPost: (postId) => datos.postEstilo?.[postId] ?? null,
    leerPlantillaPost: (postId) => datos.postPlantilla?.[postId] ?? null,
    leerDecoracionPost: (postId) => datos.postDecoracion?.[postId] ?? null,
    leerEstiloMensaje: () => datos.mensajeEstilo ?? null,
    leerLayoutMensaje: () => datos.mensajeLayout ?? null,
  };
}

beforeEach(() => {
  __resetRegistros();
});

describe("adaptador de publicaciones y mensajes", () => {
  describe("validación de payloads", () => {
    it("acepta un estilo de publicación válido", () => {
      const r = validarPayloadPostEstilo({ estilo: estiloValido() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.estilo.fuente).toBe("inter");
    });

    it("acepta una plantilla de publicación válida", () => {
      const r = validarPayloadPostPlantilla({ plantilla: layoutValido() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.plantilla.mode).toBe("bloques");
    });

    it("acepta una decoración de publicación válida", () => {
      const r = validarPayloadPostDecoracion({ decoracion: decoracionValida() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.decoracion.borde).toBe("gradiente");
    });

    it("rechaza estilo con campos inválidos", () => {
      const estiloInvalido = Object.assign({ fuente: "inter" }, { campoInventado: "x" });
      const r = validarPayloadPostEstilo({ estilo: estiloInvalido });
      expect(r.ok).toBe(false);
    });

    it("rechaza plantilla con estructura inválida", () => {
      const r = validarPayloadPostPlantilla({ plantilla: { mode: "invalido" } });
      expect(r.ok).toBe(false);
    });

    it("acepta payload de mensaje con estilo y layout", () => {
      const r = validarPayloadMensaje({ estilo: estiloValido(), layout: layoutValido() });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.estilo.fuente).toBe("inter");
        expect(r.payload.layout?.mode).toBe("bloques");
      }
    });

    it("acepta payload de mensaje solo con estilo", () => {
      const r = validarPayloadMensaje({ estilo: estiloValido() });
      expect(r.ok).toBe(true);
    });

    it("rechaza mensaje sin estilo", () => {
      const r = validarPayloadMensaje({ layout: layoutValido() });
      expect(r.ok).toBe(false);
    });

    it("rechaza payload con secreto en el estilo", () => {
      const conSecreto = { ...estiloValido(), color: "sk-fake123def456ghi789" };
      const r = validarPayloadPostEstilo({ estilo: conSecreto });
      expect(r.ok).toBe(false);
    });
  });

  describe("captura de estilos de publicación", () => {
    it("captura el estilo activo de un post", () => {
      const estilo = estiloValido();
      const { deps } = { deps: depsCon({ postEstilo: { "post-1": estilo } }) };
      const adaptador = crearAdaptadorPostEstilo(deps);
      const capturado = adaptador.capturar("post:post-1#estilo");
      expect(capturado).toEqual({ estilo });
    });

    it("no captura si el post no tiene estilo", () => {
      const { deps } = { deps: depsCon({}) };
      const adaptador = crearAdaptadorPostEstilo(deps);
      expect(adaptador.capturar("post:post-1#estilo")).toBeNull();
    });

    it("no captura si la clave no es de estilo", () => {
      const estilo = estiloValido();
      const { deps } = { deps: depsCon({ postEstilo: { "post-1": estilo } }) };
      const adaptador = crearAdaptadorPostEstilo(deps);
      expect(adaptador.capturar("post:post-1#plantilla")).toBeNull();
      expect(adaptador.capturar("otra:clave")).toBeNull();
    });
  });

  describe("captura de plantillas de publicación", () => {
    it("captura la plantilla activa de un post", () => {
      const plantilla = layoutValido();
      const { deps } = { deps: depsCon({ postPlantilla: { "post-1": plantilla } }) };
      const adaptador = crearAdaptadorPostPlantilla(deps);
      const capturado = adaptador.capturar("post:post-1#plantilla");
      expect(capturado).toEqual({ plantilla });
    });

    it("no captura si el post no tiene plantilla", () => {
      const { deps } = { deps: depsCon({}) };
      const adaptador = crearAdaptadorPostPlantilla(deps);
      expect(adaptador.capturar("post:post-1#plantilla")).toBeNull();
    });
  });

  describe("captura de decoraciones de publicación", () => {
    it("captura la decoración activa de un post", () => {
      const decoracion = decoracionValida();
      const { deps } = { deps: depsCon({ postDecoracion: { "post-1": decoracion } }) };
      const adaptador = crearAdaptadorPostDecoracion(deps);
      const capturado = adaptador.capturar("post:post-1#decoracion");
      expect(capturado).toEqual({ decoracion });
    });
  });

  describe("captura del editor de mensajes", () => {
    it("captura estilo y layout del editor de mensajes", () => {
      const estilo = estiloValido();
      const layout = layoutValido();
      const { deps } = { deps: depsCon({ mensajeEstilo: estilo, mensajeLayout: layout }) };
      const adaptador = crearAdaptadorMensajeEditor(deps);
      const capturado = adaptador.capturar("mensaje:editor");
      expect(capturado).toEqual({ estilo, layout });
    });

    it("captura solo estilo si no hay layout", () => {
      const estilo = estiloValido();
      const { deps } = { deps: depsCon({ mensajeEstilo: estilo }) };
      const adaptador = crearAdaptadorMensajeEditor(deps);
      const capturado = adaptador.capturar("mensaje:editor");
      expect(capturado).toEqual({ estilo, layout: undefined });
    });

    it("no captura si no hay nada", () => {
      const { deps } = { deps: depsCon({}) };
      const adaptador = crearAdaptadorMensajeEditor(deps);
      expect(adaptador.capturar("mensaje:editor")).toBeNull();
    });

    it("no captura clave distinta", () => {
      const { deps } = { deps: depsCon({ mensajeEstilo: estiloValido() }) };
      const adaptador = crearAdaptadorMensajeEditor(deps);
      expect(adaptador.capturar("mensaje:otro")).toBeNull();
    });
  });

  describe("aplicar (no-op con deshacer vacío en este adaptador)", () => {
    it("aplicar valida y devuelve deshacer sin efecto", () => {
      const { deps } = { deps: depsCon({}) };
      const adaptador = crearAdaptadorPostEstilo(deps);
      const { deshacer } = adaptador.aplicar("post:x#estilo", { estilo: estiloValido() });
      expect(typeof deshacer).toBe("function");
      deshacer();
    });

    it("lanza si el payload no valida", () => {
      const { deps } = { deps: depsCon({}) };
      const adaptador = crearAdaptadorPostEstilo(deps);
      const estiloInvalido = Object.assign({ fuente: "inter" as const }, { campoInvalido: 1 });
      expect(() => adaptador.aplicar("post:x#estilo", { estilo: estiloInvalido })).toThrow();
    });
  });

  describe("registro en el registro común", () => {
    it("registra las cuatro familias", () => {
      registrarAdaptadoresPublicaciones(depsCon({}));
      expect(familiasRegistradas()).toEqual(expect.arrayContaining(["post", "mensaje"]));
    });
  });
});