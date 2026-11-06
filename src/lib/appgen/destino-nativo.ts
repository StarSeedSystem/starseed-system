/**
 * Destino nativo de macOS (BAMA) · módulo puro.
 *
 * Decide si la máquina puede construir o solo planificar una app nativa y
 * arma el paquete de planificación como datos. No ejecuta comandos, no toca
 * disco y no importa `node:*`: seguro para el cliente.
 */

export interface EntornoNativo { so: string; versionSo: string; xcode: string | null; swift: string | null; discoLibreGb: number }

export interface RequisitosNativos { puedeConstruir: boolean; puedePlanificar: boolean; faltan: string[] }

export interface AppParaPlan {
  name: string;
  files?: { path: string; content?: string; language?: string }[];
  meta?: { spec?: string; notes?: string; plugins?: string[]; connections?: string[] };
}

export interface PantallaAClonar { nombre: string; origen: string; proposito: string }

export interface HistoriaBama { titulo: string; como: string; quiero: string; para: string; criterios: string[] }

export interface TokenSwiftUI { token: string; valor: string; nombreSwiftUI: string; literalSwiftUI: string }

export interface ComandoBama { descripcion: string; comando: string }

export interface PaquetePlanBama {
  app: string;
  destino: "nativa-macos";
  requisitosMinimos: { macOS: string; xcode: string; swift: string };
  pantallas: PantallaAClonar[];
  historias: HistoriaBama[];
  tokensSwiftUI: TokenSwiftUI[];
  comandos: ComandoBama[];
  archivos: { total: number; swift: string[] };
  notas: string;
}

const SO_MINIMO = 26;
const XCODE_MINIMO = 26;

function esMac(so: string): boolean {
  return /mac|darwin|os x/i.test(so);
}

function versionMayor(valor: string | null): number | null {
  const m = valor?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** macOS ≥ 26 y Xcode ≥ 26 para construir; planificar siempre. */
export function requisitosNativos(entorno: EntornoNativo): RequisitosNativos {
  const faltan: string[] = [];
  const mac = esMac(entorno.so);
  const versionSo = versionMayor(entorno.versionSo);
  const xcode = versionMayor(entorno.xcode);
  if (!mac || versionSo === null || versionSo < SO_MINIMO) faltan.push("macOS 26");
  if (xcode === null || xcode < XCODE_MINIMO) faltan.push("Xcode 26");
  return { puedeConstruir: faltan.length === 0, puedePlanificar: true, faltan };
}

const TOKENS_TRINITY: TokenSwiftUI[] = [
  { token: "trinity.zenith.active", valor: "#007FFF", nombreSwiftUI: "Color.trinityZenith", literalSwiftUI: "Color(red: 0, green: 0.498, blue: 1)" },
  { token: "trinity.horizonte.panel", valor: "#10B981", nombreSwiftUI: "Color.trinityHorizonte", literalSwiftUI: "Color(red: 0.063, green: 0.725, blue: 0.506)" },
  { token: "trinity.logica.active", valor: "#FFBF00", nombreSwiftUI: "Color.trinityLogica", literalSwiftUI: "Color(red: 1, green: 0.749, blue: 0)" },
  { token: "trinity.base.active", valor: "#DC143C", nombreSwiftUI: "Color.trinityBase", literalSwiftUI: "Color(red: 0.863, green: 0.078, blue: 0.235)" },
];

const COMANDOS_BAMA: ComandoBama[] = [
  { descripcion: "Añadir el mercado de habilidades de BAMA", comando: "claude plugin marketplace add daveebbelaar/bama" },
  { descripcion: "Instalar la habilidad BAMA", comando: "claude plugin install bama@bama" },
];

/** Paquete de planificación como datos: no ejecuta comandos ni toca disco. */
export function planBama(app: AppParaPlan): PaquetePlanBama {
  const files = app.files ?? [];
  const html = files.filter((f) => /\.(html?|htm)$/i.test(f.path));
  const swift = files.filter((f) => /\.swift$/i.test(f.path));
  const origen = html.length ? html : swift;
  const proposito =
    app.meta?.spec?.trim() ||
    app.meta?.notes?.trim() ||
    "Conservar la pantalla con la identidad Trinity.";
  const pantallas: PantallaAClonar[] = origen.length
    ? origen.map((f) => ({
        nombre: (f.path.split("/").pop() ?? f.path).replace(/\.[^.]+$/, ""),
        origen: f.path,
        proposito,
      }))
    : [{ nombre: "Vista principal", origen: "", proposito }];
  const historias: HistoriaBama[] = pantallas.map((p) => ({
    titulo: `Clonar ${p.nombre} en SwiftUI`,
    como: "persona que usa StarSeed OS",
    quiero: `ver ${p.nombre} como app nativa de macOS`,
    para: p.proposito,
    criterios: [
      `La pantalla ${p.nombre} conserva la jerarquía y el foco único del origen.`,
      "Usa los tokens Trinity y un contraste de texto de 4.5:1.",
      "Todo control clicable tiene cursor pointer y un área de 44 × 44 pt.",
    ],
  }));
  return {
    app: app.name || "App sin título",
    destino: "nativa-macos",
    requisitosMinimos: { macOS: "26", xcode: "26", swift: "6.2" },
    pantallas,
    historias,
    tokensSwiftUI: TOKENS_TRINITY.map((t) => ({ ...t })),
    comandos: COMANDOS_BAMA.map((c) => ({ ...c })),
    archivos: { total: files.length, swift: swift.map((f) => f.path) },
    notas: app.meta?.notes?.trim() || "Planificación: no se construye hasta tener macOS 26 y Xcode 26.",
  };
}
