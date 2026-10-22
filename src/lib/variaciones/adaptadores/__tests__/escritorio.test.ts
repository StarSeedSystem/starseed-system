import { describe, it, expect } from "vitest";
import type { DockItemConfig } from "@/components/layout/dock-config";
import {
  crearAdaptadorApp, crearAdaptadorDock, crearAdaptadorEscritorio,
  registrarAdaptadoresEscritorio, validarParcheApp, validarParcheDock, validarParcheEscritorio,
  type IconoEscritorio, type Movimiento, type PuertoApps, type PuertoDock, type PuertoEscritorio, type RegistroApps,
} from "../escritorio";
import { familiasRegistradas, __resetRegistros } from "../../familias";

const motivos = (r: { ok: boolean; motivos?: string[] }) => (r.ok ? "" : (r.motivos ?? []).join(" "));
const item = (id: string, extra: Partial<DockItemConfig> = {}): DockItemConfig => ({
  id, label: id, iconKey: "Sparkles", path: `/${id}`, color: "cyan", enabled: true, origin: "preset", ...extra,
});
function dockFalso(inicial: DockItemConfig[]): { puerto: PuertoDock; items(): DockItemConfig[] } {
  let items = inicial;
  return { puerto: { leer: () => items, guardar: (siguiente) => { items = siguiente; } }, items: () => items };
}
function appsFalso(inicial: RegistroApps = {}): { puerto: PuertoApps; overrides(): RegistroApps } {
  let overrides = inicial;
  return { puerto: { existe: (id) => ["notas", "clima"].includes(id), leer: () => overrides, guardar: (r) => { overrides = r; } }, overrides: () => overrides };
}
function escritorioFalso(inicial: IconoEscritorio[]): { puerto: PuertoEscritorio; iconos(): IconoEscritorio[] } {
  let iconos = inicial;
  const mover = (cs: Movimiento[]) => { iconos = iconos.map((i) => { const c = cs.find((x) => x.id === i.id); return c ? { ...i, x: c.x, y: c.y, ...(c.page !== undefined ? { page: c.page } : {}) } : i; }); };
  return { puerto: { leer: () => iconos, mover }, iconos: () => iconos };
}

