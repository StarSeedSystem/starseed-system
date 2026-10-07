# Director de producción

> Petición de Alex (2026-10-05): un director que **publique automáticamente** lo que haga falta, una
> vez filtrado por los demás directores; que juzgue con Jev, Laya, las memorias y el propósito de cada
> tarea si es coherente publicarla; que lo pruebe en todos los escenarios con verificación profesional;
> que confirme que el cambio llegó a cada medio donde se usa; y que se actualice en tiempo real en
> todos ellos, para que la flota pueda atender peticiones directas y verlas publicadas al momento.
>
> Esta petición **es la autorización de Alex** para que este director haga `git push` y despliegue
> sin pedir permiso caso a caso, siempre dentro de las puertas de este contrato. Lo que queda fuera
> (§8) sigue siendo de Alex.

## 1. Dónde está en el flujo

```
petición (Chat Director, ola) → enjambre escribe → puertas de la tarea (tsc, tests, alcance, revisión)
→ commit en main ("integrada") → directores filtran (revisor, verificación de main, optimizador, diseño)
→ PRODUCCIÓN: elige → prueba en la vista previa → publica en cada medio → confirma → propaga en vivo
→ si algo falla: revierte, veta y devuelve la tarea al enjambre con el informe
```

`publicar.py` sigue siendo el botón manual «Publicar» de Genesis. El director **reutiliza** sus
puertas (`puerta()`, `PASOS`, turno de máquina) importándolas, nunca copiándolas, y los dos comparten
cerrojo: si el diario de publicación dice `corriendo`, el otro espera.

## 2. Los medios (dónde se usa cada cambio)

El director clasifica cada archivo del lote por medio. Un lote puede tocar varios.

| Medio | Lo disparan | Cómo se publica | Cómo se confirma | Cómo se revierte |
|---|---|---|---|---|
| **Web OS** (`starseed-os.vercel.app`) | `src/**`, `public/**`, `next.config.*`, `package*.json`, `tailwind.config.ts` | `git push origin <sha>:main` sin force; Vercel compila por la integración Git | `/version.json` de producción sirve `sha` del lote (sondeo hasta 15 min) y humo de producción verde | `git revert` del lote y push; si hay `VERCEL_TOKEN` en el entorno, antes se promueve el despliegue anterior (instantáneo) |
| **Genesis local** (Mac, :9002) | lo mismo + `src/app/api/mando/**`, `src/lib/mando/**` | `reconstruir_mando.py` ya compila y cambia solo; si la nube trae build, `instalar_build.py` | `http://127.0.0.1:9002/version.json` sirve el `sha` | volver al build anterior (`intercambiar_build`) |
| **Servicios del Mac** | `scripts/puente/**`, `scripts/enjambre/**` con copia instalada (`~/.local/bin`, plists) | copiar con respaldo `.bak-<MMDD-HHMM>` y `launchctl kickstart -k` solo del servicio afectado | hash de la copia = repo, servicio vivo y latido nuevo | restaurar el `.bak` y reiniciar |
| **Supabase** (`jhgvhkypqadfdkkqoxta`) | `supabase/migrations/**` | solo migraciones **aditivas** (`CREATE … IF NOT EXISTS`, `ADD COLUMN` sin `NOT NULL` sin defecto, índices, políticas nuevas) por la Management API | la migración aparece aplicada y el esquema la refleja | migración inversa escrita en la misma tarea; si no existe, no se publica |
| **Hermes / Telegram** | `scripts/hermes/skills/**` | sincronizar a `~/.hermes/skills` con respaldo | hash igual | restaurar respaldo |
| **Nativo (Tauri)** | `native/**` | etiqueta `v<x.y.z+1>` (solo parche) → `native-build.yml` | la release existe con sus archivos | marcarla pre-release y etiquetar la anterior como vigente |
| **Nube (runners)** | — | toman `main` solos | el siguiente run usa el `sha` nuevo | — |
| **Repo y memoria** | `architecture/**`, `memory/**`, `docs/**`, `*.md` | push | el commit está en `origin/main` | revert |
| **Astraura (1.58)** | repo `IA 1.58 bit` | `publicaciones.ts` modo producción | — | — |

