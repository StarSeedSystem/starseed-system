# Inventario de aprendizaje · n8n Cloud (prueba hasta el 2026-10-18)

Formato del contrato `architecture/puente-propio-flujos.md` §2. Revisión a mitad de prueba: 2026-10-11.

## Estado de la revisión del 2026-10-11 (con la sesión de Alex abierta)

- **Instancia**: plan «Trial», **1 flujo** en total: «StarSeed · Producción (puentes)» (publicado, creado el
  2026-10-04, última edición 2026-10-05 04:10 UTC). La copia del repo (`n8n-export/2026-10-05/`) es POSTERIOR a esa
  edición: está al día. Reexportado y registrado hoy (`n8n-export/2026-10-11/`, con informe) y convertido a flujo de
  Genesis (`starseed_memory_root/flujos/starseed-producci-n-puentes.json`): 6 de 6 nodos útiles traducidos; solo la nota
  adhesiva no se traduce (no hace falta).
- **Uso de la prueba**: **3 de 1.000 ejecuciones** en octubre, 0 fallidas, 0,03 s de media. Vence el
  **2026-10-19 03:41 UTC** (18 de octubre, 21:41 en la Mac).
- **Rutas internas**: `/rest/login` y `/rest/workflows` contestan 401 aun con la sesión abierta (esta versión de n8n
  Cloud autentica distinto); los datos se leen del estado de la propia página. Para el traslado no hace falta más.
- **Motor propio**: servicio `com.starseed.flujos` vivo; Ola 1005F completa (FLU1005A–I integradas;
  H como FLU1005Hc), Ola 1005B completa por sus sucesoras (PRD1005Sc, Tb/Tbs, Ub).

## Capacidades

| Qué hace | Cómo lo hacen ellos | Qué tenemos ya | Qué falta | Prioridad | Tarea |
|---|---|---|---|---|---|
| Disparar por webhook | Nodo Webhook con ruta y método; respuesta inmediata o por nodo «Respond» | `flujos/disparadores.py` (gancho HTTP firmado) + nodo `webhook`; `respondToWebhook` se traduce como `set` | Respuesta personalizada al llamador (hoy aproximada) | Media | FLU1005C |
| Disparar por horario | Schedule Trigger / Cron | nodo `cron` (`importar_n8n.mapear_cron`) | — | — | FLU1005C |
| Transformar datos | Nodo Set (campos) y Code (JS/Python) | `set` (FLU1005B); Code → **pendiente** (no se ejecuta código ajeno: invariante del OS) | Equivalente seguro de Code (expresiones `flujos/expresiones.py` ampliadas) | Media | — |
| Llamar a una API | HTTP Request con credenciales | nodo `http` con credencial por nombre (nunca valor) | — | — | FLU1005B |
| Condiciones y ramas | If, Switch, Merge | `si`, `switch`, `fusion` | — | — | FLU1005B |
| Avisar | Telegram, correo… | `telegram`, `ntfy`, `chat_director` | Correo | Baja | FLU1005B |
| IA en el flujo | Nodos de LLM/agentes | `ia` (modelos gratuitos del enrutador) y `conocimiento` | — | — | FLU1005B, FLU1005E |
| Google Drive | Nodo nativo | **pendiente** | Nodo Drive sobre `src/lib/storage/gdrive-driver.ts` | Media | — |
| Editor visual | Lienzo de nodos, historial de ejecuciones | Editor en Genesis (FLU1005Hc: lienzo dnd-kit, panel, historial, Ejecutar/Activar) | — | — | FLU1005Hc |

## Para el traslado del 2026-10-14

1. Hecho por adelantado el 2026-10-11: el único flujo ya está exportado, al día y convertido.
2. Del 14 al 17: el motor propio corre ese flujo en sombra (sus 3 webhooks) comparando con n8n Cloud.
3. El 17: el enrutador de producción apaga n8n Cloud y los webhooks apuntan al motor propio.
   Si Alex crea flujos nuevos en n8n antes del 17: `python3 scripts/puente/flujos/exportar_externos.py n8n --carpeta ~/Downloads`.
