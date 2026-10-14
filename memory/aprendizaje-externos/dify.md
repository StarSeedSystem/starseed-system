# Inventario de aprendizaje · Dify Cloud Sandbox

Formato del contrato `architecture/puente-propio-flujos.md` §2. Revisión a mitad de prueba: 2026-10-11.

## Estado de la revisión del 2026-10-11

- **API de conocimiento** (clave de tipo «dataset» en `~/.starseed/env`, solo el nombre `DIFY_CLAVE`):
  responde bien; la cuenta tiene **0 bases de conocimiento**. Exportación hecha
  (`dify-export/2026-10-11/`, vacía): no hay documentos que trasladar.
- **Apps de Dify y créditos de mensajes del Sandbox**: sin dato. Esa clave no abre la API de apps (401) y el
  navegador integrado no tiene la sesión de cloud.dify.ai abierta (pide iniciar sesión). Sin el porcentaje de
  créditos no se puede aplicar la regla del 70 %; con 0 bases, el traslado de Dify es casi inmediato.
- **Arreglos del exportador**: quitaba mal el «/v1» (salía `/v1/v1/…`) y urllib sin User-Agent recibía 403 de
  Cloudflare; corregido el 2026-10-11 con pruebas.

## Capacidades

| Qué hace | Cómo lo hacen ellos | Qué tenemos ya | Qué falta | Prioridad | Tarea |
|---|---|---|---|---|---|
| Bases de conocimiento (RAG) | Datasets con documentos troceados e índice | `scripts/puente/conocimiento.py` y nodo `conocimiento` de los flujos | — | — | FLU1005E |
| Apps de IA publicadas como API | App = prompt con variables + conocimiento + modelo, con registro y anotaciones | Apps de IA propias (FLU1005F) | Comparar con las apps reales de la cuenta (requiere sesión) | Media | — |
| Flujos de IA (workflow/chatflow) | Lienzo con nodos de LLM, condiciones y herramientas | Motor de flujos propio + nodo `ia` | — | — | FLU1005A, FLU1005B |
| Registro y anotaciones | Cada llamada queda registrada; respuestas anotables | Registro de las apps propias (FLU1005F) | — | — | FLU1005F |

## Traslado, 2026-10-14

- `exportar_externos.py dify`: la API responde y la cuenta sigue con **0 bases y 0 documentos**
  (`dify-export/2026-10-14/`, vacía). No hay nada que cargar en el conocimiento propio (FLU1005E).
- Las apps y los créditos del Sandbox siguen sin dato: el navegador integrado no tiene la sesión de cloud.dify.ai.
