import fs from "node:fs";
import path from "node:path";

/* DIS1005C — módulo puro de verificación de tokens de armonía */

export function leerArchivo(rutaRelativa: string): string {
  const base = process.cwd();
  return fs.readFileSync(path.join(base, rutaRelativa), "utf-8");
}

export function contieneTokensArmonia(cssText: string, configText: string): {
  tokensCss: boolean;
  tokensConfig: boolean;
  clavesConservadas: boolean;
} {
  const phiPresente = cssText.includes("--phi: 1.618");
  const fibCss = ["fib-1", "fib-2", "fib-3", "fib-4", "fib-5", "fib-6", "fib-7", "fib-8", "fib-9", "fib-10"]
    .map((k) => cssText.includes(`--${k}:`))
    .every(Boolean);
  const fsCss = ["fs-phi--2", "fs-phi--1", "fs-phi-1", "fs-phi-2", "fs-phi-3", "fs-phi-4"]
    .map((k) => cssText.includes(`--${k}:`))
    .every(Boolean);

  const fibConfig = ["fib-1", "fib-2", "fib-3", "fib-4", "fib-5", "fib-6", "fib-7", "fib-8", "fib-9", "fib-10"]
    .map((k) => configText.includes(`'${k}'`) || configText.includes(`"${k}"`))
    .every(Boolean);
  const phiConfig = ["phi--2", "phi--1", "phi-1", "phi-2", "phi-3", "phi-4"]
    .map((k) => configText.includes(`'${k}'`) || configText.includes(`"${k}"`))
    .every(Boolean);

  // Claves existentes que NO deben eliminarse (lista mínima de referencia)
  const clavesCss = ["--background-hsl", "--primary-rgb", "--font-body", "--text-fluid-xs"];
  const clavesConfig = ["fontFamily", "colors", "borderRadius", "keyframes", "animation", "opacity"];
  const clavesCssConservadas = clavesCss.every((c) => cssText.includes(c));
  const clavesConfigConservadas = clavesConfig.every((c) => configText.includes(c));

  return {
    tokensCss: phiPresente && fibCss && fsCss,
    tokensConfig: fibConfig && phiConfig,
    clavesConservadas: clavesCssConservadas && clavesConfigConservadas,
  };
}

export interface PasoPhi {
  nombre: string;
  exponente: number;
  min: number;
  max: number;
}

/* Extrae los pasos --fs-phi-<n> con su clamp(min, ..., max) en rem */
export function extraerEscalaPhi(cssText: string): PasoPhi[] {
  const re = /--fs-phi-(-?\d+):\s*clamp\(\s*([\d.]+)rem\s*,[^,]+,\s*([\d.]+)rem\s*\)/g;
  const pasos: PasoPhi[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cssText)) !== null) {
    pasos.push({
      nombre: `--fs-phi-${m[1]}`,
      exponente: Number.parseInt(m[1], 10),
      min: Number.parseFloat(m[2]),
      max: Number.parseFloat(m[3]),
    });
  }
  return pasos.sort((a, b) => a.exponente - b.exponente);
}

/* Comprueba mínimo ≤ máximo en cada paso y razón ≈ φ entre máximos consecutivos */
export function verificarEscalaPhi(cssText: string, tolerancia = 0.01): {
  minimosCoherentes: boolean;
  razonPhi: boolean;
  pasos: PasoPhi[];
} {
  const pasos = extraerEscalaPhi(cssText);
  const minimosCoherentes = pasos.every((p) => p.min <= p.max);
  const razonPhi = pasos.every((p, i) => {
    if (i === 0) return true;
    const razon = p.max / pasos[i - 1].max;
    return Math.abs(razon - 1.618) <= tolerancia;
  });
  return { minimosCoherentes, razonPhi, pasos };
}
