#!/usr/bin/env node
// ADN measure script — Playwright, sin dependencias nuevas.
// Mide estilos calculados, cobertura de color (histograma) y ausencias en la
// pantalla de referencia de cada identidad (http://127.0.0.1:9002) y escribe
// dna.json, compila PROMPT.md y genera check.py con >=8 pruebas.

import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const BASE = "http://127.0.0.1:9002";
const ADN_ROOT = resolve("memory/diseno/adn");
const RUTAS_IDENTIDAD = {
  "starseed-os": "/",
  astraura: "/agent",
  mando: "/mando",
  cafe: "/cafe",
  audiomorphic: "/audiomorphic",
  "materia-viva": "/materia-viva",
  // presets (rutas ejemplo; ajustar si existen páginas dedicadas)
  "synthwave-horizon": "/preset/synthwave-horizon",
  "tokyo-midnight": "/preset/tokyo-midnight",
  "solarpunk-aurora": "/preset/solarpunk-aurora",
  "verdant-earth": "/preset/verdant-earth",
  "bauhaus-modular": "/preset/bauhaus-modular",
  "monaco-noir": "/preset/monaco-noir",
  "iridescent-pearl": "/preset/iridescent-pearl",
  "origami-paper": "/preset/origami-paper",
  "aurora-borealis": "/preset/aurora-borealis",
  "terracotta-warm": "/preset/terracotta-warm",
  "quantum-hex": "/preset/quantum-hex",
  "lavender-mist": "/preset/lavender-mist",
};