Astraura queda **en pausa** mientras Alex mantenga parado el backend 1.58. Las **redes sociales** no
son un medio automático: el director prepara la pieza verificada y la deja en la bandeja de Genesis
para que Alex la publique con un toque.

## 3. Las puertas, de la más barata a la más cara

1. **Elegibilidad.** El commit está integrado en `main` con su id de tarea, y los demás directores
   ya filtraron:
   - la revisión no fue bloqueante (o Alex la aprobó);
   - main pasó su verificación (`verificado` de la tanda o las puertas propias);
   - si toca interfaz, el director de diseño dejó nota ≥ `umbral_diseno` (si diseño está inactivo,
     se registra «sin nota» y no bloquea);
   - nadie la vetó en `~/.starseed/produccion/vetos.json`. **Cualquier director, o Alex desde Genesis, puede vetar un `sha` o una tarea** escribiendo ahí, con motivo.
2. **Seguridad.**
   - Escaneo de secretos en el diff: patrones de claves y tokens, archivos `.env*` y claves en
     `NEXT_PUBLIC_*`. Un positivo bloquea el lote entero y avisa (sin imprimir el valor).
   - Migraciones destructivas (`DROP`, `TRUNCATE`, `DELETE`, `ALTER … TYPE`, `RENAME`): van a Alex.
   - Cambios en `.github/workflows/**`: el YAML parsea y no expone secretos en logs.
   - Nada fuera de los archivos declarados por las tareas del lote.
3. **Coherencia y propósito (Jev + Laya + memoria).** Para cada candidata se arma un paquete: título
   y prompt de la tarea, motivo de la ola, petición original de Alex si la hay, diffstat, archivos,
   el contexto del área (`contexto_agente`) y los veredictos de los directores. **Una sola llamada**
   `decidir.consultar_lote` por ciclo con tres preguntas por candidata:
   - `coherente_<tid>` (si-no): ¿cumple el propósito declarado y es coherente con StarSeed?
   - `mejora_<tid>` (puntuar 1–5): ¿mejora el sistema, sin empeorar nada visible?
   - `riesgo_<tid>` (elegir bajo/medio/alto): ¿riesgo de regresión en producción?

   **Regla:** pasa si `coherente` = sí con p ≥ `umbral_jev`, `mejora` ≥ 3 y `riesgo` ≠ alto. Riesgo
   medio solo pasa con las pruebas de §3.4 completas (sin omitidas). Si Jev no responde, decide un
   panel de 3 modelos gratuitos por mayoría, como en el optimizador. **Jev frena, nunca empuja:**
   puede parar una candidata, nunca salvar una puerta determinista en rojo. Tras el resultado real
   (§3.6), se llama a `decidir.confirmar(experiencia, acierto)` para que Jev aprenda.
4. **Pruebas profesionales sobre una vista previa.** El lote se empuja a la rama
   `produccion/candidato` (con force-with-lease, solo esa rama). Eso dispara:
   - **CI** (`ci.yml`): `tsc`, tests y `npm run build` en GitHub Actions. **Nunca `next build` en el
     Mac** con el enjambre vivo.
   - **Vista previa de Vercel**: su URL se lee del estado de despliegue que Vercel publica en GitHub
     (API de deployments del repo; mismo cliente que `nube-gh.py`).
   - **Humo en la vista previa** (`produccion_pruebas.mjs`, Playwright ya instalado):
     - Rutas: las que tocó el lote (detector de `capturar_prueba.py`) más las de núcleo (`/`,
       `/escritorios`, `/nexus`, `/login`).
     - Matriz: 360×780, 430×932, 768×1024, 1280×800 y 1920×1080; claro y oscuro; movimiento reducido
       en la de móvil.
     - Comprobaciones: HTTP < 400; cero errores de consola nuevos (lista de permitidos versionada);
       sin error de hidratación; sin desborde horizontal; `version.json` con el `sha` del lote; el
       service worker registra; TTFB y LCP dentro de presupuesto.
     - Sesión: anónima siempre. Con sesión solo si existe una cuenta de pruebas en el entorno; nunca
       credenciales reales.
   - **Regresión** contra la última publicación buena: una ruta que daba 200 y ahora no bloquea; un
     tiempo más de 1,5× peor avisa.
   - **Diseño**: si el lote toca interfaz, el director de diseño puntúa sobre la vista previa.
   - **Servicios Python**: arranque `--una-vez --seco` cuando el servicio lo admita.
   - **Evaluaciones de IA** (§9): si el lote toca prompts, skills o reglas de IA, el conjunto dorado no
     puede empeorar.
