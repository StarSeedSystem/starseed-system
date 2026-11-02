export const CONDICIONES_EPIC_DECIDIDAS = false as const;

export interface NeuronaInfo {
  neurona: {
    sistema: "macos" | "linux" | "windows" | "otro";
    tienePantalla: boolean;
    binarioRare: boolean;
    gpu: boolean;
    memoriaMB: number;
  };
  servidores: Array<{
    id: string;
    propio: boolean;
    compartido: boolean;
    gpu: boolean;
    wineOProton: boolean;
    transmision: "selkies" | "sunshine" | null;
    libreDiscoGB: number;
  }>;
  persona: { id: string; aceptaCondicionesEpic: boolean; };
}

export interface ResultadoPlanificacion {
  ruta: "neurona-propia" | "servidor-propio" | "servidor-compartido" | "ninguna";
  motivo: string;
  pasos: string[];
  avisos: string[];
}

export function planificarJuegoPc(e: NeuronaInfo): ResultadoPlanificacion {
  const { neurona, servidores, persona } = e;
  const avisos: string[] = [];

  // Ruta A: Neurona propia con pantalla y Rare instalado
  if (neurona.tienePantalla && neurona.binarioRare) {
    return {
      ruta: "neurona-propia",
      motivo: "Rare instalado y pantalla disponible",
      pasos: ["abre Rare", "inicia sesión en Epic tú mismo"],
      avisos,
    };
  }

  // Ruta B: Servidor propio con GPU y Wine/Proton y transmisión
  const servidorPropio = servidores.find(s => s.propio && s.gpu && (s.wineOProton || s.transmision));
  if (servidorPropio) {
    return {
      ruta: "servidor-propio",
      motivo: "Servidor propio con GPU y compatibilidad",
      pasos: ["abre Rare en servidor", "configura transmisión"],
      avisos,
    };
  }

  // Ruta C: Condiciones Epic decididas y persona acepta
  if (CONDICIONES_EPIC_DECIDIDAS && persona.aceptaCondicionesEpic) {
    return {
      ruta: "servidor-compartido",
      motivo: "Autoría oficial y condiciones aprobadas",
      pasos: ["abre Rare", "inicia sesión en Epic tú mismo"],
      avisos,
    };
  }

  avisos.push("no hay ruta disponible en las condiciones actuales");
  return {
    ruta: "ninguna",
    motivo: "ninguna ruta viable con los requisitos dados",
    pasos: [],
    avisos,
  };
}

export function rutaConfigEpic(datos: string, personaId: string): { ruta: string; modo: number } {
  const regex = /^[a-z0-9-]{1,64}$/;
  if (!regex.test(personaId)) {
    throw new Error("personaId no válido");
  }
  const ruta = `${datos}/juegos/${personaId}/legendary`;
  return { ruta, modo: 0o700 };
}

/** Campo de sesión de Epic → largo mínimo de su VALOR para contarlo (nombrarlo sin valor no es una fuga). */
const CAMPOS_EPIC: ReadonlyArray<readonly [string, number]> = [
  ["access_token", 16],
  ["refresh_token", 16],
  ["account_id", 4],
  ["exchange_code", 4],
];

/**
 * ¿El texto lleva algo con forma de sesión de Epic? (SUP0111S, 01-11 · seguridad) Los hallazgos
 * NUNCA repiten el secreto: antes se metía el token `eg1~…` entero en `hallazgos`, y los
 * hallazgos se enseñan y se registran. Un campo cuenta solo con un valor (`access_token` largo).
 */
export function validarSinCredencialesEpic(texto: string): { ok: boolean; hallazgos: string[] } {
  const hallazgos: string[] = [];
  for (const [campo, minimo] of CAMPOS_EPIC) {
    const conValor = new RegExp(`${campo}["']?\\s*[:=]\\s*["']?[^\\s"',}&]{${minimo},}`);
    if (conValor.test(texto)) hallazgos.push(campo);
  }
  const tokens = texto.match(/eg1~[A-Za-z0-9_-]+/g)?.length ?? 0;
  if (tokens > 0) hallazgos.push(tokens === 1 ? "token eg1~ (oculto)" : `${tokens} tokens eg1~ (ocultos)`);
  return { ok: hallazgos.length === 0, hallazgos };
}

/**
 * ¿Es una descarga legítima de los releases oficiales de Rare? (SUP0111H, 02-11 · seguridad)
 * Antes solo miraba el prefijo del texto, así que `…/releases/../../../evil` pasaba. Ahora se
 * normaliza con `new URL` y se exige https, host exacto, sin credenciales ni puerto y ruta dentro
 * de `/RareDevs/Rare/releases/`. Se rechaza además el texto crudo con `..`, `%2e` (cualquier
 * caja) o barra invertida, porque la normalización podría esconder un salto de ruta.
 */
export function esUrlPermitidaRare(url: string): boolean {
  const crudo = url.toLowerCase();
  if (crudo.includes("raredevs.github.io") || crudo.includes("protondb.com")) return false;
  if (crudo.includes("..") || crudo.includes("%2e") || crudo.includes("\\")) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.hostname !== "github.com") return false;
  if (u.username !== "" || u.password !== "") return false;
  if (u.port !== "") return false;
  return u.pathname.startsWith("/RareDevs/Rare/releases/");
}
