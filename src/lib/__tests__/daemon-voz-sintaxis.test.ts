import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Ruta al demonio de voz nativo del OS. Se lee del disco en tiempo de test para
// que el autómata de abajo analice SIEMPRE el archivo real (2026-09-06, Ola 255).
const DAEMON = path.join(process.cwd(), "native/astraura-voice/daemon.mjs");

/** Devuelve las líneas del daemon como un array. */
function lineasDelDaemon(): string[] {
  const contenido = readFileSync(DAEMON, "utf8");
  return contenido.split("\n");
}

/**
 * Extrae el código del daemon sin comentarios de bloque ni de línea (y sin
 * respetar cadenas). Es un autómata sencillo: ignora lo que hay dentro de un
 * `/* ... *​/`, así como lo que va desde `//` hasta fin de línea. El objetivo
 * no es un lexer perfecto, sino detectar funciones tragadas por comentarios.
 */
function codigoSinComentarios(lineas: string[]): string[] {
  const salida: string[] = [];
  let enBloque = false;
  for (const linea of lineas) {
    if (enBloque) {
      const cierre = linea.indexOf("*/");
      if (cierre !== -1) {
        const resto = linea.slice(cierre + 2);
        if (resto.trim() !== "") {
          salida.push(resto);
        }
        enBloque = false;
      }
      continue;
    }
    let i = 0;
    let fragmento = "";
    while (i < linea.length) {
      const dosBarras = linea.indexOf("//", i);
      const apertura = linea.indexOf("/*", i);
      const proxApertura = apertura === -1 ? Number.POSITIVE_INFINITY : apertura;
      const proxComentarioLinea = dosBarras === -1 ? Number.POSITIVE_INFINITY : dosBarras;
      if (proxApertura === Number.POSITIVE_INFINITY && proxComentarioLinea === Number.POSITIVE_INFINITY) {
        fragmento += linea.slice(i);
        break;
      }
      if (proxApertura < proxComentarioLinea) {
        fragmento += linea.slice(i, apertura);
        const cierre = linea.indexOf("*/", apertura + 2);
        if (cierre === -1) {
          enBloque = true;
          break;
        }
        i = cierre + 2;
      } else {
        fragmento += linea.slice(i, dosBarras);
        break;
      }
    }
    if (fragmento.trim() !== "") {
      salida.push(fragmento);
    }
  }
  return salida;
}

describe("daemon de voz: ninguna función tragada por un comentario (Ola 255)", () => {
  it("no hay un comentario de bloque abierto justo antes de una definición", () => {
    const lineas = lineasDelDaemon();
    for (let i = 0; i < lineas.length - 1; i += 1) {
      const actual = lineas[i].trim();
      const siguiente = lineas[i + 1].trim();
      // Un `/**` o `/*` seguido de una definición significa que esa función
      // quedó DENTRO del comentario (ReferenceError en tiempo de ejecución).
      if ((actual === "/**" || actual === "/*") && siguiente !== "") {
        const esDefinicion =
          /^(async\s+)?function\s/.test(siguiente) ||
          /^const\s/.test(siguiente) ||
          /^let\s/.test(siguiente) ||
          /^class\s/.test(siguiente) ||
          /^export\s/.test(siguiente);
        expect(esDefinicion, `comentario de bloque en la línea ${i + 1} traga la definición de la línea ${i + 2}`).toBe(false);
      }
    }
  });

  it("ninguna definición de función vive dentro de un comentario de bloque", () => {
    const lineas = lineasDelDaemon();
    let enBloque = false;
    for (let i = 0; i < lineas.length; i += 1) {
      const linea = lineas[i];
      if (enBloque) {
        // Un comentario de bloque legítimo puede ocupar varias líneas; sólo es
        // un problema si DENTRO de él aparece una definición de función.
        const definicionTragada = /^(async\s+)?function\s/.test(linea.trim());
        expect(definicionTragada, `el comentario abierto en la línea ${i} traga la definición de la línea ${i + 1}`).toBe(false);
        if (linea.indexOf("*/") !== -1) {
          enBloque = false;
        }
        continue;
      }
      const abre = linea.indexOf("/*");
      if (abre !== -1) {
        const resta = linea.slice(abre + 2);
        const definicionEnLinea = /^(async\s+)?function\s/.test(resta.trim());
        expect(definicionEnLinea, `comentario en la línea ${i + 1} traga una definición`).toBe(false);
        const cierra = linea.indexOf("*/", abre + 2);
        if (cierra === -1) {
          enBloque = true;
        }
      }
    }
  });

  it("las funciones del oído residente están definidas fuera de comentarios", () => {
    const codigo = codigoSinComentarios(lineasDelDaemon()).join("\n");
    const funciones = [
      "reconocerResidente",
      "asegurarOidoResidente",
      "cederMemoriaSiHaceFalta",
      "runVibeasr",
      "asrTimeoutMs",
    ];
    for (const nombre of funciones) {
      expect(
        new RegExp(`(async\\s+)?function\\s+${nombre}\\s*\\(`).test(codigo),
        `la función ${nombre} no aparece definida fuera de comentarios`,
      ).toBe(true);
    }
  });
});

