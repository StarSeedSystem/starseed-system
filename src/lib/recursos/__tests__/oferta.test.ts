import { describe, it, expect } from "vitest";
import {
  ofertaVisiblePara,
  capacidadPrestable,
  type OfertaNeurona,
  type Quien,
} from "../oferta";

const now = Date.now();

const baseOferta: OfertaNeurona = {
  nodoId: "n1",
  cuentaId: "c1",
  medio: "navegador",
  computo: { nucleos: 2, ramLibreMb: 1024, gpu: false, motores: [] },
  almacen: { prestaMb: 5120, volumenes: ["v1"] },
  apps: [{ id: "a1", version: "1.0" }],
  enlaces: { subidaKbps: 500, bajadaKbps: 2000, latenciaMs: { n2: 5 } },
  energia: { bateriaPct: 80, cargando: false, enUso: false },
  presta: { cuenta: true, grupos: ["g1"], publico: false, topes: { cpuPct: 50, ramMb: 512, discoMb: 2560, horas: 12, soloCargando: false } },
  t: now,
};

describe("ofertaVisiblePara", () => {
  it("returns null if not allowed", () => {
    const quien: Quien = { cuentaId: "c2", grupos: ["g2"] };
    expect(ofertaVisiblePara(baseOferta, quien)).toBeNull();
  });

  it("returns offer if allowed via account", () => {
    const quien: Quien = { cuentaId: "c1", grupos: ["g2"] };
    const result = ofertaVisiblePara(baseOferta, quien);
    expect(result).not.toBeNull();
    if (result) expect(result.enlaces.latenciaMs).toBeUndefined();
  });

  it("returns offer if allowed via public", () => {
    const pub: OfertaNeurona = { ...baseOferta, presta: { ...baseOferta.presta, cuenta: false, grupos: [], publico: true } };
    const quien: Quien = { cuentaId: "c2", grupos: ["g2"] };
    const result = ofertaVisiblePara(pub, quien);
    expect(result).not.toBeNull();
    if (result) expect(result.enlaces.latenciaMs).toBeUndefined();
  });

  it("returns offer if allowed via group", () => {
    const quien: Quien = { cuentaId: "c2", grupos: ["g1"] };
    const result = ofertaVisiblePara(baseOferta, quien);
    expect(result).not.toBeNull();
    if (result) expect(result.enlaces.latenciaMs).toBeUndefined();
  });
});

describe("capacidadPrestable", () => {
  it("zeros computo when low battery and not charging", () => {
    const baja: OfertaNeurona = { ...baseOferta, energia: { ...baseOferta.energia, bateriaPct: 15, cargando: false } };
    const res = capacidadPrestable(baja);
    expect(res.computo).toEqual({ nucleos: 0, ramLibreMb: 0, gpu: false, motores: [] });
  });

  it("zeros computo when enUso true", () => {
    const enUso: OfertaNeurona = { ...baseOferta, energia: { ...baseOferta.energia, enUso: true } };
    const res = capacidadPrestable(enUso);
    expect(res.computo).toEqual({ nucleos: 0, ramLibreMb: 0, gpu: false, motores: [] });
  });

  it("applies topes to ram and storage", () => {
    const topesBajos: OfertaNeurona = { ...baseOferta, presta: { ...baseOferta.presta, topes: { ...baseOferta.presta.topes, ramMb: 256, discoMb: 1280 } } };
    const res = capacidadPrestable(topesBajos);
    expect(res.computo.ramLibreMb).toBe(256);
    expect(res.almacen.prestaMb).toBe(1280);
  });

  it("does not apply topes if under limits", () => {
    const topesAltos: OfertaNeurona = { ...baseOferta, presta: { ...baseOferta.presta, topes: { ...baseOferta.presta.topes, ramMb: 2048, discoMb: 5120 } } };
    const res = capacidadPrestable(topesAltos);
    expect(res.computo.ramLibreMb).toBe(baseOferta.computo.ramLibreMb);
    expect(res.almacen.prestaMb).toBe(baseOferta.almacen.prestaMb);
  });
});