describe("escritorio · familias escritorio, dock y app", () => {
  it("dock: solo acepta campos presentacionales y nunca cambia la ruta", () => {
    expect(validarParcheDock({ id: "genesis", label: "Origen", color: "amber" }).ok).toBe(true);
    expect(motivos(validarParcheDock({ id: "genesis", path: "/fuera" }))).toContain("no es un campo");
    expect(motivos(validarParcheDock({ id: "genesis", color: "#39FF14" }))).toContain("token del OS");
    expect(motivos(validarParcheDock({ id: "genesis" }))).toContain("no cambia nada");
    expect(motivos(validarParcheDock({ id: "con espacios" }))).toContain("id no es válido");
  });

  it("dock: aplica la variación y deshacer restaura el estado previo", () => {
    const { puerto, items } = dockFalso([item("genesis"), item("dashboard")]);
    const adaptador = crearAdaptadorDock(puerto);
    const aplicado = adaptador.aplicar("dock:genesis", { id: "genesis", label: "Génesis", color: "amber", enabled: false });
    expect(items()[0]).toMatchObject({ id: "genesis", label: "Génesis", color: "amber", enabled: false, path: "/genesis" });
    expect(items()[1]).toMatchObject({ id: "dashboard", label: "dashboard" });
    expect(adaptador.capturar("dock:genesis")).toMatchObject({ id: "genesis", label: "Génesis", color: "amber" });
    expect(adaptador.capturar("dock:otro")).toBeNull();
    aplicado.deshacer();
    expect(items()[0]).toMatchObject({ label: "genesis", color: "cyan", enabled: true });
  });

  it("dock: no ejecuta nada sin validar ni sobre un elemento ausente", () => {
    const { puerto, items } = dockFalso([item("genesis")]);
    const adaptador = crearAdaptadorDock(puerto);
    expect(() => adaptador.aplicar("dock:genesis", { id: "genesis", path: "/otro" } as never)).toThrow("rechazada");
    expect(() => adaptador.aplicar("dock:otro", { id: "otro", label: "Otro" })).toThrow("no existe");
    expect(items()[0].label).toBe("genesis");
  });

  it("app: acento como token del OS, sin hexadecimales sueltos, y deshacer restaura", () => {
    const { puerto, overrides } = appsFalso();
    expect(validarParcheApp({ id: "clima", accent: "emerald", short: "Clima" }).ok).toBe(true);
    expect(motivos(validarParcheApp({ id: "clima", accent: "#39FF14" }))).toContain("token del OS");
    expect(motivos(validarParcheApp({ id: "clima", url: "https://x.test" }))).toContain("no es un campo");
    const adaptador = crearAdaptadorApp(puerto);
    expect(adaptador.capturar("app:clima")).toBeNull();
    const aplicado = adaptador.aplicar("app:clima", { id: "clima", accent: "amber" });
    expect(overrides().clima).toEqual({ accent: "amber" });
    expect(adaptador.capturar("app:clima")).toEqual({ id: "clima", accent: "amber", short: undefined });
    aplicado.deshacer();
    expect(overrides().clima).toBeUndefined();
    expect(() => adaptador.aplicar("app:inexistente", { id: "inexistente", accent: "cyan" })).toThrow("no existe");
  });

  it("escritorio: la disposición no lleva nombres ni URLs y exige posiciones fraccionarias", () => {
    expect(validarParcheEscritorio({ iconos: [{ ref: "clima", x: 0.25, y: 0.5, page: 1 }] }).ok).toBe(true);
    expect(motivos(validarParcheEscritorio({ iconos: [{ ref: "clima", x: 0.2, y: 0.2, name: "mis-fotos.png" }] }))).toContain("datos privados");
    expect(motivos(validarParcheEscritorio({ iconos: [{ ref: "clima", x: 0.2, y: 0.2, url: "https://x.test/a" }] }))).toContain("datos privados");
    expect(motivos(validarParcheEscritorio({ iconos: [{ ref: "clima", x: 1.4, y: 0.2 }] }))).toContain("de 0 a 1");
    expect(motivos(validarParcheEscritorio({ iconos: [] }))).toContain("entre 1 y 64");
  });

  it("escritorio: mueve por entidad compartida (no por nombre) y deshacer vuelve a colocar", () => {
    const { puerto, iconos } = escritorioFalso([
      { ref: "clima", id: "i1", x: 0.1, y: 0.1 },
      { ref: "notas", id: "i2", x: 0.5, y: 0.5, page: 1 },
    ]);
    const adaptador = crearAdaptadorEscritorio(puerto);
    expect(adaptador.capturar("escritorio:iconos")).toEqual({ iconos: [{ ref: "clima", x: 0.1, y: 0.1 }, { ref: "notas", x: 0.5, y: 0.5, page: 1 }] });
    expect(adaptador.capturar("dock:genesis")).toBeNull();
    const aplicado = adaptador.aplicar("escritorio:iconos", { iconos: [{ ref: "clima", x: 0.9, y: 0.2 }, { ref: "notas", x: 0.3, y: 0.7 }] });
    expect(iconos()).toEqual([{ ref: "clima", id: "i1", x: 0.9, y: 0.2 }, { ref: "notas", id: "i2", x: 0.3, y: 0.7, page: 1 }]);
    aplicado.deshacer();
    expect(iconos()).toEqual([{ ref: "clima", id: "i1", x: 0.1, y: 0.1 }, { ref: "notas", id: "i2", x: 0.5, y: 0.5, page: 1 }]);
    expect(() => adaptador.aplicar("escritorio:iconos", { iconos: [{ ref: "ajena", x: 0.2, y: 0.2 }] })).toThrow("ninguna referencia");
  });

  it("registra las tres familias del escritorio, el dock y las apps", () => {
    __resetRegistros();
    registrarAdaptadoresEscritorio({ dock: dockFalso([item("genesis")]).puerto, apps: appsFalso().puerto, escritorio: escritorioFalso([]).puerto });
    expect(familiasRegistradas().sort()).toEqual(["app", "dock", "escritorio"]);
  });
});
