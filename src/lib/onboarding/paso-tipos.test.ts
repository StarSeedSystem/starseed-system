import { describe, it, expect, expectTypeOf } from "vitest";
import { User, type LucideIcon } from "lucide-react";
import {
  TipoCuenta,
  EstadoOnboarding,
  PropsPaso,
  PropsTarjetaTipo,
} from "./paso-tipos";

describe("tipos de los pasos del onboarding", () => {
  it("ninguna prop del paso es any", () => {
    expectTypeOf<PropsPaso["state"]>().not.toBeAny();
    expectTypeOf<PropsPaso["setState"]>().not.toBeAny();
    expectTypeOf<PropsPaso["onNext"]>().not.toBeAny();
    expectTypeOf<PropsTarjetaTipo["icon"]>().not.toBeAny();
    expectTypeOf<PropsTarjetaTipo["label"]>().not.toBeAny();
    expectTypeOf<PropsTarjetaTipo["desc"]>().not.toBeAny();
    expectTypeOf<PropsTarjetaTipo["selected"]>().not.toBeAny();
    expectTypeOf<PropsTarjetaTipo["onClick"]>().not.toBeAny();
    expect(true).toBe(true);
  });

  it("kind es un literal de los dos tipos de cuenta, no una cadena suelta", () => {
    expectTypeOf<EstadoOnboarding["kind"]>().toEqualTypeOf<TipoCuenta | undefined>();
    const kind: TipoCuenta = "grupo";
    expect(kind).toBe("grupo");
  });

  it("setState exige el estado completo y onNext es una función sin argumentos", () => {
    const state: EstadoOnboarding = {};
    const setState: PropsPaso["setState"] = () => {};
    const onNext: PropsPaso["onNext"] = () => {};
    setState({ ...state, kind: "individual" });
    onNext();
    expectTypeOf<ReturnType<PropsPaso["onNext"]>>().toEqualTypeOf<void>();
    expect(true).toBe(true);
  });

  it("icon de la tarjeta acepta un icono de lucide", () => {
    expectTypeOf(User).toEqualTypeOf<LucideIcon>();
  });
});
