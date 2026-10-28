// Contract: `architecture/artcraft-y-rare.md` §5 completo (rutas A, B y C, y §5.3 credenciales de Epic). Rare es GPL-3.0-or-later: SOLO como programa aparte, nunca enlazado. Las credenciales de Epic son SIEMPRE de la persona y nunca van a un repositorio, memoria, sala, grupo ni registro.

export const CONDICIONES_EPIC_DECIDIDAS = false as const; // Until Alex decides, route C not offered

type Sistema = "macos" | "linux" | "windows" | "otro";
type Transmision = "selkies" | "sunshine" | null;

export interface Neurona {
  sistema: Sistema;
  tienePantalla: boolean;
  binarioRare: boolean;
  gpu: boolean;
  memoriaMB: number;
}

export interface Servidor {
  id: string;
  propio: boolean;
  compartido: boolean;
  gpu: boolean;
  wineOProton: boolean;
  transmision: Transmision;
  libreDiscoGB: number;
}

export interface Persona {
  id: string;
  aceptaCondicionesEpic: boolean;
}

export type Ruta = "neurona-propia" | "servidor-propio" | "servidor-compartido" | "ninguna";

export interface ResultadoPlanificacion {
  ruta: Ruta;
  motivo: string;
  pasos: string[];
  avisos: string[];
}

function esRutaA(neurona: Neurona): boolean {
  return Boolean(neurona.tienePantalla && neurona.binarioRare);
}

function esRutaB(neurona: Neurona, servidor: Servidor): boolean {
  return neurona.tienePantalla && neurona.binarioRare &&
    servidor.propio && servidor.gpu && Boolean(servidor.wineOProton || servidor.transmision);
}

function esRutaC(neurona: Neurona, servidor: Servidor, persona: Persona): boolean {
  return neurona.tienePantalla && neurona.binarioRare &&
    servidor.compartido && servidor.gpu && Boolean(servidor.wineOProton || servidor.transmision);
}

function motivosRutaA(): string {
  return "neurona con pantalla y binario instalado";
}

function motivosRutaB(): string {
  return "neurona con pantalla y servidor propio con GPU, Wine o Proton y transmisión";
}

function motivosRutaC(): string {
  return "condiciones Epic decididas y aceptadas, servidor compartido con GPU, Wine o Proton y transmisión";
}

function esA1SinGPU(neurona: Neurona): boolean {
  return Boolean(neurona.sistema === "linux" && neurona.memoriaMB >= 8192 && !neurona.gpu);
}

function avisoA1SinGPU(): string {
  return "el A1 de Oracle (sin GPU) no sirve para juegos 3D";
}

export function planificarJuegoPc(
  e: { neurona: Neurona; servidores: Servidor[]; persona: Persona }
): ResultadoPlanificacion {
  const neurona = e.neurona;
  const servidores = e.servidores;
  const persona = e.persona;

  const pasos: string[] = [];
  const avisos: string[] = [];

  const servidorConGPU = servidores.find(s => s.gpu);

  if (!neurona.tienePantalla) {
    return { ruta: "ninguna", motivo: "sin pantalla", pasos: [], avisos: [] };
  }

  if (esRutaA(neurona)) {
    pasos.push("abre Rare", "inicia sesión en Epic tú mismo");
    if (esA1SinGPU(neurona)) {
      avisos.push(avisoA1SinGPU());
    }
    return { ruta: "neurona-propia", motivo: motivosRutaA(), pasos, avisos };
  }

  if (!CONDICIONES_EPIC_DECIDIDAS) {
    return { ruta: "ninguna", motivo: "condiciones Epic no decididas", pasos: [], avisos: [] };
  }

  if (servidorConGPU && esRutaB(neurona, servidorConGPU)) {
    pasos.push("abre Rare", "inicia sesión en Epic tú mismo");
    return { ruta: "servidor-propio", motivo: motivosRutaB(), pasos, avisos };
  }

  if (servidorConGPU && esRutaC(neurona, servidorConGPU, persona)) {
    pasos.push("abre Rare", "inicia sesión en Epic tú mismo");
    return { ruta: "servidor-compartido", motivo: motivosRutaC(), pasos, avisos };
  }

  return { ruta: "ninguna", motivo: "ninguna ruta disponible", pasos: [], avisos: [] };
}

export interface ConfigEpic {
  ruta: string;
  modo: number;
}

export function rutaConfigEpic(datosConfig: string, personaId: string): ConfigEpic {
  if (!/^[a-z0-9-]{1,64}$/.test(personaId)) {
    return { ruta: "", modo: 0 };
  }
  return { ruta: `${datosConfig}/juegos/${personaId}/legendary`, modo: 0o700 };
}

export interface ValidacionEpic {
  ok: boolean;
  hallazgos: string[];
}

const CAMPOS_CLAVES = [
  "access_token",
  "refresh_token", 
  "account_id",
  "exchange_code"
] as const;

const PREFIJOS_PROHIBIDOS = ["eg1~"] as const;

export function validarSinCredencialesEpic(texto: string): ValidacionEpic {
  const hallazgos: string[] = [];
  const textoLower = texto.toLowerCase();

  for (const campo of CAMPOS_CLAVES) {
    if (textoLower.includes(campo)) {
      hallazgos.push(campo);
    }
  }

  for (const prefijo of PREFIJOS_PROHIBIDOS) {
    if (textoLower.includes(prefijo)) {
      hallazgos.push(`token con prefijo ${prefijo}`);
    }
  }

  return { ok: hallazgos.length > 0, hallazgos };
}

export function esUrlPermitidaRare(url: string): boolean {
  const urlLower = url.toLowerCase();
  if (urlLower.includes("raredevs.github.io") || urlLower.includes("protondb.com")) {
    return false;
  }
  if (urlLower.includes("rare-linux.zip") || urlLower.includes("rare-windows.zip")) {
    return false;
  }
  return urlLower.includes("github.com/raredevs/rare/releases");
}