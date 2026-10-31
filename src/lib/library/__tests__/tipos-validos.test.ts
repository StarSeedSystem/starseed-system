import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { VALID_KINDS, allPackages } from "../packages";

const RAIZ = path.resolve(__dirname, "../../../..");

// Guardia del 31-10: una ficha con kind «tool» tumbó la Biblioteca entera.
// La tienda ya cae con gracia (KIND_META[pkg.kind] ?? KIND_META.app), pero eso
// pintaba un tipo raro como si fuera una app en silencio. Esta prueba recorre
// el catálogo completo para que una ficha nueva tipo raro salga en rojo en el
// CI y no en producción.
describe("Biblioteca · todo kind del catálogo es válido y pintable", () => {
  it("cada paquete de allPackages() lleva un kind dentro de VALID_KINDS", () => {
    const paquetes = allPackages();
    expect(paquetes.length).toBeGreaterThan(0);
    const validos = new Set<string>(VALID_KINDS);
    for (const p of paquetes) {
      expect(validos.has(p.kind), `${p.id}: kind «${p.kind}» no está en VALID_KINDS`).toBe(true);
    }
  });

  it("cada kind válido tiene su entrada en el KIND_META de la tienda (se pinta con su chip e icono)", () => {
    const tienda = readFileSync(
      path.join(RAIZ, "src/components/library/package-store.tsx"),
      "utf8",
    );
    const bloque =
      /KIND_META: Record<(?:PackageKind)[^=]*=\s*\{([\s\S]*?)\n\};/.exec(tienda)?.[1] ?? "";
    expect(bloque.length, "KIND_META no encontrado en package-store.tsx").toBeGreaterThan(100);
    for (const kind of VALID_KINDS) {
      // Las claves con guion van entrecomilladas («"ai-source"»): aceptamos las dos formas.
      expect(bloque, `KIND_META no pinta «${kind}»`).toMatch(new RegExp(`["']?${kind}["']?:`));
    }
  });
});
