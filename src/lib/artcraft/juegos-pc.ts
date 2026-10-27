/**
 * ArtCraft · Juegos de PC y Rare (Contrato architecture/artcraft-y-rare.md §5).
 * Módulo puro: sin node:*, sin React, sin red.
 */

export const CONDICIONES_EPIC_DECIDIDAS = false;

export interface NeuronaPc {
  sistema: "macos" | "linux" | "windows" | "otro";
  tienePantalla: boolean;
  binarioRare: boolean;
  gpu: boolean;
  memoriaMB: number;
}

export interface ServidorPc {
  id: string;
  propio: boolean;
  compartido: boolean;
  gpu: boolean;
  wineOProton: boolean;
  transmision: "selkies" | "sunshine" | null;
  libreDiscoGB: number;
}

export interface PersonaPc {
  id: string;
  aceptaCondicionesEpic: boolean;
}

export interface PlanJuegoPc {
  ruta: "neurona-propia" | "servidor-propio" | "servidor-compartido" | "ninguna";
  motivo: string;
  pasos: string[];
  avisos: string[];
}

export function planificarJuegoPc(e: { neurona: NeuronaPc; servidores: ServidorPc[]; persona: PersonaPc }): PlanJuegoPc {
  const avisos: string[] = [];
  const { neurona, servidores, persona } = e;

  if (neurona.tienePantalla && neurona.binarioRare) {
    if (neurona.sistema === "macos" || neurona.sistema === "linux" || neurona.sistema === "windows") {
      return {
        ruta: "neurona-propia",
        motivo: "Neurona propia con pantalla y Rare instalado (Ruta A).",
        pasos: ["abre Rare", "inicia sesión en Epic tú mismo"],
        avisos,
      };
    }
  }

  const propServ = servidores.find((s) => s.propio);
  if (propServ) {
    if (!propServ.gpu) {
      avisos.push("Aviso: El A1 de Oracle (sin GPU) no sirve para 3D.");
    }
    if (propServ.gpu && propServ.wineOProton && propServ.transmision) {
      return {
        ruta: "servidor-propio",
        motivo: "Servidor propio con GPU, Wine o Proton y transmisión (Ruta B).",
        pasos: ["conecta por transmisión", "abre Rare en el servidor", "inicia sesión en Epic tú mismo"],
        avisos,
      };
    }
  }

  const compServ = servidores.find((s) => s.compartido);
  if (compServ) {
    if (!compServ.gpu) {
      avisos.push("Aviso: El A1 de Oracle (sin GPU) no sirve para 3D.");
    }
    if (!CONDICIONES_EPIC_DECIDIDAS) {
      return {
        ruta: "ninguna",
        motivo: "Ruta C bloqueada: CONDICIONES_EPIC_DECIDIDAS es false.",
        pasos: [],
        avisos,
      };
    }
    if (!persona.aceptaCondicionesEpic) {
      return {
        ruta: "ninguna",
        motivo: "La persona no acepta las condiciones de Epic para servidor compartido.",
        pasos: [],
        avisos,
      };
    }
    if (compServ.gpu && compServ.wineOProton && compServ.transmision) {
      return {
        ruta: "servidor-compartido",
        motivo: "Servidor compartido con sesión aislada, GPU, Wine o Proton y transmisión (Ruta C).",
        pasos: ["inicia sesión con tu cuenta de Epic en tu sesión aislada", "abre Rare"],
        avisos,
      };
    }
  }

  return {
    ruta: "ninguna",
    motivo: "No se cumple ninguna ruta viable para juegos de PC (falta pantalla, Rare, servidor adecuado o condiciones de Epic).",
    pasos: [],
    avisos,
  };
}

const PERSONA_ID_RE = /^[a-z0-9-]{1,64}$/;

export function rutaConfigEpic(datos: string, personaId: string): { ruta: string; modo: number } {
  if (!PERSONA_ID_RE.test(personaId)) {
    throw new Error(`ID de persona inválido: «${personaId}»`);
  }
  return {
    ruta: `${datos}/juegos/${personaId}/legendary`,
    modo: 0o700,
  };
}

export function validarSinCredencialesEpic(texto: string): { ok: boolean; hallazgos: string[] } {
  const hallazgos: string[] = [];
  const lower = texto.toLowerCase();

  const terminos = ["access_token", "refresh_token", "account_id", "exchange_code"];
  for (const t of terminos) {
    if (lower.includes(t)) {
      hallazgos.push(`Campo detectado: ${t}`);
    }
  }

  if (texto.includes("eg1~") || /eg1~[a-zA-Z0-9_-]{8,}/.test(texto)) {
    hallazgos.push("Token con prefijo eg1~ detectado");
  }

  return {
    ok: hallazgos.length === 0,
    hallazgos,
  };
}

export function esUrlPermitidaRare(url: string): boolean {
  if (url.includes("raredevs.github.io") || url.includes("protondb.com")) {
    return false;
  }
  return url.startsWith("https://github.com/RareDevs/Rare/releases/");
}
