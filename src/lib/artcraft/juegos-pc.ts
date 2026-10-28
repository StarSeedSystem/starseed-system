/**
 * ArtCraft · PLANIFICADOR DE JUEGOS DE PC (contrato §5). Módulo puro: sin node:*, React, red.
 */
export const CONDICIONES_EPIC_DECIDIDAS = false;

export interface NeuronaInfo {
  sistema: "macos" | "linux" | "windows" | "otro";
  tienePantalla: boolean;
  binarioRare: boolean;
  gpu: boolean;
  memoriaMB: number;
}
export interface ServidorInfo {
  id: string;
  propio: boolean;
  compartido: boolean;
  gpu: boolean;
  wineOProton: boolean;
  transmision: "selkies" | "sunshine" | null;
  libreDiscoGB: number;
}
export interface PersonaInfo {
  id: string;
  aceptaCondicionesEpic: boolean;
}
export interface PlanJuego {
  ruta: "neurona-propia" | "servidor-propio" | "servidor-compartido" | "ninguna";
  motivo: string;
  pasos: string[];
  avisos: string[];
}

/** Planifica la ruta para jugar un juego de PC según los recursos disponibles. */
export function planificarJuegoPc(e: {
  neurona: NeuronaInfo;
  servidores: ServidorInfo[];
  persona: PersonaInfo;
}): PlanJuego {
  const { neurona, servidores, persona } = e;
  const avisos: string[] = [];

  // Avisa si hay servidores sin GPU (p.ej. Oracle A1)
  if (servidores.some((s) => !s.gpu)) {
    avisos.push("Los servidores sin GPU (p. ej. Oracle A1) no sirven para 3D.");
  }

  // Ruta A: neurona propia con pantalla y Rare instalado
  if (neurona.tienePantalla && neurona.binarioRare) {
    return {
      ruta: "neurona-propia",
      motivo: "Rare disponible en la neurona con pantalla.",
      pasos: ["Abre Rare", "Inicia sesión en Epic tú mismo"],
      avisos,
    };
  }

  // Solo considerar rutas de servidor si la neurona NO tiene pantalla NI Rare instalado
  const puedeUsarServidor = !neurona.tienePantalla && !neurona.binarioRare;

  // Ruta B: servidor propio (no compartido) con GPU, Wine/Proton y transmisión
  if (puedeUsarServidor) {
    const servidorPropio = servidores.find(
      (s) => s.propio && !s.compartido && s.gpu && s.wineOProton && s.transmision !== null,
    );
    if (servidorPropio) {
      return {
        ruta: "servidor-propio",
        motivo: `Servidor propio «${servidorPropio.id}» cumple requisitos.`,
        pasos: [
          `Conecta a ${servidorPropio.id} por ${servidorPropio.transmision}`,
          "Abre Rare en el servidor",
          "Inicia sesión en Epic tú mismo",
        ],
        avisos,
      };
    }
  }

  // Ruta C: solo si las condiciones Epic están decididas y la persona las acepta
  if (puedeUsarServidor && CONDICIONES_EPIC_DECIDIDAS && persona.aceptaCondicionesEpic) {
    const servidorCompartido = servidores.find((s) => s.compartido);
    if (servidorCompartido) {
      return {
        ruta: "servidor-compartido",
        motivo: `Servidor compartido «${servidorCompartido.id}» disponible.`,
        pasos: [
          `Conecta a ${servidorCompartido.id} por ${servidorCompartido.transmision ?? "transmisión"}`,
          "Abre Rare en el servidor",
          "Inicia sesión en Epic tú mismo",
        ],
        avisos,
      };
    }
    return {
      ruta: "ninguna",
      motivo: "Condiciones Epic decididas y aceptadas, pero no hay servidor compartido.",
      pasos: [],
      avisos,
    };
  }

  // Ninguna ruta viable
  const motivos: string[] = [];
  if (!neurona.tienePantalla) motivos.push("La neurona no tiene pantalla.");
  if (!neurona.binarioRare) motivos.push("Rare no está instalado en la neurona.");
  if (puedeUsarServidor) {
    const servidorPropio = servidores.find(
      (s) => s.propio && s.gpu && s.wineOProton && s.transmision !== null,
    );
    if (!servidorPropio) motivos.push("No hay servidor propio con GPU, Wine/Proton y transmisión.");
  }
  if (!CONDICIONES_EPIC_DECIDIDAS) motivos.push("Condiciones de Epic no decididas.");
  else if (!persona.aceptaCondicionesEpic) motivos.push("La persona no acepta las condiciones de Epic.");
  return {
    ruta: "ninguna",
    motivo: motivos.join(" "),
    pasos: [],
    avisos,
  };
}

const PERSONA_REGEX = /^[a-z0-9-]{1,64}$/;

/** Devuelve la ruta de configuración de Legendary para una persona y su modo 0o700. */
export function rutaConfigEpic(datos: string, personaId: string): { ruta: string; modo: number } {
  if (!PERSONA_REGEX.test(personaId)) throw new Error("Persona inválida");
  return { ruta: `${datos}/juegos/${personaId}/legendary`, modo: 0o700 };
}

/** Detecta credenciales típicas de Legendary en un texto sin repetir valores. */
export function validarSinCredencialesEpic(texto: string): { ok: boolean; hallazgos: string[] } {
  const hallazgos: string[] = [];
  const patrones = [
    { clave: "access_token", regex: /access_token\s*[:=]\s*["']?([^"'\s]{9,})/i },
    { clave: "refresh_token", regex: /refresh_token\s*[:=]\s*["']?([^"'\s]{9,})/i },
    { clave: "account_id", regex: /account_id\s*[:=]\s*["']?([^"'\s]{9,})/i },
    { clave: "exchange_code", regex: /exchange_code\s*[:=]\s*["']?([^"'\s]{9,})/i },
    { clave: "eg1~ token", regex: /eg1~[A-Za-z0-9_\-]{8,}/ },
  ];
  for (const p of patrones) {
    if (p.regex.test(texto)) hallazgos.push(p.clave);
  }
  return { ok: hallazgos.length === 0, hallazgos };
}

const GITHUB_RARE_RELEASES = "https://github.com/RareDevs/Rare/releases/";

/** Verifica si una URL está permitida para descargar Rare. */
export function esUrlPermitidaRare(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host === "raredevs.github.io" || host === "protondb.com") return false;
    // Bloquear cualquier descarga remota de Rare que no sea GitHub releases oficial
    if (!url.startsWith(GITHUB_RARE_RELEASES)) return false;
    return true;
  } catch {
    return false;
  }
}