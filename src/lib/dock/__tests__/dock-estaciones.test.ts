// StarSeed · Ola 1010E (ES1010Q): «Estaciones» en el dock para todas las cuentas.
//
// La garantía de botones predeterminados decide con la VERSIÓN que viaja
// dentro del payload sincronizado (dock-defaults.ts): una cuenta con payload
// v22 no conoce `estaciones` y debe recibirlo ENCENDIDO al normalizar; una con
// payload v23 que lo apagó ya decidió y se respeta tal cual. Se fija además
// que la semilla de respaldo (la que usa el camino de sync cuando el catálogo
// real no está cargado) sea EXACTA al preset del catálogo.
import { describe, expect, it } from "vitest";
import {
  DOCK_DEFAULT_ON_IDS,
  DOCK_DEFAULTS_VERSION,
  normalizeDockState,
} from "@/lib/dock/dock-defaults";

/** Item cualquiera que no participa en la garantía (debe sobrevivir intacto). */
const otro = { id: "dashboard", label: "Dashboard", enabled: true, origin: "preset" };

// El proveedor de semillas canónico se registra al IMPORTAR dock-config.ts (que
// arrastra lucide-react). Este fichero NO lo importa estático: la normalización
// de abajo corre con el proveedor aún sin registrar y usa FALLBACK_SEEDS. El
// catálogo se importa dinámicamente ya dentro de la prueba que compara lo que
// produjo la semilla de respaldo con el preset real.
const garantia = normalizeDockState({ defaultsVersion: 22, items: [otro] });
const porRespaldo = garantia.payload.items.find((i) => i.id === "estaciones");

const habilitados = (items: Array<{ id: string; enabled?: boolean }>) =>
  items.filter((i) => i.enabled === true).map((i) => i.id);

describe("dock · estaciones (Ola 1010E)", () => {
  it("la garantía alcanza `estaciones`: versión 23 e id al final de DOCK_DEFAULT_ON_IDS", () => {
    expect(DOCK_DEFAULTS_VERSION).toBe(23);
    expect(DOCK_DEFAULT_ON_IDS[DOCK_DEFAULT_ON_IDS.length - 1]).toBe("estaciones");
  });

  it("un payload v22 sin `estaciones` lo recibe encendido (y estampa la v23)", () => {
    expect(garantia.changed).toBe(true);
    expect(garantia.payload.defaultsVersion).toBe(DOCK_DEFAULTS_VERSION);
    expect(porRespaldo?.enabled).toBe(true);
    // La garantía entera sigue viva y no se pierde nada de lo que ya había.
    expect(habilitados(garantia.payload.items)).toEqual(
      expect.arrayContaining([...DOCK_DEFAULT_ON_IDS]),
    );
    expect(garantia.payload.items.some((i) => i.id === "dashboard")).toBe(true);
    expect(garantia.payload.items.filter((i) => i.id === "estaciones")).toHaveLength(1);
  });

  it("un payload v23 que apagó `estaciones` se respeta tal cual", () => {
    const r = normalizeDockState({
      defaultsVersion: DOCK_DEFAULTS_VERSION,
      items: [otro, { id: "estaciones", label: "Estaciones", enabled: false, origin: "preset" }],
    });
    expect(r.changed).toBe(false);
    expect(r.payload.items.find((i) => i.id === "estaciones")?.enabled).toBe(false);
  });

  it("la semilla de respaldo es idéntica al preset del catálogo", async () => {
    // Import dinámico AQUÍ y no arriba: al cargar el catálogo se registra el
    // proveedor canónico, y lo que se comparó arriba ya se produjo por respaldo.
    const { DOCK_PRESETS } = await import("@/components/layout/dock-config");
    const preset = DOCK_PRESETS.find((p) => p.id === "estaciones");
    expect(preset).toBeDefined();
    expect(porRespaldo).toEqual(preset);
  });
});