5. **Publicar.** Fast-forward `git push origin <sha>:main`, nunca force. Se publica **por lotes** en
   una ventana (`ventana_min`). Las peticiones directas de Alex van por el **carril exprés**: sin
   esperar la ventana, con las mismas puertas.
6. **Confirmar en cada medio** (`verificar_publicado` extendido por medio, §2): `sha` servido, humo
   de producción solo lectura, servicios con latido. «Integrado no es aplicado»: hasta que cada medio
   lo confirma, el lote no está publicado.
7. **Propagar en tiempo real.**
   - Aviso `version` por ntfy, en un tema fijo del código (no es secreto: el cliente siempre lo
     comprueba contra `version.json`, así que un aviso falso no hace nada). **Sin Supabase Realtime**,
     para no consumir créditos.
   - Los clientes abiertos (web, PWA, Genesis y nativo si envuelve la web) reciben el aviso, comprueban
     `version.json` al momento y aplican:
     - si la persona no está escribiendo, una recarga suave que conserva el estado (el tope de 2
       recargas por sesión se mantiene);
     - si está escribiendo, el aviso «Nueva versión» (`update-banner`).
   - El sondeo de reserva cada 5 min se mantiene.
   - Aviso al Chat Director siempre. A Telegram, solo si era una petición de Alex o si hubo
     reversión.
8. **Revertir.** Si el paso 6 falla, en menos de 5 minutos:
   - se revierte el lote;
   - se veta su `sha`;
   - las tareas causantes vuelven al enjambre (`cerrar-tarea.py <tid> pendiente "<informe>"`) con el
     informe del fallo como contexto;
   - se avisa.

## 4. Modos, topes e interruptor

- `seco`: decide y escribe el informe, sin publicar nada.
- `canario`: llega hasta la vista previa con todas las pruebas; no promueve a producción.
- `auto`: todo el ciclo.
- **Arranque:** un ciclo en `seco`, que Claude verifica contra lo que él habría decidido, y luego
  `auto`.
- **Topes:** `max_publicaciones_dia` 24; `ventana_min` 20; `max_tags_nativos_semana` 1; migraciones
  solo `aditivas`.
- **Interruptor:** `~/.starseed/produccion-pausada.json` y un botón en Genesis. Pausado, no publica
  nada; las puertas y los informes siguen corriendo.

## 5. Desarrollo en tiempo real

El objetivo es que una petición escrita en el Chat Director llegue a cada medio sin que nadie tenga
que «publicar»:

```
petición → ola exprés → enjambre → puertas → producción por el carril exprés
→ aviso en el Chat Director con versión, medios confirmados y enlace
```

El director mide `latencia_peticion_publicacion` (desde el mensaje hasta la confirmación del último
medio) y se la entrega al optimizador como métrica.

## 6. Aprender

- `~/.starseed/produccion/historial.jsonl`: una línea por lote, con `sha`, tareas, modelos que las
  escribieron, puertas con su resultado y tiempo, resultado por medio, reversión y latencias.
- El optimizador lee la **tasa de reversión por modelo** como métrica, que penaliza la rotación de
  modelos.
- El director de diseño lee las notas sobre vista previa frente a producción.
- Los errores de consola que se repiten proponen una entrada a la lista de permitidos solo si son
  ajenos (extensiones del navegador). Si no, se convierten en una tarea.

## 7. Integración

- **Servicio** `produccion` en `instalar-servicios.py` (`com.starseed.produccion`), ciclo cada
  `intervalo_s`.
- **Bloque de configuración** en los dos espejos (`config_director.py` y `director-config.ts`):

  ```
  produccion: {activo: true, modo: "seco", intervalo_s: 120, ventana_min: 20,
               max_publicaciones_dia: 24, expres_alex: true, umbral_jev: 0.7,
               umbral_diseno: 75, migraciones: "aditivas", max_tags_nativos_semana: 1,
               revertir_auto: true}
  ```

