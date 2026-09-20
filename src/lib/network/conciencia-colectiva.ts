import type { Experiencia } from "@/lib/astraura/experiencias";
import type { CapacidadesNodo } from "@/lib/network/capacidades-nodo";
import type { MeshHandle } from "@/lib/network/webrtc-mesh";

export interface ManifiestoAdaptador {
  actual: string;
  sha: string;
  t: number;
  experiencias: number;
  exactitud_dorado: number;
  base: string;
  pendienteDescarga?: boolean;
}

export type TemaConciencia =
  | "astraura/capacidades"
  | "astraura/experiencias"
  | "astraura/adaptador";

export interface MensajeConciencia {
  tema: TemaConciencia;
  origen: string;
  payload: CapacidadesNodo | Experiencia[] | ManifiestoAdaptador;
  t: number;
}

export interface TransporteConciencia {
  publicar: (mensaje: MensajeConciencia) => void;
  suscribir: (handler: (msg: MensajeConciencia) => void) => () => void;
}

export function anonimizar(e: Experiencia): Experiencia {
  if (e.dominio === "chat" || e.dominio === "persona") {
    return { ...e, entrada: "" };
  }
  return { ...e };
}

export function loteDeExperiencias(exps: Experiencia[], max = 50): Experiencia[] {
  return exps
    .filter((e) => e.resultado !== null && e.resultado !== undefined)
    .map(anonimizar)
    .slice(0, max);
}

export function recibidasSinDuplicar(mias: Experiencia[], ajenas: Experiencia[]): Experiencia[] {
  const idsMias = new Set(mias.map((e) => e.id));
  const resultado: Experiencia[] = [];
  const vistas = new Set<string>();

  for (const exp of ajenas) {
    if (exp?.id && !idsMias.has(exp.id) && !vistas.has(exp.id)) {
      vistas.add(exp.id);
      resultado.push(exp);
    }
  }

  return resultado;
}

export function fusionarManifiestos(
  mio: ManifiestoAdaptador | null,
  ajeno: ManifiestoAdaptador
): ManifiestoAdaptador {
  if (!mio) return { ...ajeno, pendienteDescarga: true };
  if (ajeno.sha === mio.sha) return mio;

  const ajenoNuevo = ajeno.t > mio.t;
  const ajenoMejorExactitud = ajeno.exactitud_dorado > mio.exactitud_dorado;
  const igualExactitud = ajeno.exactitud_dorado === mio.exactitud_dorado;
  const igualT = ajeno.t === mio.t;

  if (ajenoMejorExactitud && ajeno.t >= mio.t) {
    return { ...ajeno, pendienteDescarga: true };
  }
  if (ajenoNuevo && ajeno.exactitud_dorado >= mio.exactitud_dorado) {
    return { ...ajeno, pendienteDescarga: true };
  }
  if (igualExactitud && igualT && ajeno.sha > mio.sha) {
    return { ...ajeno, pendienteDescarga: true };
  }

  return mio;
}

export function crearTransporteMesh(handle: MeshHandle): TransporteConciencia {
  return {
    publicar: (msg: MensajeConciencia) => {
      handle.broadcast(JSON.stringify(msg));
    },
    suscribir: (handler: (msg: MensajeConciencia) => void) => {
      return handle.onPeer({
        onMessage: (_peerId: string, data: string) => {
          try {
            const parsed = JSON.parse(data) as MensajeConciencia;
            if (
              parsed &&
              typeof parsed === "object" &&
              "tema" in parsed &&
              (parsed.tema === "astraura/capacidades" ||
                parsed.tema === "astraura/experiencias" ||
                parsed.tema === "astraura/adaptador")
            ) {
              handler(parsed);
            }
          } catch {
            // Ignorar mensajes malformados
          }
        },
      });
    },
  };
}
