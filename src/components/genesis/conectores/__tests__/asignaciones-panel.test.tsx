/**
 * Peldaños de la escalera de conectores (GCA1019N) — caso de la rama adaptado a
 * la API de hoy. Main no tiene el panel ni `peldanoDe`: el contrato vigente es
 * `elegirCandidatos`, que deduce el peldaño cruzando la tarea, las ofertas del
 * ámbito, el catálogo y las preferencias. Se conservan las garantías que siguen
 * en pie: local primero, lo gratuito después, lo privado nunca en la malla y el
 * pago solo con permiso. PURO: sin red, disco ni procesos.
 */
import { describe, expect, it } from "vitest";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import { elegirCandidatos, type OfertaContexto, type Preferencias, type Tarea } from "@/lib/genesis/conectores/escalera";

const LIMITE = { rpm: 30, porDia: null, horasMes: null, almacenamientoGb: null, nota: "30/min" };
const op = (id: string, extra: Partial<OpcionCatalogo> = {}): OpcionCatalogo => ({
  id, nombre: id, tipo: "proveedor", papeles: ["escritor"], gratis: LIMITE, requiereCuenta: true,
  enlaceAlta: null, enlaceClave: null, variables: [], privacidad: "nube-sin-retencion",
  licencia: null, verificado: null, fuente: "prueba", ...extra,
});
const oferta = (id: string, papel: OpcionCatalogo["papeles"] = ["escritor"]): OfertaContexto => ({
  id, nombre: id, tipo: "modelo", papel,
});
const prefs = (extra: Partial<Preferencias> = {}): Preferencias => ({
  permitirPago: false, topeDiario: null, prohibidos: [], ...extra,
});
const tarea = (extra: Partial<Tarea> = {}): Tarea => ({ papel: "escritor", privado: false, tamano: 1000, ...extra });

const catalogo: OpcionCatalogo[] = [
  op("astraura-local", { tipo: "modelo", gratis: null, privacidad: "local" }),
  op("free-prov"),
  op("premium", { gratis: null, privacidad: "nube-con-retencion" }),
  op("actions", { tipo: "contenedor", gratis: LIMITE }),
];

describe("peldaños de elegirCandidatos", () => {
  it("deduce el peldaño de cada opción del catálogo", () => {
    const candidatos = elegirCandidatos({
      tarea: tarea(),
      ofertas: [oferta("astraura-local")],
      catalogo,
      vinculadas: new Set<string>(),
      preferencias: prefs({ permitirPago: true }),
    });
    const porId = new Map(candidatos.map((c) => [c.candidatoId, c]));
    expect(porId.get("astraura-local")?.peldano).toBe(1);
    expect(porId.get("free-prov")?.peldano).toBe(3);
    expect(porId.get("actions")?.peldano).toBe(4);
    expect(porId.get("premium")?.peldano).toBe(6);
    expect(porId.get("astraura-local")?.motivo).toContain("Astraura");
    expect(porId.get("free-prov")?.motivo).toContain("malla");
    expect(porId.get("actions")?.motivo).toContain("Contenedor");
    expect(porId.get("premium")?.motivo).toContain("pago");
    expect(candidatos.map((c) => c.peldano)).toEqual([1, 3, 4, 6]);
  });

  it("lo privado no sale a la malla y sin permiso no hay peldaño de pago", () => {
    const candidatos = elegirCandidatos({
      tarea: tarea({ privado: true }),
      ofertas: [],
      catalogo: [op("free-prov"), op("premium", { gratis: null })],
      vinculadas: new Set<string>(),
      preferencias: prefs(),
    });
    expect(candidatos).toEqual([]);
  });

  it("ordena por peldaño y luego por id, y respeta los prohibidos", () => {
    const candidatos = elegirCandidatos({
      tarea: tarea(),
      ofertas: [],
      catalogo: [op("z-free"), op("a-free"), op("sin-sitio", { tipo: "herramienta", gratis: null })],
      vinculadas: new Set<string>(),
      preferencias: prefs({ prohibidos: ["z-free"] }),
    });
    expect(candidatos.map((c) => c.candidatoId)).toEqual(["a-free"]);
  });
});
