import { describe, it, expect } from "vitest";
import { resolverEndpointServicio } from "../run";
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
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, base);
    expect(r.endpoint).toBe(`http://${SERVICIOS_INSTALADOS["stirling-pdf"]?.host}:${SERVICIOS_INSTALADOS["stirling-pdf"]?.puerto}`);
    expect(r.endpoint).toBe("http://127.0.0.1:8180");
    expect(r.destino).toBe("capa-publica");
    expect(r.motivo).toContain("bajo demanda");
    expect(r.motivo).toContain("15 min");
  });

  it("OpenHands sin ofertas se coloca en el A1 bajo demanda: 127.0.0.1:8010", () => {
    const r = resolverEndpointServicio("openhands", SIN_OFERTAS, base);
    expect(r.endpoint).toBe(`http://127.0.0.1:${SERVICIOS_INSTALADOS["openhands-agent-server"]?.puerto}`);
    expect(r.destino).toBe("capa-publica");
    for (const servicioId of ["libretranslate", "archivebox", "comfyui"] as ServicioId[]) {
      expect(SERVICIOS_INSTALADOS[servicioId]?.bajoDemanda).toBe(true);
    }
  });

  it("un conector que no respalda un servicio pesado sigue con su propio endpoint", () => {
    const r = resolverEndpointServicio("searxng", SIN_OFERTAS, base);
    expect(r.endpoint).toBeNull();
    expect(r.destino).toBe("conector-propio");
    expect(r.motivo).toContain("su endpoint propio");
  });

  it("lo privado nunca sale a una capa pública: sin URL y lo dice", () => {
    const privado: Contexto = { ...base, privado: true };
    const r = resolverEndpointServicio("stirling-pdf", SIN_OFERTAS, privado);
    expect(r.endpoint).toBeNull();
    expect(r.destino).toBe("ninguno");
    expect(r.motivo).toContain("privado");
  });

  it("si la colocación cae en una neurona de la cuenta, no inventa su URL", () => {
    const r = resolverEndpointServicio("stirling-pdf", [ofertaCuenta("nube1")], base);
    expect(r.endpoint).toBeNull();
    expect(r.destino).toBe("cuenta");
    expect(r.motivo).toContain("Stirling-PDF");
  });
});
