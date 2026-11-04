import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// Guardias finales de StarSeed XR (XR1010AL · contrato `architecture/starseed-xr.md` §0, §1.3 y §3 k):
// lee el código fuente (node, sin red ni WebGL) y vigila cámara, emulador, peso, `node:*`, cableado y tamaño.
const RAIZ = path.resolve(__dirname, "../../../../..");
function leer(rel: string): string { return readFileSync(path.join(RAIZ, rel), "utf8"); }
function archivos(rel: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(path.join(RAIZ, rel), { withFileTypes: true })) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== "__tests__") salida.push(...archivos(r)); }
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) salida.push(r);
  }
  return salida;
}
const FUENTES = archivos("src");
const SIN_PRUEBAS = FUENTES.filter((f) => !f.includes("__tests__"));
const sinComentarios = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const lineas = (rel: string): number => leer(rel).replace(/\n$/, "").split("\n").length;
const PESADOS = ["three", "@react-three/", "@pmndrs/", "@dimforge/", "@pixiv/", "@sparkjsdev/"];
const esPesado = (spec: string): boolean => PESADOS.some((p) => spec === p || spec.startsWith(p));

function resolver(spec: string, desde: string): string | null {
  let base: string;
  if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(desde), spec));
  else if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (FUENTES.includes(c)) return c;
  }
  return null;
}
const DESDE = /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
const EFECTO = /(?:^|\n)\s*import\s+["']([^"']+)["']/g, DINAMICA = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
function importaciones(rel: string, incluirTipos = false, incluirDinamicas = false): string[] {
  const src = sinComentarios(leer(rel));
  const desde = [...src.matchAll(DESDE)].filter((m) => incluirTipos || !m[2]).map((m) => m[4]);
  const efectos = [...src.matchAll(EFECTO)].map((m) => m[1]);
  const dinamicas = incluirDinamicas ? [...src.matchAll(DINAMICA)].map((m) => m[1]) : [];
  return desde.concat(efectos, dinamicas);
}
function huerfanos(): string[] {
  const importados = new Set<string>();
  for (const f of SIN_PRUEBAS) for (const s of importaciones(f, true, true)) {
    const r = resolver(s, f);
    if (r) importados.add(r);
  }
  return SIN_PRUEBAS.filter((f) => /^(src\/lib\/xr\/[^/]+\.ts|src\/components\/xr\/shell\/[^/]+\.tsx?)$/.test(f))
    .filter((f) => !f.endsWith("/tipos.ts") && !importados.has(f));
}
describe("guardias XR", () => {
  it("(1) ningún archivo pide la función camera-access", () => {
    expect(SIN_PRUEBAS.filter((f) => sinComentarios(leer(f)).includes("camera-access"))).toEqual([]);
  });
  it("(2) emulate: solo en almacen-xr y condicionado a desarrollo", () => {
    const con = SIN_PRUEBAS.filter((f) => /emulate\s*:/.test(sinComentarios(leer(f))));
    expect(con).toEqual(["src/components/xr/shell/almacen-xr.ts"]);
    const linea = sinComentarios(leer(con[0] ?? "")).split("\n").find((l) => /emulate\s*:/.test(l)) ?? "";
    expect(linea).toContain("emuladorPermitido");
    expect(linea).toMatch(/\bfalse\b/);
  });

  it("(3) el layout raíz y la entrada global no arrastran motores 3D", () => {
    const alcanzados: string[] = [];
    for (const inicio of ["src/app/(app)/app-globals.tsx", "src/components/xr/shell/entrada-global.tsx"]) {
      const vistos = new Set<string>();
      const pila = [inicio];
      while (pila.length) {
        const f = pila.pop() as string;
        if (vistos.has(f)) continue;
        vistos.add(f);
        for (const s of importaciones(f)) {
          if (esPesado(s)) alcanzados.push(`${f} -> ${s}`);
          else {
            const r = resolver(s, f);
            if (r && !vistos.has(r)) pila.push(r);
          }
        }
      }
    }
    expect(alcanzados).toEqual([]);
  });

  it("(4) ni el núcleo ni el shell importan node:*", () => {
    const malos = SIN_PRUEBAS.filter((f) => /^src\/(lib\/xr|components\/xr\/shell)\//.test(f))
      .filter((f) => /from\s+["']node:|import\s*\(\s*["']node:|require\s*\(\s*["']node:/.test(sinComentarios(leer(f))));
    expect(malos).toEqual([]);
  });

  it("(5) ningún módulo queda huérfano fuera de la deuda de montaje conocida", () => {
    const pendientes = new Set([
      "src/components/xr/shell/orbe-voz.tsx",
      "src/components/xr/shell/resolver-miembros.ts",
      "src/components/xr/shell/splat-objeto.tsx",
      "src/components/xr/shell/tarjeta-consentimiento.tsx",
      "src/components/xr/shell/use-presencia-xr.ts",
      "src/lib/xr/entrada-eventos.ts",
      "src/lib/xr/mundo-motor.ts",
    ]);
    const faltan = huerfanos().filter((f) => !pendientes.has(f));
    expect(faltan, `Sin importador fuera de pruebas: ${faltan.join(", ")}`).toEqual([]);
  });

  it("(6) tamaños: lib/xr ≤ 200 líneas y shell ≤ 120 (deuda heredada listada)", () => {
    expect(archivos("src/lib/xr").filter((f) => lineas(f) > 200)).toEqual([]);
    const heredados = new Set([
      "src/components/xr/shell/ejecutor-mundo.ts",
      "src/components/xr/shell/mundo-render-puro.ts",
      "src/components/xr/shell/prefs-xr.ts",
      "src/components/xr/shell/boton-entrada-xr.tsx",
      "src/components/xr/shell/dock-3d.tsx",
      "src/components/xr/shell/escena-os.tsx",
      "src/components/xr/shell/mundo-render.tsx",
      "src/components/xr/shell/pizarra-3d.tsx",
    ]);
    const nuevos = archivos("src/components/xr/shell").filter((f) => lineas(f) > 120 && !heredados.has(f));
    expect(nuevos, `Sin dividir y fuera de la deuda conocida: ${nuevos.join(", ")}`).toEqual([]);
  });
});
