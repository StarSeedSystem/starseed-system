/**
 * Empaquetador de contexto para Astra (Ola 294 · AR2 · 2026-09-08).
 *
 * Por qué existe: AR1 (ya integrada) dejó a `gpt-6-astra` como DIRECTOR
 * que audita «todos los contextos» del OS, pero el límite real es el
 * presupuesto de tokens de cada llamada. Volcarlo todo no es opción: hay
 * que ELEGIR qué fuentes mira cada ámbito y RECORTAR al presupuesto.
 *
 * Reglas duras:
 *  · Las funciones puras no tocan disco ni red: solo transforman texto.
 *  · `construirContexto` (la única asíncrona) lee con `raizDelProyecto()`,
 *    NUNCA con `process.cwd()` directo (regla del Mando para no
 *    contaminar el bundle de Vercel con todo el árbol).
 *  · `redactarSecretos` se aplica a TODO lo que sale: ninguna clave puede
 *    viajar en el prompt de Astra, ni siquiera una del propio repo.
 *  · Si una fuente falta, se anota con ` (ausente)` y se sigue.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { AMBITOS_ASTRA } from "@/lib/mando/astra";
import { raizDelProyecto } from "@/lib/mando/raiz";

/** Fuentes que mira cada ámbito de Astra (rutas relativas al repositorio). */
export const FUENTES_POR_AMBITO: Record<string, string[]> = {
  // Capacidades que el OS promete en CLAUDE.md y que aún no existen: la propia
  // constitución, las adendas fundacionales y la bitácora de cambios.
  funciones: [
    "CLAUDE.md",
    "memory/state.md",
    "memory/roadmap.md",
    "memory/architecture.md",
  ],
  // Identidad visual y Trinity: master del design system, los componentes UI y
  // el catálogo de pantallas del HUD.
  diseno: [
    "design-system/starseed-system/MASTER.md",
    "src/components/layout/omni-dock.tsx",
    "src/components/layout/side-curtains.tsx",
    "src/components/layout/dock-config.ts",
    "src/components/dashboard/apps/app-catalog.ts",
  ],
  // Capas, acoplamientos, deuda: la arquitectura viva + los archivos más
  // compartidos del módulo Mando.
  arquitectura: [
    "memory/architecture.md",
    "CLAUDE.md",
    "src/lib/mando/astra.ts",
    "src/lib/mando/ramificacion.ts",
  ],
  // Navegación por teclado, foco, contraste, lectores de pantalla: el propio
  // CLAUDE.md y los componentes de layout que concentran la accesibilidad.
  accesibilidad: [
    "CLAUDE.md",
    "src/components/layout/omni-dock.tsx",
    "src/components/layout/header.tsx",
  ],
  // Costes de render, bundles, llamadas repetidas: el Mando es el sitio con
  // más I/O del OS, y el documento de economía marca la vara.
  rendimiento: [
    "memory/orquestacion-economica.md",
    "src/lib/mando/ramificacion.ts",
    "src/lib/mando/asistente.ts",
  ],
  // Claves fuera del cliente y del repo, rutas /api/mando/* solo locales:
  // constitución, el módulo de claves del servidor y el SOP económico.
  "seguridad-y-claves": [
    "CLAUDE.md",
    "memory/orquestacion-economica.md",
    "src/lib/mando/claves-servidor.ts",
    "src/lib/mando/guardian.ts",
  ],
  // Orquestación sin agotar créditos: SOP económico, catálogo de modelos y
  // estado vivo del enjambre.
  "economia-de-agentes": [
    "memory/orquestacion-economica.md",
    "src/lib/mando/modelos-disponibles.ts",
    "src/lib/mando/flota.ts",
  ],
  // Feed, publicación, singularidad del contenido (Entidad Única): constitución
  // (sección 6) + las rutas de publicación.
  "contenido-y-canales": [
    "CLAUDE.md",
    "src/lib/mando/publicaciones.ts",
    "src/lib/canales/canales.ts",
  ],
  // Regla dorada del CLAUDE.md §11: una ruta que no está en el dock ni en el
  // catálogo no existe para el usuario.
  descubribilidad: [
    "CLAUDE.md",
    "src/components/layout/dock-config.ts",
    "src/lib/dock/dock-defaults.ts",
    "src/components/dashboard/apps/app-catalog.ts",
  ],
};

