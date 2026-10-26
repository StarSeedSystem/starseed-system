import { describe, it, expect } from "vitest";
import { resolverEndpointServicio, conEsperaFria, medioOsDe } from "../run";
import type { IntegrationResult } from "../types";
import type { Contexto, ServicioId } from "@/lib/recursos/servicios-pesados";
import { SERVICIOS_INSTALADOS } from "@/lib/recursos/servicios-pesados";
import type { OfertaNeurona } from "@/lib/recursos/oferta";

const SIN_OFERTAS: OfertaNeurona[] = [];

const ofertaCuenta = (nodoId: string): OfertaNeurona => ({
  nodoId,
  cuentaId: "yo",
  medio: "wifi",
  computo: { nucleos: 8, ramLibreMb: 8192, gpu: false, vramMb: undefined, motores: [] },
  almacen: { prestaMb: 10000, volumenes: [] },
  apps: [],
  enlaces: {},
  energia: { enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 8192, discoMb: 10000, soloCargando: false } },
  t: new Date(2026, 9, 20, 10, 0, 0).getTime(),
});

const base: Contexto = { cuentaId: "yo" };

describe("endpoint por colocación del servicio pesado (PES1020Ac)", () => {
  it("sin ofertas, Stirling-PDF cae en la capa pública siempre encendida: 127.0.0.1:8180", () => {
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, base, { medio: "localhost" });
    expect(r.endpoint).toBe(`http://${SERVICIOS_INSTALADOS["stirling-pdf"]?.host}:${SERVICIOS_INSTALADOS["stirling-pdf"]?.puerto}`);
    expect(r.endpoint).toBe("http://127.0.0.1:8180");
    expect(r.destino).toBe("capa-publica");
    expect(r.motivo).toContain("bajo demanda");
    expect(r.motivo).toContain("15 min");
    expect(r.esperaFria).toMatchObject({ segundos: 109 });
  });

  it("OpenHands sin ofertas se coloca en el A1 bajo demanda: 127.0.0.1:8010", () => {
    const r = resolverEndpointServicio("openhands", SIN_OFERTAS, base, { medio: "localhost" });
    expect(r.endpoint).toBe(`http://127.0.0.1:${SERVICIOS_INSTALADOS["openhands-agent-server"]?.puerto}`);
    expect(r.endpoint).toBe("http://127.0.0.1:8010");
    expect(r.destino).toBe("capa-publica");
    expect(r.esperaFria).toMatchObject({ segundos: 14 });
    for (const servicioId of ["libretranslate", "archivebox", "comfyui"] as ServicioId[]) {
      expect(SERVICIOS_INSTALADOS[servicioId]?.bajoDemanda).toBe(true);
    }
  });

  it("un conector que no respalda un servicio pesado sigue con su propio endpoint", () => {
    const r = resolverEndpointServicio("searxng", SIN_OFERTAS, base);
    expect(r.endpoint).toBeNull();
    expect(r.destino).toBe("conector-propio");
    expect(r.motivo).toContain("su endpoint propio");
    expect(r.esperaFria).toBeNull();
  });

  it("lo privado nunca sale a una capa pública: sin URL y lo dice", () => {
    const privado: Contexto = { ...base, privado: true };
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, privado);
    expect(r.endpoint).toBeNull();
    expect(r.destino).toBe("ninguno");
    expect(r.motivo).toContain("privado");
    expect(r.esperaFria).toBeNull();
  });

  it("si la colocación cae en una neurona de la cuenta, no inventa su URL", () => {
    const r = resolverEndpointServicio("stirling-pdf", [ofertaCuenta("nube1")], base);
    expect(r.endpoint).toBeNull();
    expect(r.destino).toBe("cuenta");
    expect(r.motivo).toContain("Stirling-PDF");
  });
});

describe("endpoint por medio del OS (CNX1020A: urlPorDefecto aplicado al conector)", () => {
  it("localhost recibe la dirección del túnel del A1", () => {
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, base, { medio: "localhost" });
    expect(r.endpoint).toBe("http://127.0.0.1:8180");
  });

  it("la app nativa de la Mac también alcanza 127.0.0.1", () => {
    const r = resolverEndpointServicio("openhands", SIN_OFERTAS, base, { medio: "app-nativa-mac" });
    expect(r.endpoint).toBe("http://127.0.0.1:8010");
  });

  it("una página https NO recibe 127.0.0.1: endpoint null y el motivo lo dice", () => {
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, base, { medio: "https" });
    expect(r.endpoint).toBeNull();
    expect(r.motivo).toContain("https");
    expect(r.motivo).toContain("Stirling-PDF");
  });

  it("un medio http remoto tampoco alcanza el túnel de la Mac", () => {
    const r = resolverEndpointServicio("openhands", SIN_OFERTAS, base, { medio: "http-remoto" });
    expect(r.endpoint).toBeNull();
    expect(r.motivo).toContain("túnel");
  });

  it("la variable STIRLING_PDF_URL manda sobre la dirección del túnel", () => {
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, base, {
      medio: "localhost",
      variables: { STIRLING_PDF_URL: "https://pdf.cerebro.internal" },
    });
    expect(r.endpoint).toBe("https://pdf.cerebro.internal");
  });
});

describe("medioOsDe · el medio OS se deduce de la ventana (puro)", () => {
  it("sin ventana (servidor, pruebas) es «otros»: no se promete el 127.0.0.1", () => {
    expect(medioOsDe(undefined)).toBe("otros");
  });

  it("la app nativa (Tauri) es «app-nativa-mac» aunque su página venga por https", () => {
    expect(medioOsDe({ tauri: true, protocolo: "https:", host: "starseed-os.vercel.app" })).toBe("app-nativa-mac");
  });

  it("navegador local «localhost», https remoto «https» y el resto «http-remoto»", () => {
    expect(medioOsDe({ tauri: false, protocolo: "http:", host: "localhost:9002" })).toBe("localhost");
    expect(medioOsDe({ tauri: false, protocolo: "http:", host: "127.0.0.1:9002" })).toBe("localhost");
    expect(medioOsDe({ tauri: false, protocolo: "https:", host: "starseed-os.vercel.app" })).toBe("https");
    expect(medioOsDe({ tauri: false, protocolo: "http:", host: "192.168.1.20:9002" })).toBe("http-remoto");
  });
});

describe("conEsperaFria · el servicio bajo demanda no se da por caído en su primera llamada", () => {
  const frío = (error: string): IntegrationResult => ({ ok: false, error });

  it("un fallo de tiempo canta cuánto puede tardar el arranque en frío", () => {
    const r = conEsperaFria("stirling-pdf", frío("Tiempo de espera agotado (10 000 ms)."));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("109 s");
    expect(r.error).toContain("no lo des por caído");
  });

  it("OpenHands canta sus 14 s hasta estar sano", () => {
    const r = conEsperaFria("openhands", frío("Tiempo de espera agotado."));
    expect(r.error).toContain("14 s");
  });

  it("lo que no es fallo de tiempo (o no respalda un servicio del A1) no se toca", () => {
    const sinConfig = frío("no configurado");
    expect(conEsperaFria("searxng", sinConfig)).toBe(sinConfig);
    const httpError = frío("respondió 404");
    expect(conEsperaFria("stirling-pdf", httpError)).toBe(httpError);
    const bien: IntegrationResult = { ok: true, data: { vivo: true } };
    expect(conEsperaFria("stirling-pdf", bien)).toBe(bien);
  });
});
