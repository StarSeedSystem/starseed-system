import { describe, it, expect, vi } from "vitest";
import { SERVICIOS_A1, urlPorDefecto, esperaFria, type ServicioA1 } from "../servicios-a1";

describe("SERVICIOS_A1", () => {
  it("contiene los cinco servicios instalados el 2026-10-20", () => {
    expect(Object.keys(SERVICIOS_A1)).toEqual(["libretranslate", "stirling-pdf", "archivebox", "comfyui", "openhands"]);
  });
  it("cada servicio tiene versión, puertos, RAM medida y arranque en frío", () => {
    for (const info of Object.values(SERVICIOS_A1)) {
      expect(info.nombre).toBeTruthy(); expect(info.version).toBeTruthy(); expect(info.puertoA1).toBeGreaterThan(0);
      expect(info.puertoMac).toBeGreaterThan(0); expect(info.ramMedida).toBeTruthy(); expect(info.arranqueEnFrioSegundos).toBeGreaterThan(0); expect(info.bajoDemanda).toBe(true);
    }
  });
  it("LibreTranslate usa puerto 5100 en la Mac (5000 es AirPlay)", () => {
    expect(SERVICIOS_A1.libretranslate.puertoA1).toBe(5000); expect(SERVICIOS_A1.libretranslate.puertoMac).toBe(5100);
  });
  it("Stirling-PDF usa el mismo puerto en A1 y Mac", () => {
    expect(SERVICIOS_A1["stirling-pdf"].puertoA1).toBe(8180); expect(SERVICIOS_A1["stirling-pdf"].puertoMac).toBe(8180);
  });
});

describe("urlPorDefecto", () => {
  const s: ServicioA1 = "libretranslate";
  it("devuelve la URL del túnel en localhost", () => { const r = urlPorDefecto(s, "localhost"); expect(r.url).toBe("http://127.0.0.1:5100"); expect(r.motivo).toContain("túnel"); });
  it("devuelve la URL del túnel en app-nativa-mac", () => { const r = urlPorDefecto(s, "app-nativa-mac"); expect(r.url).toBe("http://127.0.0.1:5100"); expect(r.motivo).toContain("túnel"); });
  it("devuelve null en https con motivo de contenido mixto", () => { const r = urlPorDefecto(s, "https"); expect(r.url).toBeNull(); expect(r.motivo).toContain("HTTPS"); });
  it("devuelve null en entorno desconocido", () => { const r = urlPorDefecto(s, "desconocido"); expect(r.url).toBeNull(); expect(r.motivo).toContain("desconocido"); });
  it("la variable de entorno tiene prioridad sobre el túnel", () => { vi.stubEnv("LIBRETRANSLATE_URL", "http://mi-servidor:9999"); expect(urlPorDefecto(s, "localhost").url).toBe("http://mi-servidor:9999"); vi.unstubAllEnvs(); });
  it("la variable de entorno tiene prioridad incluso en https", () => { vi.stubEnv("LIBRETRANSLATE_URL", "https://api.mi-servidor.com"); expect(urlPorDefecto(s, "https").url).toBe("https://api.mi-servidor.com"); vi.unstubAllEnvs(); });
  it("funciona para todos los servicios con sus variables", () => {
    const casos: Array<[ServicioA1, string, string]> = [["libretranslate", "LIBRETRANSLATE_URL", "http://lt:5000"], ["stirling-pdf", "STIRLING_PDF_URL", "http://sp:8180"], ["archivebox", "ARCHIVEBOX_URL", "http://ab:8001"], ["comfyui", "COMFYUI_URL", "http://cu:8188"], ["openhands", "OPENHANDS_URL", "http://oh:8010"]];
    for (const [svc, envVar, valor] of casos) { vi.stubEnv(envVar, valor); const r = urlPorDefecto(svc, "https"); expect(r.url).toBe(valor); expect(r.motivo).toContain(envVar); vi.unstubAllEnvs(); }
  });
});

describe("esperaFria", () => {
  it("Stirling-PDF: 109 s", () => expect(esperaFria("stirling-pdf")).toBe(109));
  it("ComfyUI: 22 + 30 = 52 s", () => expect(esperaFria("comfyui")).toBe(52));
  it("LibreTranslate: 3 s", () => expect(esperaFria("libretranslate")).toBe(3));
  it("ArchiveBox: 76 s", () => expect(esperaFria("archivebox")).toBe(76));
  it("OpenHands: 14 s", () => expect(esperaFria("openhands")).toBe(14));
});