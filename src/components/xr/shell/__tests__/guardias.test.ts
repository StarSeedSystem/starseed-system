import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "..", "..", "..", "..", "..");
const SRC = path.join(ROOT, "src");
const SHELL = path.join(__dirname, "..");
const LIB_XR = path.join(ROOT, "src", "lib", "xr");

function listar(dir: string, ext: string): string[] {
  if (!statSync(dir).isDirectory()) return [];
  return readdirSync(dir).filter((f) => f.endsWith(ext));
}
function listarRecursivo(dir: string, ext: string, base = dir): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listarRecursivo(full, ext, base));
    } else if (entry.endsWith(ext)) {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

const HEAVY_PKGS = [
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "@react-three/xr",
  "@react-three/uikit",
  "@pmndrs/xr",
  "@pmndrs/uikit",
  "@dimforge/rapier3d-compat",
  "@pixiv/three-vrm",
  "@sparkjsdev/spark",
];

const NODE_BUILTINS = [
  "node:fs",
  "node:fs/promises",
  "node:path",
  "node:os",
  "node:child_process",
  "node:crypto",
  "node:http",
  "node:https",
  "node:url",
  "node:util",
  "node:stream",
  "node:events",
  "node:buffer",
  "node:querystring",
];

function extraerImports(archivo: string): string[] {
  const src = readFileSync(archivo, "utf8");
  const imports: string[] = [];
  const regex = /from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(src)) !== null) {
    imports.push(m[1]);
  }
  const dynRegex = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dynRegex.exec(src)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

