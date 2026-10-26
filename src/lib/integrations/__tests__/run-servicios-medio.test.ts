/** CNX1020Ab · cableado de `servicios-a1` en el runner (§7): el medio decide si la dirección del túnel se promete. */
import { describe, expect, it } from "vitest";
import { medioActual, resolverEndpointServicio } from "../run";
import type { Contexto } from "@/lib/recursos/servicios-pesados";
import type { OfertaNeurona } from "@/lib/recursos/oferta";
import type { MedioOs } from "@/lib/servidores/servicios-a1";

const SIN_OFERTAS: OfertaNeurona[] = [];
const base: Contexto = { cuentaId: "yo" };

describe("resolverEndpointServicio con el medio (§7 del catálogo A1)", () => {
  it("en localhost el Stirling del A1 llega por el túnel, y avisa de sus 109 s en frío", () => {
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, base, "localhost");
    expect(r.endpoint).toBe("http://127.0.0.1:8180");
    expect(r.destino).toBe("capa-publica");
    expect(r.motivo).toContain("túnel com.starseed.tunel-servicios-a1");
    expect(r.motivo).toContain("109");
    expect(r.esperaFria).toMatchObject({ segundos: 109, texto: expect.stringContaining("109") });
  });

  it("en la app nativa de la Mac, OpenHands llega por el túnel (sano en 14 s)", () => {
    const r = resolverEndpointServicio("openhands", SIN_OFERTAS, base, "app-nativa-mac");
    expect(r.endpoint).toBe("http://127.0.0.1:8010");
    expect(r.esperaFria).toMatchObject({ segundos: 14, texto: expect.stringContaining("14") });
  });

  it("una página https no recibe el 127.0.0.1 del A1: sin URL y con su motivo", () => {
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, base, "https");
    expect(r.endpoint).toBeNull();
    expect(r.destino).toBe("capa-publica");
    expect(r.motivo).toContain("https");
    expect(r.motivo).toContain("Pero: ");
    expect(r.esperaFria).toBeUndefined();
  });

  it("en http en otra máquina o con medio sin identificar, tampoco", () => {
    for (const medio of ["http-remoto", "otros"] as MedioOs[]) {
      const r = resolverEndpointServicio("openhands", SIN_OFERTAS, base, medio);
      expect(r.endpoint).toBeNull();
      expect(r.motivo).toContain("Pero: ");
    }
  });

  it("la variable manda en medio local, y entonces no se anota espera en frío", () => {
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, base, "localhost", { STIRLING_PDF_URL: "http://127.0.0.1:9999" });
    expect(r.endpoint).toBe("http://127.0.0.1:9999");
    expect(r.motivo).toContain("STIRLING_PDF_URL manda");
    expect(r.esperaFria).toBeUndefined();
  });

  it("una variable pública se respeta incluso en https", () => {
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, base, "https", { STIRLING_PDF_URL: "https://pdf.example.org" });
    expect(r.endpoint).toBe("https://pdf.example.org");
    expect(r.motivo).toContain("STIRLING_PDF_URL manda");
  });

  it("una variable que apunta al bucle en un medio sin bucle se ignora y lo dice", () => {
    const r = resolverEndpointServicio("openhands", SIN_OFERTAS, base, "https", { OPENHANDS_AGENT_SERVER_URL: "http://127.0.0.1:8010" });
    expect(r.endpoint).toBeNull();
    expect(r.motivo).toContain("OPENHANDS_AGENT_SERVER_URL");
    expect(r.motivo).toContain("se ignora");
  });

  it("un conector que no es un servicio pesado sigue igual, con o sin medio", () => {
    const r = resolverEndpointServicio("searxng", SIN_OFERTAS, base, "localhost");
    expect(r.endpoint).toBeNull();
    expect(r.destino).toBe("conector-propio");
    expect(r.motivo).toContain("su endpoint propio");
  });

  it("sin medio declarado se mantiene la dirección como hasta ahora (colocación A1)", () => {
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, base);
    expect(r.endpoint).toBe("http://127.0.0.1:8180");
    expect(r.esperaFria).toBeUndefined();
  });
});

describe("medioActual · sin window (SSR/pruebas en node)", () => {
  it("no se sabe si 127.0.0.1 es alcanzable: «otros»", () => {
    expect(medioActual()).toBe("otros");
  });
});
