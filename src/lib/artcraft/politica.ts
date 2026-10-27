import { Origen, Ambito, Rol } from "@/lib/protomolecula/tipos";
import { decidir } from "@/lib/protomolecula/permisos";
import { HERRAMIENTAS, AppArtcraft, type HerramientasApp, type PrefijosVetados, PREFIJOS_VETADOS } from "./politica-tablas";

export interface RaicesTrabajo {
  lectura: readonly string[];
  escritura: readonly string[];
}

export interface LlamadaArtcraft {
  app: AppArtcraft;
  herramienta: string;
  parametros: Record<string, unknown>;
  origen: Origen;
  ambito: Ambito;
  rol: Rol | null;
  raices: RaicesTrabajo;
}

export type Veredicto = {
  decision: "permitir" | "confirmar" | "denegar";
  motivo: string;
  escribe: boolean;
};

function normalizaRuta(ruta: string): string {
  const s = String(ruta);
  if (s.length === 0) return "";
  return s.replace(/\\/g, "/").replace(/\/\/+/g, "/");
}

export function rutaDentro(ruta: string, raices: RaicesTrabajo): boolean {
  const normalizada = normalizaRuta(ruta);
  if (normalizada.length === 0) return false;
  if (normalizada.includes("..")) return false;
  if (normalizada.includes("~")) return false;
  if (normalizada.includes("file:")) return false;
  if (normalizada.includes("\\\\")) return false;
  if (normalizada.includes("\0")) return false;

  for (const raiz of raices.lectura) {
    const normalizadaRaiz = normalizaRuta(raiz);
    if (normalizada === normalizadaRaiz) return true;
    if (normalizada.startsWith(normalizadaRaiz + "/")) return true;
  }

  for (const raiz of raices.escritura) {
    const normalizadaRaiz = normalizaRuta(raiz);
    if (normalizada === normalizadaRaiz) return true;
    if (normalizada.startsWith(normalizadaRaiz + "/")) return true;
  }

  return false;
}

export function rutasEnParametros(
  obj: Record<string, unknown>,
  profundidad = 0
): string[] {
  if (profundidad > 6 || obj === null || typeof obj !== "object") return [];

  const resultados: string[] = [];

  for (const [clave, valor] of Object.entries(obj)) {
    const bajo = ["path", "file", "dir", "out", "src", "dst", "from", "to", "ruta", "archivo", "carpeta"];
    const coincideClave = bajo.includes(clave);

    if (coincideClave && typeof valor === "string" && valor.length > 0) {
      resultados.push(valor);
    }

    if (typeof valor === "string") {
      const inicio = valor;
      if (
        inicio.startsWith("/") ||
        inicio.startsWith("~") ||
        inicio.startsWith("file:") ||
        inicio.startsWith("\\\\") ||
        /^[A-Za-z]:/.test(inicio)
      ) {
        resultados.push(valor);
      }
    }

    if (typeof valor === "object" && valor !== null && profundidad < 6) {
      const sub = rutasEnParametros(valor as Record<string, unknown>, profundidad + 1);
      resultados.push(...sub);
    }
  }

  return resultados;
}

function tienePrefijoVetado(herramienta: AppArtcraft, comando: string): boolean {
  const prefijos = PREFIJOS_VETADOS[herramienta];
  return prefijos.some((prefijo) => comando.startsWith(prefijo));
}