describe("Guardias XR1010AL — contrato §0, §1.3, §3(k)", () => {
  it("ningún archivo de src/ pide la función camera-access", () => {
    const archivos = listarRecursivo(SRC, ".ts").concat(listarRecursivo(SRC, ".tsx"));
    const infractores: string[] = [];
    for (const rel of archivos) {
      if (rel.includes("__tests__")) continue;
      if (rel === "components/xr/shell/__tests__/guardias.test.ts") continue;
      const contenido = readFileSync(path.join(SRC, rel), "utf8");
      if (/["']camera-access["']/.test(contenido)) {
        infractores.push(rel);
      }
    }
    if (infractores.length > 0) {
      console.error("Archivos que piden camera-access:", infractores);
    }
    expect(infractores).toHaveLength(0);
  });

  it("emulate: solo aparece con false/condicionado a desarrollo en almacen-xr.ts", () => {
    const almacen = path.join(SHELL, "almacen-xr.ts");
    const src = readFileSync(almacen, "utf8");
    const lineas = src.split("\n");
    const problemas: string[] = [];
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim();
      if (linea.includes("emulate:") && !linea.includes("emulate: false") && !linea.includes("emuladorPermitido")) {
        problemas.push(`Línea ${i + 1}: ${linea}`);
      }
    }
    if (problemas.length > 0) {
      console.error("Usos de emulate no permitidos:", problemas);
    }
    expect(problemas).toHaveLength(0);
  });

  it("grafo de imports estático desde app-globals.tsx no alcanza three/@react-three/@pmndrs/@dimforge/@pixiv/@sparkjsdev", () => {
    const appGlobals = path.join(ROOT, "src", "app", "(app)", "app-globals.tsx");
    const visitados = new Set<string>();
    const cola: string[] = [appGlobals];
    const alcanzados: string[] = [];

    while (cola.length > 0) {
      const actual = cola.shift()!;
      if (visitados.has(actual)) continue;
      visitados.add(actual);

      const imports = extraerImports(actual);
      for (const imp of imports) {
        const srcActual = readFileSync(actual, "utf8");
        const dynamicImportRegex = new RegExp(`import\\s*\\(\\s*["']${imp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\s*\\)`);
        const isDynamic = dynamicImportRegex.test(srcActual);
        const isNextDynamic = srcActual.includes("next/dynamic") && srcActual.includes(imp);
        if (isDynamic || isNextDynamic) continue;

        let resuelto: string | null = null;
        if (imp.startsWith("@/")) {
          resuelto = path.join(SRC, imp.slice(2));
          if (!resuelto.endsWith(".ts") && !resuelto.endsWith(".tsx")) {
            resuelto += ".ts";
            if (!statSync(resuelto, { throwIfNoEntry: false })?.isFile()) {
              resuelto = resuelto.replace(/\.ts$/, ".tsx");
            }
          }
        } else if (imp.startsWith(".")) {
          resuelto = path.resolve(path.dirname(actual), imp);
          if (!resuelto.endsWith(".ts") && !resuelto.endsWith(".tsx")) {
            resuelto += ".ts";
            if (!statSync(resuelto, { throwIfNoEntry: false })?.isFile()) {
              resuelto = resuelto.replace(/\.ts$/, ".tsx");
            }
          }
        } else {
          for (const pesado of HEAVY_PKGS) {
            if (imp === pesado || imp.startsWith(pesado + "/")) {
              alcanzados.push(`${actual} → ${imp}`);
            }
          }
          continue;
        }

        if (resuelto && statSync(resuelto, { throwIfNoEntry: false })?.isFile()) {
          cola.push(resuelto);
        }
      }
    }

    if (alcanzados.length > 0) {
      console.error("Importaciones a paquetes pesados en grafo estático:", alcanzados);
    }
    expect(alcanzados).toHaveLength(0);
  });

  it("ningún archivo de src/lib/xr/ ni src/components/xr/shell/ importa node:*", () => {
    const archivosXr = listarRecursivo(LIB_XR, ".ts").map((f) => path.join(LIB_XR, f));
    const archivosShell = listarRecursivo(SHELL, ".ts").concat(listarRecursivo(SHELL, ".tsx")).map((f) => path.join(SHELL, f));
    const todos = [...archivosXr, ...archivosShell].filter((f) => !f.includes("__tests__"));
    const infractores: string[] = [];

    for (const archivo of todos) {
      const src = readFileSync(archivo, "utf8");
      for (const builtin of NODE_BUILTINS) {
        if (src.includes(`from "${builtin}"`) || src.includes(`from '${builtin}'`)) {
          infractores.push(`${path.relative(ROOT, archivo)} → ${builtin}`);
        }
      }
    }

    if (infractores.length > 0) {
      console.error("Imports de node:* encontrados:", infractores);
    }
    expect(infractores).toHaveLength(0);
  });

  it("cada módulo de shell/ y lib/xr/ (salvo tipos.ts) se usa fuera de su propia prueba", () => {
    const shellFiles = listar(SHELL, ".ts").concat(listar(SHELL, ".tsx")).filter((f) => !f.includes(".test."));
    const libXrFiles = listar(LIB_XR, ".ts").filter((f) => !f.includes(".test.") && f !== "tipos.ts");
    const todosModulos = [...shellFiles.map((f) => path.join(SHELL, f)), ...libXrFiles.map((f) => path.join(LIB_XR, f))];

    const srcFiles = listarRecursivo(SRC, ".ts").concat(listarRecursivo(SRC, ".tsx")).filter((f) => !f.includes("__tests__"));
    const importadores = new Map<string, Set<string>>();

    for (const rel of srcFiles) {
      const archivo = path.join(SRC, rel);
      const imports = extraerImports(archivo);
      for (const imp of imports) {
        let resuelto: string | null = null;
        if (imp.startsWith("@/")) {
          resuelto = path.join(SRC, imp.slice(2));
          if (!resuelto.endsWith(".ts") && !resuelto.endsWith(".tsx")) {
            const ts = resuelto + ".ts";
            const tsx = resuelto + ".tsx";
            if (statSync(ts, { throwIfNoEntry: false })?.isFile()) resuelto = ts;
            else if (statSync(tsx, { throwIfNoEntry: false })?.isFile()) resuelto = tsx;
          }
        } else if (imp.startsWith(".")) {
          resuelto = path.resolve(path.dirname(archivo), imp);
          if (!resuelto.endsWith(".ts") && !resuelto.endsWith(".tsx")) {
            const ts = resuelto + ".ts";
            const tsx = resuelto + ".tsx";
            if (statSync(ts, { throwIfNoEntry: false })?.isFile()) resuelto = ts;
            else if (statSync(tsx, { throwIfNoEntry: false })?.isFile()) resuelto = tsx;
          }
        }
        if (resuelto) {
          const relResuelto = path.relative(ROOT, resuelto);
          if (!importadores.has(relResuelto)) importadores.set(relResuelto, new Set());
          importadores.get(relResuelto)!.add(rel);
        }
      }
    }

    const noUsados: string[] = [];
    for (const modulo of todosModulos) {
      const rel = path.relative(ROOT, modulo);
      const quien = importadores.get(rel);
      if (!quien || quien.size === 0) {
        noUsados.push(rel);
      }
    }

    if (noUsados.length > 0) {
      console.error("Módulos no importados por ningún archivo no-test:", noUsados);
    }
    expect(noUsados).toHaveLength(0);
  });

  it("src/lib/xr/ respeta ≤ 200 líneas (verifica pureza.test.ts)", () => {
    const archivos = listar(LIB_XR, ".ts").filter((f) => !f.includes(".test."));
    const largos: string[] = [];
    for (const f of archivos) {
      const lineas = readFileSync(path.join(LIB_XR, f), "utf8").split("\n").length;
      if (lineas > 200) largos.push(`${f}: ${lineas} líneas`);
    }
    expect(largos).toHaveLength(0);
  });
});