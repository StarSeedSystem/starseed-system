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

## Traslado, 2026-10-14 (aviso programado del inicio)

- **Exportación**: la sesión de n8n Cloud del navegador integrado caducó (redirige a «signin») y Claude no
  escribe contraseñas: no se pudo releer la instancia. Lo último exportado (2026-10-11) es posterior a la
  última edición del único flujo (2026-10-05). Si Alex creó flujos después del 11: iniciar sesión en n8n Cloud
  y descargar cada flujo (⋯ → Download) a `~/Downloads`, y luego
  `python3 scripts/puente/flujos/exportar_externos.py n8n --carpeta ~/Downloads`.
- **Nadie depende hoy de n8n Cloud**: ningún proceso llama a `produccion_webhooks.emitir` y en la Mac no hay
  `N8N_WEBHOOK_URL` ni `PRODUCCION_WEBHOOKS`. Sus 3 ejecuciones de octubre no vinieron de ningún proceso en marcha. Además su
  Webhook pide la cabecera `X-StarSeed-Token` y nuestro emisor firma con `X-StarSeed-Firma`. Que venza el 18 no
  apaga nada que funcione.
- **Sombra (los 3 eventos por el motor propio, carpeta temporal)**: hoy **0 de 3** dan lo que da n8n.
  1. `motor.REGISTRO` está vacío: «publicada» se recoge y falla en el primer nodo («No hay ejecutor
     registrado para el tipo pendiente»). Ningún flujo puede correr con el servicio tal como está.
  2. Solo escucha el PRIMER webhook: «pieza-lista» y «revertida» se quedan sin consumir.
  3. Con los ejecutores enchufados y solo la rama del disparador, corre, pero el importador deja el «=» de n8n
     delante de cada expresión (`"=sombra1014"`, listas como texto).
  - El gancho HTTP de Genesis sí funciona: sin firma 401, firmado 202 (archivo de prueba borrado después).
  - Informe completo: `memory/aprendizaje-externos/sombra-2026-10-14.json`.
- **Tareas** (`cola-traslado-n8n-1014.json`, Ola 1014T): FLU1014A registro de ejecutores, B todos los
  disparadores, C solo la rama del disparador, D importador («=», nota, forma n8n, Set fiel), E sombra
  permanente (`flujos/sombra.py` + prueba de los 3 eventos), F emisor al gancho propio por evento, G
  autopublicar avisa «publicada».
- **El 17** (último traslado): `python3 scripts/puente/flujos/sombra.py` debe dar 3 de 3; entonces el flujo
  corre en casa (`FLUJOS_GANCHO_BASE` en `~/.starseed/env`) y n8n Cloud puede vencer sin pérdida.

## Último traslado (2026-10-18, el día que vence la prueba)

- **Sombra: 3 de 3.** `python3 .transfer/sombra-n8n-1014/sombra.py` da hoy, por el camino REAL (gancho → disparadores →
  motor), lo mismo que el Set de n8n para «publicada», «pieza-lista» y «revertida». Informe:
  `memory/aprendizaje-externos/sombra-2026-10-18.json`. Faltaba una cosa: el importador no marcaba los webhooks de n8n
  con `forma: "n8n"` y el ejecutor pasaba el cuerpo suelto (los `$json.body.*` salían vacíos). Arreglado en
  `flujos/importar_n8n.py` con su prueba, y el flujo se reimportó desde `n8n-export/2026-10-11/` (copia del anterior en
  `starseed_memory_root/archivo/flujos-1018/`).
- **El servicio `com.starseed.flujos` llevaba vivo desde el 14-10 02:04** con el código de antes de FLU1014A–D (Python
  carga los módulos al arrancar): se reinició para que use el motor nuevo.
- **En casa de punta a punta:** `FLUJOS_GANCHO_BASE` en `~/.starseed/env` (copia en `env.respaldo-20261018`). Un evento
  firmado de prueba («prueba-traslado-1018») entró por el gancho de Genesis (202) y el servicio lo ejecutó «completa».
- **Enrutador:** `produccion_puentes.py` aparta `n8n_cloud` desde el 2026-10-18 aunque `N8N_CLOUD_URL` siga en el
  entorno (PUENTES1017, commit 531e7e259) y respeta el apagado a mano.
- **Exportación final:** la instancia pide iniciar sesión (sin API en la prueba). Solo había 1 flujo y la exportación del
  11-10 está al día según el registro; si Alex entra antes de que venza, se vuelve a exportar para comparar.
- **Pendiente del enjambre:** FLU1014E (sombra permanente en `flujos/sombra.py`) y FLU1014G (autopublicar emite
  «publicada»).
