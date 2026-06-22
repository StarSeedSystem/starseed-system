"use client";

/**
 * Cerebros — Adaptadores de generación (Higgsfield + cualquier API de gen).
 *
 * Un servidor de cerebro de tipo `higgsfield`/`online` puede llevar un objeto
 * `adapter` que describe, de forma genérica y plantillada, cómo invocar una API
 * de generación (imagen/vídeo) y cómo extraer la URL de salida. El proxy del bot
 * (api/brain.py, acción `run`) interpreta este adaptador:
 *
 *   adapter = {
 *     template:   <string JSON con marcadores {{task}} / {{prompt}}>,  // cuerpo POST
 *     resultPath: "result.url" | "data.0.url" | ...,  // path al output en la respuesta
 *     poll?: {                                          // sondeo asíncrono (opcional)
 *       statusUrl:  <url con {{id}}>,
 *       idPath:     "id",
 *       donePath:   "status",
 *       doneValue:  "completed",
 *       resultPath: "result.url",
 *       intervalMs: 3000,
 *       maxTries:   40,
 *     },
 *   }
 *
 * En `run`, el bot sustituye la tarea en `template`, hace POST al endpoint del
 * servidor con `Authorization: Bearer <key>`, parsea la respuesta; si hay `poll`
 * extrae el id (idPath) y consulta `statusUrl` cada `intervalMs` hasta que
 * `donePath == doneValue` (o `maxTries`), y luego extrae `poll.resultPath`; si
 * no hay `poll`, extrae `resultPath`. Devuelve `{ ok, result, raw }`.
 *
 * Este módulo sólo aporta PRESETS editables y un helper para clonarlos; el
 * adaptador se guarda en `server.adapter` y se persiste con el cerebro.
 *
 * Sigue el patrón de catálogos de src/lib/brains/brains.ts (SERVER_KINDS, etc.).
 */

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Configuración de sondeo asíncrono (Higgsfield/Replicate son async). */
export interface AdapterPoll {
  /** URL de estado; usa {{id}} como marcador del id de la petición. */
  statusUrl: string;
  /** Path para extraer el id de la respuesta inicial (p.ej. "id"). */
  idPath: string;
  /** Path al campo de estado en la respuesta de sondeo (p.ej. "status"). */
  donePath: string;
  /** Valor que indica "terminado" (p.ej. "completed"). */
  doneValue: string;
  /** Path al output una vez terminado (p.ej. "result.url"). */
  resultPath: string;
  /** Intervalo entre sondeos, en ms. */
  intervalMs: number;
  /** Máximo de intentos (el bot lo acota para respetar límites serverless). */
  maxTries: number;
}

/** Adaptador de generación, almacenado en `server.adapter`. */
export interface GenAdapter {
  /** Cuerpo de la petición como string JSON con {{task}} / {{prompt}}. */
  template: string;
  /** Path dot/index al output en la respuesta directa (sin poll). */
  resultPath: string;
  /** Configuración de sondeo asíncrono (opcional). */
  poll?: AdapterPoll;
}

export interface GenPreset {
  id: string;
  label: string;
  blurb: string;
  adapter: GenAdapter;
}

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

export const GEN_PRESETS: GenPreset[] = [
  {
    id: "higgsfield",
    label: "Higgsfield (vídeo/imagen)",
    blurb:
      'Async: POST con {"prompt":"{{task}}"} → id; sondea el estado hasta "completed" y extrae la URL. ' +
      'Para Image-to-Video añade "image_url"; para Soul Mode usa "reference_image_urls". ' +
      "Pega tu endpoint exacto de cloud.higgsfield.ai y el nombre de tu clave en la bóveda.",
    adapter: {
      // Text-to-Video por defecto. Para Image-to-Video añade "image_url":"https://…";
      // para Soul Mode usa "reference_image_urls":["https://…"].
      template: '{\n  "prompt": "{{task}}"\n}',
      resultPath: "result.url",
      poll: {
        statusUrl: "https://cloud.higgsfield.ai/v1/generations/{{id}}",
        idPath: "id",
        donePath: "status",
        doneValue: "completed",
        resultPath: "result.url",
        intervalMs: 3000,
        maxTries: 40,
      },
    },
  },
  {
    id: "replicate",
    label: "Replicate-style (predicciones)",
    blurb:
      'Async: POST {"input":{"prompt":"{{task}}"}} → id; sondea la predicción hasta status "succeeded" y extrae output. ' +
      "Ajusta statusUrl/donePath/resultPath a tu modelo concreto.",
    adapter: {
      template: '{\n  "input": {\n    "prompt": "{{task}}"\n  }\n}',
      resultPath: "output",
      poll: {
        statusUrl: "https://api.replicate.com/v1/predictions/{{id}}",
        idPath: "id",
        donePath: "status",
        doneValue: "succeeded",
        resultPath: "output",
        intervalMs: 3000,
        maxTries: 40,
      },
    },
  },
  {
    id: "openai-image",
    label: "OpenAI-style (imágenes, síncrono)",
    blurb:
      'Síncrono: POST {"prompt":"{{task}}","n":1,"size":"1024x1024"} y extrae directamente data.0.url (sin sondeo).',
    adapter: {
      template:
        '{\n  "prompt": "{{task}}",\n  "n": 1,\n  "size": "1024x1024"\n}',
      resultPath: "data.0.url",
    },
  },
  {
    id: "custom",
    label: "Personalizado (genérico)",
    blurb:
      "Plantilla mínima para cualquier API: edita el cuerpo, el resultPath y, si tu API es asíncrona, activa el sondeo.",
    adapter: {
      template: '{\n  "prompt": "{{task}}"\n}',
      resultPath: "url",
    },
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Devuelve un preset por id. */
export function presetById(id: string): GenPreset | undefined {
  return GEN_PRESETS.find((p) => p.id === id);
}

/**
 * Devuelve un adaptador NUEVO (copia profunda) a partir de un preset, listo
 * para guardarse en `server.adapter` y editarse sin mutar el catálogo.
 */
export function applyPreset(presetId: string): GenAdapter {
  const p = presetById(presetId);
  const base: GenAdapter = p
    ? p.adapter
    : { template: '{\n  "prompt": "{{task}}"\n}', resultPath: "url" };
  // Copia profunda defensiva (incluye poll si existe).
  const clone: GenAdapter = {
    template: base.template,
    resultPath: base.resultPath,
  };
  if (base.poll) clone.poll = { ...base.poll };
  return clone;
}
