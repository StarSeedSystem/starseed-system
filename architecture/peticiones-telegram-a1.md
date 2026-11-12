# Peticiones por Telegram atendidas en el A1 · contrato y cola PET1112

**Fecha:** 2026-11-12 · **Pedido de Alex:** «envié un mensaje de una solicitud al chat de Telegram pero ni siquiera
respondió… lo que le pedí debería funcionar aún sin la Mac completamente… que me envíe lo que solicité sin que use la
Mac ni Claude».
**Destino en el repo:** `architecture/peticiones-telegram-a1.md`

## 1. Qué pasó

- **El 2026-11-12 a las 14:04, Alex escribió a @StarSeed_Design_bot** (el chat «Síntesis de producción StarSeed»):
  pedía una infografía y un resumen de audio tipo podcast de la última síntesis, hechos en NotebookLM desde el cuaderno
  «StarSeed: Producción audiovisual».
- **Nadie lo leyó:** `sintesis_telegram.py` solo envía; ningún proceso hacía `getUpdates` sobre ese bot. El mensaje
  seguía pendiente en Telegram.
- **La sesión de NotebookLM había caducado en la Mac y en el A1:** `claves` (SDP1111R) copió la sesión de la Mac al
  A1, las dos copias se usaron sin mantenimiento y Google las cerró. Un mismo `storage_state.json` en dos nodos rota
  `__Secure-1PSIDTS` por separado y acaba invalidado.
- **Las cuentas del A1 volvieron a llegar con el uid 501:** `~/.starseed/cuentas/*.json` en el A1 con dueño `501:staff`
  y modo 600, así que el usuario `starseed` no puede leerlas.
- **La síntesis del 2026-11-12 no se escribió.** `agente_sintesis` encoló a las 06:24 siete tareas (SIN11121–SIN11127)
  en `olas/cola-suenos-sintesis.json`, de 821 KB. Ninguna tiene entrada en `progreso.json`, y `estado.json` sigue en
  `entregar` con `sintesis_path: null`.

## 2. Lo que ya funciona (hecho por Claude con permiso de Alex, fuera del repo)

- **Escucha en el A1:** `/home/starseed/herramientas/peticiones-telegram/peticiones_telegram.py`, servicio
  `starseed-peticiones-telegram.service` (usuario `starseed`, `Restart=always`). Copia de referencia en
  `architecture/peticiones-telegram-a1-referencia/peticiones_telegram.py.txt`.
  - Hace *long polling* de @StarSeed_Design_bot y solo acepta `TELEGRAM_SINTESIS_CHAT_ID`.
  - Acusa recibo y guarda cada petición en `~/.starseed/peticiones/cola.json` antes de confirmar el *offset*.
  - Interpreta con FreeLLMAPI local usando modelos con nombre (nunca `auto`, nunca Claude) y tiene reglas de
    respaldo.
  - **NotebookLM:** genera infografía, audio, vídeo, presentación, mapa mental, informe, cuestionario, tarjetas y tabla.
    La fuente es la última «Síntesis diaria AAAA-MM-DD» de Drive, un Doc enlazado o el cuaderno. Lo lanza todo a la
    vez, espera, descarga y lo envía al chat.
  - **Lo demás:** responde con modelos gratuitos. Comandos `/estado` y `/ayuda`.
  - **Mantenimiento:** `auth refresh` de NotebookLM cada 20 min. Si la sesión cae, la petición espera hasta 24 h y
    reintenta 3 veces cada paso que falla.
- **`starseed-cuentas-dueno.path` y `.service`:** devuelven el dueño `starseed` a `~/.starseed/cuentas` cada vez que
  cambian. Es un parche hasta PET1112C.
- **Sesión de NotebookLM:** el **A1 es su único dueño**. La copia de la Mac quedó apartada como
  `storage_state.json.caducada-2026-11-12`, así que `claves` no la vuelve a enviar.
- **Pedido de las 14:04:** entregado con la infografía y el audio de la «Síntesis diaria 2026-11-11», generados en el
  A1.

## 3. Reglas

- La sesión de NotebookLM vive solo en el A1; ningún otro nodo usa ni copia ese perfil mientras el del A1 esté vivo.
- Solo el chat de Alex manda. El bot nunca publica, ni escribe a terceros, ni toca cuentas, ni hace push.
- Todo con modelos gratuitos con nombre; nunca `auto` y nunca Claude.
- Las claves solo viven en `~/.starseed/env`; no se imprimen nunca, como tampoco la IP.
- Módulos de 120 líneas como máximo, con pruebas sin red. La herramienta de §2 sigue en marcha hasta que la versión
  del repo esté desplegada y probada con un mensaje real; después se retira.

