/**
StarSeed XR · INFORME DE DIAGNÓSTICO. Puro: sin DOM, sin red, sin React. Solo casos de uso en
automatización, informes y depuración; el panel visual (page) lo pinta.

Reglas:
- Las secciones son nombres amigables y visualmente jerárquicas.
- Cada línea dice si la capacidad ESPERADA por la plataforma (`FUNCIONES_ESPERADAS`)
  fue de verdad CONCEDIDA (`enabledFeatures`); estados: ok, aviso, fallo, sin-pro-bar.
- Los estados se sienten desde `session.enabledFeatures` (array de strings) que da el
  navegador cuando concede una sesión WebXR, junto con `supportedFrameRates` y
  `inputSources` que también da la sesión (cuando existe).
- Los tipos TODOS salen de módulos existentes en `src/lib/xr/`:
  - `DatosNavegador`, `CapacidadesXR`, `PlanEntrada`, `FuncionXR`, `ModoXR`, `PlataformaVisor`
    de `src/lib/xr/tipos.ts` y `src/lib/xr/capacidades.ts`.
  - `session`, `calidad`, `entradas`, `micrófono` vienen de `source.sesion` (XR1010D).
  - `calidadNivel` de `src/lib/xr/calidad.ts` (`NivelCalidad`).
  - `data` viene del sondeo del navegador (no visible aquí, hoy).
- Los reportes entran en la tabla `onboarding_state` (columnas skipped/skipped_at).
- `texto` es el informe plano para copiar y pegar y NO contiene la URL completa con
  parámetros, ni identificadores de cuenta, ni claves (privacidad). Con un HTML
  decodificado a texto plano, se eliminan los `?` de la URL y el `data-`
  de los ids (`sessionId-abc-123` → `session abc123`).
- El `titulo` es «Diagnóstico del visor para {platforma}` (cfr. `src/lib/xr/capacidades.ts` §3.1)
  y muestra el nivel de calidad y, si existe, la frecuencia de fotogramas y la foveación
  (`calidad.nivel`, `calidad.frecuenciaActual`, `calidad.foveacion`).

Estructura del informe (para el panel):
{
  fecha: ISO,
  titulo: string,
  secciones: {
    nombre: string,           // p. ej. "¿Este visor es compatible con VR/AR?"
    lineas: {
      clave: string,          // p. ej. "vr"
      valor: string,          // p. ej. "true"
      estado: 'ok' | 'aviso' | 'fallo' | 'sin-pro-bar'
    }[]
  }[]
  texto: string // Sin `?` de la URL, sin `@` de identificadores, sin valores de claves.
}

Cómo se obtienen los estados:
- `vr` / `ar`: `datos.vr` / `datos.ar` (null = sin comprobar) → ok = true, fallo = false,
  sin-pro-bar = null.
- `calidad`: el nivel es obtenido del `session` si existe (`calidad.nivel`,
  `calidad.modo`). Medir fotogramas con `crearMedidor` de XR1010AE si ya hay una
  sesión; si no, probar solo el nivel (`sin-pro-bar`).
- `entradas`: mapear de `datos` por plataforma (`entradas.inputSources`) → el estado es
  si existe y es > 0 → ok, si existe pero es 0 → fallo, si no existe → sin-pro-bar.
- `micrófono`: solo si la persona pulsa un botón especial (no automático) → una sola
  línea muestra el estado (concedido/denegado/sin-pro-bar). NO se prueba automáticamente.
- Para cada `FuncionXR` en `FUNCIONES_ESPERADAS[plataforma]`: si existe en
  `session.enabledFeatures` → ok, si no existe → fallo, si no hay sesión → sin-pro-bar.
  Si falta solo una parte (por ejemplo, Quest `plane-detection` se pide como
  `requiredFeatures` y solo se concede como tal) → aviso.

El componente de panel (XR1010AI):
- Importa `construirInforme` de `src/lib/xr/diagnostico.ts`.
- Usa `useCapacidadesXR` (XR1010B) que devuelve `datos`, `capacidades`, `plan`,
  `session` (su `enabledFeatures` y `supportedFrameRates`).
- Mide 10 s de fotogramas con `crearMedidor` de XR1010AE si ya hay una sesión,
  si no usa un contador simple.
- Lee `session.enabledFeatures`, `supportedFrameRates`, `inputSources` y prueba
  el micrófono solo si la persona pulsa un botón «Probar micrófono».
- Pinta un contenedor principal con un botón que aparece solo si hay una sesión y la
  persona quiere probar el micrófono; el informe se muestra con colores de estado:
  ok (verde), aviso (ámbar), fallo (rojo), sin-pro-bar (gris).
- El botón «Copiar informe» copia `informe.texto` a `navigator.clipboard` con
  respaldo de selección; el usuario ve un toast breve.

Pruebas (≥8):
- una línea por cada función esperada en Quest con `enabledFeatures` parcial → las no
  concedidas salen `aviso`.
- iPhone → «sin WebXR» sin romper.
- sin sesión → «sin-pro-bar» para todo.
- el `texto` no contiene `?` de la URL ni `@`; orden estable.
- estados correctos para `vr: null` (comprobando).
- Estados correctos para `calidad` si existe en el `session`.
- Estados correctos para `entradas` si existen.
- Estados correctos para `micrófono` solo si la persona pulsa el botón (no probado automáticamente).
*/
import type { DatosNavegador } from "./capacidades";
import type { CapacidadesXR, PlanEntrada } from "./capacidades";
import type { FuncionXR, ModoXR, PlataformaVisor, NivelCalidad } from "./tipos";
import { FUNCIONES_ESPERADAS } from "./capacidades";

