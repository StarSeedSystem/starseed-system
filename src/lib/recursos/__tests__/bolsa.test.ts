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

const basePeticion = (overrides: Partial<PeticionBolsa> = {}): PeticionBolsa => ({
  id: "p1",
  contexto: { tipo: "cuenta", id: "cuentaA", privado: false },
  partes: [{ clase: "computo", necesita: { ramMb: 256 } }],
  ...overrides,
});

const getResultados = (res: ReturnType<typeof planificar>, clase: string) => res.porParte[clase] ?? [];

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
    const pet: PeticionBolsa = {
      id: "p2b",
      contexto: { tipo: "cuenta", id: "cuentaA", privado: true },
      partes: [{ clase: "computo", necesita: { ramMb: 256 } }],
    };
    const res = planificar(pet, [
      baseOferta({
        nodoId: "n2",
        cuentaId: "cuentaA",
        presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
      }),
    ]);
    expect(getResultados(res, "computo").length).toBeGreaterThan(0);
    expect(getResultados(res, "computo")[0].destino).toBe("n2");
  });

  it("no privado permite ofertas públicas", () => {
    const pet: PeticionBolsa = basePeticion();
    const res = planificar(pet, [
      baseOferta({
        nodoId: "n2",
        presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
      }),
    ]);
    expect(getResultados(res, "computo").length).toBeGreaterThan(0);
    expect(getResultados(res, "computo")[0].destino).toBe("n2");
  });

  it("sin latenciaMaxMs no filtra por latencia", () => {
    const pet: PeticionBolsa = basePeticion();
    const res = planificar(pet, [
      baseOferta({
        enlaces: { subidaKbps: 100, bajadaKbps: 200, latenciaMs: { n1: 100 } },
      }),
    ]);
    expect(getResultados(res, "computo").length).toBeGreaterThan(0);
  });

  it("reglas.latenciaMaxMs se aplica como fallback", () => {
    const pet: PeticionBolsa = basePeticion();
    const res = planificar(
      pet,
      [baseOferta({ enlaces: { subidaKbps: 100, bajadaKbps: 200, latenciaMs: { n1: 15 } } })],
      { latenciaMaxMs: 10 }
    );
    expect(getResultados(res, "computo").length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("batería baja sin cargar descarta oferta ajena", () => {
    const pet: PeticionBolsa = basePeticion({ contexto: { tipo: "cuenta", id: "cuentaA", privado: true } });
    const res = planificar(pet, [
      baseOferta({
        nodoId: "n-baja",
        cuentaId: "cuentaB",
        energia: { bateriaPct: 10, cargando: false, enUso: false },
        presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
      }),
    ]);
    expect(getResultados(res, "computo").length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("batería baja descarta oferta (incluso propia) — BUG: no exime cuenta propia", () => {
    const pet: PeticionBolsa = basePeticion({ contexto: { tipo: "cuenta", id: "cuentaA", privado: true } });
    const res = planificar(pet, [
      baseOferta({
        nodoId: "n-propia-baja",
        cuentaId: "cuentaA",
        energia: { bateriaPct: 10, cargando: false, enUso: false },
        presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
      }),
    ]);
    expect(getResultados(res, "computo").length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("enUso=true descarta oferta ajena", () => {
    const pet: PeticionBolsa = basePeticion();
    const res = planificar(pet, [
      baseOferta({
        nodoId: "n-enuso",
        cuentaId: "cuentaB",
        energia: { bateriaPct: 80, cargando: false, enUso: true },
        presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
      }),
    ]);
    expect(getResultados(res, "computo").length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("suficiente RAM prestable pasa filtro", () => {
    const pet: PeticionBolsa = basePeticion({ partes: [{ clase: "computo", necesita: { ramMb: 512 } }] });
    const res = planificar(pet, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 2048, gpu: true, motores: [] } })]);
    expect(getResultados(res, "computo").length).toBeGreaterThan(0);
    expect(getResultados(res, "computo")[0].destino).toBe("n1");
  });

  it("RAM insuficiente (prestable) falla y va a suelo", () => {
    const pet: PeticionBolsa = basePeticion({ partes: [{ clase: "computo", necesita: { ramMb: 4096 } }] });
    const res = planificar(pet, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 256, gpu: true, motores: [] } })]);
    expect(getResultados(res, "computo").length).toBe(0);
    expect(res.suelo).toBeDefined();
    expect(res.suelo!.falta.some((f) => f.includes("RAM"))).toBe(true);
  });

  it("GPU requerida filtra ofertas sin GPU", () => {
    const pet: PeticionBolsa = basePeticion({ partes: [{ clase: "computo", necesita: { ramMb: 256, gpu: true } }] });
    const res = planificar(pet, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 2048, gpu: false, motores: [] } })]);
    expect(getResultados(res, "computo").length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("ventana: requiere RAM prestable", () => {
    const pet: PeticionBolsa = { id: "p-ventana", contexto: { tipo: "cuenta", id: "cuentaA", privado: false }, partes: [{ clase: "ventana", necesita: { ramMb: 1024 } }] };
    const res = planificar(pet, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 512, gpu: true, motores: [] } })]);
    expect(getResultados(res, "ventana").length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("relevo: requiere subidaKbps", () => {
    const pet: PeticionBolsa = { id: "p-relevo", contexto: { tipo: "cuenta", id: "cuentaA", privado: false }, partes: [{ clase: "relevo", necesita: { kbps: 200 } }] };
    const res = planificar(pet, [baseOferta({ enlaces: { subidaKbps: 100, bajadaKbps: 200, latenciaMs: {} } })]);
    expect(getResultados(res, "relevo").length).toBe(0);
    expect(res.suelo).toBeDefined();
  });

  it("fuentes incluye el nodoId en cada resultado", () => {
    const pet: PeticionBolsa = basePeticion();
    const res = planificar(pet, [
      baseOferta({ nodoId: "n1", cuentaId: "cuentaA" }),
      baseOferta({ nodoId: "n2", cuentaId: "cuentaA" }),
    ]);
    const resultados = getResultados(res, "computo");
    expect(resultados.length).toBeGreaterThanOrEqual(1);
    expect(resultados[0].fuentes).toBeDefined();
    expect(resultados[0].fuentes).toEqual(["n1"]);
  });

  it("ofertas vacías va a suelo", () => {
    const pet: PeticionBolsa = basePeticion();
    const res = planificar(pet, []);
    expect(res.suelo).toBeDefined();
    expect(res.suelo!.destino).toBe("local");
  });

  it("petición con múltiples partes genera plan por cada una", () => {
    const pet: PeticionBolsa = {
      id: "p-multi",
      contexto: { tipo: "cuenta", id: "cuentaA", privado: false },
      partes: [
        { clase: "computo", necesita: { ramMb: 256 } },
        { clase: "bytes", necesita: { volumen: 100 } },
      ],
    };
    const res = planificar(pet, [baseOferta()]);
    expect(getResultados(res, "computo").length).toBeGreaterThan(0);
    expect(getResultados(res, "bytes").length).toBeGreaterThan(0);
  });

  it("una parte falla y otra pasa: suelo solo para la que falla", () => {
    const pet: PeticionBolsa = {
      id: "p-partial",
      contexto: { tipo: "cuenta", id: "cuentaA", privado: false },
      partes: [
        { clase: "computo", necesita: { ramMb: 256 } },
        { clase: "bytes", necesita: { volumen: 10000 } },
      ],
    };
    const res = planificar(pet, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 512, gpu: true, motores: [] }, almacen: { prestaMb: 100, volumenes: [] } })]);
    expect(getResultados(res, "computo").length).toBeGreaterThan(0);
    expect(getResultados(res, "bytes").length).toBe(0);
    expect(res.suelo).toBeDefined();
    expect(res.suelo!.falta.some((f) => f.includes("volumen"))).toBe(true);
  });
});
