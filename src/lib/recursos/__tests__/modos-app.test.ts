// Pruebas de los modos de apertura en la malla (§5 de apps-en-la-malla.md · Ola 1017A).
// Puro: sin red, sin disco y sin procesos; el plan ya llega masticado.
import { describe, it, expect } from "vitest";
import { Circle } from "lucide-react";
import { comoAbrir, type AppParaAbrir } from "../modos-app";
import type { OfertaNeurona } from "../oferta";
import type { ResultadoPlanificacion } from "../bolsa";
import type { StarseedApp } from "@/components/dashboard/apps/launcher-types";

const FUERTE = { nucleos: 8, ramLibreMb: 8192, gpu: true, vramMb: 4096, motores: ["imagen", "voz"] };
const DEBIL = { nucleos: 2, ramLibreMb: 512, gpu: false, motores: ["imagen"] };

const neurona = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "n-local",
  cuentaId: "cuentaA",
  medio: "mac",
  computo: FUERTE,
  almacen: { prestaMb: 2048, volumenes: [] },
  apps: [{ id: "app", version: "1" }],
  enlaces: { subidaKbps: 5000, bajadaKbps: 5000, latenciaMs: {} },
  energia: { bateriaPct: 90, cargando: false, enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 4096, discoMb: 2048, soloCargando: false } },
  t: 0,
  ...o,
});

const app = (id: string, extra: Partial<AppParaAbrir> = {}): AppParaAbrir => ({ id, ...extra });

const plan = (porParte: ResultadoPlanificacion["porParte"]): ResultadoPlanificacion => ({ porParte });

describe("comoAbrir", () => {
  it("sin campos nuevos abre en local, como hoy", () => {
    expect(comoAbrir(app("basica"), neurona())).toMatchObject({ modo: "local", destino: "local" });
  });

  it("sigue la regla del §5 aunque el listado ponga otra primera", () => {
    expect(comoAbrir(app("a", { ejecucion: ["ramificada", "local"] }), neurona()).modo).toBe("local");
  });

  it("acepta una StarseedApp del catálogo tal cual", () => {
    const delCatalogo: StarseedApp = {
      id: "nexus", name: "Nexus", description: "Red de la comunidad",
      icon: Circle, accent: "#007FFF", category: "starseed",
      open: { primary: "route", allowed: ["route", "tab"] },
      ejecucion: ["local", "por-bandas"], requisitos: { ramMb: 512 },
    };
    expect(comoAbrir(delCatalogo, neurona()).modo).toBe("local");
  });

  it("se prefiere local aunque por-bandas también valga (lo propio primero)", () => {
    const e = comoAbrir(
      app("a", { ejecucion: ["local", "por-bandas"], requisitos: { volumen: "v-web" } }),
      neurona(),
      plan({ bytes: [{ destino: "n2", motivo: "guarda bandas" }] })
    );
    expect(e.modo).toBe("local");
  });

  it("web/WASM grande con volumen se abre por bandas y en el nodo del plan", () => {
    const pedida = app("a", { ejecucion: ["local", "por-bandas"], requisitos: { ramMb: 4096, volumen: "v-web" } });
    const e = comoAbrir(pedida, neurona({ computo: DEBIL }), plan({ bytes: [{ destino: "n2", motivo: "guarda bandas" }] }));
    expect(e.modo).toBe("por-bandas");
    expect(e.destino).toBe("n2");
    expect(e.motivo).toContain("bandas");
  });

  it("si la neurona ya guarda las bandas del volumen, se sirven de la caché local", () => {
    const e = comoAbrir(
      app("a", { ejecucion: ["por-bandas"], requisitos: { volumen: "v-web" } }),
      neurona({ almacen: { prestaMb: 2048, volumenes: ["v-web"] } })
    );
    expect(e.modo).toBe("por-bandas");
    expect(e.destino).toBe("local");
    expect(e.motivo).toContain("ya están aquí");
  });

  it("nativa fuera del disco se monta por la pasarela local", () => {
    const pedida = app("a", { ejecucion: ["montada"], requisitos: { ramMb: 4096, volumen: "v-nat" } });
    const e = comoAbrir(pedida, neurona({ computo: DEBIL }), plan({ bytes: [{ destino: "n3", motivo: "guarda el volumen" }] }));
    expect(e.modo).toBe("montada");
    expect(e.destino).toBe("n3");
    expect(e.motivo).toContain("pasarela");
  });

  it("transmitida cuando el plan trae ventana de otra neurona", () => {
    const pedida = app("a", { ejecucion: ["local", "transmitida"], requisitos: { ramMb: 16384 } });
    const e = comoAbrir(pedida, neurona({ computo: DEBIL }), plan({ ventana: [{ destino: "n5", motivo: "la tiene prestada" }] }));
    expect(e.modo).toBe("transmitida");
    expect(e.destino).toBe("n5");
  });

  it("sin ventana en el plan, transmitida cae al suelo con el aviso", () => {
    const e = comoAbrir(app("a", { ejecucion: ["transmitida"], requisitos: { ramMb: 16384 } }), neurona({ computo: DEBIL }));
    expect(e).toMatchObject({ modo: "transmitida", destino: "local" });
    expect(e.motivo).toContain("Falta");
  });

  it("ramificada cuando solo falta cálculo y el plan lo trae", () => {
    const pedida = app("a", { ejecucion: ["local", "ramificada"], requisitos: { ramMb: 16384 } });
    const e = comoAbrir(
      pedida,
      neurona({ computo: DEBIL }),
      plan({ computo: [{ destino: "n2", motivo: "CPU libre" }, { destino: "n3", motivo: "CPU libre" }] })
    );
    expect(e.modo).toBe("ramificada");
    expect(e.destino).toBe("local");
    expect(e.motivo).toContain("n2");
  });

  it("suelo: nunca nada, abre igualmente y avisa de lo que falta", () => {
    const e = comoAbrir(
      app("a", { ejecucion: ["local"], requisitos: { ramMb: 8192, gpu: true, motores: ["voz"] } }),
      neurona({ computo: DEBIL })
    );
    expect(e.modo).toBe("local");
    expect(e.motivo).toContain("Falta");
    expect(e.motivo).toContain("GPU");
    expect(e.motivo).toContain("voz");
  });
});
