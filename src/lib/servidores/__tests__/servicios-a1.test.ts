// Pruebas de servicios-a1 (CNX1020A): puros, sin red ni disco. Cada medio del
// OS y la prioridad de las variables de entorno, contra §7 del SOP
// repos-libreria-1020d.md (las medidas del 2026-10-20).
import { describe, expect, it } from "vitest";
import {
  VARIABLES_ENTORNO, TUNEL_SERVICIOS_A1, esperaFria, infoServicioA1,
  urlPorDefecto, type ServicioA1,
} from "@/lib/servidores/servicios-a1";

const SERVICIOS: ServicioA1[] = [
  "libretranslate", "stirling-pdf", "archivebox", "comfyui", "openhands-agent",
];

describe("catálogo medido (SOP §7)", () => {
  it("da una ficha con versión, puertos y RAM por cada servicio", () => {
    for (const s of SERVICIOS) {
      const info = infoServicioA1(s);
      expect(info.version).toBeTruthy();
      expect(info.urlA1).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(info.urlMac).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(info.memoriaNecesariaMb).toBeGreaterThan(0);
    }
  });

  it("LibreTranslate cambia de puerto al cruzar la Mac (5000 es AirPlay)", () => {
    const info = infoServicioA1("libretranslate");
    expect(info.puertoA1).toBe(5000);
    expect(info.puertoMac).toBe(5100);
    expect(info.urlMac).toBe("http://127.0.0.1:5100");
  });

  it("los demás servicios guardan su puerto entre A1 y Mac", () => {
    for (const s of SERVICIOS.slice(1)) {
      const info = infoServicioA1(s);
      expect(info.puertoMac).toBe(info.puertoA1);
      expect(info.urlMac).toBe(info.urlA1);
    }
  });

  it("nombra el túnel y las cinco variables de entorno", () => {
    expect(TUNEL_SERVICIOS_A1).toBe("com.starseed.tunel-servicios-a1");
    expect(VARIABLES_ENTORNO.comfyui).toBe("COMFYUI_URL");
    expect(VARIABLES_ENTORNO.libretranslate).toBe("LIBRETRANSLATE_URL");
    expect(VARIABLES_ENTORNO["stirling-pdf"]).toBe("STIRLING_PDF_URL");
    expect(VARIABLES_ENTORNO.archivebox).toBe("ARCHIVEBOX_URL");
    expect(VARIABLES_ENTORNO["openhands-agent"]).toBe("OPENHANDS_AGENT_URL");
  });

  it("da una espera fría para cada servicio y las cifras del §7", () => {
    expect(esperaFria("stirling-pdf").segundos).toBe(109);
    expect(esperaFria("stirling-pdf").medido).toBe(true);
    expect(esperaFria("comfyui").segundos).toBe(22);
    expect(esperaFria("comfyui").detalle).toContain("SD 1.5");
    for (const s of SERVICIOS) {
      expect(esperaFria(s).detalle.length).toBeGreaterThan(5);
    }
  });
});

describe("urlPorDefecto por medio", () => {
  it("en localhost y app nativa de la Mac da la URL del túnel, con su origen", () => {
    for (const entorno of ["localhost", "nativa-mac"] as const) {
      for (const s of SERVICIOS) {
        const r = urlPorDefecto(s, entorno);
        expect(r.url).toBe(infoServicioA1(s).urlMac);
        expect(r.origen).toBe("tunel-a1");
        expect(r.motivo).toContain("com.starseed.tunel-servicios-a1");
      }
    }
  });

  it("en páginas https (túnel y nube) da null con motivo de contenido mixto", () => {
    for (const entorno of ["tunel-https", "nube-https"] as const) {
      for (const s of SERVICIOS) {
        const r = urlPorDefecto(s, entorno);
        expect(r.url).toBeNull();
        expect(r.origen).toBeNull();
        expect(r.motivo).toContain("https");
      }
    }
  });

  it("en otro http ajeno a la Mac da null: 127.0.0.1 no es la Mac", () => {
    for (const s of SERVICIOS) {
      const r = urlPorDefecto(s, "otro-http");
      expect(r.url).toBeNull();
      expect(r.motivo).toContain("no la Mac");
    }
  });
});

describe("prioridad de las variables de entorno", () => {
  it("la variable manda en cualquier medio, incluso en https", () => {
    const r = urlPorDefecto("comfyui", "nube-https", { comfyui: "http://192.168.1.50:8188" });
    expect(r.url).toBe("http://192.168.1.50:8188");
    expect(r.origen).toBe("variable-de-entorno");
    expect(r.motivo).toContain("COMFYUI_URL");
  });

  it("en Mac, la variable anula la URL del túnel", () => {
    const r = urlPorDefecto("libretranslate", "localhost", {
      libretranslate: "http://127.0.0.1:9200",
    });
    expect(r.url).toBe("http://127.0.0.1:9200");
    expect(r.origen).toBe("variable-de-entorno");
  });

  it("con otra variable definida pero no la del servicio, usa el medio", () => {
    const r = urlPorDefecto("comfyui", "localhost", {
      libretranslate: "http://127.0.0.1:9200",
    });
    expect(r.url).toBe(infoServicioA1("comfyui").urlMac);
    expect(r.origen).toBe("tunel-a1");
  });

  it("una variable vacía (o de espacios) no manda", () => {
    const r = urlPorDefecto("comfyui", "localhost", { comfyui: "   " });
    expect(r.url).toBe(infoServicioA1("comfyui").urlMac);
  });
});
