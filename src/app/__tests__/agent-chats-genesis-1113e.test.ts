/**
 * GEN1113E · `/agent`: título en español, la sección de chat sin Telegram y con «Genesis», y los
 * enlaces viejos (contrato `architecture/astraura-chats-genesis.md` §2.1 y §3.3).
 *
 * `page.tsx` no puede exportar nada más que la página (Next lo rechaza), así que la prueba lee su
 * código: toma el bloque REAL de `TAB_ALIASES`, `normalizeTab` y `focoDeConexiones`, lo transpila
 * con TypeScript y lo ejecuta contra los `value` reales de `STUDIO_SECTIONS`. Si alguien cambia el
 * alias, el menú o la función, esta prueba lo ve.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const PAGINA = readFileSync(path.join(__dirname, "..", "(app)", "agent", "page.tsx"), "utf8");
const FUNCIONES = readFileSync(path.join(__dirname, "..", "..", "components", "funciones", "funciones-index.tsx"), "utf8");

function entre(texto: string, desde: string, hasta: string): string {
  const i = texto.indexOf(desde);
  const j = texto.indexOf(hasta, i + desde.length);
  if (i < 0 || j < 0) throw new Error(`No encuentro el bloque ${desde} … ${hasta}`);
  return texto.slice(i, j);
}

const SECCIONES = entre(PAGINA, "const STUDIO_SECTIONS", "// Mapa value → sección");
const VALUES = [...SECCIONES.matchAll(/value: "([^"]+)"/g)].map((m) => m[1]);
const SECCION_CHAT = entre(SECCIONES, 'id: "chat",', '\n  },\n');
const ITEMS_CHAT = [...SECCION_CHAT.matchAll(/\{ value: "([^"]+)", label: "([^"]+)", icon: (\w+) \}/g)].map((m) => ({
  value: m[1],
  label: m[2],
  icon: m[3],
}));

type Foco = "telegram" | "genesis" | "poligenesis" | "metagenesis" | undefined;
const { normalizeTab, focoDeConexiones } = (() => {
  const bloque = entre(PAGINA, "const TAB_ALIASES", "// --- Types ---");
  const js = ts.transpileModule(bloque, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const valueToSection = Object.fromEntries(VALUES.map((v) => [v, "s"]));
  const fabrica = new Function("VALUE_TO_SECTION", `${js}\nreturn { normalizeTab, focoDeConexiones };`);
  return fabrica(valueToSection) as {
    normalizeTab: (raw: string | null | undefined) => string | null;
    focoDeConexiones: (tab: string | null | undefined, foco: string | null | undefined) => Foco;
  };
})();

describe("GEN1113E · pestañas de la sección de chat", () => {
  it("quedan Chats · Multiagente 1.58 · Conexiones de chat · Genesis, en ese orden", () => {
    expect(ITEMS_CHAT).toEqual([
      { value: "chat", label: "Chats", icon: "Bot" },
      { value: "chat-158", label: "Multiagente 1.58", icon: "Users" },
      { value: "conexiones-chat", label: "Conexiones de chat", icon: "Send" },
      { value: "chats-genesis", label: "Genesis", icon: "Dna" },
    ]);
  });

  it("no queda ningún ítem ni contenido de la pestaña Telegram", () => {
    expect(VALUES).not.toContain("telegram");
    expect(ITEMS_CHAT.some((i) => /telegram/i.test(i.label) || i.value === "telegram")).toBe(false);
    expect(PAGINA).not.toMatch(/<TabsContent value="telegram"/);
    expect(PAGINA).not.toMatch(/<TelegramSpacesPanel/);
  });

  it("monta la pestaña Genesis de GEN1113D y pasa `foco` a Conexiones de chat", () => {
    expect(PAGINA).toMatch(/<TabsContent value="chats-genesis"[^>]*><PestanaGenesis \/><\/TabsContent>/);
    expect(PAGINA).toMatch(/import\("@\/components\/chats-genesis\/pestana-genesis"\)/);
    expect(PAGINA).toMatch(/<ChatConnectionsPanel foco=\{focoDeConexiones\(tabParam, params\?\.get\('foco'\)\)\} \/>/);
  });

  it("el título es «Astraura IA y Orquestación» en la página y en el catálogo de funciones", () => {
    expect(PAGINA).toContain('<span className="truncate">Astraura IA y Orquestación</span>');
    expect(PAGINA).not.toContain(">Astraura AI & Orchestration<");
    expect(FUNCIONES).toContain('title: "Astraura IA y Orquestación"');
  });
});

describe("GEN1113E · enlaces viejos y nuevos (?tab=)", () => {
  it("telegram y sus alias caen en Conexiones de chat con la opción Telegram abierta", () => {
    for (const t of ["telegram", "tg", "telegram-spaces"]) {
      expect(normalizeTab(t)).toBe("conexiones-chat");
      expect(focoDeConexiones(t, null)).toBe("telegram");
    }
  });

  it("?tab=genesis sigue llevando a Génesis de Seres (D2)", () => {
    expect(normalizeTab("genesis")).toBe("genesis-seres");
    expect(normalizeTab("seres")).toBe("genesis-seres");
  });

  it("?tab=chats-genesis y sus alias abren la pestaña nueva", () => {
    for (const t of ["chats-genesis", "genesis-chats", "metagenesis-chats"]) expect(normalizeTab(t)).toBe("chats-genesis");
  });

  it("los enlaces de siempre de la sección no cambian", () => {
    expect(normalizeTab("chat")).toBe("chat");
    expect(normalizeTab("chats")).toBe("chat");
    expect(normalizeTab("chat-158")).toBe("chat-158");
    expect(normalizeTab("multiagente")).toBe("chat-158");
    expect(normalizeTab("conexiones-chat")).toBe("conexiones-chat");
    expect(normalizeTab("no-existe")).toBeNull();
  });

  it("`?foco=` solo acepta las opciones del panel", () => {
    expect(focoDeConexiones("conexiones-chat", "telegram")).toBe("telegram");
    expect(focoDeConexiones("conexiones-chat", "metagenesis")).toBe("metagenesis");
    expect(focoDeConexiones("conexiones-chat", "<script>")).toBeUndefined();
    expect(focoDeConexiones("conexiones-chat", null)).toBeUndefined();
  });

  it("el catálogo de funciones enlaza a la opción Telegram y a los chats de Genesis", () => {
    expect(FUNCIONES).toContain('route: "/agent?tab=conexiones-chat&foco=telegram"');
    expect(FUNCIONES).toContain('{ label: "Chats de Genesis", route: "/agent?tab=chats-genesis"');
    expect(FUNCIONES).not.toContain('"/agent?tab=telegram"');
    // Cada ruta /agent?tab= del catálogo existe de verdad (directa o por alias).
    for (const m of FUNCIONES.matchAll(/route: "\/agent\?tab=([^"&]+)/g)) {
      expect(normalizeTab(m[1]), `?tab=${m[1]}`).not.toBeNull();
    }
  });
});