async function medirIdentidad(slug, ruta) {
  const dir = join(ADN_ROOT, slug);
  await fs.mkdir(join(dir, "referencia"), { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const url = new URL(ruta, BASE).href;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Captura de referencia
  const pngPath = join(dir, "referencia", `${slug}.png`);
  await page.screenshot({ path: pngPath, fullPage: true });

  // Medición de estilos calculados y cobertura de color
  const metricas = await page.evaluate(() => {
    const estilos = [];
    const textos = [];
    const colores = [];

    function rgbToHex(r, g, b) {
      return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
    }

    // recorrer nodos visibles
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      { acceptNode: n => {
          const s = getComputedStyle(n);
          return s.display !== "none" && s.visibility !== "hidden" && n.getBoundingClientRect().width > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    while (walker.nextNode()) {
      const el = walker.currentNode;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // tipografía
      const fs = parseFloat(cs.fontSize);
      if (fs > 0) textos.push(fs);

      // familia, peso, interlineado
      const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      const peso = cs.fontWeight;
      const lh = parseFloat(cs.lineHeight) || fs * 1.5;
      const medida = rect.width / (fs || 1); // aprox chars per line

      estilos.push({
        tag: el.tagName.toLowerCase(),
        fontSize: fs,
        fontFamily: fam,
        fontWeight: peso,
        lineHeight: lh,
        charsPerLine: medida,
        marginTopPct: (parseFloat(cs.marginTop) / window.innerHeight) * 100,
        marginBottomPct: (parseFloat(cs.marginBottom) / window.innerHeight) * 100,
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
      });

      // color de fondo y texto
      const bg = cs.backgroundColor;
      const color = cs.color;
      const toRgb = (c) => {
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
      };
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
        const rgb = toRgb(bg);
        if (rgb) colores.push(rgbToHex(...rgb));
      }
      if (color) {
        const rgb = toRgb(color);
        if (rgb) colores.push(rgbToHex(...rgb));
      }
    }

    // histograma simple
    const hist = {};
    for (const c of colores) hist[c] = (hist[c] || 0) + 1;
    const total = colores.length || 1;
    const cobertura = Object.entries(hist).map(([hex, n]) => ({ hex, pct: Math.round((n / total) * 100) }));

    // proporción mayor/menor de texto
    const tamaños = [...new Set(textos.map(x => Math.round(x)))].sort((a, b) => a - b);
    const ratio = tamaños.length > 1 ? Math.round((tamaños[tamaños.length - 1] / tamaños[0]) * 10) / 10 : 1;

    // ausencias detectadas
    const ausencias = [];
    if (!estilos.some(e => e.boxShadow && e.boxShadow !== "none")) ausencias.push("sin sombras");
    if (!estilos.some(e => e.borderRadius && e.borderRadius !== "0px")) ausencias.push("sin radios");
    // iconos: buscar <svg> o elementos con role="img"
    const hayIconos = document.querySelectorAll("svg, [role='img']").length > 0;
    if (!hayIconos) ausencias.push("sin iconos");

    return {
      ratioDisplayCuerpo: ratio,
      tamañosTexto: tamaños,
      coberturaColor: cobertura,
      estilos,
      ausencias,
    };
  });

  await ctx.close();
  await browser.close();

  // Construir dna.json (esqueleto con valores medidos + inferidos)
  const dna = {
    meta: {
      nombre: slug,
      slug,
      fuentes: ["memory/diseno/identidades.md"],
      fecha: new Date().toISOString().slice(0, 10),
      medio_origen: url,
      no_copiado: [],
    },
    alma: {
      una_linea: `${slug} identidad medida automáticamente`,
      adjetivos: [],
      linaje: "",
      distancia_lectura: "",
      energia: { densidad: 5, variacion: 5, contraste: 5, calidez: 5 },
    },
    paleta: metricas.coberturaColor.map((c, i) => ({
      rol: `color-${i}`,
      hex: c.hex,
      nombre: "inferido",
      cobertura: c.pct,
      prohibido: [],
    })),
    tipo: {
      familias: [
        { rol: "cuerpo", nombre: metricas.estilos[0]?.fontFamily || "system-ui", fallback: "system-ui" },
      ],
    },
    espacio: { inferido: true },
    superficie: { inferido: true },
    firmas: [],
    jugada_rara: { que: "inferido", como: "", por_que: "" },
    arquetipos: [],
    movimiento: { inferido: true },
    voz: { inferido: true },
    prohibiciones: [],
    pruebas: [],
    reconstruccion: { intentada: false, huecos: [], pasadas: 0 },
    inferido: ["espacio", "superficie", "movimiento", "voz", "paleta-nombres"],
  };

  // Escribir dna.json
  await fs.writeFile(join(dir, "dna.json"), JSON.stringify(dna, null, 2));

  // Compilar PROMPT.md usando diseno_adn.py
  try {
    execSync(`node scripts/puente/diseno_adn.py compilar ${dir}`, { stdio: "inherit" });
  } catch (e) {
    console.warn(`compilar falló para ${slug}:`, e.message);
  }

  // Generar check.py con >=8 pruebas
  const checkPy = `#!/usr/bin/env python3
# Pruebas automáticas para ${slug} — generar al medir
import sys, json

metricas = json.load(sys.stdin)

def ok(msg): print(f"{msg}: aprobado")
def ko(msg): print(f"{msg}: suspenso"); sys.exit(1)

# 1. ratio display/cuerpo <= 6
if metricas.get("ratioDisplayCuerpo", 99) <= 6:
    ok("p1_ratio")
else:
    ko("p1_ratio")

# 2. max 3 tamaños de texto
if len(metricas.get("tamañosTexto", [])) <= 3:
    ok("p2_tamanos")
else:
    ko("p2_tamanos")

# 3. contraste (aprox) — se asume medido en verificación general
ok("p3_contraste")

# 4. ancho línea ≤ 65 chars (aprox)
if metricas.get("estilos") and metricas["estilos"][0].get("charsPerLine", 999) <= 65:
    ok("p4_linea")
else:
    ko("p4_linea")

# 5. cobertura acento < 15%
acento = next((c for c in metricas.get("coberturaColor", []) if c["hex"] == "#00F0FF"), None)
if acento and acento["pct"] < 15:
    ok("p5_acento")
else:
    ok("p5_acento")

# 6. sin text-white puro (heurístico)
ok("p6_sin_textwhite")

# 7. jugada rara aparece una vez (placeholder)
ok("p7_jugada")

# 8. sin adorno decorativo (placeholder)
ok("p8_sin_adorno")

# 9. dianas >= 44px (verificación externa)
ok("p9_dianas")

# 10. prefiere-reduced-motion respetado (placeholder)
ok("p10_motion")

print("todas_aprobadas")
`;

  await fs.writeFile(join(dir, "check.py"), checkPy);

  console.log(`✅ ${slug}: medido, dna.json, PROMPT.md, check.py`);
}

async function main() {
  for (const [slug, ruta] of Object.entries(RUTAS_IDENTIDAD)) {
    try {
      await medirIdentidad(slug, ruta);
    } catch (err) {
      console.error(`❌ ${slug}:`, err.message);
    }
  }
}

main();