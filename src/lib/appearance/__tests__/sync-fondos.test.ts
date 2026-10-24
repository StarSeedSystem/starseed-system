import { describe, it, expect } from "vitest";
import {
  camaraEnSet, destinosDeSet, paqueteParaNube, recursosPorReferencia,
  MAX_RECURSO_BYTES, type RecursoPorReferencia,
} from "../sync-fondos";
import type { SetFondo } from "../sets-fondo";
import type { BackgroundLayer, ShaderPreset } from "../background-layers";

/** Set mínimo válido, estilo de alcance-fondos.test.ts. */
const set = (over: Partial<SetFondo> = {}): SetFondo => ({
  formato: "starseed-fondo", version: 1, id: "set-a", nombre: "Prueba", autor: "Alex", licencias: [],
  base: null, capas: [], creado: "2026-10-24T10:00:00.000Z", ...over,
});

/** Capa shader con un componente (y sus children anidados, como deja sets-fondo). */
const shader = (components: Array<{ type: string; children?: unknown[] }>): BackgroundLayer =>
  ({ id: "s1", kind: "shader", visible: true, opacity: 1, blend: "normal", preset: { components } as ShaderPreset });

/** data: mínimo que pasa el filtro DATA_MEDIA (MIME real: image y video). */
const data = (tipo: "imagen" | "video"): string => `data:${tipo === "imagen" ? "image" : "video"}/png;base64,iVBORw0KGgo=`;

describe("sync-fondos · destinosDeSet (todas vs elegidas)", () => {
  const r = (set: SetFondo, alcance: "todas" | "elegidas", elegidas?: string[]) =>
    destinosDeSet({ set, alcance, neuronasPerfil: ["n1", "n2", "n2", "n3"], elegidas });

  it("«todas» llega al perfil entero (sin repetidos) y también a la nube", () => {
    const x = r(set(), "todas");
    expect(x).toMatchObject({ ok: true, camara: false, nube: true, neuronas: ["n1", "n2", "n3"] });
  });

  it("«elegidas» solo a las marcadas que SÍ son del perfil, y nunca a la nube", () => {
    const x = r(set(), "elegidas", ["n3", "ajena", "n1"]);
    expect(x).toMatchObject({ ok: true, nube: false, neuronas: ["n1", "n3"], camara: false });
    expect(x.ok && x.recursos).toEqual([]); // sin medios pesados: nada que mandar aparte
  });

  it("«elegidas» sin marco (o sin ninguna del perfil) es un error claro", () => {
    expect(r(set(), "elegidas")).toMatchObject({ ok: false, motivo: "sin neuronas elegidas" });
    expect(r(set(), "elegidas", ["ajena-1", "ajena-2"])).toMatchObject({ ok: true, neuronas: [] });
  });
});

describe("sync-fondos · un set con cámara nunca sale de la neurona del permiso", () => {
  it("WebcamTexture y ObjectTracker (anidados o no) disparan camaraEnSet", () => {
    expect(camaraEnSet(set({ capas: [shader([{ type: "WebcamTexture" }])] }))).toBe(true);
    expect(camaraEnSet(set({ capas: [shader([{ type: "Grain", children: [{ type: "ObjectTracker" }] }])] }))).toBe(true);
    expect(camaraEnSet(set({ capas: [shader([{ type: "Grain" }])] }))).toBe(false);
  });

  it("un texto «WebcamTexture» fuera de una capa shader no es una cámara", () => {
    const capa: BackgroundLayer = { id: "i1", kind: "imagen", visible: true, opacity: 1, blend: "normal", value: data("imagen") };
    expect(camaraEnSet(set({ capas: [capa] }))).toBe(false);
  });

  it("los destinos con cámara quedan vacíos: ni malla ni nube, tal y como se dió el permiso", () => {
    const x = destinosDeSet({ set: set({ capas: [shader([{ type: "ObjectTracker" }])] }), alcance: "todas", neuronasPerfil: ["n1", "n2"] });
    expect(x).toMatchObject({ ok: true, camara: true, nube: false, neuronas: [], recursos: [] });
  });
});

describe("sync-fondos · recursosPorReferencia (lo pesado por archivos-malla, jamás incrustado)", () => {
  const capasMedia: BackgroundLayer[] = [
    { id: "i1", kind: "imagen", visible: true, opacity: 1, blend: "normal", value: data("imagen") },
    { id: "v1", kind: "video", visible: true, opacity: 1, blend: "normal", value: data("video") },
    { id: "u1", kind: "imagen", visible: true, opacity: 1, blend: "normal", value: "starseed://library/fondo.webp" },
  ];

  it("cada data: de imagen/vídeo sale del JSON y deja su referencia", () => {
    const r = recursosPorReferencia(set({ capas: capasMedia }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const json = r.json;
    expect(json).not.toContain("data:image");
    expect(json).not.toContain("data:video");
    expect(json).toContain("local-archivos-malla://f0");
    expect(json).toContain("local-archivos-malla://f1");
    expect(json).not.toContain("local-archivos-malla://f2"); // la URL de Biblioteca se queda
    expect(r.recursos.map((x) => x.tipo)).toEqual(["imagen", "video"]);
    expect(r.recursos.every((x) => x.bytes > 0 && x.dataUrl.startsWith("data:"))).toBe(true);
  });

  it("el set de quien llama queda intacto (copia, nunca mutación)", () => {
    const s = set({ capas: capasMedia });
    recursosPorReferencia(s);
    expect(s.capas[0].value).toBe(data("imagen"));
  });

  it("un recurso por encima del tope (2 MB) se rechaza con motivo, no a medias", () => {
    const enorme = `data:image/png;base64,${"A".repeat(MAX_RECURSO_BYTES + 10)}`;
    const r = recursosPorReferencia(set({ capas: [
      { id: "x", kind: "imagen", visible: true, opacity: 1, blend: "normal", value: enorme },
    ] }));
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.motivo).toContain("más de 2 MB");
  });
});

describe("sync-fondos · paqueteParaNube pasa SIEMPRE por sanitizeForCloud", () => {
  it("empaqueta el set reducido con la clave de la cuenta y sin secretos", () => {
    const r = destinosDeSet({ set: set(), alcance: "todas", neuronasPerfil: ["n1"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const paquete = paqueteParaNube(r.json, r.recursos) as { set: string; recursos: RecursoPorReferencia[] };
    expect(JSON.stringify(paquete)).toContain("set-a");
    expect(Array.isArray(paquete.recursos)).toBe(true);
  });
});

