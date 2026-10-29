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

export function validarSinCredencialesEpic(texto: string): { ok: boolean; hallazgos: string[] } {
  const campos = ["access_token", "refresh_token", "account_id", "exchange_code"]; 
  const hallazgos: string[] = [];
  const regexToken = /eg1~[a-zA-Z0-9-_]+/;
  for (const campo of campos) {
    if (texto.includes(campo)) hallazgos.push(campo);
  }
  const mTokens = texto.match(regexToken);
  if (mTokens) hallazgos.push(...mTokens);
  const ok = hallazgos.length === 0;
  return { ok, hallazgos };
}

export function esUrlPermitidaRare(url: string): boolean {
  // Blocked domains
  if (url.includes("raredevs.github.io") || url.includes("protondb.com")) return false;
  if (!url.startsWith("https://github.com/RareDevs/Rare/releases/")) return false;
  return true;
}
