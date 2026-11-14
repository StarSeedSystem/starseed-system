# Autorreparación de sesiones y proveedores (ola SES1113)

## 1. Pedido de Maggasukha (2026-11-13, 19:58 México)

> El chat de la síntesis repite que la sesión de NotebookLM del A1 caducó y que se lo pida a Claude. No debería
> depender de Claude: MetaGenesis tiene que resolver esos errores por sí misma, con todos sus medios, proveedores y
> capacidades y con los agentes directores de todo el workflow, automáticamente.

## 2. Diagnóstico (A1, 2026-11-14 ~02:00 UTC)

1. **El aviso sale del bot del repo.**
   - Desde el 2026-11-14 a las 01:15 UTC, `starseed-peticiones-telegram.service` corre
     `scripts/puente/peticiones_telegram.py` del repo. Hasta entonces corría la herramienta provisional de
     `~/herramientas/peticiones-telegram`.
   - La versión del repo perdió los arreglos del 2026-11-12, que ya tenía la provisional:
     - `peticiones_notebooklm.nb()` lanza `SesionCaducada` aunque el código de salida sea 0, basta con que el texto
       nombre «Authentication»;
     - no hay cerrojo: el keepalive, el productor de encargos y las peticiones llaman al CLI a la vez, y cada llamada
       rota la cookie `__Secure-1PSIDTS` y pisa la de las otras, así que la sesión se rompe de verdad;
     - `mantener_sesion()` avisa al primer fallo, no tras 3 seguidos, y no distingue un fallo de red de una
       caducidad. Cada vez que la sesión va y vuelve, avisa de nuevo;
     - `RENOVAR` (en `peticiones_reglas.py`) manda a pedírselo a Claude.
2. **Fallo de red.** Entre las 01:15 y las 01:50 UTC el A1 perdió la red (`sendMessage falló: URLError`, el SSH no
   respondía) y se reinició a las 01:50 con el kernel 7.0.0-1016. Un fallo de red se parece a una caducidad y
   dispara el aviso.
3. **La sesión estaba viva en realidad.** A las 01:51 UTC, `notebooklm auth check` daba «Authentication is valid»,
   con `__Secure-1PSIDTS` vigente.
4. **Las piezas de reparación existen pero nadie las llama.**
   - `navegador_alta.py notebooklm` (PET1112Eb/NAV1112) ya importa cookies desde el perfil google-alex del
     navegador propio, pero ni el bot ni el líder la invocan.
   - El contenedor del navegador no está en marcha en el A1; solo corre `starseed-caddy`.
5. **No hay token maestro.** El CLI 0.8.6 admite `login --master-token`: con un solo inicio de sesión se obtiene un
   token duradero, y después `auth refresh` acuña cookies nuevas sin navegador. En el A1 falta el extra `[headless]`
   (`gpsoauth` no está instalado) y el perfil dice «Master token: not present».
6. **Faltan pruebas de regresión.** El despliegue del bot del repo no comprobó que se mantuvieran los arreglos de la
   herramienta que sustituía.

## 3. Diseño

### 3.1 Principios

- **Claude nunca es un paso necesario.** Ningún texto de MetaGenesis manda a pedir algo a Claude. Claude puede ser la
  última ruta del orquestador económico, nunca un requisito.
- **Primero se repara solo; después se rodea; a la persona se acude al final.**
  - Si un proveedor cae, el trabajo sigue por otra vía.
  - A Maggasukha solo se le pide lo que exige su mano (un inicio de sesión de Google), una vez al día como mucho por
    sesión, con un paso autoservicio que no necesita a Claude.
- **Nunca se confunde una caída de red o un tiempo agotado con una caducidad.**

### 3.2 Sanador de sesiones (`scripts/puente/sanador_sesiones.py`)

Es el núcleo puro con E/S inyectable. Corre en el líder (A1) cada 15 min, con un temporizador versionado, y a
demanda (`reparar <sesion>`). En la Mac corre la parte que le toca. Lleva un registro de sesiones; para cada una hay
una comprobación y unas recetas ordenadas.

| Sesión | Comprobación | Recetas, en orden |
|---|---|---|
| notebooklm (A1) | `auth check` + `list --json`, con el cerrojo | 1. `auth refresh --verify`, con espera creciente. 2. Volver a acuñar desde el token maestro, si existe (`auth refresh` lo hace solo). 3. Restaurar el `storage_state.buena-*` más reciente que pase `auth check`. 4. `navegador_alta.py notebooklm`, si el navegador propio está vivo. 5. Pedírselo a la Mac si está viva: `notebooklm login --browser-cookies chrome --account alexbordongarrigos@gmail.com --storage <tmp>` y envío al A1 por el canal de `claves` + `auth import-cookies`. 6. Escalado autoservicio (§3.4). |
| google-oauth alex / alex-docs | refresco del token de acceso | refresh_token. Con la app en «prueba», los tokens caducan a los 7 días: avisar 3 días antes con los pasos exactos para publicar la app (SDP1111U). |
| higgsfield CLI (A1 y Mac) | `higgsfield account` | Solo aviso. El OAuth necesita navegador y se renueva desde la Mac con `higgsfield auth login`. |
| freellmapi / NIM | ping del modelo | Marcar el proveedor caído en el enrutador y reiniciar `starseed-freellmapi` una vez. |
| telegram | `getMe` | Reintentar; si cae la red, no avisar por Telegram. |