export function evaluarLlamada(
  llamada: LlamadaArtcraft
): Veredicto {
  const { app, herramienta, parametros, origen, ambito, rol, raices } = llamada;
  const herramientas = HERRAMIENTAS[app];

  if (!herramientas) {
    return {
      decision: "denegar",
      motivo: `Herramienta desconocida: ${herramienta}`,
      escribe: false,
    };
  }

  const esVetada = herramientas.vetadas.includes(herramienta);
  if (esVetada) {
    return {
      decision: "denegar",
      motivo: `Herramienta vetada: ${herramienta}`,
      escribe: false,
    };
  }

  const esLibre = herramientas.libre.includes(herramienta);
  const esTrabajo = herramientas.trabajo.includes(herramienta);

  if (!esLibre && !esTrabajo) {
    return {
      decision: "denegar",
      motivo: `Herramienta no reconocida: ${herramienta}`,
      escribe: false,
    };
  }

  const hayTrusted = (parametros["trusted"] as boolean) === true;
  if (hayTrusted) {
    return {
      decision: "denegar",
      motivo: "Herramienta confiada no permitida",
      escribe: false,
    };
  }

  const rutas = rutasEnParametros(parametros);

  if (herramienta === "run_command" || herramienta === "execute_command") {
    const comando =
      (parametros as { command?: string }).command ||
      ((parametros as { commands?: unknown[] }).commands?.[0] as { command?: string })
        ?.command;
    if (comando && tienePrefijoVetado(app, comando)) {
      return {
        decision: "denegar",
        motivo: `Comando con prefijo vetado: ${comando}`,
        escribe: false,
      };
    }
  }

  if (herramienta === "batch") {
    const commands = (parametros as { commands?: unknown[] }).commands;
    if (Array.isArray(commands)) {
      for (const c of commands) {
        const comando = (c as { command?: string }).command;
        if (comando && tienePrefijoVetado(app, comando)) {
          return {
            decision: "denegar",
            motivo: `Comando con prefijo vetado en lote: ${comando}`,
            escribe: false,
          };
        }
      }
    }
  }

  const rutasNoValidas = rutas.filter((r) => !rutaDentro(r, raices));
  if (rutasNoValidas.length > 0) {
    return {
      decision: "denegar",
      motivo: `Ruta fuera de confinamiento: ${rutasNoValidas[0]}`,
      escribe: false,
    };
  }

  if (esLibre) {
    if (origen === "ia" || origen === "agente") {
      if (
        herramienta === "pointer" ||
        herramienta === "key" ||
        herramienta === "type_text" ||
        herramienta === "select" ||
        herramienta === "call_app"
      ) {
        return {
          decision: "denegar",
          motivo: `Origen ${origen} no permitido en herramienta de ventana`,
          escribe: false,
        };
      }
    }
    return { decision: "permitir", motivo: "Herramienta libre", escribe: false };
  }

  if (esTrabajo) {
    const esEscritura = rutas.some(
      (r) =>
        !raices.escritura.some(
          (raiz) =>
            normalizaRuta(r) === normalizaRuta(raiz) ||
            normalizaRuta(r).startsWith(normalizaRuta(raiz) + "/")
        )
    );

    if (esEscritura) {
      return {
        decision: "denegar",
        motivo: "Ruta fuera de área de escritura",
        escribe: true,
      };
    }

    if (ambito === "personal") {
      if (
        herramienta === "pointer" ||
        herramienta === "key" ||
        herramienta === "type_text" ||
        herramienta === "select" ||
        herramienta === "call_app"
      ) {
        return {
          decision: "denegar",
          motivo: `Origen ${origen} no permitido en herramienta de ventana`,
          escribe: true,
        };
      }
      return { decision: "permitir", motivo: "Acción de trabajo permitida", escribe: true };
    }

    if (ambito === "grupo" || ambito === "publica") {
      const dec = decidir({ rol, origen, ambito, accion: "editar-estructura" });
      if (!dec.permitido) {
        return {
          decision: "confirmar",
          motivo: dec.confirmar ? "Confirmar acción de grupo" : dec.motivo,
          escribe: true,
        };
      }
      return {
        decision: "confirmar",
        motivo: "Confirmar acción de grupo",
        escribe: true,
      };
    }

    return {
      decision: "denegar",
      motivo: "No autorizado para este ámbito",
      escribe: true,
    };
  }

  return { decision: "denegar", motivo: "Herramienta no clasificada", escribe: false };
}