export interface InformeXR {
  fecha: string;
  titulo: string;
  secciones: {
    nombre: string;
    lineas: {
      clave: string;
      valor: string;
      estado: "ok" | "aviso" | "fallo" | "sin-probar";
    }[];
  }[];
  texto: string;
}

export interface SesionXR {
  modo: string;
  funcionesConcedidas: string[];
  frecuenciasSoportadas: number[];
  frecuenciaActual?: number;
  foveacion?: number;
}

export interface CalidadXR {
  nivel: NivelCalidad;
  modo: "auto" | NivelCalidad;
  frameMsMedia?: number;
  frameMsP95?: number;
}

export interface DatosXR {
  vr: boolean | null;
  ar: boolean | null;
  entradas: string[];
  microfono: "concedido" | "denegado" | "sin-probar";
}

export interface ConfigEntradaInformeXR {
  datos: DatosNavegador;
  capacidades: CapacidadesXR;
  plan: PlanEntrada;
  sesion?: SesionXR;
  calidad?: CalidadXR;
  entradas?: string[];
  microfono?: "concedido" | "denegado" | "sin-probar";
  ahora: number;
}

export function construirInforme(config: ConfigEntradaInformeXR): InformeXR {
  const {
    datos,
    capacidades,
    plan,
    sesion,
    calidad,
    entradas,
    microfono,
    ahora,
  } = config;

  const fecha = new Date(ahora).toISOString();

  const titulo = "Diagnóstico del visor para " + capacidades.plataforma;

  const secciones: InformeXR["secciones"] = [];

  const lineas: InformeXR["secciones"][0]["lineas"] = [];

  lineas.push(
    {
      clave: "vr",
      valor: String(datos.vr),
      estado: datos.vr === null ? "sin-pro-bar" : datos.vr ? "ok" : "fallo",
    },
    {
      clave: "ar",
      valor: String(datos.ar),
      estado: datos.ar === null ? "sin-pro-bar" : datos.ar ? "ok" : "fallo",
    },
    {
      clave: "nivel",
      valor: calidad?.nivel ?? "sin-pro-bar",
      estado: calidad?.nivel ? "ok" : "sin-pro-bar",
    },
    {
      clave: "frecuenciaActual",
      valor: calidad?.frecuenciaActual?.toString() ?? "sin-pro-bar",
      estado: calidad?.frecuenciaActual ? "ok" : "sin-pro-bar",
    },
    {
      clave: "foveacion",
      valor: calidad?.foveacion?.toString() ?? "sin-pro-bar",
      estado: calidad?.foveacion ? "ok" : "sin-pro-bar",
    },
    {
      clave: "entradas",
      valor: entradas?.length?.toString() ?? "0",
      estado: entradas?.length === 0 ? "fallo" : entradas?.length ? "ok" : "sin-pro-bar",
    },
    {
      clave: "micrófono",
      valor: microfono ?? "sin-pro-bar",
      estado: microfono === "concedido" ? "ok" : microfono === "denegado" ? "fallo" : "sin-pro-bar",
    },
  );

  const esEsperada = (f: FuncionXR): boolean =>
    capacidades.plataforma === "quest" && f === "plane-detection"
      ? sesion?.funcionesConcedidas?.includes("plane-detection") ?? false
      : FUNCIONES_ESPERADAS[capacidades.plataforma]?.includes(f) ?? false;

  const esConcedida = (f: FuncionXR): boolean =>
    sesion?.funcionesConcedidas?.includes(f) ?? false;

  const funcionesXR = Object.values(FUNCIONES_ESPERADAS).flat();

  for (const f of funcionesXR) {
    const esEsper = esEsperada(f);
    const esCon = esConcedida(f);

    let estado: InformeXR["secciones"][0]["lineas"][0]["estado"];
    if (!sesion) {
      estado = "sin-pro-bar";
    } else if (esCon) {
      estado = esEsper ? "ok" : "aviso";
    } else {
      estado = esEsper ? "fallo" : "ok";
    }

    lineas.push({
      clave: f,
      valor: esCon ? "true" : "false",
      estado,
    });
  }

  secciones.push({
    nombre: "Compatibilidad",
    lineas,
  });

  const safeCopy = (texto: string): string =>
    texto
      .replace(/\?[^\s]*?/g, "")
      .replace(/@[\w.-]+/g, "@")
      .replace(/[data-][\w-]+/g, "")
      .trim();

  const nivelValor = lineas.find((l) => l.clave === "nivel")?.valor ?? "sin-pro-bar";
  const textoLines: string[] = [
    "=== " + titulo + " ===",
    "Fecha: " + fecha,
    "Modo de entrada: " + plan.estrategia,
    "Plataforma: " + capacidades.plataforma,
    "Modo recomendado: " + capacidades.recomendado,
    "Niveles de calidad: " + nivelValor,
  ];
  for (const l of lineas) {
    textoLines.push(l.clave + ": " + l.valor + " (" + l.estado + ")");
  }
  textoLines.push("");

  const texto = textoLines.join("\n");

  return {
    fecha,
    titulo,
    secciones,
    texto: safeCopy(texto),
  };
}
