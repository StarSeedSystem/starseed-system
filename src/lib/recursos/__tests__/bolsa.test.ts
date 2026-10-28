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

const basePeticion = (o: Partial<PeticionBolsa> = {}): PeticionBolsa => ({
  id: "p",
  contexto: { tipo: "cuenta", id: "cuentaA", privado: false },
  partes: [{ clase: "computo", necesita: { ramMb: 256 } }],
  ...o,
});

const publica = (nodoId: string, cuentaId: string) => baseOferta({
  nodoId,
  cuentaId,
  presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
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

  it("privado acepta oferta de la misma cuenta con presta.cuenta=true", () => {
    const pet = basePeticion({ contexto: { tipo: "cuenta", id: "cuentaA", privado: true } });
    const res = planificar(pet, [baseOferta({ nodoId: "n2", cuentaId: "cuentaA" })]);
    expect(res.porParte["computo"].length).toBeGreaterThan(0);
    expect(res.porParte["computo"][0].destino).toBe("n2");
  });

  it("no privado permite ofertas públicas", () => {
    const res = planificar(basePeticion(), [publica("n2", "cuentaB")]);
    expect(res.porParte["computo"].length).toBeGreaterThan(0);
    expect(res.porParte["computo"][0].destino).toBe("n2");
  });

  it("sin latenciaMaxMs no filtra por latencia", () => {
    const res = planificar(basePeticion(), [
      baseOferta({ enlaces: { subidaKbps: 100, bajadaKbps: 200, latenciaMs: { n1: 100 } } }),
    ]);
    expect(res.porParte["computo"].length).toBeGreaterThan(0);
  });

  it("reglas.latenciaMaxMs se aplica como fallback", () => {
    const res = planificar(
      basePeticion(),
      [baseOferta({ enlaces: { subidaKbps: 100, bajadaKbps: 200, latenciaMs: { n1: 15 } } })],
      { latenciaMaxMs: 10 },
    );
    expect(res.porParte["computo"].length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("batería baja sin cargar descarta oferta ajena", () => {
    const res = planificar(basePeticion(), [
      baseOferta({
        nodoId: "n-baja",
        cuentaId: "cuentaB",
        energia: { bateriaPct: 10, cargando: false, enUso: false },
        presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
      }),
    ]);
    expect(res.porParte["computo"].length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("enUso=true descarta oferta ajena", () => {
    const res = planificar(basePeticion(), [
      baseOferta({
        nodoId: "n-enuso",
        cuentaId: "cuentaB",
        energia: { bateriaPct: 80, cargando: false, enUso: true },
        presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
      }),
    ]);
    expect(res.porParte["computo"].length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("suficiente RAM prestable pasa el filtro", () => {
    const pet = basePeticion({ partes: [{ clase: "computo", necesita: { ramMb: 512 } }] });
    const res = planificar(pet, [baseOferta()]);
    expect(res.porParte["computo"].length).toBeGreaterThan(0);
    expect(res.porParte["computo"][0].destino).toBe("n1");
  });

  it("RAM insuficiente (prestable) falla y va a suelo", () => {
    const pet = basePeticion({ partes: [{ clase: "computo", necesita: { ramMb: 4096 } }] });
    const res = planificar(pet, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 256, gpu: true, motores: [] } })]);
    expect(res.porParte["computo"].length).toBe(0);
    expect(res.suelo).toBeDefined();
    expect(res.suelo!.falta.some((f) => f.includes("RAM"))).toBe(true);
  });

  it("GPU requerida filtra ofertas sin GPU", () => {
    const pet = basePeticion({ partes: [{ clase: "computo", necesita: { ramMb: 256, gpu: true } }] });
    const res = planificar(pet, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 2048, gpu: false, motores: [] } })]);
    expect(res.porParte["computo"].length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("ventana requiere RAM prestable", () => {
    const pet = basePeticion({ partes: [{ clase: "ventana", necesita: { ramMb: 1024 } }] });
    const res = planificar(pet, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 512, gpu: true, motores: [] } })]);
    expect(res.porParte["ventana"].length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("relevo requiere subidaKbps", () => {
    const pet = basePeticion({ partes: [{ clase: "relevo", necesita: { kbps: 200 } }] });
    const res = planificar(pet, [baseOferta({ enlaces: { subidaKbps: 100, bajadaKbps: 200, latenciaMs: {} } })]);
    expect(res.porParte["relevo"].length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("ofertas vacías va a suelo local con motivo y falta", () => {
    const res = planificar(basePeticion(), []);
    expect(res.suelo).toBeDefined();
    expect(res.suelo!.destino).toBe("local");
    expect(res.suelo!.motivo.length).toBeGreaterThan(0);
    expect(res.suelo!.falta.length).toBeGreaterThan(0);
  });

  it("múltiples fuentes disponibles ramifica hasta 3", () => {
    const res = planificar(basePeticion(), [
      publica("n1", "cuentaB"),
      publica("n2", "cuentaC"),
      publica("n3", "cuentaD"),
      publica("n4", "cuentaE"),
    ]);
    const destinos = res.porParte["computo"].map((r) => r.destino);
    expect(destinos).toEqual(["n1", "n2", "n3"]);
  });

  it("mismo input siempre mismo output", () => {
    const pet = basePeticion();
    const ofertas = [publica("n2", "cuentaB"), publica("n1", "cuentaC")];
    expect(planificar(pet, ofertas)).toEqual(planificar(pet, ofertas));
  });

  it("petición con múltiples partes genera plan por cada una", () => {
    const pet = basePeticion({
      partes: [
        { clase: "computo", necesita: { ramMb: 256 } },
        { clase: "bytes", necesita: { volumen: 100 } },
      ],
    });
    const res = planificar(pet, [baseOferta()]);
    expect(Object.keys(res.porParte).sort()).toEqual(["bytes", "computo"]);
    expect(res.porParte["computo"].length).toBeGreaterThan(0);
    expect(res.porParte["bytes"].length).toBeGreaterThan(0);
    expect(res.suelo).toBeUndefined();
  });

  it("una parte falla y otra pasa: suelo solo para la que falla", () => {
    const pet = basePeticion({
      partes: [
        { clase: "computo", necesita: { ramMb: 8192 } },
        { clase: "bytes", necesita: { volumen: 100 } },
      ],
    });
    const res = planificar(pet, [baseOferta()]);
    expect(res.porParte["computo"].length).toBe(0);
    expect(res.porParte["bytes"].length).toBeGreaterThan(0);
    expect(res.suelo).toBeDefined();
    expect(res.suelo!.falta.some((f) => f.includes("computo"))).toBe(true);
    expect(res.suelo!.falta.some((f) => f.includes("bytes"))).toBe(false);
  });
});
