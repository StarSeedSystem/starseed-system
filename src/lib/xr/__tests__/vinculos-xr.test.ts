import { describe, expect, it } from "vitest";
import type { FuenteControl } from "@/lib/protomolecula/vinculos-control";
import { ACCIONES_OBLIGATORIAS, ACCIONES_XR, MAPAS_DEFECTO, asignar, claveGatillo, gatilloAFuente, validarMapa, type Gatillo, type MapaEntrada } from "../vinculos-xr";
import type { EntradaXR } from "../tipos";

const ENTRADAS = Object.keys(MAPAS_DEFECTO) as EntradaXR[];

describe("mapas por defecto", () => {
  it("hay un mapa para cada forma de entrar y TODOS pasan su propia validación", () => {
    expect(ENTRADAS.sort()).toEqual(["gamepad", "manos", "mandos", "mirada-pellizco", "teclado-raton", "tactil", "voz"].sort());
    for (const e of ENTRADAS) expect(validarMapa(e, MAPAS_DEFECTO[e]), `${e}: ${validarMapa(e, MAPAS_DEFECTO[e]).problemas.join(" | ")}`).toMatchObject({ ok: true });
  });
  it("en todas se puede salir y abrir el menú: nadie queda atrapado", () => {
    for (const e of ENTRADAS) for (const a of ACCIONES_OBLIGATORIAS) expect(MAPAS_DEFECTO[e][a]?.length, `${e}/${a}`).toBeGreaterThan(0);
  });
  it("salir con voz funciona siempre («salir»)", () => {
    for (const e of ["voz", "manos", "tactil", "mirada-pellizco"] as const) expect(MAPAS_DEFECTO[e].salir?.some((g) => g.tipo === "frase" && g.texto === "salir")).toBe(true);
  });
  it("todas las acciones del vocabulario existen y no hay ninguna fuera de él", () => {
    for (const e of ENTRADAS) for (const a of Object.keys(MAPAS_DEFECTO[e])) expect(ACCIONES_XR).toContain(a);
  });
});

describe("validar un mapa", () => {
  const base = (): MapaEntrada => structuredClone(MAPAS_DEFECTO.mandos);
  it("detecta dos acciones con el mismo gatillo", () => {
    const m = base();
    m.recentrar = [{ tipo: "boton", indice: 5, mano: "derecha" }];
    const r = validarMapa("mandos", m);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/mismo gatillo/);
  });
  it("rechaza un gesto del sistema y un gatillo que no existe con esa entrada", () => {
    const m = base();
    m.recentrar = [{ tipo: "gesto", gesto: "pellizco-palma", mano: "izquierda" }];
    expect(validarMapa("manos", { ...MAPAS_DEFECTO.manos, recentrar: m.recentrar }).problemas.join(" ")).toMatch(/del sistema/);
    expect(validarMapa("mandos", { ...base(), recentrar: [{ tipo: "tecla", codigo: "KeyR" }] }).problemas.join(" ")).toMatch(/no existe con mandos/);
  });
  it("exige salir y el menú de mano, y botones entre 0 y 9", () => {
    const m = base();
    delete m.salir;
    expect(validarMapa("mandos", m).problemas.join(" ")).toMatch(/Falta un gatillo para «salir»/);
    expect(validarMapa("mandos", { ...base(), agarrar: [{ tipo: "boton", indice: 14, mano: "izquierda" }] }).problemas.join(" ")).toMatch(/no existe/);
  });
});

describe("reasignar sin perder nada en silencio", () => {
  it("al dar a una acción un gatillo ocupado, se lo quita a la otra y lo dice", () => {
    const { mapa, desplazada } = asignar(MAPAS_DEFECTO.mandos, "recentrar", { tipo: "boton", indice: 5, mano: "derecha" });
    expect(desplazada).toBe("salir");
    expect(mapa.salir).toBeUndefined();
    expect(validarMapa("mandos", mapa).problemas.join(" ")).toMatch(/«salir»/);
  });
  it("un gatillo libre se añade el primero y conserva los demás", () => {
    const { mapa, desplazada } = asignar(MAPAS_DEFECTO.mandos, "agarrar", { tipo: "boton", indice: 2, mano: "derecha" });
    expect(desplazada).toBeNull();
    expect(mapa.agarrar?.[0]).toEqual({ tipo: "boton", indice: 2, mano: "derecha" });
    expect(mapa.agarrar?.length).toBe((MAPAS_DEFECTO.mandos.agarrar?.length ?? 0) + 1);
  });
  it("asignar dos veces lo mismo no duplica", () => {
    const g: Gatillo = { tipo: "boton", indice: 2, mano: "derecha" };
    const una = asignar(MAPAS_DEFECTO.mandos, "agarrar", g).mapa;
    const dos = asignar(una, "agarrar", g).mapa;
    expect(dos.agarrar?.filter((x) => claveGatillo(x) === claveGatillo(g)).length).toBe(1);
  });
});

describe("puente con la Protomolécula", () => {
  it("un botón o eje de mando se convierte en una FuenteControl de gamepad (0 izquierda, 1 derecha)", () => {
    const f1: FuenteControl | null = gatilloAFuente({ tipo: "boton", indice: 4, mano: "izquierda" });
    const f2: FuenteControl | null = gatilloAFuente({ tipo: "eje", indice: 3, direccion: "-", mano: "derecha" });
    expect(f1).toEqual({ tipo: "gamepad", control: "boton", numero: 4, indice: 0 });
    expect(f2).toEqual({ tipo: "gamepad", control: "eje", numero: 3, indice: 1 });
  });
  it("un gesto, una tecla o una frase no son un gamepad", () => {
    expect(gatilloAFuente({ tipo: "gesto", gesto: "pellizco", mano: "cualquiera" })).toBeNull();
    expect(gatilloAFuente({ tipo: "tecla", codigo: "KeyM" })).toBeNull();
    expect(gatilloAFuente({ tipo: "frase", texto: "salir" })).toBeNull();
  });
});