/** Ambitos de Astra que aún no tienen fuentes declaradas (informe para tests). */
export function ambitosSinFuentes(): string[] {
  const ids = new Set(AMBITOS_ASTRA.map((a) => a.id));
  return [...ids].filter((id) => !FUENTES_POR_AMBITO[id] || FUENTES_POR_AMBITO[id].length === 0);
}

/** Aproxima tokens: 1 token ≈ 4 caracteres (regla conservadora). */
export function estimarTokens(texto: string): number {
  if (typeof texto !== "string" || texto.length === 0) return 0;
  // Redondeo hacia arriba para que el presupuesto nunca se pase por un ajuste
  // a la baja; es una estimación, no una medida.
  return Math.ceil(texto.length / 4);
}

/** Recorta una lista de bloques al presupuesto, sin partir líneas. */
export function recortarAlPresupuesto(
  bloques: { ruta: string; texto: string; peso: number }[],
  maxTokens: number,
): { ruta: string; texto: string }[] {
  if (!Array.isArray(bloques) || bloques.length === 0) return [];
  const presupuesto = Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : 0;
  if (presupuesto === 0) return [];
  // Orden estable por peso DESC, luego por ruta para determinismo.
  const ordenados = bloques
    .filter((b) => b && typeof b.texto === "string" && typeof b.ruta === "string")
    .map((b, i) => ({ ruta: b.ruta, texto: b.texto, peso: Number.isFinite(b.peso) ? b.peso : 0, i }))
    .sort((a, b) => b.peso - a.peso || a.ruta.localeCompare(b.ruta));
  // `tokens` = caracteres / 4. Cada bloque puede entrar COMPLETO (si sus
  // tokens caben en lo que queda) o RECORTADO al último `\n` que aún
  // quepa; NUNCA se parte una línea a la mitad.
  const salida: { ruta: string; texto: string }[] = [];
  let gastado = 0;
  for (const b of ordenados) {
    const tokensTotales = estimarTokens(b.texto);
    const disponibles = presupuesto - gastado;
    if (disponibles <= 0) break;
    if (tokensTotales <= disponibles) {
      salida.push({ ruta: b.ruta, texto: b.texto });
      gastado += tokensTotales;
      continue;
    }
    // Recorte por líneas: estimamos caracteres disponibles y buscamos el
    // último `\n` que aún entre (al menos 32 caracteres para no devolver
    // un bloque trivialmente inútil).
    const maxChars = Math.max(0, disponibles * 4);
    if (maxChars < 32) break;
    const trozo = b.texto.slice(0, maxChars);
    const últimoSalto = trozo.lastIndexOf("\n");
    if (últimoSalto <= 0) {
      // No hay salto: este bloque no entra entero, pero tampoco lo
      // podemos partir con seguridad → se descarta y se sigue con el
      // siguiente (puede que entre uno más pequeño).
      continue;
    }
    const textoRecortado = trozo.slice(0, últimoSalto).trimEnd();
    if (textoRecortado.length === 0) continue;
    salida.push({ ruta: b.ruta, texto: textoRecortado });
    gastado += estimarTokens(textoRecortado);
  }
  return salida;
}

