import { describe, it, expect, beforeEach } from "vitest";
import {
  crearAdaptadorApariencia,
  disenoDeApariencia,
  idsApariencia,
  registrarAdaptadoresApariencia,
  variacionAGuardado,
  variacionDesdeGuardado,
  type DepsApariencia,
  type FamiliaApariencia,
} from "../apariencia";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";

const TEMA = "synthwave-horizon";
const FONDO = "gradiente-aurora";

function depsCon(activos: Partial<Record<FamiliaApariencia, string | null>>) {
  const escritos: Array<{ familia: FamiliaApariencia; id: string | null }> = [];
  const deps: DepsApariencia = {
    leer: (familia) => activos[familia] ?? null,
    escribir: (familia, id) => {
      activos[familia] = id;
      escritos.push({ familia, id });
    },
  };
  return { deps, activos, escritos };
}

beforeEach(() => {
  __resetRegistros();
});

describe("adaptador de apariencia", () => {
  it("captura el tema activo como DesignFile de un id de curatedPresets", () => {
    const { deps } = depsCon({ tema: TEMA });
    const diseno = crearAdaptadorApariencia("tema", deps).capturar(`tema:${TEMA}`);
    expect(diseno?.id).toBe(TEMA);
    expect(diseno?.tipo).toBe("tema-completo");
    expect(diseno?.nombre).toBe("Synthwave Horizon");
    expect(diseno?.payload.appearance).toBeTruthy();
  });

  it("captura el fondo activo desde BACKGROUND_REGISTRY", () => {
    const { deps } = depsCon({ fondo: FONDO });
    const diseno = crearAdaptadorApariencia("fondo", deps).capturar(`fondo:${FONDO}`);
    expect(diseno?.id).toBe(FONDO);
    expect(diseno?.tipo).toBe("fondo");
    expect(diseno?.payload.tokens?.background).toBe(FONDO);
  });

  it("no captura si no hay nada activo ni si la clave es de otra familia", () => {
    const vacio = depsCon({});
    expect(crearAdaptadorApariencia("tema", vacio.deps).capturar(`tema:${TEMA}`)).toBeNull();
    const conFondo = depsCon({ fondo: FONDO });
    expect(crearAdaptadorApariencia("tema", conFondo.deps).capturar(`fondo:${FONDO}`)).toBeNull();
    expect(crearAdaptadorApariencia("tema", conFondo.deps).capturar("clave-invalida")).toBeNull();
  });

  it("aplicar escribe el id y deshacer devuelve el estado anterior", () => {
    const { deps, escritos } = depsCon({ tema: "tokyo-midnight" });
    const adaptador = crearAdaptadorApariencia("tema", deps);
    const diseno = disenoDeApariencia("tema", TEMA);
    expect(diseno).not.toBeNull();
    if (!diseno) return;
    const { deshacer } = adaptador.aplicar(`tema:${TEMA}`, diseno);
    expect(escritos).toEqual([{ familia: "tema", id: TEMA }]);
    deshacer();
    expect(escritos[1]).toEqual({ familia: "tema", id: "tokyo-midnight" });
  });

  it("no aplica nada sin validar: un id ajeno al registro no escribe", () => {
    const { deps, escritos } = depsCon({ tema: TEMA });
    const ajeno = { ...disenoDeApariencia("tema", TEMA)!, id: "tema-inventado" };
    const { deshacer } = crearAdaptadorApariencia("tema", deps).aplicar(`tema:${ajeno.id}`, ajeno);
    expect(escritos).toHaveLength(0);
    deshacer();
    expect(escritos).toHaveLength(0);
  });

  it("valida los ids canónicos y rechaza un secreto en el payload", () => {
    const { deps } = depsCon({});
    const adaptador = crearAdaptadorApariencia("tema", deps);
    const bueno = disenoDeApariencia("tema", TEMA);
    expect(adaptador.validar(bueno).ok).toBe(true);

    const conSecreto = { ...bueno!, payload: { ...bueno!.payload, token: "sk-fake123def456ghi789" } };
    const revision = adaptador.validar(conSecreto);
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.motivos.some((m) => m.startsWith("Privacidad"))).toBe(true);
  });

  it("ida y vuelta por la Biblioteca conserva el diseño", () => {
    const diseno = disenoDeApariencia("fondo", FONDO);
    expect(diseno).not.toBeNull();
    if (!diseno) return;
    const entrada = variacionAGuardado(diseno, "fondos");
    expect(entrada.type).toBe("design");
    expect(variacionDesdeGuardado(entrada)?.id).toBe(FONDO);
    const adaptador = crearAdaptadorApariencia("fondo", depsCon({}).deps);
    expect(adaptador.validar(entrada).ok).toBe(true);
  });

  it("registra tema y fondo en el registro compartido", () => {
    const { deps } = depsCon({ tema: TEMA, fondo: FONDO });
    registrarAdaptadoresApariencia(deps);
    expect(familiasRegistradas()).toEqual(["tema", "fondo"]);
    expect(adaptadorDe("tema:synthwave-horizon")?.familia).toBe("tema");
    expect(adaptadorDe("fondo:estrellas")?.familia).toBe("fondo");
  });

  it("expone los ids de los dos registros canónicos", () => {
    expect(idsApariencia("tema")).toContain(TEMA);
    expect(idsApariencia("fondo")).toContain(FONDO);
    expect(idsApariencia("fondo")).not.toContain("fondo-inventado");
  });
});
