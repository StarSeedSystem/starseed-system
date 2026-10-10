import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const pkgPath = path.resolve(__dirname, "../../../../../package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

describe("XR1010A — dependencias exactas en package.json", () => {
  it("tiene las 7 versiones exactas (6 en dependencies, iwer en devDependencies)", () => {
    expect(pkg.dependencies["@react-three/xr"]).toBe("6.6.31");
    expect(pkg.dependencies["@react-three/uikit"]).toBe("1.0.76");
    expect(pkg.dependencies["detect-gpu"]).toBe("5.0.70");
    expect(pkg.dependencies["@dimforge/rapier3d-compat"]).toBe("0.21.0");
    expect(pkg.dependencies["@pixiv/three-vrm"]).toBe("3.5.5");
    expect(pkg.dependencies["@sparkjsdev/spark"]).toBe("2.3.1");
    expect(pkg.devDependencies["iwer"]).toBe("2.5.0");
  });

  it("NO incluye @iwer/sem ni @react-three/rapier como dependencias directas", () => {
    const depKeys = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(depKeys).not.toContain("@iwer/sem");
    expect(depKeys).not.toContain("@react-three/rapier");
  });
});

describe("XR1010A — paquetes presentes en node_modules (sin import dinámico)", () => {
  const paquetes = [
    ["@react-three/xr", "6.6.31"],
    ["@react-three/uikit", "1.0.76"],
    ["detect-gpu", "5.0.70"],
    ["@dimforge/rapier3d-compat", "0.21.0"],
    ["@pixiv/three-vrm", "3.5.5"],
    ["@sparkjsdev/spark", "2.3.1"],
    ["iwer", "2.5.0"],
  ] as const;

  for (const [nombre, version] of paquetes) {
    it(`${nombre}@${version} existe en node_modules`, () => {
      const pkgDir = path.resolve(__dirname, "../../../../../node_modules", nombre);
      expect(fs.existsSync(pkgDir)).toBe(true);
      const subPkg = JSON.parse(
        fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8")
      );
      expect(subPkg.version).toBe(version);
    });
  }

  it("@iwer/sem y @react-three/rapier NO deben aparecer como dependencias directas del proyecto (pueden existir anidados)", () => {
    // Solo comprobación de ausencia en package.json; no se importa ningún módulo WebGL.
    const pkgPath2 = path.resolve(__dirname, "../../../../../package.json");
    const pkg2 = JSON.parse(fs.readFileSync(pkgPath2, "utf-8"));
    const todos = Object.keys({ ...pkg2.dependencies, ...pkg2.devDependencies });
    expect(todos).not.toContain("@iwer/sem");
    expect(todos).not.toContain("@react-three/rapier");
  });
});
