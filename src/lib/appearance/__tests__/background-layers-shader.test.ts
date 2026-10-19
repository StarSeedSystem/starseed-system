import { describe, it, expect } from "vitest";
import { normalizeLayers, migrateBackgroundLayers, BG_LAYERS_VERSION, createLayer } from "../background-layers";

describe("background-layers with shader and difusion", () => {
  it("should create a shader layer with default values", () => {
    const layer = createLayer("shader");
    expect(layer.kind).toBe("shader");
    expect(layer.name).toBe("Shader");
    expect(layer.blend).toBe("normal");
    expect(layer.opacity).toBe(1);
    expect(layer.preset).toBeUndefined();
    expect(layer.transform).toBeUndefined();
    expect(layer.mascara).toBeUndefined();
  });

  it("should create a difusion layer with default values", () => {
    const layer = createLayer("difusion");
    expect(layer.kind).toBe("difusion");
    expect(layer.name).toBe("Difuminado");
    expect(layer.blend).toBe("normal");
    expect(layer.opacity).toBe(0.5);
    expect(layer.difusion).toEqual({ modo: "transparente" });
    expect(layer.transform).toBeUndefined();
    expect(layer.mascara).toBeUndefined();
  });

  it("should normalize a layer with shader preset and transform", () => {
    const raw = [
      {
        id: "test1",
        kind: "shader",
        preset: { components: [], structureVersion: 1 },
        transform: { x: 0.1, y: -0.2, escala: 1.5, rotacion: 30, ancho: 0.8, alto: 0.6 },
        mascara: "radial",
        visible: true,
        opacity: 0.7,
        blend: "normal",
      },
    ];
    const layers = normalizeLayers(raw);
    expect(layers.length).toBe(1);
    const l = layers[0];
    expect(l.kind).toBe("shader");
    expect(l.preset).toEqual({ components: [], structureVersion: 1 });
    expect(l.transform).toEqual({ x: 0.1, y: -0.2, escala: 1.5, rotacion: 30, ancho: 0.8, alto: 0.6 });
    expect(l.mascara).toBe("radial");
    expect(l.opacity).toBe(0.7);
  });

  it("should normalize a layer with difusion values and clamp out-of-range", () => {
    const raw = [
      {
        id: "test2",
        kind: "difusion",
        difusion: {
          modo: "tono",
          tono: 400, // out of range -> clamp to 360
          desenfoquePx: 100, // out of range -> clamp to 80
          opacidad: 1.5, // out of range -> clamp to 1
          textura: "grano",
        },
        visible: true,
        opacity: 0.5,
        blend: "normal",
      },
    ];
    const layers = normalizeLayers(raw);
    expect(layers.length).toBe(1);
    const l = layers[0];
    expect(l.kind).toBe("difusion");
    expect(l.difusion).toEqual({
      modo: "tono",
      tono: 360,
      desenfoquePx: 80,
      opacidad: 1,
      textura: "grano",
    });
  });

  it("should normalize a layer with transform values and clamp out-of-range", () => {
    const raw = [
      {
        id: "test3",
        kind: "color",
        value: "#ff0000",
        transform: {
          x: -1, // out of range -> clamp to -0.5
          y: 2, // out of range -> clamp to 0.5
          escala: 0.05, // out of range -> clamp to 0.1
          rotacion: 500, // out of range -> clamp to 180 (but note: clamp to 180? actually -180 to 180, so 500 -> 180)
          ancho: 1.5, // out of range -> clamp to 1
          alto: -0.5, // out of range -> clamp to 0
        },
        mascara: "invalido", // invalid -> undefined
        visible: true,
        opacity: 0.5,
        blend: "normal",
      },
    ];
    const layers = normalizeLayers(raw);
    expect(layers.length).toBe(1);
    const l = layers[0];
    expect(l.kind).toBe("color");
    expect(l.transform).toEqual({
      x: -0.5,
      y: 0.5,
      escala: 0.1,
      rotacion: 180,
      ancho: 1,
      alto: 0,
    });
    expect(l.mascara).toBeUndefined();
  });

  it("should migrate an old config (version 0) to version 4 with new fields undefined", () => {
    const oldConfig = {
      type: "spline",
      layers: [
        {
          id: "old1",
          kind: "color",
          value: "#00ff00",
          visible: true,
          opacity: 0.5,
          blend: "normal",
        },
      ],
      layersVersion: 0,
    };
    const migrated = migrateBackgroundLayers(oldConfig);
    expect(migrated.layersVersion).toBe(BG_LAYERS_VERSION);
    expect(migrated.removedAudiomorphicGhost).toBe(false);
    expect(migrated.layers.length).toBe(1);
    const l = migrated.layers[0];
    expect(l.kind).toBe("color");
    // New fields should be undefined
    expect(l.preset).toBeUndefined();
    expect(l.difusion).toBeUndefined();
    expect(l.transform).toBeUndefined();
    expect(l.mascara).toBeUndefined();
  });

  it("should migrate an old audiomorphic config (version 1) to version 4 and remove ghost", () => {
    const oldConfig = {
      type: "audiomorphic",
      layersVersion: 1,
    };
    const migrated = migrateBackgroundLayers(oldConfig);
    expect(migrated.layersVersion).toBe(BG_LAYERS_VERSION);
    expect(migrated.removedAudiomorphicGhost).toBe(true);
    expect(migrated.type).toBe("spline"); // base engine
    expect(migrated.layers.length).toBe(1);
    const l = migrated.layers[0];
    expect(l.kind).toBe("audiomorphic");
    expect(l.visible).toBe(false); // should be disabled
    // New fields should be undefined
    expect(l.preset).toBeUndefined();
    expect(l.difusion).toBeUndefined();
    expect(l.transform).toBeUndefined();
    expect(l.mascara).toBeUndefined();
  });

  it("should preserve new fields when migrating a version 3 config (if they existed)", () => {
    // Simulate a version 3 config that already has the new fields (though unlikely)
    const oldConfig = {
      type: "spline",
      layersVersion: 3,
      layers: [
        {
          id: "new1",
          kind: "shader",
          preset: { components: [{ type: "test", id: "1", props: {} }] },
          transform: { x: 0.1, y: 0.1, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
          mascara: "ninguna",
          visible: true,
          opacity: 0.5,
          blend: "normal",
        },
      ],
    };
    const migrated = migrateBackgroundLayers(oldConfig);
    expect(migrated.layersVersion).toBe(BG_LAYERS_VERSION);
    expect(migrated.layers.length).toBe(1);
    const l = migrated.layers[0];
    expect(l.kind).toBe("shader");
    expect(l.preset).toEqual({ components: [{ type: "test", id: "1", props: {} }] });
    expect(l.transform).toEqual({ x: 0.1, y: 0.1, escala: 1, rotacion: 0, ancho: 1, alto: 1 });
    expect(l.mascara).toBe("ninguna");
  });
});