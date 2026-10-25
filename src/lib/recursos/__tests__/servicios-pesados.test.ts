import { describe, it, expect } from "vitest";
import { CAPAS_PUBLICAS_CONOCIDAS, REQUISITOS_SERVICIO, SERVICIOS_INSTALADOS, colocarServicio } from "../servicios-pesados";
import type { Contexto, RequisitosServicio } from "../servicios-pesados";
import type { OfertaNeurona } from "../oferta";

const oferta = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "n1", cuentaId: "yo", medio: "wifi",
  computo: { nucleos: 8, ramLibreMb: 8192, gpu: false, vramMb: undefined, motores: [] },
  almacen: { prestaMb: 10000, volumenes: [] }, apps: [], enlaces: {}, energia: { enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 8192, discoMb: 10000, soloCargando: false } },
  t: new Date(2026, 9, 20, 10, 0, 0).getTime(), ...o,
});
const ctx = (c: Partial<Contexto> = {}): Contexto => ({ cuentaId: "yo", ...c });
const publica = (nodoId: string): OfertaNeurona => oferta({ nodoId, cuentaId: "otra", presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 100, ramMb: 8192, discoMb: 0, soloCargando: false } } });

describe("catálogo verificado", () => {
  it("declara los seis servicios con los datos del catálogo", () => {
    expect(Object.keys(REQUISITOS_SERVICIO).sort()).toEqual(["archivebox", "comfyui", "coolify", "libretranslate", "openhands-agent-server", "stirling-pdf"]);
    expect(REQUISITOS_SERVICIO.comfyui).toMatchObject({ ram_gb: 8, vram_gb: 4, gpu: "recomendada" });
    expect(REQUISITOS_SERVICIO.libretranslate).toMatchObject({ ram_gb: null, ramMedidaMb: 711 });
    expect(REQUISITOS_SERVICIO["stirling-pdf"].ramMedidaMb).toBe(1434);
    expect(REQUISITOS_SERVICIO.archivebox.ramMedidaMb).toBeNull();
  });
  it("instala cinco servicios del A1 en 127.0.0.1 bajo demanda", () => {
    expect(SERVICIOS_INSTALADOS.libretranslate?.puerto).toBe(5000);
    expect(SERVICIOS_INSTALADOS["stirling-pdf"]?.puerto).toBe(8180);
    expect(SERVICIOS_INSTALADOS.archivebox?.puerto).toBe(8001);
    expect(SERVICIOS_INSTALADOS.comfyui?.puerto).toBe(8188);
    expect(SERVICIOS_INSTALADOS["openhands-agent-server"]?.puerto).toBe(8010);
    expect(SERVICIOS_INSTALADOS.coolify).toBeUndefined();
    for (const s of Object.values(SERVICIOS_INSTALADOS)) expect([s?.host, s?.apagaSinUsoMin]).toEqual(["127.0.0.1", 15]);
  });
  it("conoce las capas públicas y su estado", () => {
    expect(CAPAS_PUBLICAS_CONOCIDAS.find((c) => c.id === "oracle-a1")).toMatchObject({ estado: "activa", ramMb: 12288, arquitectura: "arm64", gpu: false });
    expect(CAPAS_PUBLICAS_CONOCIDAS.find((c) => c.id === "cloud-run")?.estado).toBe("inactiva");
    expect(CAPAS_PUBLICAS_CONOCIDAS.find((c) => c.id === "espacios-hf")?.estado).toBe("con-permiso");
  });
});
describe("orden de colocación", () => {
  it("prefiere el aparato y deja respaldo en la cuenta", () => {
    const r = colocarServicio("libretranslate", [oferta({ nodoId: "mac" }), oferta({ nodoId: "nube" })], ctx({ aparatoId: "mac" }));
    expect(r.donde).toEqual({ tipo: "aparato", id: "mac" });
    expect(r.motivo).toContain("127.0.0.1:5000");
    expect(r.respaldo).toEqual({ tipo: "cuenta", id: "nube" });
  });
  it("nunca usa el aparato con el enjambre escribiendo o la memoria en aviso", () => {
    const enjambre = colocarServicio("libretranslate", [oferta({ nodoId: "mac" })], ctx({ aparatoId: "mac", enjambreEscribiendo: true }));
    expect(enjambre.donde.tipo).not.toBe("aparato");
    expect(enjambre.falta.join(" ")).toContain("enjambre");
    const presion = colocarServicio("libretranslate", [oferta({ nodoId: "mac" })], ctx({ aparatoId: "mac", presionMemoria: "aviso" }));
    expect(presion.donde.tipo).not.toBe("aparato");
    expect(presion.falta.join(" ")).toContain("presión de memoria");
  });
  it("respeta el orden cuenta, cerebro, malla y capa pública", () => {
    const r = colocarServicio("libretranslate", [publica("cerebro"), publica("vecino")], ctx({ servidoresCerebro: ["cerebro"] }));
    expect(r.donde).toEqual({ tipo: "cerebro", id: "cerebro" });
    expect(r.respaldo).toEqual({ tipo: "malla", id: "vecino" });
    expect(colocarServicio("libretranslate", [], ctx()).donde).toEqual({ tipo: "capa-publica", id: "oracle-a1" });
  });
});
describe("privacidad", () => {
  it("lo privado no sale a la malla ni a una capa pública", () => {
    const r = colocarServicio("libretranslate", [publica("vecino")], ctx({ privado: true }));
    expect(r.donde.tipo).toBe("ninguno");
    expect(r.falta.join(" ")).toContain("privado");
  });
  it("lo privado sí cabe en la cuenta", () => {
    expect(colocarServicio("libretranslate", [oferta({ nodoId: "mia" })], ctx({ privado: true })).donde).toEqual({ tipo: "cuenta", id: "mia" });
  });
});
describe("arquitectura y RAM sin medir", () => {
  it("no coloca donde la arquitectura no está verificada", () => {
    const soloAmd64: RequisitosServicio = { ...REQUISITOS_SERVICIO.libretranslate, arquitecturas: ["amd64"] };
    const r = colocarServicio(soloAmd64, [], ctx());
    expect(r.donde.tipo).toBe("ninguno");
    expect(r.falta).toContain("medir arm64 en el A1");
  });
  it("una RAM sin medir exige oferta medida y se anota «a medir»", () => {
    const o = oferta({ nodoId: "nube1" });
    const sin = colocarServicio("archivebox", [o], ctx({ privado: true }));
    expect(sin.donde.tipo).toBe("ninguno");
    expect(sin.falta.join(" ")).toContain("RAM medida");
    const con = colocarServicio("archivebox", [o], ctx({ privado: true, ofertasMedidas: ["nube1"] }));
    expect(con.donde).toEqual({ tipo: "cuenta", id: "nube1" });
    expect(con.falta).toContain("a medir el consumo real del servicio");
  });
  it("en una capa pública medida se coloca y avisa de que falta medir", () => {
    const r = colocarServicio("archivebox", [], ctx());
    expect(r.donde).toEqual({ tipo: "capa-publica", id: "oracle-a1" });
    expect(r.falta).toContain("a medir el consumo real del servicio");
  });
});

