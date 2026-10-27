/**
 * Rare: Juegos de PC — planificador puro y guarda de credenciales de Epic.
 * Contrato: architecture/artcraft-y-rare.md §5 completo (rutas A, B y C, y §5.3 credenciales de Epic).
 * MÓDULO PURO: sin node:*, sin React, sin red.
 */

export const CONDICIONES_EPIC_DECIDIDAS = false;

export interface Neurona {
  sistema: "macos" | "linux" | "windows" | "otro";
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
  transmision: "selkies" | "sunshine" | null;
  libreDiscoGB: number;
}

export interface Persona {
  id: string;
  aceptaCondicionesEpic: boolean;
}

export interface PlanJuegoPc {
  ruta: "neurona-propia" | "servidor-propio" | "servidor-compartido" | "ninguna";
  motivo: string;
  pasos: string[];
  avisos: string[];
}

export function planificarJuegoPc(e: {
  neurona: Neurona;
  servidores: Servidor[];
  persona: Persona;
}): PlanJuegoPc {
  const avisos: string[] = [];
  const pasos: string[] = [];

  if (!e.neurona.gpu && e.neurona.sistema !== "otro") {
    avisos.push("El A1 de Oracle (sin GPU) no sirve para 3D cuando el servidor tiene gpu: false");
  }

  if (e.neurona.tienePantalla && e.neurona.binarioRare) {
    pasos.push("abre Rare");
    return { ruta: "neurona-propia", motivo: "La neurona tiene pantalla y Rare instalado", pasos, avisos };
  }

  const servidorPropio = e.servidores.find(s => s.propio && s.gpu && s.wineOProton && s.transmision);
  if (servidorPropio) {
    pasos.push(`conecta a ${servidorPropio.id} por ${servidorPropio.transmision}`);
    pasos.push("inicia sesión en Epic tú mismo");
    return { ruta: "servidor-propio", motivo: "Hay un servidor propio con GPU, Wine/Proton y transmisión", pasos, avisos };
  }

  if (CONDICIONES_EPIC_DECIDIDAS && e.persona.aceptaCondicionesEpic) {
    const servidorCompartido = e.servidores.find(s => s.compartido && s.gpu && s.wineOProton && s.transmision);
    if (servidorCompartido) {
      pasos.push(`solicita sesión en ${servidorCompartido.id} por ${servidorCompartido.transmision}`);
      pasos.push("inicia sesión en Epic tú mismo con tu cuenta");
      return { ruta: "servidor-compartido", motivo: "Condiciones de Epic decididas y la persona acepta; hay servidor compartido con GPU", pasos, avisos };
    }
    avisos.push("No hay servidor compartido con GPU, Wine/Proton y transmisión disponible");
    return { ruta: "ninguna", motivo: "Condiciones decididas y persona acepta, pero no hay servidor compartido adecuado", pasos, avisos };
  }

  return { ruta: "ninguna", motivo: "No hay neurona con pantalla y Rare, ni servidor propio con GPU, ni condiciones de Epic decididas y aceptadas", pasos, avisos };
}

const PERSONA_ID_RE = /^[a-z0-9-]{1,64}$/;

export function rutaConfigEpic(datos: string, personaId: string): { ruta: string; modo: number } {
  if (!PERSONA_ID_RE.test(personaId)) {
    throw new Error(`personaId inválido: "${personaId}" (solo a-z, 0-9, -, máx 64)`);
  }
  const base = datos.replace(/\/+$/, "");
  return { ruta: `${base}/juegos/${personaId}/legendary`, modo: 0o700 };
}

export function validarSinCredencialesEpic(texto: string): { ok: boolean; hallazgos: string[] } {
  const hallazgos: string[] = [];
  const patrones: Array<{ regex: RegExp; nombre: string }> = [
    { regex: /access_token["']?\s*[:=]\s*["']?([^"'\s]{9,})/gi, nombre: "access_token" },
    { regex: /refresh_token["']?\s*[:=]\s*["']?([^"'\s]{9,})/gi, nombre: "refresh_token" },
    { regex: /account_id["']?\s*[:=]\s*["']?([^"'\s]{9,})/gi, nombre: "account_id" },
    { regex: /exchange_code["']?\s*[:=]\s*["']?([^"'\s]{9,})/gi, nombre: "exchange_code" },
    { regex: /eg1~[^"'\s]{8,}/gi, nombre: "eg1~" },
  ];
  for (const { regex, nombre } of patrones) {
    if (regex.test(texto)) {
      if (!hallazgos.includes(nombre)) hallazgos.push(nombre);
    }
  }
  return { ok: hallazgos.length === 0, hallazgos };
}

export function esUrlPermitidaRare(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname === "raredevs.github.io") return false;
    if (u.hostname === "protondb.com") return false;
    if (u.hostname === "github.com" && u.pathname.startsWith("/RareDevs/Rare/releases/")) return true;
    return false;
  } catch {
    return false;
  }
}