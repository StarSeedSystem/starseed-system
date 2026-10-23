import { describe, it, expect } from "vitest";
import { OfertaNeurona } from "../oferta";
import {
  CAPAS_PUBLICAS_CONOCIDAS,
  REQUISITOS_SERVICIO,
  SERVICIOS_INSTALADOS,
  ContextoServicio,
  RequisitosServicio,
  colocarConRequisitos,
  colocarServicio,
} from "../servicios-pesados";

const base = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "aparato-1",
  cuentaId: "cuentaA",
  medio: "wifi",
  computo: { nucleos: 4, ramLibreMb: 8000, gpu: false, motores: [] },
  almacen: { prestaMb: 1024, volumenes: [] },
  apps: [],
  enlaces: {},
  energia: { enUso: false },
  presta: {
    cuenta: true,
    grupos: [],
    publico: false,
    topes: { cpuPct: 100, ramMb: 8000, discoMb: 16384, soloCargando: false },
  },
  t: new Date(2026, 9, 20, 10, 0, 0).getTime(),
  ...o,
});

const ofertaDe = (
  nodoId: string,
  cuentaId: string,
  ram: number,
  opciones: { publico?: boolean; enCuenta?: boolean } = {}
): OfertaNeurona =>
  base({
    nodoId,
    cuentaId,
    computo: { nucleos: 4, ramLibreMb: ram, gpu: false, motores: [] },
    presta: {
      cuenta: opciones.enCuenta !== false,
      grupos: [],
      publico: opciones.publico === true,
      topes: { cpuPct: 100, ramMb: ram, discoMb: 16384, soloCargando: false },
    },
  });

const ctx: ContextoServicio = { cuentaId: "cuentaA", grupos: [], aparatoId: "aparato-1", privado: false };

describe("datos verificados del catálogo (2026-10-20)", () => {
  it("requisitos medidos en el A1 y arm64 comprobado", () => {
    expect(REQUISITOS_SERVICIO.libretranslate.ramMedidaMb).toBe(711);
    expect(REQUISITOS_SERVICIO["stirling-pdf"].ramMedidaMb).toBe(1400);
    expect(REQUISITOS_SERVICIO.comfyui.ramMedidaMb).toBe(4100);
    expect(REQUISITOS_SERVICIO.comfyui.nota).toContain("más de 10 min");
    expect(REQUISITOS_SERVICIO.coolify.arm64Verificado).toBe(false);
    for (const id of ["libretranslate", "stirling-pdf", "archivebox", "comfyui", "openhands-agent-server"] as const) {
      expect(REQUISITOS_SERVICIO[id].arm64Verificado).toBe(true);
    }
    expect(REQUISITOS_SERVICIO.archivebox.ramMedidaMb).toBeNull();
  });
  it("servicios instalados en el A1, con el puerto y su bajo demanda", () => {
    const puertos = new Map(SERVICIOS_INSTALADOS.map(s => [s.servicio, s.puerto]));
    expect([...puertos.values()].sort((a, b) => a - b)).toEqual([5000, 8001, 8010, 8180, 8188]);
    for (const s of SERVICIOS_INSTALADOS) {
      expect(s.host).toBe("127.0.0.1");
      expect(s.modo).toBe("bajo-demanda");
      expect(s.minutosSinUso).toBe(15);
    }
  });
  it("capas de conciencia con su estado real", () => {
    const porId = new Map(CAPAS_PUBLICAS_CONOCIDAS.map(c => [c.id, c]));
    const a1 = porId.get("oracle-a1");
    expect(a1 && { nucleos: a1.nucleos, ramMb: a1.ramMb, arq: a1.arquitectura, gpu: a1.gpu, estado: a1.estado })
      .toEqual({ nucleos: 2, ramMb: 12288, arq: "arm64", gpu: false, estado: "activa" });
    expect(porId.get("cloud-run")?.estado).toBe("inactiva");
    expect(porId.get("cloud-run")?.motivo).toBe("facturación de Google desactivada desde el 2026-09-25");
    expect(porId.get("espacios-hf")?.estado).toBe("con-permiso");
  });
});