/** Una línea por ruta, agrupadas por sección; deduplica. */
export function resumenDeRutas(rutas: string[]): string {
  if (!Array.isArray(rutas) || rutas.length === 0) return "";
  // Dedup preservando el orden de la primera aparición.
  const vistas = new Set<string>();
  const únicas: string[] = [];
  for (const r of rutas) {
    if (typeof r !== "string") continue;
    const limpia = r.replace(/^\.?\//, "").trim();
    if (!limpia || vistas.has(limpia)) continue;
    vistas.add(limpia);
    únicas.push(limpia);
  }
  // Agrupa por sección (primer segmento, antes de la primera `/`).
  const porSección = new Map<string, string[]>();
  for (const r of únicas) {
    const sección = r.includes("/") ? (r.split("/")[0] ?? r) : "(raíz)";
    const lista = porSección.get(sección) ?? [];
    lista.push(r);
    porSección.set(sección, lista);
  }
  const lineas: string[] = [];
  for (const [sección, lista] of [...porSección.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lineas.push(`[${sección}]`);
    for (const r of [...lista].sort()) lineas.push(`  · ${r}`);
  }
  return lineas.join("\n");
}

/** Tapa prefijos típicos de claves y bloques `CLAVE=<32+ hex|base64>`. */
export function redactarSecretos(texto: string): string {
  if (typeof texto !== "string" || texto.length === 0) return "";
  let s = texto;
  // 1) Prefijos típicos de claves de proveedores. Cada uno con sufijo de
  // caracteres «seguros» para una clave (letras, dígitos, guion, guion bajo).
  // 2026-09-08: por qué esta lista y no más: son los que YA circulan en
  // orquestacion-economica.md, en claves-servidor.ts y en .env.example.
  const prefijos: Array<{ patron: RegExp; mascara: string }> = [
    { patron: /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/g, mascara: "sk-••••" },
    { patron: /gsk_[A-Za-z0-9_-]{16,}/g, mascara: "gsk_••••" },
    { patron: /ssk_[A-Za-z0-9_-]{16,}/g, mascara: "ssk_••••" },
    { patron: /nvapi-[A-Za-z0-9_-]{16,}/g, mascara: "nvapi-••••" },
  ];
  for (const p of prefijos) s = s.replace(p.patron, p.mascara);
  // 2) Cadenas de 32+ caracteres hexadecimales o base64 detrás de un `=`
  // de una variable de entorno (`CLAVE=abcd...`). Hex puro (sin +, /, =)
  // y base64 (con +, /, =) por separado para no pisar palabras normales.
  // Por qué: tokens comunitarios y hashes de los proveedores que aún no
  // tienen prefijo propio.
  s = s.replace(
    /([A-Za-z_][A-Za-z0-9_]{1,40}\s*=\s*)([A-Fa-f0-9]{32,})/g,
    (_m, pre, val) => `${pre}••••`,
  );
  s = s.replace(
    /([A-Za-z_][A-Za-z0-9_]{1,40}\s*=\s*)([A-Za-z0-9+/]{32,}={0,2})/g,
    (_m, pre, val) => `${pre}••••`,
  );
  return s;
}

/** Lee las fuentes del ámbito, redacta secretos, recorta y devuelve el texto. */
export async function construirContexto(
  ambito: string,
  maxTokens = 60_000,
): Promise<{ texto: string; fuentes: string[]; tokens: number }> {
  const presupuesto = Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : 60_000;
  const raíz = raizDelProyecto();
  const fuentes = Array.isArray(FUENTES_POR_AMBITO[ambito]) ? FUENTES_POR_AMBITO[ambito] : [];
  // Bloques crudos: una entrada por fuente; la redactamos ANTES de medir
  // para que el tamaño real que vamos a enviar ya esté libre de claves.
  const bloquesBrutos: { ruta: string; texto: string; peso: number; existe: boolean }[] = [];
  const fuentesListado: string[] = [];
  for (const ruta of fuentes) {
    const limpia = ruta.replace(/^\.?\//, "");
    const absoluta = path.join(raíz, limpia);
    let texto = "";
    let existe = false;
    try {
      // `stat` primero evita leer directorios como archivo.
      const info = await stat(absoluta);
      if (info.isFile()) {
        texto = await readFile(absoluta, "utf-8");
        existe = true;
      }
    } catch {
      existe = false;
    }
    const redactado = redactarSecretos(texto);
    // Tope por archivo: 12k caracteres bastan para que Astra «vea» el archivo
    // sin tragar la constitución entera; la otra mitad del presupuesto la
    // reparte el recortador por peso.
    const capped = redactado.length > 12_000 ? `${redactado.slice(0, 12_000)}\n…` : redactado;
    bloquesBrutos.push({ ruta: limpia, texto: capped, peso: capped.length, existe });
    fuentesListado.push(existe ? limpia : `${limpia} (ausente)`);
  }
  // Orden por peso DESC: los archivos más relevantes (con más texto útil)
  // entran primero; si la constitución y el SOP económico caben, lo demás
  // se cuela o no según sobre.
  const bloquesParaRecorte = bloquesBrutos.map((b) => ({ ruta: b.ruta, texto: b.texto, peso: b.peso }));
  const elegidos = recortarAlPresupuesto(bloquesParaRecorte, presupuesto);
  const partes: string[] = [`# Contexto para Astra · ámbito: ${ambito}`];
  for (const e of elegidos) partes.push(`\n## ${e.ruta}\n\n${e.texto}`);
  const texto = partes.join("\n");
  return { texto, fuentes: fuentesListado, tokens: estimarTokens(texto) };
}