**Registro y avisos:**
- Cada intento queda en `starseed_memory_root/salud/sesiones.jsonl`: sesión, receta, resultado y duración, sin
  secretos.
- El estado agregado va en `salud/estado.json`, que leen el bot (`/estado`), el parte diario, el Mando (panel «Salud
  de sesiones») y la síntesis (una línea).

### 3.3 Bot y productor (NotebookLM)

- **Un solo cerrojo entre procesos** para todo el CLI de NotebookLM del nodo: `fcntl.flock` sobre
  `~/.notebooklm/profiles/default/.starseed-cli.lock`.
  - El trabajo espera su turno.
  - El keepalive no espera: si el CLI está ocupado, la sesión está en uso y cuenta como viva.
- **Qué es caducidad:** solo cuenta si el código de salida no es 0 **y** el texto dice «Authentication expired/error»
  o «Run 'notebooklm login'».
  - Un tiempo agotado (124), `httpx`/`URLError` o la falta de red son «transitorio»: se reintentan y no avisan.
- **Keepalive** (`auth refresh --verify`) cada 20 min.
  - Tras cada refresco verificado, se copia `storage_state.json` a `storage_state.buena-<n>.json` (se guardan 3).
  - Se declara caducada tras **3 fallos de autenticación seguidos**. Entonces llama a
    `sanador_sesiones.reparar("notebooklm")` y **no** escribe a Maggasukha: el sanador decide si escala.
  - Al volver, una sola línea: «NotebookLM vuelve a estar viva ✓ (reparada por <receta>)».
- **Peticiones:** ningún «caducó» por petición. Esperan en silencio y `/estado` dice por qué.
- **Si NotebookLM está caído, el trabajo no se para:**
  - los entregables de texto (informe, documento, guion, tabla, resumen, plan) se hacen con la ruta de modelos
    gratuitos (`llm()`) y se guardan en Drive marcados «hecho sin NotebookLM · se rehará al volver»;
  - los nativos (audio, vídeo, infografía, mapa mental, presentación) esperan en cola;
  - encargos y síntesis siguen.
- **`RENOVAR` nunca menciona a Claude.** El texto lo arma el sanador: qué intentó, qué falta y el paso autoservicio.

### 3.4 Escalado autoservicio (sin Claude)

Solo cuando han fallado todas las recetas, y como mucho una vez al día por sesión, se manda un solo mensaje:
- lo que pasó, en una línea;
- lo que MetaGenesis intentó (las recetas);
- la acción que falta y dos formas de hacerla:
  - **en la Mac:** el nodo de MetaGenesis abre solo la ventana de inicio de sesión al detectar que la Mac está activa
    (`notebooklm login --master-token …`, o si no `--browser chrome`), y al terminar lleva la sesión al A1;
  - **desde el móvil:** `/renovar notebooklm` en el bot, que levanta el navegador propio (Selkies, MetaGenesis › Apps
    Linux) y responde con el enlace.

### 3.5 Token maestro (inicio de sesión duradero)

- Se instala `notebooklm-py[headless]==0.8.6` en el venv del A1 y en la Mac.
- `sanador_sesiones.py arrancar-token notebooklm` solo corre si
  `starseed_memory_root/salud/aprobaciones.json` tiene `{"notebooklm_master_token": true}`. Esa marca la pone
  Maggasukha (o Claude con su aprobación escrita).
- El arranque se hace en la Mac: hay un solo inicio de sesión, que hace él.
  - El perfil resultante (token maestro + `android_id`) viaja al A1 por el canal de `claves`, con permisos 600 y
    dueño `starseed`.
  - **Nunca** va al repo, a Drive, a Supabase, a los registros ni a Telegram.
- Desde entonces, la receta 2 (§3.2) repara las caducidades sin navegador.

### 3.6 Directores: incidentes que se convierten en olas de reparación

- **Cuando todas las recetas fallan:** si fallan dos veces seguidas en una sesión, o aparece una firma de error
  nueva, el director de turno del líder abre una tarea automática (`cola-auto-salud-<fecha>.json`) con los registros
  (sin secretos) para diagnosticar y parchear.
  - El orquestador económico la enruta a modelos gratuitos y pasa por las puertas de pruebas habituales.
- **El parte diario** lleva «Salud de sesiones»: caídas, recetas que funcionaron y tiempo sin servicio.
- **Regla de despliegue:** antes de sustituir una herramienta en servicio por su versión del repo, las pruebas del
  repo deben cubrir los arreglos de la herramienta sustituida. En este caso, el cerrojo, los 3 fallos, distinguir la
  red de la autenticación y el aviso de vuelta.

### 3.7 Seguridad

- Ningún agente escribe, guarda ni ve contraseñas.
- Las cookies y el token maestro solo viven en archivos privados del nodo (600). No se imprimen ni salen en los
  registros.
- Ningún modelo conduce un navegador con la sesión iniciada; solo se usan guiones fijos (NAV1112).
- Nada se publica ni se envía a terceros.

## 4. Cola SES1113

La cola está en `starseed_memory_root/olas/cola-ses1113.json`. SES1113A va primero y es urgente: corta los avisos
falsos.
