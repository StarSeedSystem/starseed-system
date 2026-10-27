import { describe, it, expect } from "vitest";
import { planificar, PeticionBolsa, ReglasBolsa, PartePeticion } from "../bolsa";
import { OfertaNeurona } from "../oferta";

const baseOferta = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "n1",
  cuentaId: "cuentaA",
  medio: "wifi",
  computo: { nucleos: 4, ramLibreMb: 2048, gpu: true, vramMb: 4096, motores: ["imagen"] },
  almacen: { prestaMb: 1024, volumenes: ["v1"] },
  apps: [{ id: "app", version: "1" }],
  enlaces: { subidaKbps: 100, bajadaKbps: 200, latenciaMs: {} },
  energia: { bateriaPct: 80, cargando: false, enUso: false },
  presta: { cuenta: true, grupos: ["g1"], publico: false, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
  t: Date.now(),
  ...o,
});

describe("planificar", () => {
  it("privado descarta vecinos públicos y solo acepta misma cuenta", () => {
    const pet: PeticionBolsa = { id: "p2", contexto: { tipo: "cuenta", id: "cuentaA", privado: true }, partes: [{ clase: "bytes", necesita: { volumen: 100 } }] };
    const res = planificar(pet, [baseOferta({ presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 50, ramMb: 1024, discoMb: 1024, soloCargando: false } } })]);
    expect(res.porParte["bytes"].length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("móvil sin recursos abre app pesada en local con suelo", () => {
    const pet: PeticionBolsa = { id: "p3", contexto: { tipo: "cuenta", id: "cuentaMovil", privado: false }, partes: [{ clase: "computo", necesita: { ramMb: 8192, gpu: true } }] };
    const res = planificar(pet, [baseOferta({ nodoId: "n2", cuentaId: "cuentaMovil", computo: { nucleos: 1, ramLibreMb: 512, gpu: false, vramMb: undefined, motores: [] }, presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 10, ramMb: 256, discoMb: 100, soloCargando: false } } })]);
    expect(res.suelo).toBeDefined();
    expect(res.suelo!.destino).toBe("local");
    expect(res.suelo!.falta.some((f) => f.includes("computo"))).toBe(true);
  });

  it("reparto ramifica en varias fuentes", () => {
    const pet: PeticionBolsa = { id: "p4", contexto: { tipo: "grupo", id: "g1", privado: false }, partes: [{ clase: "bytes", necesita: { volumen: 500 } }] };
    const res = planificar(pet, [
      baseOferta({ nodoId: "n1", cuentaId: "cuentaB", presta: { cuenta: false, grupos: ["g1"], publico: true, topes: { cpuPct: 50, ramMb: 512, discoMb: 1024, soloCargando: false } } }),
      baseOferta({ nodoId: "n2", cuentaId: "cuentaC", presta: { cuenta: false, grupos: ["g1"], publico: true, topes: { cpuPct: 50, ramMb: 512, discoMb: 1024, soloCargando: false } } }),
    ]);
    expect(res.porParte["bytes"].length).toBeGreaterThanOrEqual(1);
  });

  it("latencia descarta ofertas lentas", () => {
    const pet: PeticionBolsa = { id: "p5", contexto: { tipo: "cuenta", id: "cuentaA", privado: false }, partes: [{ clase: "relevo", necesita: { kbps: 200 }, latenciaMaxMs: 5 }] };
    const res = planificar(pet, [baseOferta({ enlaces: { subidaKbps: 50, bajadaKbps: 50, latenciaMs: { n1: 15 } } })]);
    expect(res.porParte["relevo"].length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("gratis primero y determinista por nodoId", () => {
    const pet: PeticionBolsa = { id: "p6", contexto: { tipo: "cuenta", id: "cuentaA", privado: false }, partes: [{ clase: "computo", necesita: { ramMb: 256 } }] };
    const res = planificar(pet, [
      baseOferta({ nodoId: "n2", cuentaId: "cuentaB", presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } } }),
      baseOferta({ nodoId: "n1", cuentaId: "cuentaA" }),
    ]);
    expect(res.porParte["computo"][0].destino).toBe("n1");
  });
});