describe("colocarServicio · orden del §3", () => {
  it("aprende en el propio aparato cuando su oferta basta", () => {
    const c = colocarServicio("libretranslate", [ofertaDe("aparato-1", "cuentaA", 8000)], ctx);
    expect(c.donde).toEqual({ tipo: "aparato", id: "aparato-1" });
  });
  it("si el aparato no cabe, va a la neurona de la misma cuenta", () => {
    const ofertas = [ofertaDe("aparato-1", "cuentaA", 300), ofertaDe("auriga", "cuentaA", 2000)];
    const c = colocarServicio("libretranslate", ofertas, ctx);
    expect(c.donde).toEqual({ tipo: "cuenta", id: "auriga" });
  });
  it("si nadie de la cuenta puede, va al vecino público de la malla", () => {
    const c = colocarServicio("libretranslate", [ofertaDe("vecino", "cuentaB", 2000, { publico: true })], ctx);
    expect(c.donde).toEqual({ tipo: "malla", id: "vecino" });
  });
  it("sin ofertas, lo coloca la capa pública oracle-a1 con el servicio ya instalado", () => {
    const c = colocarServicio("libretranslate", [], ctx);
    expect(c.donde).toEqual({ tipo: "capa-publica", id: "oracle-a1" });
    expect(c.motivo).toContain("127.0.0.1:5000");
    expect(c.motivo).toContain("bajo demanda");
  });
  it("ComfyUI también llega al A1 (sin GPU: cola sin prisa) con su dato honesto", () => {
    const c = colocarServicio("comfyui", [], ctx);
    expect(c.donde).toEqual({ tipo: "capa-publica", id: "oracle-a1" });
    expect(c.motivo).toContain("10 min");
  });
  it("contenido privado: vecino de la malla ni capa pública, solo aparato o cuenta", () => {
    const privado: ContextoServicio = { ...ctx, privado: true };
    const c1 = colocarServicio("libretranslate", [ofertaDe("vecino", "cuentaB", 2000, { publico: true })], privado);
    expect(c1.donde.tipo).toBe("ninguno");
    expect(c1.falta.some(f => f.includes("contenido privado"))).toBe(true);
    const c2 = colocarServicio("libretranslate", [ofertaDe("aparato-1", "cuentaA", 2000)], privado);
    expect(c2.donde).toEqual({ tipo: "aparato", id: "aparato-1" });
  });
  it("arm64 sin verificar no se coloca en el A1 y lo dice: medir arm64 en el A1", () => {
    const c = colocarServicio("coolify", [], ctx);
    expect(c.donde.tipo).toBe("ninguno");
    expect(c.falta).toContain("medir arm64 en el A1");
  });
  it("la capa inactiva nunca se elige y su motivo aparece, igual que la capa con permiso", () => {
    const c = colocarServicio("coolify", [], ctx);
    expect(c.falta.some(f => f.includes("facturación de Google desactivada desde el 2026-09-25"))).toBe(true);
    expect(c.falta.some(f => f.includes("Capa espacios-hf sin permiso"))).toBe(true);
    const conPermiso: ContextoServicio = { ...ctx, permisoEspaciosHf: true };
    const req: RequisitosServicio = { ...REQUISITOS_SERVICIO.coolify, ramMedidaMb: 512 };
    const c2 = colocarConRequisitos({ ...req, arm64Verificado: false }, [], conPermiso);
    expect(c2.donde).toEqual({ tipo: "capa-publica", id: "espacios-hf" });
  });
  it("GPU recomendada sin GPU: coloca en CPU y anota la cola lenta", () => {
    const c = colocarServicio("comfyui", [ofertaDe("aparato-1", "cuentaA", 5000)], ctx);
    expect(c.donde).toEqual({ tipo: "aparato", id: "aparato-1" });
    expect(c.falta.some(f => f.includes("sin GPU: cola lenta"))).toBe(true);
  });
  it("RAM sin medir se anota «a medir», aunque la oferta tenga medida", () => {
    const c = colocarServicio("archivebox", [ofertaDe("aparato-1", "cuentaA", 4000)], ctx);
    expect(c.donde).toEqual({ tipo: "aparato", id: "aparato-1" });
    expect(c.falta.some(f => f.includes("RAM del servicio a medir"))).toBe(true);
  });
});

describe("reglas de GPU necesaria y de espacio", () => {
  const reqGpu: RequisitosServicio = {
    ...REQUISITOS_SERVICIO.libretranslate,
    gpu: "necesaria",
    ramMedidaMb: 512,
    nota: "requerimiento de prueba con GPU necesaria",
  };

  it("GPU necesaria sin oferta con GPU y sin privado: va a la web gratis, no a un «nada»", () => {
    const c = colocarConRequisitos(reqGpu, [], ctx);
    expect(c.donde).toEqual({ tipo: "web-gratis" });
    expect(c.falta.some(f => f.includes("GPU necesaria"))).toBe(true);
  });
  it("GPU necesaria y privado: ninguno, con lo que falta", () => {
    const c = colocarConRequisitos(reqGpu, [], { ...ctx, privado: true });
    expect(c.donde.tipo).toBe("ninguno");
    expect(c.falta.some(f => f.includes("GPU necesaria"))).toBe(true);
  });
  it("GPU necesaria sí se coloca en una oferta con GPU antes que la web", () => {
    const conGpu = ofertaDe("vecino", "cuentaB", 2000, { publico: true });
    conGpu.computo.gpu = true;
    const c = colocarConRequisitos(reqGpu, [conGpu], ctx);
    expect(c.donde).toEqual({ tipo: "malla", id: "vecino" });
  });
  it("una capa que no cabe por RAM queda descartada con su razón", () => {
    const req: RequisitosServicio = { ...REQUISITOS_SERVICIO.comfyui, ramMedidaMb: 20000 };
    const c = colocarConRequisitos(req, [], ctx);
    expect(c.donde.tipo).toBe("ninguno");
    expect(c.falta.some(f => f.includes("no cabe"))).toBe(true);
  });
});
