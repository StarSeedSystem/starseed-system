import type { Ambito } from "@/lib/protomolecula/tipos";
import type { Encargo } from "./encargo";
import { decidirAplicacion, rangoDeRol, EntidadAmbito, TipoEntidad } from "@/lib/genesis/operaciones";

function toGenesisAmbito(ambito: Ambito) {
  if (ambito === "personal") return { tipo: "persona" };
  const entidad: EntidadAmbito = { tipo: "pagina" as TipoEntidad, id: "", slug: "", nombre: "" };
  return { tipo: "entidad", entidad };
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i);
  return hash >>> 0;
}

export function decidirResultado(e: {
  ambito: Ambito;
  esDueno: boolean;
  rol?: string | null;
  democratico?: boolean;
  tocaFueraDeLaMolecula: boolean;
}): { modo: 'aceptar' | 'proponer-voto' | 'proponer-metagenesis' | 'sin-permiso'; motivo: string } {
  if (e.tocaFueraDeLaMolecula) return { modo: 'proponer-metagenesis', motivo: 'un átomo, un conversor o código del OS lo decide MetaGenesis' };

  const genesisAmbito = toGenesisAmbito(e.ambito);
  const rango = rangoDeRol(e.rol);
  const democratico = e.democratico ?? false;
  const resultado = decidirAplicacion(genesisAmbito, rango, democratico);

  let modo: 'aceptar' | 'proponer-voto' | 'proponer-metagenesis' | 'sin-permiso';
  let motivo: string;

  switch (resultado.modo) {
    case "aplicar": modo = 'aceptar'; motivo = resultado.motivo; break;
    case "proponer": modo = 'proponer-voto'; motivo = resultado.motivo; break;
    case "sin-permiso": modo = 'sin-permiso'; motivo = resultado.motivo; break;
  }

  // Override for personal/perfil when esDueno is false (if not already handled by decidirAplicacion)
  // Note: decidirAplicacion for personal ambito always returns "aplicar", so we don't need to override for personal when esDueno is true.
  // But for personal/perfil when esDueno is false, we want to return 'sin-permiso' with a specific motive.
  if ((e.ambito === "personal" || e.ambito === "perfil") && !e.esDueno) {
    return {
      modo: 'sin-permiso',
      motivo: 'No eres el dueño de esta molécula',
    };
  }

  // For personal/perfil when esDueno is true, we want to return 'aceptar' with a motive.
  // However, decidirAplicacion for personal ambito returns "aplicar" with motive "Es tu cuenta.".
  // We can keep that, but let's change the motive to be more specific to the molecule.
  if ((e.ambito === "personal" || e.ambito === "perfil") && e.esDueno) {
    return {
      modo: 'aceptar',
      motivo: 'Eres el dueño de esta molécula',
    };
  }

  // For grupo and publica, we use the result from decidirAplicacion, but we mapped the modo already.
  // However, note that the motive from decidirAplicacion is for an entity, which is acceptable.
  return { modo, motivo };
}

export function propuestaMetaGenesis(encargo: Encargo, falta: { tipo: 'atomo' | 'conversor' | 'otro'; detalle: string }): {
  id: string;
  titulo: string;
  archivos: string[];
  depende: string[];
  prompt: string;
} {
  const encargoString = [
    encargo.id,
    encargo.moleculaId,
    encargo.ambito,
    encargo.entidadId ?? '',
    encargo.intencion,
    encargo.criterios.map(c => `${c.tipo}:${c.valor ?? ''}:${c.texto}`).join(';'),
    encargo.autor.tipo,
    encargo.autor.id,
    encargo.origen,
    encargo.creadoEn.toString(),
  ].join('|');
  const faltaString = `${falta.tipo}|${falta.detalle}`;
  const input = encargoString + '|' + faltaString;
  const hash = hashString(input);
  const hashHex = hash.toString(16).padStart(8, '0').substring(0, 8);
  const id = `PGM${hashHex}`;
  const titulo = `Propuesta de MetaGenesis: ${falta.tipo}`;
  const archivos: string[] = [];
  const depende: string[] = [];
  const prompt = encargo.ambito === 'personal' ? `Tipo de lo que falta: ${falta.tipo}` : `Intención: ${encargo.intencion}\nFalta: ${falta.tipo} - ${falta.detalle}`;
  return { id, titulo, archivos, depende, prompt };
}