- **Directores:** `"produccion"` en `DIRECTORES`, con alias `director-produccion`. También en
  `NOMBRES_DIRECTORES` de `director-servicios.tsx`, junto con optimizador y diseño, que faltan.
- **Estado:** `starseed_memory_root/mando/produccion-estado.json` (escritura atómica). Contiene los
  candidatos, cada puerta por candidata y cada medio con el `sha` que sirve.
- **Genesis:** tarjeta «Producción» dentro del panel de Publicación, con el lote en curso, puerta por
  puerta, los medios con su `sha`, las últimas publicaciones y reversiones, el modo, Pausar/Reanudar y
  Vetar. API: `/api/mando/produccion`, solo local y con `guardianMando`.

## 8. Lo que sigue siendo de Alex

- Credenciales, cuentas, ajustes y pagos.
- Migraciones destructivas.
- Versiones nativas menores y mayores.
- Borrar datos.
- Publicar en redes sociales.
- Reactivar BitNet, la voz y Astraura 1.58.
- Quitar una puerta de este contrato.

## 9. Habilidades: los repos que usa y cómo (añadido el 2026-10-05)

Petición de Alex: incluir Dify, Temporal, LangServe, n8n, Firebase Genkit, Flowise, CrewAI, los servidores
MCP y LlamaIndex como habilidades del director. El estado se comprobó en GitHub el 2026-10-05. Regla
común: el Mac tiene 8 GB, así que nada de esto corre como servidor en el Mac. Se adopta el **patrón** con
lo que ya tenemos y la librería o el servidor solo cuando un experimento demuestre que mejora sin cargarlo.

| Repo | Qué es | Estado | Cómo lo usa el director |
|---|---|---|---|
| **Temporal** (`temporalio/temporal`, MIT) | Motor de flujos durables | Activo | **Ejecución durable** del bucle (ver abajo). El servidor (`temporal server start-dev`) solo como opción en la nube. |
| **MCP** (`modelcontextprotocol/servers`) | Servidores de referencia del protocolo | Activo | `mcp_director.py` (nuestro servidor MCP, sin dependencias) suma herramientas de producción: `produccion_estado`, `produccion_candidatos`, `produccion_historial`, `produccion_vetar`, `produccion_pausar` y `produccion_reanudar`. Claude, Hermes, Codex y cualquier IDE consultan y frenan producción por el mismo canal. Los servidores `git`, `fetch` y `time` sirven de modelo. |
| **LlamaIndex** (`run-llama/llama_index`, MIT) | Indexar y recuperar documentos | Activo | **Memoria del proyecto para la puerta 3** (ver abajo). |
| **CrewAI** (`crewAIInc/crewAI`, MIT) | Equipos de agentes por roles | Activo | **El panel de respaldo** de la puerta 3 como equipo por roles (ver abajo). |
| **Firebase Genkit** (ahora `genkit-ai/genkit`, Apache-2.0) | Flujos de IA, trazas y evaluaciones | Activo | **Puerta de evaluaciones de IA** (ver abajo). Nada de desplegar en Firebase ni Cloud Run: la facturación de Google Cloud está desactivada. |
| **n8n** (`n8n-io/n8n`, licencia de uso sostenible) | Automatización con cientos de integraciones | Activo | Puente hacia medios sin conector propio, por **webhooks firmados** (ver abajo). Necesita una instancia fuera del Mac; hasta que exista, los webhooks quedan apagados. |
| **Dify** (`langgenius/dify`, licencia propia basada en Apache con condiciones) | Plataforma de apps y flujos de IA con RAG | Activo | Medio opcional «apps de IA» en §2: si StarSeed publica un agente o flujo en Dify, el director lo versiona y publica por su API con las mismas puertas. Apagado hasta que haya instancia y clave en el entorno. |
| **Flowise** (`FlowiseAI/Flowise`) | Constructor visual de agentes | **Archivado** en GitHub (último cambio 2026-08-13) | Solo como referencia en la Biblioteca; no se adopta mientras siga archivado. |
| **LangServe** (`langchain-ai/langserve`) | Publicar cadenas como API REST | **Archivado**; su README recomienda LangGraph Platform | Solo el patrón: cada servicio de IA en Python expone `/invoke`, `/stream` y `/playground`. Para lo nuevo, LangGraph (ya en la Biblioteca de diseño). |

