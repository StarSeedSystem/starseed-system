import { describe, expect, it } from "vitest";
import { FREE_CATALOG, type CatalogSource } from "@/ai/astraura/free-catalog";
import { PREFERENCIA_CAPAS_DEFECTO, type PreferenciaCapas } from "@/lib/astraura/capas-conciencia";
import type { EntradaCapa } from "@/lib/astraura/capas/catalogo";
import type { CapaInstalada, NodoCapas } from "@/lib/astraura/capas/planificador";
import { entradaRepartoDesde, instaladasDesdeAlmacen, planDelTurno, type DepRepartoVivo } from "../adaptadores/reparto-vivo";

const SHA = "a".repeat(64);
const WEB = { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", esTauri: false, esPWA: false, deviceMemory: 8, hardwareConcurrency: 8 };
const NATIVO = { ...WEB, esTauri: true, deviceMemory: 16, discoLibreBytes: 100 * 1024 ** 3 };
const molde = FREE_CATALOG.find((s) => s.privacy === "cloud" && s.tier !== "paid" && !s.id.startsWith("astraura")) as CatalogSource;
const fuente = (id: string, tier: CatalogSource["tier"] = "free-key"): CatalogSource => ({ ...molde, id, tier });
const prefs = (o: Partial<PreferenciaCapas> = {}): PreferenciaCapas => ({ ...PREFERENCIA_CAPAS_DEFECTO, ...o });
const inst = (id: string, capa: CapaInstalada["capa"], ramMinMb = 256): CapaInstalada => ({ id, capa, sha256: SHA, ramMinMb });
const par: NodoCapas = { id: "mac", tipo: "par", conectado: true, propio: true, capas: [inst("ternary-bonsai-4b", "palabra")] };
const ajeno: NodoCapas = { ...par, id: "vecino", propio: false };
const dep = (o: Partial<DepRepartoVivo> = {}): DepRepartoVivo => ({
  entorno: () => WEB, instaladas: () => [], preferencias: () => prefs(), fuentes: () => [fuente("gratis-uno")], ...o,
});
const lanza = (): never => { throw new Error("caído"); };
const dondes = (p: ReturnType<typeof planDelTurno>) => [p.reparto, ...p.reparto.respaldo].map((x) => x.donde);

describe("entradaRepartoDesde y planDelTurno (reparto vivo)", () => {
  it("web sin capas, privado: va a un par PROPIO con su modelo y su nodo, nunca a un par ajeno ni fuera", () => {
    const d = dep({ nodos: () => [ajeno, par] });
    expect(entradaRepartoDesde(d)).toMatchObject({ medio: "web", capasLocales: [], remotas: [{ capa: "palabra", donde: "par" }] });
    const p = planDelTurno("conversacion", "media", "privada", d);
    expect(p.reparto).toMatchObject({ motor: "bonsai", donde: "par", capa: "palabra" });
    expect(dondes(p)).not.toContain("api-externa");
    expect(p.detalle).toEqual({ modelo: "ternary-bonsai-4b", nodo: "mac", profundidad: undefined });
  });

  it("web sin capas ni pares: lo público sale a la API gratis y lo privado no sale a ninguna", () => {
    expect(planDelTurno("conversacion", "media", "publica", dep()).reparto).toMatchObject({ donde: "api-externa", modelo: "gratis-uno" });
    const privado = planDelTurno("conversacion", "media", "privada", dep());
    expect(privado.reparto.motor).toBe("ninguno");
    expect(privado.reparto.motivo).toMatch(/privado/i);
  });

  it("lo privado nunca sale a una API aunque el nivelador pida APIs y sobre crédito", () => {
    const d = dep({ entorno: () => NATIVO, instaladas: () => [inst("ternary-bonsai-4b", "palabra", 3072)], preferencias: () => prefs({ nivelador: 0 }),
      fuentes: () => [fuente("gratis-uno"), fuente("pago-a", "paid")], costeTurno: () => 1, presupuestoPago: () => ({ disponible: 1000, reserva: 0 }) });
    const p = planDelTurno("conversacion", "media", "privada", d);
    expect(p.reparto).toMatchObject({ motor: "bonsai", donde: "local" });
    expect(dondes(p)).not.toContain("api-externa");
  });

  it("sin medidor de crédito solo entran las gratis; con crédito sobre la reserva entra la de pago medida", () => {
    const fuentes = () => [fuente("pago-a", "paid"), fuente("gratis-uno")];
    const sinMedidor = entradaRepartoDesde(dep({ fuentes, costeTurno: () => 2 }), { tarea: "conversacion", dificultad: "media", privacidad: "publica" });
    expect(sinMedidor.presupuesto).toEqual({ disponible: 0, reserva: 0 });
    const sinCredito = planDelTurno("conversacion", "media", "publica", dep({ fuentes, costeTurno: () => 2 }));
    expect([sinCredito.reparto, ...sinCredito.reparto.respaldo].map((x) => x.modelo)).toEqual(["gratis-uno"]);
    const conCredito = planDelTurno("conversacion", "media", "publica",
      dep({ fuentes, costeTurno: () => 2, presupuestoPago: () => ({ disponible: 10, reserva: 5 }) }));
    expect(conCredito.reparto.respaldo.map((x) => x.modelo)).toContain("pago-a");
    const sinCoste = entradaRepartoDesde(dep({ fuentes, presupuestoPago: () => ({ disponible: 10, reserva: 5 }) }));
    expect(sinCoste.externas.map((x) => x.id)).toEqual(["gratis-uno"]);
  });

  it("nivelador de capas-conciencia: alto deja Astraura local delante; bajado al enrutador, la API va primero", () => {
    const base = { entorno: () => NATIVO, instaladas: () => [inst("ternary-bonsai-4b", "palabra", 3072)] };
    const alto = planDelTurno("conversacion", "media", "publica", dep(base));
    expect(alto.reparto).toMatchObject({ motor: "bonsai", donde: "local" });
    const bajo = planDelTurno("conversacion", "media", "publica", dep({ ...base, preferencias: () => prefs({ nivelador: 10 }) }));
    expect(bajo.reparto).toMatchObject({ donde: "api-externa", modelo: "gratis-uno" });
    expect(bajo.reparto.respaldo[0]).toMatchObject({ donde: "local" });
  });

  it("nivelador en «Modelo específico» (34–66): la elegida va primero; desde 67 («Capas 1.58»), Astraura", () => {
    const base = { entorno: () => NATIVO, instaladas: () => [inst("ternary-bonsai-4b", "palabra", 3072)], fuentes: () => [fuente("a-gratis"), fuente("gratis-uno")] };
    const con = (nivelador: number) => dep({ ...base, preferencias: () => prefs({ nivelador, especifico: { fuente: "gratis-uno" } }) });
    for (const n of [34, 55, 66]) expect(planDelTurno("conversacion", "media", "publica", con(n)).reparto).toMatchObject({ donde: "api-externa", modelo: "gratis-uno" });
    expect(planDelTurno("conversacion", "media", "publica", con(67)).reparto).toMatchObject({ motor: "bonsai", donde: "local" });
  });

  it("planificar completa el reflejo local con modelo y profundidad de Needle", () => {
    const p = planDelTurno("herramienta", "baja", "privada", dep({ entorno: () => NATIVO, instaladas: () => [inst("needle3-reflejo", "reflejo")] }));
    expect(p.reparto).toMatchObject({ motor: "needle", donde: "local", capa: "reflejo" });
    expect(p.capas?.capa).toBe("reflejo");
    expect(p.detalle).toEqual({ modelo: "needle3-reflejo", nodo: undefined, profundidad: 20 });
    expect(p.avisos).toEqual([]);
  });

  it("dependencias que lanzan: plan honesto, sin lanzar y diciendo qué no se pudo leer", () => {
    const d: DepRepartoVivo = { entorno: lanza, instaladas: lanza, preferencias: lanza, nodos: lanza, fuentes: lanza,
      presupuestoPago: lanza, enLinea: lanza, costeTurno: lanza };
    expect(entradaRepartoDesde(d)).toMatchObject({ conexion: "sin", capasLocales: [], externas: [], presupuesto: { disponible: 0, reserva: 0 } });
    const p = planDelTurno("conversacion", "media", "publica", d);
    expect(p.reparto).toMatchObject({ motor: "ninguno", donde: "ninguno" });
    expect(p.avisos.join(" ")).toMatch(/perfil del medio[\s\S]*capas instaladas[\s\S]*conexión/);
    const soloPerfil = planDelTurno("conversacion", "media", "publica", dep({ perfilDelMedio: lanza, presupuestoMedio: lanza }));
    expect(soloPerfil.reparto).toMatchObject({ donde: "api-externa" });
  });

  it("Astraura 1.58 apagada no usa ninguna capa propia; con la capa mesh apagada no hay pares", () => {
    const capas = { entorno: () => NATIVO, instaladas: () => [inst("ternary-bonsai-4b", "palabra", 3072)], nodos: () => [par] };
    const apagada = dep({ ...capas, preferencias: () => prefs({ activo: false }) });
    expect(planDelTurno("conversacion", "media", "publica", apagada).reparto).toMatchObject({ donde: "api-externa" });
    expect(planDelTurno("conversacion", "media", "privada", apagada).reparto.motor).toBe("ninguno");
    const sinMesh = dep({ nodos: () => [par], preferencias: () => prefs({ capas: { ...PREFERENCIA_CAPAS_DEFECTO.capas, mesh: false } }) });
    expect(planDelTurno("conversacion", "media", "privada", sinMesh).reparto.motor).toBe("ninguno");
  });

  it("un bot invitado responde con su propio modelo y no pasa por el planificador", () => {
    const p = planDelTurno("conversacion", "media", "publica", dep({ origen: "ag-ui" }));
    expect(p).toMatchObject({ reparto: { motor: "invitado" }, capas: null, detalle: null });
  });

  it("instaladasDesdeAlmacen: solo capas completas con su SHA en el catálogo", () => {
    const e = (id: string, sha256: string): EntradaCapa => ({ id, familia: "f", capa: "palabra", modelo: id, version: "1", formato: "gguf",
      runtime: "llama-cpp", parametros: "4B", disco_mb: 10, ram_min_mb: 300, sha256, fuente_oficial: "x", espejos: [], estado: "recomendado", medios: ["nativo"] });
    const info = (id: string, completa: boolean) => ({ id, bytes: 1, ultimoUso: 0, fijada: false, completa, trozosGuardados: 1 });
    const r = instaladasDesdeAlmacen({ capas: [info("a", true), info("b", false), info("c", true), info("z", true)], usadosBytes: 1, persistente: false },
      { esquema: 1, actualizado: "", capas: [e("a", SHA), e("b", SHA), e("c", "por-verificar")] });
    expect(r).toEqual([{ id: "a", capa: "palabra", sha256: SHA, ramMinMb: 300 }]);
  });
});
