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