**Ejecución durable (Temporal).** `director-produccion.py` trata cada lote como un flujo con pasos
(actividades) idempotentes:

- El estado del lote se persiste **antes y después** de cada paso en `produccion-estado.json` y en
  `historial.jsonl`.
- Cada paso tiene reintentos con espera creciente y un tope.
- Las esperas largas (CI, vista previa, sondeo de 15 min) son **temporizadores persistidos** con su
  hora de vencimiento, nunca un `sleep` en memoria.
- Si el servicio se reinicia, **retoma el lote en el paso donde quedó** y no repite un push ya hecho:
  lo comprueba contra `origin`.
- La reversión es la **compensación** (patrón saga): cada paso que publica registra cómo deshacerse.

**Memoria del proyecto (LlamaIndex).** `produccion_memoria.py` indexa `architecture/`, `memory/`,
`CLAUDE.md`, `AGENTS.md`, los informes de tareas (`olas/pasos/`), el historial de producción y los
incidentes.

- Por cada candidata recupera los 5 pasajes más relevantes y los añade a su paquete de contexto, sin
  pasar de 6 KB.
- No usa red ni servidor: el índice va en disco y busca por coincidencia de palabras clave (BM25).
- Usa LlamaIndex si está instalado. Si no, un BM25 en Python puro con la misma interfaz.
- Los embeddings son opcionales y solo por pasarela gratuita.

**Panel de respaldo (CrewAI).** Cuando Jev no responde, decide un equipo de cuatro roles, cada uno con
un modelo gratuito distinto de la flota:

- responsable de lanzamiento: propósito y coherencia;
- QA: pruebas y regresión;
- seguridad: secretos, datos y permisos;
- SRE: medios y reversión.

Decide por mayoría, y seguridad tiene veto. Se reutilizan las pasarelas de `decidir.py` y, si existe,
`optimizador_panel.py`.

**Evaluaciones de IA (Genkit).** Si el lote toca prompts, skills de Hermes, reglas de Jev, Astraura o
Aurora, la puerta 4 ejecuta un **conjunto dorado** de casos de `memory/produccion/evals/`:

- cada caso es una entrada con las propiedades que debe cumplir la salida;
- se ejecuta con modelos gratuitos y se compara con la versión publicada;
- si empeora, el lote no pasa.

Se adopta el patrón de evaluadores de Genkit. Genkit mismo (JS) solo si cabe sin coste en CI.

**Webhooks (n8n, Dify).** `produccion_webhooks.py` es el emisor que usa el enrutador de puentes de §10; emite eventos firmados con HMAC:

- `produccion.publicada`
- `produccion.revertida`
- `produccion.pieza_lista` (la pieza verificada para redes, que Alex aprueba)

Van a las URLs que haya en el entorno: `N8N_WEBHOOK_URL`, `DIFY_WEBHOOK_URL` y la clave
`PRODUCCION_WEBHOOK_SECRETO`, sin imprimirlas nunca. Si una URL no responde, no frena el ciclo.

**Biblioteca.** Los 9 entran en la Biblioteca del OS como «Herramientas de producción», cada uno con
su estado y su licencia.

## 10. Puentes hacia medios externos con autoenrutado (decisión de Alex, 2026-10-05)

> «Principalmente lo propio, para no depender de externos, pero aprovechando lo que tengamos
> disponible, fusionando n8n en Hugging Face, n8n Cloud, Dify Cloud y Zapier, autoenrutándose
> inteligentemente».

**Regla de oro: lo propio primero y siempre de respaldo.** Ningún evento depende de un externo para
llegar a Alex. Los externos solo **añaden** alcance (redes, Drive, apps de IA) cuando están sanos y
dentro de su cupo gratuito. **Nunca** se pasa de un cupo gratuito: el puente se aparta al 90 % del
cupo del mes.

