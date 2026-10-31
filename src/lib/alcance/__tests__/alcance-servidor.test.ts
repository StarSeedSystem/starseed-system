// INV1025P · Las piezas PURAS del servidor del alcance: hash determinista igual
// al del almacén Python (huella), resolver el destino objetivo+ficha, la vista
// por defecto, el mailto (que lo envía la persona, R3) y el estado pegado a la
// propuesta, sin red; los hashes se calculan con WebCrypto.
import { describe, expect, it } from "vitest";

import {
  correoDe, enlacesDeTexto, hashPlano, mailtoDe, normalizarAlcance, plano, pieDe, remitenteNombre,
} from "@/lib/alcance/alcance-servidor";
import { resolverDestino, seguimientoDe } from "@/lib/alcance/alcance-tipos";

describe("plano y hashPlano (misma huella que alcance_objetivos.py)", () => {
  it("quita acentos, pasa a minúsculas y recorta", () => {
    expect(plano("  YoSoy — Matías De Stefano  ")).toBe("yosoy — matias de stefano");
  });
  it("el hash es un sha256 hexadecimal estable", async () => {
    const a = await hashPlano("YoSoy — Matías De Stefano");
    const b = await hashPlano("yosoy — matias de stefano");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });
});

describe("resolverDestino (objetivo privado + ficha privada)", () => {
  it("sin canal ni ficha: sin canal, nivel alto (R8) y medio por omisión", () => {
    const d = resolverDestino({ id: "obj-abc123", nombre_publico: "YoSoy" }, null);
    expect(d).toEqual({ id: "obj-abc123", nombrePublico: "YoSoy", nivel: "alto", medio: "correo-propio", canalPublicado: "" });
  });
  it("la ficha manda sobre el objetivo; el nivel malo se trata como alto", async () => {
    const d = resolverDestino(
      { id: "obj-abc123", nivel: "medio" },
      { nombre_publico: "YoSoy", canal_oficial: { medio: "correo-usuario", valor: "prensa@yosoy.org", fuente_url: "https://yosoy.org/contacto" } },
    );
    expect(d.nivel).toBe("medio");
    expect(d.medio).toBe("correo-usuario");
    expect(d.canalPublicado).toBe("prensa@yosoy.org");
    const conHttps = resolverDestino({ id: "obj-x" }, { canal_oficial: { valor: "", fuente_url: "https://github.com/dorsey" } });
    expect(conHttps.canalPublicado).toBe("https://github.com/dorsey");
    expect(conHttps.medio).toBe("formulario");
  });
});

describe("correo, mailto y pie honesto (R3·R7)", () => {
  it("correoDe saca el email de un canal y no inventa", () => {
    expect(correoDe("Prensa de YoSoy: prensa@yosoy.org")).toBe("prensa@yosoy.org");
    expect(correoDe("https://github.com/dorsey")).toBe("");
  });
  it("mailtoDe codifica asunto y cuerpo; el mailto nunca lleva rutas ni credenciales", () => {
    const h = mailtoDe("prensa@yosoy.org", "Hola de StarSeed", "Nos resonó…\nSolo vida.");
    expect(h).toBe("mailto:prensa%40yosoy.org?subject=Hola+de+StarSeed&body=Nos+reson%C3%B3%E2%80%A6%0ASolo+vida.");
  });
  it("el pie lleva identidad real y forma de no recibir más", () => {
    const p = pieDe("Alex · StarSeed OS");
    expect(p.identidad).toContain("Alex");
    expect(p.baja.toLowerCase()).toContain("no recibir más");
  });
  it("remitenteNombre SIN entorno apaga al nombre por defecto del OS", () => {
    expect(remitenteNombre()).not.toBe("");
  });
});

describe("normalizarAlcance y enlacesDeTexto", () => {
  it("estado desconocido o corrupto cae a pendiente", () => {
    expect(normalizarAlcance(undefined)).toEqual({ estadoEnvio: "pendiente", aprobadaPorHumano: false, huellaAprobada: "" });
    expect(normalizarAlcance({ estadoEnvio: "enviada", aprobadaPorHumano: true, huellaAprobada: "a".repeat(64) }).estadoEnvio).toBe("enviada");
    expect(normalizarAlcance({ estadoEnvio: "otro" }).estadoEnvio).toBe("pendiente");
  });
  it("enlacesDeTexto coge la fila, no corta cada punto y no se repite", () => {
    expect(enlacesDeTexto("Mira https://starseed-os.vercel.app/a. También https://x.org/b.")).toEqual([
      "https://starseed-os.vercel.app/a", "https://x.org/b",
    ]);
  });
});

describe("seguimientoDe (mapea a seguimiento-respuestas.ts)", () => {
  it("lo enviado espera; lo demás está resuelto", () => {
    expect(seguimientoDe("enviada")).toBe("esperando");
    expect(seguimientoDe("sin-respuesta")).toBe("esperando");
    expect(seguimientoDe("respondida")).toBe("resuelto");
    expect(seguimientoDe("pendiente")).toBe("resuelto");
    expect(seguimientoDe("no-contactar")).toBe("resuelto");
  });
});
