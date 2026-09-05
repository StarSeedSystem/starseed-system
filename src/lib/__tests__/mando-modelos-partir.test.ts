import { describe, expect, it } from "vitest";
import { partirModelo } from "../mando/modelos-disponibles";

describe("partirModelo (Ola 242 · reasignacion)", () => {
  it("xkiro/qwen/qwen3-coder-plus:free → proveedor xkiro y modelo con barras intactas", () => {
    expect(partirModelo("xkiro/qwen/qwen3-coder-plus:free")).toEqual({ proveedor: "xkiro", modelo: "qwen/qwen3-coder-plus:free" });
  });
  it("moonshotai/kimi-k3 → proveedor moonshotai y modelo kimi-k3", () => {
    expect(partirModelo("moonshotai/kimi-k3")).toEqual({ proveedor: "moonshotai", modelo: "kimi-k3" });
  });
  it("sin barra → proveedor nim por defecto y el id como modelo", () => {
    expect(partirModelo("kimi-k3")).toEqual({ proveedor: "nim", modelo: "kimi-k3" });
  });
});