describe("GPU necesaria", () => {
  const conGpu: RequisitosServicio = { ...REQUISITOS_SERVICIO.comfyui, gpu: "necesaria" };
  it("sin oferta con GPU y sin privacidad usa la web gratis", () => {
    const r = colocarServicio(conGpu, [], ctx());
    expect(r.donde).toEqual({ tipo: "web-gratis", id: "pollinations" });
    expect(r.falta.join(" ")).toContain("GPU");
    expect(r.motivo).toContain("facturación de Google desactivada");
  });
  it("con privacidad y sin GPU no coloca nada y dice qué falta", () => {
    const r = colocarServicio(conGpu, [], ctx({ privado: true }));
    expect(r.donde.tipo).toBe("ninguno");
    expect(r.falta.join(" ")).toContain("una oferta con GPU");
  });
  it("con una oferta con GPU la usa", () => {
    const gpu = oferta({ nodoId: "gpu1", computo: { nucleos: 8, ramLibreMb: 8192, gpu: true, vramMb: 8192, motores: [] } });
    expect(colocarServicio(conGpu, [gpu], ctx()).donde).toEqual({ tipo: "cuenta", id: "gpu1" });
  });
});
describe("capas públicas", () => {
  it("nunca elige una capa inactiva y enseña su motivo", () => {
    const r = colocarServicio("comfyui", [], ctx());
    expect(r.donde).toEqual({ tipo: "capa-publica", id: "oracle-a1" });
    expect(r.motivo).toContain("Cloud Run: facturación de Google desactivada desde el 2026-09-25");
    expect(r.motivo).toContain("solo con permiso de la persona");
    expect(r.motivo).toContain("cola sin prisa");
  });
});