## 4. Cola PET1112

```json
{"ola": "PET1112", "tareas": [
{"id": "PET1112A", "ola": "PET1112", "titulo": "Peticiones por Telegram · módulos del repo", "archivos": ["scripts/puente/peticiones_reglas.py", "scripts/puente/peticiones_notebooklm.py", "scripts/puente/peticiones_telegram.py", "scripts/puente/test_peticiones_reglas.py", "scripts/puente/test_peticiones_notebooklm.py", "scripts/puente/test_peticiones_telegram.py"], "depende": [], "prompt": "Lee architecture/peticiones-telegram-a1.md y la herramienta de referencia architecture/peticiones-telegram-a1-referencia/peticiones_telegram.py.txt (ya funciona en el A1). Pásala al repo con el mismo comportamiento, partida en tres módulos de 120 líneas como máximo: peticiones_reglas.py (PURO: TIPOS, por_reglas, validar el plan del modelo, texto de /estado y /ayuda), peticiones_notebooklm.py (fuente de Drive, lanzar, esperar, descargar y preparar el envío, con el CLI inyectable) y peticiones_telegram.py (bucle getUpdates, cola durable en ~/.starseed/peticiones/cola.json, hilo de trabajo y refresco de NotebookLM cada 20 min). Reutiliza sintesis_telegram para enviar texto y cuentas_google.token para Drive. Solo el chat TELEGRAM_SINTESIS_CHAT_ID; modelos de FreeLLMAPI con nombre, nunca 'auto' ni Claude. Pruebas sin red: reglas sobre el mensaje real de Alex («infografía y resumen de audio tipo podcast de la última síntesis…» da infographic+audio y ultima_sintesis), cola durable y reanudable, un chat ajeno ignorado y una sesión caducada que deja la petición esperando."},
{"id": "PET1112B", "ola": "PET1112", "titulo": "Peticiones por Telegram · unidades y despliegue en el A1", "archivos": ["deploy/oracle/nodo/systemd/starseed-peticiones-telegram.service", "deploy/oracle/nodo/systemd/starseed-cuentas-dueno.path", "deploy/oracle/nodo/systemd/starseed-cuentas-dueno.service", "scripts/puente/oracle_nodo.py", "scripts/puente/test_oracle_nodo.py"], "depende": ["PET1112A"], "prompt": "Lee architecture/peticiones-telegram-a1.md §2. Versiona las tres unidades que ya funcionan en el A1 (copias exactas en architecture/peticiones-telegram-a1-referencia/*.txt), pero con ExecStart apuntando a scripts/puente/peticiones_telegram.py del checkout del A1 (patrón starseed-metagenesis.service; usuario starseed, Restart=always, MemoryMax=900M; ExecStartPre=+chown de cuentas). Añade a oracle_nodo una orden `peticiones` que copie las unidades, haga daemon-reload, pare y deshabilite la herramienta vieja (/home/starseed/herramientas/peticiones-telegram) SOLO después de que la nueva esté activa, y conserve ~/.starseed/peticiones/estado.json (el offset) para no repetir mensajes. Nunca imprimas la IP (usa tachar). Pruebas del guion generado sin red."},
{"id": "PET1112C", "ola": "PET1112", "titulo": "claves · dueño correcto y NotebookLM con un solo dueño", "archivos": ["scripts/puente/oracle_nodo.py", "scripts/puente/test_oracle_nodo.py", "scripts/puente/actividad_notebooklm.py", "scripts/puente/test_actividad_notebooklm.py"], "depende": [], "prompt": "Lee architecture/peticiones-telegram-a1.md §1 y §3. (1) En la orden `claves`, tras copiar ~/.starseed/cuentas/*.json al A1, deja dueño starseed:starseed, carpeta 700 y archivos 600 (hoy llegan como 501:staff y starseed no los lee). (2) _notebooklm_al_a1: el A1 es el ÚNICO dueño de la sesión de NotebookLM. Antes de copiar, comprueba en el A1 `notebooklm auth check` con el venv; si la sesión del A1 está viva, NO copies nada y devuelve {'ok': True, 'enviado': False, 'motivo': 'el A1 es el dueño y está viva'}. Solo copia si el A1 no tiene sesión o la tiene caducada, y entonces avisa de que la de la Mac deja de usarse. (3) actividad_notebooklm.py en la Mac: si el CLI de la Mac no tiene sesión, no falla; devuelve cero fichas con motivo. Pruebas sin red de los tres casos."},
{"id": "PET1112D", "ola": "PET1112", "titulo": "Síntesis diaria atascada · que salga cada día", "archivos": ["scripts/puente/agente_sintesis.py", "scripts/puente/test_agente_sintesis.py"], "depende": [], "prompt": "Lee architecture/peticiones-telegram-a1.md §1 (último punto) y architecture/sintesis-diaria-autonoma.md. El 2026-11-12 agente_sintesis encoló a las 06:24 SIN11121–SIN11127 en starseed_memory_root/olas/cola-suenos-sintesis.json (821 KB). Ningún director las tomó: no aparecen en progreso.json, y produccion-audiovisual/estado.json sigue en fase 'entregar' con sintesis_path null. Diagnostica la causa leyendo cómo escanean las colas los directores (nombre del archivo, tamaño de los prompts frente a sus topes, campos obligatorios) y corrígela en agente_sintesis sin tocar los directores, salvo que sea imprescindible. Añade un respaldo: si a la hora de entregar (07:54 de America/Mexico_City) no hay texto, la síntesis se redacta directamente con la flota gratuita en un solo paso (como la prueba del 2026-11-11), se guarda, se sube a Drive y se envía. Un día nunca queda sin síntesis. Pruebas sin red: cola sin tomar en la entrega lleva al respaldo y produce una entrega."},
{"id": "PET1112E", "ola": "PET1112", "titulo": "NotebookLM del A1 · renovar sin la Mac", "archivos": ["scripts/puente/navegador_alta.py", "scripts/puente/test_navegador_alta.py"], "depende": ["PET1112A"], "prompt": "Lee architecture/peticiones-telegram-a1.md y architecture/navegador-propio-metagenesis.md §4. Cuando la sesión del CLI de NotebookLM del A1 caduca (lo detecta peticiones_telegram con `auth refresh`), hoy hace falta la Mac. Añade a navegador_alta.py una orden `notebooklm`: si la sesión google-alex del navegador propio está viva, extrae sus cookies de Google del perfil (sin imprimirlas) y las importa al perfil default del CLI con `notebooklm auth import-cookies`. Después comprueba con `notebooklm auth check` y avisa por sintesis_telegram del resultado. Si google-alex no está viva, lanza el `alta google-alex` existente y repite. Ningún paso teclea ni lee contraseñas. Con todo inyectable y pruebas sin red. Al terminar, el texto RENOVAR de peticiones_telegram debe decir «MetaGenesis › Apps Linux»."},
{"id": "PET1112F", "ola": "PET1112", "titulo": "Cada síntesis entra sola al cuaderno de NotebookLM", "archivos": ["scripts/puente/agente_sintesis.py", "scripts/puente/test_agente_sintesis.py"], "depende": ["PET1112D"], "prompt": "Lee architecture/peticiones-telegram-a1.md §2. Tras entregar la síntesis del día (Doc de Drive creado), añádela como fuente al cuaderno de producción (dc62bea7-a241-46b6-a9f9-1ea954f0ea16) con `notebooklm source add-drive`, en el nodo que tiene la sesión (el A1); si la fuente ya existe por drive_document_id, no la dupliques. Al final del mensaje de Telegram de la síntesis, añade una línea: «Pídeme en este chat infografía, audio, vídeo o presentación de esta síntesis». El fallo de este paso no bloquea la entrega. Pruebas sin red."},
{"id": "PET1112G", "ola": "PET1112", "titulo": "Documentar las peticiones por Telegram", "archivos": ["architecture/sintesis-diaria-autonoma.md", "memory/workflow-actual.md", "CLAUDE.md", "AGENTS.md"], "depende": ["PET1112B", "PET1112C", "PET1112E"], "prompt": "Lee architecture/peticiones-telegram-a1.md. En architecture/sintesis-diaria-autonoma.md añade una sección corta sobre las peticiones de Alex por el chat de la síntesis: qué hace el bot, dónde corre (A1), /estado y cómo se renueva NotebookLM. En CLAUDE.md y AGENTS.md añade «Pedir cosas a MetaGenesis por Telegram» (3–5 líneas): el chat de @StarSeed_Design_bot atiende a Alex desde el A1 sin la Mac, y la sesión de NotebookLM es solo del A1. Añade también una entrada corta en memory/workflow-actual.md."}
]}
```
