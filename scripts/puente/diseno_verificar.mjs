#!/usr/bin/env node
// Verificación de diseño §4 (sin juez visual): capturas y medidas en la matriz.
// Uso: node diseno_verificar.mjs --base http://localhost:9002 --rutas /mando,/escritorios \
//        --salida <dir> [--matriz movil,tablet,escritorio,tv]
// Devuelve JSON por stdout; nunca deja un navegador abierto (finally).
import { chromium } from "playwright";

const TAMANOS = {
  movil: { width: 360, height: 780 },
  movil_grande: { width: 430, height: 932 },
  tablet: { width: 768, height: 1024 },
  tablet_grande: { width: 1024, height: 1366 },
  escritorio: { width: 1280, height: 800 },
  escritorio_grande: { width: 1920, height: 1080 },
  tv: { width: 3840, height: 2160 },
  plegable: { width: 280, height: 653 },
};
const DIANA_MINIMA = 44;
const CONTRASTE_MINIMO = 4.5;

function parseArgs(argv) {
  const args = { matriz: ["movil", "tablet", "escritorio", "tv"] };
  for (let i = 2; i < argv.length; i++) {
    const clave = argv[i];
    const valor = argv[i + 1];
    if (clave === "--base") args.base = valor;
    else if (clave === "--rutas") args.rutas = valor.split(",").map((r) => r.trim());
    else if (clave === "--salida") args.salida = valor;
    else if (clave === "--matriz") args.matriz = valor.split(",").map((m) => m.trim());
    if (clave.startsWith("--")) i++;
  }
  if (!args.base || !args.rutas || !args.salida) {
    throw new Error("Faltan --base, --rutas o --salida");
  }
  return args;
}

// Devuelve {ruta, tamano, desbordes[], contraste_bajo[], dianas_chicas[],
//            errores_consola[], fuera_horizontal}
async function capturarYMedir(page, base, ruta, tamano, salida) {
  const { width, height } = TAMANOS[tamano];
  const erroresConsola = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") erroresConsola.push(msg.text().slice(0, 200));
  });
  await page.setViewportSize({ width, height });
  await page.goto(new URL(ruta, base).href, { waitUntil: "domcontentloaded", timeout: 20000 });
  const { promises: fs } = await import("node:fs");
  await fs.mkdir(salida, { recursive: true });
  const nombreBase = `${ruta.replace(/\W+/g, "_")}__${tamano}`.replace(/^_/, "");
  await page.screenshot({ path: `${salida}/${nombreBase}.png`, fullPage: true });

  // Medición en la página: contraste WCAG real (luminancia de los colores
  // computados del texto y su fondo efectivo) y dianas por tag, rol o handler.
  const mediciones = await page.evaluate(
    ({ DIANA_MINIMA, CONTRASTE_MINIMO }) => {
      const RIGUROSO = /^(rgb|rgba)\(([^)]+)\)$/;
      function aRGB(color) {
        const m = RIGUROSO.exec(color);
        if (!m) return null;
        const partes = m[2].split(",").map((v) => parseFloat(v.trim()));
        return { r: partes[0], g: partes[1], b: partes[2], a: partes.length > 3 ? partes[3] : 1 };
      }
      function luminancia({ r, g, b }) {
        const f = (v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      }
      function contraste(c1, c2) {
        const l1 = luminancia(c1);
        const l2 = luminancia(c2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }
      const esVisible = (el) => {
        const r = el.getBoundingClientRect();
        const e = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && e.visibility !== "hidden" && e.display !== "none";
      };
      function fondoEfectivo(el) {
        let nodo = el;
        let color = { r: 255, g: 255, b: 255, a: 1 };
        while (nodo && nodo.nodeType === 1) {
          const c = aRGB(getComputedStyle(nodo).backgroundColor);
          if (c && c.a > 0) {
            if (c.a >= 1) return c;
            color = c;
          }
          nodo = nodo.parentElement;
        }
        return color;
      }

      const desbordes = [];
      const contrasteBajo = [];
      const dianasChicas = [];
      const fueraHorizontal = [];
      const vw = document.documentElement.clientWidth;

      const todos = document.querySelectorAll("body *");
      for (const el of todos) {
        if (!esVisible(el)) continue;
        const r = el.getBoundingClientRect();
        const sel = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "");

        if (el.scrollWidth > el.clientWidth + 1 && (el.textContent || "").trim().length > 0) {
          const e = getComputedStyle(el);
          if (e.overflowX === "hidden" || e.textOverflow === "ellipsis") desbordes.push(sel);
        }
        if (r.left < -1 || r.right > vw + 1) fueraHorizontal.push(sel);

        // Dianas: tag BUTTON/A, role="button"/"link", o manejador de clic.
        const esDiana =
          el.tagName === "BUTTON" ||
          el.tagName === "A" ||
          el.getAttribute("role") === "button" ||
          el.getAttribute("role") === "link" ||
          typeof el.onclick === "function";
        if (esDiana && (r.width < DIANA_MINIMA || r.height < DIANA_MINIMA)) {
          dianasChicas.push(`${sel} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }

        // Contraste: solo texto propio y fallos reales (ratio < mínimo).
        const textoPropio = [...el.childNodes].some(
          (n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0,
        );
        if (textoPropio) {
          const e = getComputedStyle(el);
          const fg = aRGB(e.color);
          const bg = fondoEfectivo(el);
          if (fg && bg) {
            const ratio = contraste(fg, bg);
            if (ratio < CONTRASTE_MINIMO) {
              contrasteBajo.push(`${sel} ${ratio.toFixed(2)}:1`);
            }
          }
        }
      }
      return {
        desbordes: [...new Set(desbordes)].slice(0, 20),
        contraste_bajo: [...new Set(contrasteBajo)].slice(0, 20),
        dianas_chicas: [...new Set(dianasChicas)].slice(0, 20),
        fuera_horizontal: [...new Set(fueraHorizontal)].slice(0, 20),
      };
    },
    { DIANA_MINIMA, CONTRASTE_MINIMO },
  );
  return { ...mediciones, errores_consola: [...new Set(erroresConsola)].slice(0, 10) };
}

async function main() {
  const { base, rutas, salida, matriz } = parseArgs(process.argv);
  const browser = await chromium.launch();
  const informes = [];
  try {
    for (const ruta of rutas) {
      for (const tamano of matriz) {
        if (!TAMANOS[tamano]) continue;
        const contexto = await browser.newContext();
        try {
          const page = await contexto.newPage();
          const informe = await capturarYMedir(page, base, ruta, tamano, salida);
          informes.push({ ruta, tamano, ...informe });
        } catch (error) {
          informes.push({
            ruta,
            tamano,
            desbordes: [],
            contraste_bajo: [],
            dianas_chicas: [],
            errores_consola: [`navegación: ${String(error).slice(0, 200)}`],
            fuera_horizontal: [],
          });
        } finally {
          await contexto.close();
        }
      }
    }
  } finally {
    await browser.close(); // nunca dejar un navegador abierto
  }
  const { promises: fs } = await import("node:fs");
  await fs.mkdir(salida, { recursive: true });
  await fs.writeFile(`${salida}/informe.json`, JSON.stringify(informes, null, 2));
  process.stdout.write(JSON.stringify(informes) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
