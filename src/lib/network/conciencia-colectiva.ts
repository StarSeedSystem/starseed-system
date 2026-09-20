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

export function esCapacidadesNodo(obj: unknown): obj is CapacidadesNodo {
  if (!obj || typeof obj !== "object") return false;
  const c = obj as Partial<CapacidadesNodo>;
  return (
    typeof c.nodoId === "string" &&
    c.nodoId.trim() !== "" &&
    typeof c.medio === "string" &&
    typeof c.t === "number" &&
    !isNaN(c.t)
  );
}

export function esExperiencia(obj: unknown): obj is Experiencia {
  if (!obj || typeof obj !== "object") return false;
  const e = obj as Partial<Experiencia>;
  return typeof e.id === "string" && e.id.trim() !== "";
}

export function esManifiestoAdaptador(obj: unknown): obj is ManifiestoAdaptador {
  if (!obj || typeof obj !== "object") return false;
  const m = obj as Partial<ManifiestoAdaptador>;
  return (
    typeof m.actual === "string" &&
    typeof m.sha === "string" &&
    typeof m.t === "number" &&
    !isNaN(m.t) &&
    typeof m.exactitud_dorado === "number" &&
    !isNaN(m.exactitud_dorado) &&
    typeof m.base === "string"
  );
}

export function anonimizar(e: Experiencia): Experiencia {
  if (!e || typeof e !== "object") return e;
  if (e.dominio === "chat" || e.dominio === "persona") {
    return { ...e, entrada: "" };
  }
  return { ...e };
}

export function loteDeExperiencias(exps: Experiencia[], max = 50): Experiencia[] {
  if (!Array.isArray(exps)) return [];
  return exps
    .filter((e) => esExperiencia(e) && e.resultado !== null && e.resultado !== undefined)
    .map(anonimizar)
    .slice(0, max);
}

export function recibidasSinDuplicar(mias: Experiencia[], ajenas: Experiencia[]): Experiencia[] {
  if (!Array.isArray(ajenas)) return [];
  const misArray = Array.isArray(mias) ? mias : [];
  const idsMias = new Set(misArray.filter((e) => esExperiencia(e)).map((e) => e.id));
  const resultado: Experiencia[] = [];
  const vistas = new Set<string>();

  for (const exp of ajenas) {
    if (esExperiencia(exp)) {
      if (!idsMias.has(exp.id) && !vistas.has(exp.id)) {
        vistas.add(exp.id);
        resultado.push(exp);
      }
    }
  }

  return resultado;
}

export function fusionarManifiestos(
  mio: ManifiestoAdaptador | null,
  ajeno: ManifiestoAdaptador
): ManifiestoAdaptador {
  if (!esManifiestoAdaptador(ajeno)) {
    return (
      mio ?? {
        actual: "",
        sha: "",
        t: 0,
        experiencias: 0,
        exactitud_dorado: 0,
        base: "",
      }
    );
  }
  if (!mio || !esManifiestoAdaptador(mio)) {
    return { ...ajeno, pendienteDescarga: true };
  }
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
      try {
        handle.broadcast(JSON.stringify(msg));
      } catch {
        // Ignorar fallos al emitir
      }
    },
    suscribir: (handler: (msg: MensajeConciencia) => void) => {
      return handle.onPeer({
        onMessage: (_peerId: string, data: string) => {
          try {
            if (typeof data !== "string") return;
            const parsed = JSON.parse(data) as MensajeConciencia;
            if (
              parsed &&
              typeof parsed === "object" &&
              typeof parsed.tema === "string" &&
              (parsed.tema === "astraura/capacidades" ||
                parsed.tema === "astraura/experiencias" ||
                parsed.tema === "astraura/adaptador")
            ) {
              handler(parsed);
            }
          } catch {
            // Ignorar mensajes malformados o fallos de parseo
          }
        },
      });
    },
  };
}
