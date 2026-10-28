/** CNX1020A · pruebas de `servicios-a1`: los cinco servicios del A1, cada medio del OS (§11) y las variables. */
import { describe, expect, it } from "vitest";
import type { MedioOs, ServicioA1 } from "../servicios-a1";
import { SERVICIOS_A1, TUNEL_SERVICIOS_A1, VARIABLE_URL_POR_SERVICIO, esperaFria, urlPorDefecto } from "../servicios-a1";

const SERVICIOS: ServicioA1[] = ["libretranslate", "stirling-pdf", "archivebox", "comfyui", "openhands-agent-server"];

describe("SERVICIOS_A1 · instalado y medido el 2026-10-20", () => {
  it("declara exactamente los cinco servicios del A1", () => {
    expect(Object.keys(SERVICIOS_A1).sort()).toEqual([...SERVICIOS].sort());
  });

  it("LibreTranslate llega por el 5100 porque en la Mac el 5000 es de AirPlay", () => {
    const l = SERVICIOS_A1.libretranslate;
    expect(l).toMatchObject({
      version: "1.9.6",
      urlTunel: "http://127.0.0.1:5100",
      puertos: { a1: 5000, mac: 5100 },
      ramMedida: "711 MiB",
    });
    expect(l.detalle).toContain("AirPlay");
  });

  it("todas las direcciones son 127.0.0.1, nunca otra máquina", () => {
    for (const s of SERVICIOS) {
      expect(SERVICIOS_A1[s].urlTunel.startsWith("http://127.0.0.1:")).toBe(true);
      expect(SERVICIOS_A1[s].instalado).toBe("2026-10-20");
    }
    expect(TUNEL_SERVICIOS_A1).toBe("com.starseed.tunel-servicios-a1");
  });
});

describe("urlPorDefecto · cada medio del OS", () => {
  const ESPERADAS: Record<ServicioA1, string> = {
    libretranslate: "http://127.0.0.1:5100",
    "stirling-pdf": "http://127.0.0.1:8180",
    archivebox: "http://127.0.0.1:8001",
    comfyui: "http://127.0.0.1:8188",
    "openhands-agent-server": "http://127.0.0.1:8010",
  };

  it("localhost y la app nativa de la Mac reciben la dirección del túnel", () => {
    for (const medio of ["localhost", "app-nativa-mac"] as MedioOs[]) {
      for (const s of SERVICIOS) {
        const r = urlPorDefecto(s, medio);
        expect(r).toMatchObject({ url: ESPERADAS[s], fuente: "tunel", motivo: expect.stringContaining("túnel") });
      }
    }
  });

  it("una página https no puede llamar a 127.0.0.1", () => {
    expect(urlPorDefecto("libretranslate", "https")).toMatchObject({
      url: null,
      fuente: "medio",
      motivo: expect.stringContaining("https"),
    });
  });

  it("http en otra máquina tampoco, con su motivo", () => {
    expect(urlPorDefecto("stirling-pdf", "http-remoto")).toMatchObject({
      url: null,
      fuente: "medio",
      motivo: expect.stringContaining("otra máquina"),
    });
  });

  it("medio sin identificar: no se promete nada", () => {
    const r = urlPorDefecto("comfyui", "otros");
    expect(r).toMatchObject({ url: null, fuente: "medio", motivo: expect.any(String) });
  });
});

describe("urlPorDefecto · prioridad de las variables", () => {
  it("COMFYUI_URL manda sobre la del túnel en localhost", () => {
    expect(urlPorDefecto("comfyui", "localhost", { COMFYUI_URL: "http://127.0.0.1:9999" })).toEqual({
      url: "http://127.0.0.1:9999",
      motivo: "COMFYUI_URL manda",
      fuente: "variable",
    });
    expect(urlPorDefecto("libretranslate", "app-nativa-mac", { LIBRETRANSLATE_URL: "http://127.0.0.1:5101" }).url).toBe(
      "http://127.0.0.1:5101",
    );
  });

  it("los nombres de las variables son los del contrato; una variable vacía no manda", () => {
    expect(VARIABLE_URL_POR_SERVICIO).toMatchObject({
      comfyui: "COMFYUI_URL",
      libretranslate: "LIBRETRANSLATE_URL",
      "stirling-pdf": "STIRLING_PDF_URL",
      archivebox: "ARCHIVEBOX_URL",
      "openhands-agent-server": "OPENHANDS_AGENT_SERVER_URL",
    });
    expect(urlPorDefecto("libretranslate", "localhost", { LIBRETRANSLATE_URL: "  " }).fuente).toBe("tunel");
  });
  it("una variable pública se respeta hasta en https; una que apunta al bucle, no", () => {
    expect(
      urlPorDefecto("stirling-pdf", "https", { STIRLING_PDF_URL: "https://pdf.example.org" }),
    ).toEqual({ url: "https://pdf.example.org", motivo: "STIRLING_PDF_URL manda", fuente: "variable" });
    const r = urlPorDefecto("archivebox", "https", { ARCHIVEBOX_URL: "http://127.0.0.1:8001" });
    expect(r).toMatchObject({ url: null, fuente: "medio", motivo: expect.stringContaining("ARCHIVEBOX_URL") });
  });
});

describe("esperaFria · la primera llamada bajo demanda", () => {
  it("Stirling-PDF 109 s en frío; OpenHands sano en 14 s", () => {
    expect(esperaFria("stirling-pdf")).toMatchObject({ segundos: 109, texto: expect.stringContaining("109") });
    expect(esperaFria("openhands-agent-server").segundos).toBe(14);
  });

  it("ComfyUI son 22 s más la carga del modelo", () => {
    expect(esperaFria("comfyui")).toMatchObject({ segundos: 22, texto: expect.stringContaining("modelo") });
  });

  it("lo no medido se dice como tal: LibreTranslate y ArchiveBox", () => {
    for (const s of ["libretranslate", "archivebox"] as ServicioA1[]) {
      expect(esperaFria(s)).toMatchObject({ segundos: null, texto: expect.stringContaining("sin medir") });
    }
  });
});
