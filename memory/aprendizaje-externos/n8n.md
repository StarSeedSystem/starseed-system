# Inventario de aprendizaje · n8n Cloud (prueba hasta el 2026-10-18)

Formato del contrato `architecture/puente-propio-flujos.md` §2. Revisión a mitad de prueba: 2026-10-11.

## Estado de la revisión del 2026-10-11

- **Instancia**: el navegador integrado NO tiene la sesión de n8n Cloud abierta (`/rest/login` → 401, redirige a
  `/signin`). Sin sesión no se pueden leer los flujos, las plantillas ni las ejecuciones; Claude no escribe
  contraseñas. Hace falta que Alex entre una vez en el navegador integrado (o exporte a mano a `~/Downloads`).
- **Exportado hasta hoy**: 1 flujo (`n8n-export/2026-10-05/starseed-produccion-puentes.json`, «StarSeed ·
  Producción (puentes)», 7 nodos). El importador propio lo traduce entero: 6 de 6 nodos útiles (3 webhooks y
  3 «set»); solo la nota adhesiva no se traduce (no hace falta).
- **Uso de la prueba (x/1000 ejecuciones)**: sin dato (requiere la sesión).
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

1. Alex abre sesión una vez en n8n Cloud desde el navegador integrado (o descarga los JSON a `~/Downloads`).
2. `python3 scripts/puente/flujos/exportar_externos.py n8n --carpeta ~/Downloads` (arreglado el 2026-10-11:
   ya corre como guion).
3. El importador los convierte y el motor propio los corre en sombra comparando resultados.
