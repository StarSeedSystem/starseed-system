import { describe, expect, it } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  herramientaPorId,
} from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

/*
 * Fichas de modelos de imagen locales (IMG1011, verificadas el 2026-10-11, contrato
 * architecture/astraura-imagenes.md §1): diez fichas nuevas juntas, justo después de
 * la de `qwen-image`, más la actualización de `stable-diffusion-cpp`.
 * Sin red ni GPU: solo se consulta el dato del catálogo.
 */

const NUEVAS = [
  "sd15",
  "pixart-sigma",
  "sana-1600m",
  "sdxl",
  "sd35-medium",
  "sd35-large",
  "flux1-dev",
  "qwen-image-2.1",
  "krea-2",
  "sd-webui-forge",
] as const;

/** Fichas de imagen que YA existían antes de esta ola: no se duplican. */
const PREVIAS = ["comfyui", "invokeai", "a1111-webui", "stable-diffusion-cpp", "flux1-schnell", "qwen-image"];

const ids = CATALOGO_PROTOMOLECULA.map((h) => h.id);
const ficha = (id: string): HerramientaProto => {
  const h = herramientaPorId(id);
  expect(h, `falta la ficha ${id}`).toBeDefined();
  return h as HerramientaProto;
};

describe("colocación de las fichas nuevas", () => {
  it("las diez están, juntas, justo después de `qwen-image`", () => {
    const qi = ids.indexOf("qwen-image");
    expect(qi).toBeGreaterThanOrEqual(0);
    expect(ids.slice(qi + 1, qi + 1 + NUEVAS.length)).toEqual([...NUEVAS]);
  });

  it("ninguna id se repite y las previas no se duplican", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...NUEVAS, ...PREVIAS]) {
      expect(ids.filter((x) => x === id), id).toHaveLength(1);
    }
  });
});

describe("datos del contrato §1 en cada ficha nueva", () => {
  it("sd15: réplica de referencia y OpeNRAIL-M comercial responsable", () => {
    const h = ficha("sd15");
    expect(h.web).toBe("https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5");
    expect(h.licenciaPesos).toBe("CreativeML OpenRAIL-M");
    expect((h.avisos ?? []).join(" ")).toMatch(/runwayml/);
  });

  it("pixart-sigma y sdxl: OpenRAIL++ (uso comercial permitido)", () => {
    expect(ficha("pixart-sigma").licenciaPesos).toBe("OpenRAIL++");
    expect(ficha("sdxl").licenciaPesos).toBe("CreativeML OpenRAIL++-M");
  });

  it("sana-1600m: código en NVlabs/Sana y va SOLO por Diffusers", () => {
    const h = ficha("sana-1600m");
    expect(h.codigo).toBe("https://github.com/NVlabs/Sana");
    expect(h.licenciaPesos).toBe("Apache-2.0");
    expect(h.control.notas).toMatch(/Diffusers/);
    expect(h.descripcion).toMatch(/NO figura|no figura/);
  });

  it("sd35-medium y sd35-large: Stability AI Community License (condicionado, gated)", () => {
    for (const id of ["sd35-medium", "sd35-large"]) {
      const h = ficha(id);
      expect(h.licenciaPesos, id).toBe("Stability AI Community License");
      expect(h.descripcion, id).toMatch(/condicionad/i);
      expect((h.avisos ?? []).join(" "), id).toMatch(/gated|aceptar sus términos/i);
    }
  });

  it("flux1-dev: NO comercial, con nota de la GGUF city96/FLUX.1-dev-gguf", () => {
    const h = ficha("flux1-dev");
    expect(h.licenciaPesos).toBe("FLUX.1 [dev] Non-Commercial License");
    expect((h.avisos ?? []).join(" ")).toMatch(/city96\/FLUX\.1-dev-gguf/);
    expect((h.avisos ?? []).join(" ")).toMatch(/NO comercial|no comercial/i);
  });

  it("qwen-image-2.1: Qwen Research License, no comercial, datos del 2026-09-20", () => {
    const h = ficha("qwen-image-2.1");
    expect(h.licenciaPesos).toBe("Qwen Research License");
    expect(h.descripcion).toMatch(/2026-09-20/);
    expect(h.descripcion).toMatch(/10 (imágenes de )?referencia/);
    expect(h.descripcion.toLowerCase()).toMatch(/transparencia/);
    expect((h.avisos ?? []).join(" ")).toMatch(/licencia aparte/);
    expect((h.avisos ?? []).join(" ")).toMatch(/47 GB/);
  });

  it("krea-2: Community License, comercial solo de pago, gated, VRAM sin publicar", () => {
    const h = ficha("krea-2");
    expect(h.licencia).toBe("Apache-2.0");
    expect(h.licenciaPesos).toBe("Krea 2 Community License");
    const avisos = (h.avisos ?? []).join(" ");
    expect(avisos).toMatch(/licencia de pago/);
    expect(avisos).toMatch(/gated|aceptar sus términos/i);
    expect(avisos).toMatch(/VRAM sin publicar/);
  });

  it("sd-webui-forge: AGPL-3.0, estado de 2024, solo compatibilidad con la API de A1111", () => {
    const h = ficha("sd-webui-forge");
    expect(h.licencia).toBe("AGPL-3.0");
    expect(h.integracion).toBe("servicio-local"); // programa aparte, nunca enlazada
    expect(h.tipo).toBe("app");
    const avisos = (h.avisos ?? []).join(" ");
    expect(avisos).toMatch(/2024/);
    expect(avisos).toMatch(/solo compatibilidad/i);
    expect(h.control.notas).toMatch(/AUTOMATIC1111/);
  });

  it("las diez están verificadas el 2026-10-11 y ninguna pide nada a la red", () => {
    for (const id of NUEVAS) {
      const h = ficha(id);
      expect(h.verificado, id).toBe("2026-10-11");
      expect(h.categoria, id).toBe("ia-generativa");
      expect(JSON.stringify(h), id).not.toMatch(/sk-[A-Za-z0-9]{10}|ghp_|Bearer\s/);
    }
  });
});

describe("stable-diffusion-cpp actualizado", () => {
  it("lista los modelos que soporta y avisa de su RPC sin autenticación", () => {
    const h = ficha("stable-diffusion-cpp");
    const soporta = h.control.notas;
    for (const modelo of ["SD 1.5", "SDXL", "SD 3.5", "FLUX.1", "PixArt", "Qwen-Image", "Krea 2"]) {
      expect(soporta, modelo).toContain(modelo);
    }
    expect(soporta).toMatch(/Sana NO figura/);
    const avisos = (h.avisos ?? []).join(" ");
    expect(avisos).toMatch(/RPC/);
    expect(avisos).toMatch(/sin autenticación|no tiene autenticación/i);
    expect(avisos).toMatch(/malla privada/);
  });
});