describe("daemon de voz: rutas de clonación blindadas (Ola 266 · I1A2)", () => {
  // La revisión de I1A encontró un path traversal REAL: `clonId` se tomaba de
  // `body.personality` sin sanitizar y se interpolaba en refsDir (`../../x`
  // salía de la carpeta). El cierre fue: regex validadora definida UNA vez
  // (`CLON_TIMBRE_RE`) + una única función puerta (`rutaRef`) que construye y
  // verifica TODA ruta de referencias. Este test lee el FUENTE (grep textual)
  // porque el daemon corre fuera de vitest: garantiza que la constante existe
  // y que ninguna ruta de clonación vuelve a construirse a pelo.
  it("CLON_TIMBRE_RE y rutaRef existen en el fuente del demonio", () => {
    const fuente = codigoSinComentarios(lineasDelDaemon()).join("\n");
    expect(fuente.includes("const CLON_TIMBRE_RE = /^[a-z0-9-]{2,40}$/")).toBe(true);
    expect(fuente.includes("const LANG_RE = /^[a-z]{2}$/")).toBe(true);
    expect(/function\s+rutaRef\s*\(\s*timbre,\s*lang,\s*ext\s*\)/.test(fuente)).toBe(true);
    // La puerta comprueba el destino resuelto, no solo los caracteres.
    expect(fuente.includes("path.resolve(PATHS.refsDir) + path.sep")).toBe(true);
  });

  it("ninguna línea que usa refsDir y un id del cliente construye la ruta sin pasar por rutaRef", () => {
    // Heurística textual: una línea con `refsDir` que además mencione
    // `personality`, `clonId` o `timbre` es donde el path traversal coló la
    // última vez; TODAS deben pasar por rutaRef (join directo = error).
    const codigo = codigoSinComentarios(lineasDelDaemon());
    for (const linea of codigo) {
      if (!linea.includes("refsDir")) continue;
      if (!/personality|clonId|timbre/.test(linea)) continue;
      expect(
        linea.includes("rutaRef("),
        `la línea construye una ruta de referencias fuera de rutaRef: ${linea.trim()}`,
      ).toBe(true);
    }
  });

  it("el .rvq se escribe en temporal y fileOk ignora los .tmp", () => {
    const fuente = codigoSinComentarios(lineasDelDaemon()).join("\n");
    expect(fuente.includes('`${rvq}.tmp`')).toBe(true);
    expect(fuente.includes("fs.renameSync(tmpRvq, rvq)")).toBe(true);
    expect(fuente.includes('.endsWith(".tmp")')).toBe(true);
  });
});