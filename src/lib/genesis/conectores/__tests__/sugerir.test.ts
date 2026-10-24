import { describe, expect, it } from "vitest";
import type { Asignacion, Preferencias } from "../asignaciones";
import type { OpcionCatalogo, Papel } from "../catalogo-opciones";
import { CONTENEDORES_OPCIONES, type ContenedorOpcion } from "../contenedores";
import type { OfertaContexto } from "../escalera";
import { sugerirParaAmbito, type EntradaSugerir, type GrupoSugerencias, type Sugerencia } from "../sugerir";

const LIMITE = { rpm: 30, porDia: null, horasMes: null, almacenamientoGb: null, nota: "30 peticiones/min" };
const op = (id: string, extra: Partial<OpcionCatalogo> = {}): OpcionCatalogo => ({
  id, nombre: id, tipo: "proveedor", papeles: ["escritor"], gratis: LIMITE, requiereCuenta: true,
  enlaceAlta: `https://alta.example/${id}`, enlaceClave: `https://claves.example/${id}`, variables: ["PRUEBA_API_KEY"],
  privacidad: "nube-sin-retencion", licencia: null, verificado: null, fuente: "prueba", ...extra });
const asig = (clave: Papel, pref: Partial<Preferencias> = {}, cadena: string[] = []): Asignacion<Papel> => ({
  clave, cadena, respaldo: [], preferencias: { localPrimero: true, privacidad: "desconocida", presupuesto: null, ...pref } });
const oferta = (id: string, papel: Papel[]): OfertaContexto => ({ id, nombre: id, tipo: "modelo", papel });
const cont = (id: string, extra: Partial<ContenedorOpcion> = {}): ContenedorOpcion => ({ id, nombre: id, enlaceAlta: null,
  guia: null, requiereCuenta: false, requierePago: false, aptoPrivado: true, verificado: true, ...extra });
const sugerir = (e: Partial<EntradaSugerir>) => sugerirParaAmbito({ asignaciones: [], catalogo: [], ofertas: [],
  vinculadas: new Set<string>(), contenedores: [], ...e });
const opciones = (gs: GrupoSugerencias[], clave: GrupoSugerencias["clave"]): Sugerencia[] => {
  const g = gs.find((x) => x.clave === clave);
  return g && "opciones" in g ? g.opciones : [];
};
const ids = (gs: GrupoSugerencias[], clave: GrupoSugerencias["clave"]) => opciones(gs, clave).map((s) => s.id);
const sinOpcion = (gs: GrupoSugerencias[]) => gs.flatMap((g) => ("papeles" in g ? g.papeles : []));

