// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLAVE_POLITICAS, EVENTO_POLITICAS, guardarNeuronaElegida, guardarPoliticaSistema, idSistema, leerNeuronaElegida,
  leerPoliticaSistema, tienePoliticaPropia,
} from "../almacen-politicas";
import { politicaPorDefecto } from "../politica";

afterEach(() => {
  vi.restoreAllMocks();
  try { localStorage.clear(); } catch { /* */ }
});

describe("almacén de políticas", () => {
  it("ids estables por tipo", () => {
    expect(idSistema("os")).toBe("os");
    expect(idSistema("grupo", "huerto-ab12")).toBe("grupo:huerto-ab12");
    expect(idSistema("pagina", "  ")).toBe("pagina:?");
  });

  it("sin nada guardado devuelve la de su tipo", () => {
    expect(leerPoliticaSistema("grupo:x", "grupo")).toEqual(politicaPorDefecto("grupo"));
    expect(tienePoliticaPropia("grupo:x")).toBe(false);
  });

  it("guarda, avisa y lee de vuelta saneado", () => {
    const oido = vi.fn();
    window.addEventListener(EVENTO_POLITICAS, oido);
    const p = { ...politicaPorDefecto("perfil"), interfaz: { modo: "manual" as const } };
    expect(guardarPoliticaSistema("perfil:u1", "perfil", p)).toBe(true);
    expect(oido).toHaveBeenCalledTimes(1);
    expect(leerPoliticaSistema("perfil:u1", "perfil").interfaz.modo).toBe("manual");
    expect(tienePoliticaPropia("perfil:u1")).toBe(true);
    expect(JSON.parse(localStorage.getItem(CLAVE_POLITICAS)!)["perfil:u1"].tipo).toBe("perfil");
    window.removeEventListener(EVENTO_POLITICAS, oido);
  });

  it("JSON roto o almacenamiento bloqueado no rompen nada", () => {
    localStorage.setItem(CLAVE_POLITICAS, "{roto");
    expect(leerPoliticaSistema("os", "os")).toEqual(politicaPorDefecto("os"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(guardarPoliticaSistema("os", "os", politicaPorDefecto("os"))).toBe(false);
  });

  it("neurona elegida: guarda, valida y borra", () => {
    guardarNeuronaElegida("neu-mac.1");
    expect(leerNeuronaElegida()).toBe("neu-mac.1");
    localStorage.setItem("starseed.actualizaciones.neurona-elegida.v1", "<script>");
    expect(leerNeuronaElegida()).toBeNull();
    guardarNeuronaElegida(null);
    expect(leerNeuronaElegida()).toBeNull();
  });
});