| Puente | Tipo | Capacidades | Cupo gratuito que vigila | Cómo se activa |
|---|---|---|---|---|
| Bandeja de Genesis | Propio | Avisos, piezas para aprobar | — | Siempre activo |
| Chat Director | Propio | Avisos, informes | — | Siempre activo |
| ntfy (tema fijo) | Propio (servicio público gratuito) | Aviso de versión a los clientes | — | Siempre activo |
| Telegram / Hermes | Propio | Avisos importantes | — | Ya configurado |
| n8n en Hugging Face Space | Externo gratuito, nuestro | Redes (borrador que Alex aprueba), Drive, cualquier integración de n8n | Ninguno de pago; se duerme sin uso | `N8N_HF_URL` en el entorno |
| n8n Cloud | Externo | Lo mismo que n8n (solo webhooks: su API no está disponible en la prueba) | 1.000 ejecuciones y 14 días desde que se crea la cuenta | `N8N_CLOUD_URL` en el entorno; los flujos se importan pegándolos una vez en su lienzo |
| Dify Cloud (Sandbox) | Externo | Apps y flujos de IA, RAG (base de conocimiento por su API) | 200 créditos de mensajes; 5.000 llamadas a la API al mes | `DIFY_URL` y `DIFY_CLAVE` en el entorno |
| Zapier | Externo | Integraciones sin servidor | El plan gratuito NO incluye webhooks (son de pago): inactivo como puente; sigue como conector de Claude | `ZAPIER_WEBHOOK_URL` solo si algún día hay plan con webhooks |

**Enrutado** (`scripts/puente/produccion_puentes.py`, puro y con estado en
`~/.starseed/produccion/puentes.json`):

1. Cada evento (`publicada`, `revertida`, `pieza_lista`, `notas_version`, `app_ia`) declara la
   **capacidad** que necesita.
2. Los avisos van **siempre** por los puentes propios. Los externos solo se suman para capacidades
   que lo propio no cubre.
3. Entre los externos capaces se ordenan por: sano (último ok reciente, sin fallos seguidos), cupo
   restante, latencia media y peso aprendido. Cada éxito sube el peso y cada fallo lo baja.
4. Si el primero falla, se prueba el siguiente. Si no queda ninguno, la pieza va a la bandeja de Genesis con el motivo, de modo que nunca se pierde.
5. Se cuenta cada uso contra su cupo, que se reinicia el día 1 o en la fecha del plan. Al 90 % el
   puente se aparta solo y se avisa en el Chat Director.
6. Un puente no configurado (sin URL en el entorno) **no existe** para el enrutador: no da error ni
   reintenta.
7. El n8n de Hugging Face se despierta con una petición de salud antes de usarlo, con un tope de
   60 s. Si no despierta, se usa el siguiente.

**n8n en Hugging Face** (`deploy/n8n-hf/`):
- Un Space Docker con la imagen oficial de n8n Community.
- Los flujos viven en el repo (`deploy/n8n-hf/flujos/*.json`) y se importan en cada arranque, porque
  el disco del Space gratuito no es persistente.
- Las credenciales de cada servicio (Drive, redes) van como secretos del Space, nunca en el repo.
- Los webhooks de n8n verifican la firma HMAC de §9.
- El Space es **privado**: las peticiones llevan el `HF_TOKEN` como autorización. Si fuera público,
  cualquiera podría reclamar la cuenta propietaria de n8n.
- `arranque.sh` importa por la CLI de n8n los flujos y las credenciales (desde los secretos del
  Space, con `N8N_ENCRYPTION_KEY` fija) y **activa los flujos por la CLI**. Los webhooks no necesitan
  que nadie entre a la interfaz ni un usuario propietario.

**Genesis.** La tarjeta de Producción muestra cada puente con su estado, el cupo usado y el último
uso, y permite apartarlo o activarlo a mano.

**Vincular cuentas:** `python3 scripts/puente/vincular_cuentas.py` (o abrir `.transfer/vincular-cuentas.command`) abre cada página en el navegador, lee la clave del portapapeles sin mostrarla, la valida y la guarda en `~/.starseed/env`. La prueba de n8n Cloud queda pendiente hasta que los flujos estén listos, para no gastar sus 14 días.

**Lo que es de Alex:**
- crear las cuentas que falten (prueba de n8n Cloud, Dify Sandbox);
- poner sus URLs y claves en `~/.starseed/env`;
- dar los permisos de Drive y redes dentro de n8n.

Todo lo demás lo montan la flota y Claude. Hasta que existan, el enrutador funciona solo con lo propio.