describe("sugerirParaAmbito", () => {
  it("devuelve los grupos en orden fijo y explica cada papel sin opción", () => {
    const gs = sugerir({ asignaciones: [asig("escritor"), asig("chat", { privacidad: "local" })] });
    expect(gs.map((g) => g.clave)).toEqual(["local-por-activar", "gratis-por-vincular", "sin-opcion"]);
    expect(gs.map((g) => g.titulo)).toEqual(["Local por activar", "Gratis por vincular", "Sin opción"]);
    const [escritor, chat] = sinOpcion(gs);
    expect(escritor).toMatchObject({ papel: "escritor", motivo: expect.stringContaining("no permite pago") });
    expect(chat).toMatchObject({ papel: "chat", motivo: expect.stringContaining("privado") });
  });

  it("local por activar: capacidad sin usar, la más potente medida primero, y no muta la entrada", () => {
    const ofertas = [oferta("n-lenta", ["escritor", "chat"]), oferta("srv-cerebro", ["chat"]), oferta("n-potente", ["escritor"])];
    const vinculadas = new Set(["servidor-propio"]);
    const gs = sugerir({
      asignaciones: [asig("escritor"), asig("chat", {}, ["srv-cerebro"])], ofertas, vinculadas,
      potencia: new Map([["n-potente", 80], ["srv-cerebro", 10]]),
      contenedores: [cont("servidor-propio"), cont("neurona-contenedor")],
    });
    expect(ids(gs, "local-por-activar")).toEqual(["n-potente", "n-lenta", "neurona-contenedor"]);
    expect(opciones(gs, "local-por-activar")[1]).toMatchObject({ papeles: ["escritor", "chat"], privacidad: "local" });
    expect(opciones(gs, "local-por-activar")[2].papeles).toEqual([]);
    expect(sinOpcion(gs)).toEqual([]);
    expect(ofertas.map((o) => o.id)).toEqual(["n-lenta", "srv-cerebro", "n-potente"]);
    expect([...vinculadas]).toEqual(["servidor-propio"]);
  });

  it("gratis por vincular: enlaces, límite y papeles; ordena por papeles, privacidad y verificación", () => {
    const gs = sugerir({
      asignaciones: ["escritor", "chat", "revisor", "visión"].map((p) => asig(p as Papel)),
      vinculadas: new Set(["ya-vinculada"]),
      catalogo: [
        op("nube-b", { privacidad: "nube-con-retencion" }), op("aa-sin-verificar"),
        op("zz-verificada", { verificado: "2026-10-19" }), op("nube-a", { papeles: ["escritor", "chat", "imagen"] }),
        op("ya-vinculada"), op("sin-cuenta", { papeles: ["revisor"], requiereCuenta: false }),
        op("local-ausente", { papeles: ["visión"], privacidad: "local" }),
      ],
    });
    expect(ids(gs, "gratis-por-vincular")).toEqual(["nube-a", "zz-verificada", "aa-sin-verificar", "nube-b"]);
    expect(opciones(gs, "gratis-por-vincular")[0]).toMatchObject({ papeles: ["escritor", "chat"], limite: LIMITE,
      enlaceAlta: "https://alta.example/nube-a", enlaceClave: "https://claves.example/nube-a", variables: ["PRUEBA_API_KEY"] });
    // «sin-cuenta» cubre al revisor sin pedir nada; lo local que ninguna neurona ofrece no cubre la visión.
    expect(sinOpcion(gs).map((s) => s.papel)).toEqual(["visión"]);
  });

  it("lo privado no sale de la cuenta: nada de nube para papeles locales ni más allá de su privacidad", () => {
    const gs = sugerir({
      asignaciones: [asig("chat", { privacidad: "local" }), asig("escritor", { privacidad: "nube-sin-retencion" })],
      catalogo: [op("nube-x", { papeles: ["chat", "escritor"], privacidad: "nube-con-retencion" })],
      contenedores: [cont("a1", { requiereCuenta: true, aptoPrivado: false })],
    });
    expect(ids(gs, "gratis-por-vincular")).toEqual([]);
    expect(sinOpcion(gs).map((s) => s.papel)).toEqual(["chat", "escritor"]);
  });

  it("solo sugiere Cloudroom cuando hay una neurona de escritorio compatible", () => {
    const base = { asignaciones: [asig("código")], contenedores: CONTENEDORES_OPCIONES };
    expect(ids(sugerir(base), "gratis-por-vincular")).not.toContain("cloudroom");
    const gs = sugerir({ ...base, relevanteCloudroom: true,
      ofertas: [{ ...oferta("neurona", ["código"]), escritorioCompatible: true }] });
    expect(ids(gs, "gratis-por-vincular")).toContain("cloudroom");
    expect(opciones(gs, "gratis-por-vincular").find((s) => s.id === "cloudroom")?.motivo).toContain("100 agentes");
    expect(ids(sugerir({ ...base, ofertas: [{ ...oferta("neurona", ["código"]), escritorioCompatible: true }] }),
      "gratis-por-vincular")).not.toContain("cloudroom");
  });

  describe("de pago solo con permiso del ámbito (contenedores reales)", () => {
    const catalogo = [op("pago-1", { gratis: null, papeles: ["escritor", "código"] }), op("nube-a")];
    const contenedores = CONTENEDORES_OPCIONES;

    it("sin presupuesto no sugiere pago en ningún grupo", () => {
      const gs = sugerir({ asignaciones: [asig("escritor"), asig("código")], catalogo, contenedores });
      expect(gs.map((g) => g.clave)).not.toContain("de-pago-con-permiso");
      expect(JSON.stringify(gs)).not.toMatch(/pago-1|huggingface-spaces|google-cloud/);
      expect(ids(gs, "gratis-por-vincular")).toEqual(expect.arrayContaining(["nube-a", "oracle-a1", "github-actions"]));
      expect(ids(gs, "local-por-activar")).toEqual(["servidor-propio", "neurona-contenedor"]);
      expect(sinOpcion(gs)).toEqual([{ papel: "código", motivo: expect.stringContaining("no permite pago") }]);
    });

    it("con presupuesto va tras lo gratis y solo para papeles que nada más cubre", () => {
      const conTope = { presupuesto: 5 };
      const gs = sugerir({ asignaciones: [asig("escritor", conTope), asig("código", conTope)], catalogo, contenedores });
      expect(gs.map((g) => g.clave)).toEqual(["local-por-activar", "gratis-por-vincular", "de-pago-con-permiso", "sin-opcion"]);
      expect(opciones(gs, "de-pago-con-permiso").find((s) => s.id === "pago-1")?.papeles).toEqual(["código"]);
      expect(ids(gs, "de-pago-con-permiso")).toEqual(expect.arrayContaining(["huggingface-spaces", "google-cloud"]));
      expect(ids(gs, "gratis-por-vincular")).not.toContain("google-cloud");
      expect(sinOpcion(gs)).toEqual([]);
    });
  });
});
