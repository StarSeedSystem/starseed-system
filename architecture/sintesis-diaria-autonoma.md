# Síntesis diaria autónoma en MetaGenesis · contrato y cola SDP1111

**Fecha:** 2026-11-11.
**Origen:**
- preparado por Claude en la nube a petición de Alex;
- encolado por Claude (Cowork, con la Mac) el mismo día.

**Estado:** la cola `starseed_memory_root/olas/cola-sdp1111.json` está encolada con 15 tareas (A–L, N, O y P).
- SDP1111M (lectura diaria de «Mi actividad» con el navegador) **no** está en la cola: espera la aprobación de Alex y
  su texto está en `starseed_memory_root/olas/pendientes/tarea-sdp1111m-pendiente.json`.
- Nada está construido todavía.

**Fuente:** el Doc de Drive `1EWYkJscwVhuizSYfY5AhrKQQNAZTXWGASvyLYKe6oZs` (Pláticas y videos › Síntesis diarias).

## 1. Qué pidió Alex (2026-11-11, literal en lo esencial)

- La síntesis diaria de producción debe **funcionar sola desde MetaGenesis**, con:
  - sus directores;
  - sus agentes de Imaginación;
  - Jev y Laya;
  - las herramientas de la Librería.
- La tarea programada de Claude es **opcional**: dirige y organiza cuando está disponible, pero no es necesaria.
- Los agentes deben analizar **su actividad diaria** en sus dos cuentas, alexbordongarrigos@gmail.com y
  fundacionstarseed@gmail.com:
  - documentos nuevos, archivos de Drive, enlaces y notas;
  - la actividad de cada cuaderno de NotebookLM;
  - el historial de vídeos vistos en YouTube, relacionado con los temas de investigación;
  - los correos que él ha enviado a comunidades y sobre StarSeed;
  - el historial de búsquedas y los chats de Gemini;
  - los guardados de Instagram (programación y StarSeed) y las páginas o grupos útiles para contactos y referencias.
- **Ahorro:** sin créditos de pago, salvo que se pida o haga falta para algo más necesario.
- **Sin prisa:** la calidad va antes que el tiempo. Cuanto más contexto y herramientas tenga cada agente sin
  saturarlo, mejor.
- **Cuentas:** las vinculaciones se dejan preparadas para que Alex solo inicie sesión o pase una clave.

## 2. Por qué no llegó ninguna síntesis desde el 9 de noviembre

1. **MetaGenesis nunca tuvo un proceso de síntesis.** La única pieza que la escribía era la tarea programada de
   Claude. Alex la pausó el 2026-11-10, y con eso dejó de existir quien la produjera.
2. **El buzón y el parte diario (ola BZN1108) existen como archivos pero no están cableados:**
   - ningún instalador, plist, unidad systemd ni la lista HIJOS del A1 los arranca;
   - la tabla `metagenesis_buzon` sigue sin existir en Supabase (comprobado el 2026-11-11).
3. **Aunque estuvieran cableados, no bastarían:**
   - solo **entregan** avisos: no investigan ni redactan;
   - la migración fija el destino a `telegram:Maggasukha`, que es el chat general y no el de las síntesis.

Conclusión: hay que construir el productor de la síntesis dentro de MetaGenesis. Eso es esta ola.

## 3. Diseño

### 3.1 Dónde vive

- **El agente:** uno nuevo, `scripts/puente/agente_sintesis.py`, con el patrón de `agente_alcance.py` y
  `agente_referencias_diseno.py`:
  - `ciclo(raiz, ahora=None, encargar=None, jev=None, forzar=False, seco=False, …)`;
  - estado en JSON, escritura atómica y cerrojo;
  - CLI `plan|ciclo|estado`.
- **Quién lo llama:** `director_autodesarrollo.py`, igual que a `_agente_alcance`. Ese director ya corre **en el A1
  con arriendo de líder**, así que la síntesis funciona con la Mac apagada.
- El director de producción (`autopublicar.py`) no es el sitio: publica software.

### 3.2 El ciclo, en tres pasadas (no hay prisa)

El director llama al agente cada 15 minutos; el agente decide con su estado en qué fase está.

1. **Recolectar y encargar** (desde las 00:30 de Ciudad de México):
   - **Arma el contexto común:**
     - el protocolo, el índice de vídeos y la red de resonancia;
     - las 3 últimas síntesis (la rotación sale de su «Mañana»);
     - las salidas de Imaginación de 24 h;
     - los informes nuevos de directores y sueños;
     - el resumen de actividad personal (§4).
   - **Encola análisis libres** para la flota gratuita en `olas/cola-suenos-sintesis.json`, con
     `encargar_por_flota`. Una tarea por rama, cada una con su rol y solo el contexto que necesita:
     - contactos y creadores (2–3 de la rotación);
     - noticias con fuente y fecha;
     - referencias de diseño (reutiliza lo del agente de referencias);
     - actividad de Alex: qué temas tocó ayer y qué sugieren para la producción;
     - ideas de vídeo y redes;
     - guion y storyboard de los 2 vídeos de la rotación.
2. **Redactar** (cuando están las salidas, o a las 06:30 con lo que haya):
   - una tarea de capacidad alta funde las ramas en la síntesis, con las secciones del protocolo;
   - una segunda tarea, con rol de revisor, comprueba que cada dato lleve fuente y fecha y devuelve correcciones. Se
     repite una vez como mucho.
3. **Verificar y entregar** (07:54 como objetivo; si no está lista, sale cuando lo esté):
   - **Jev puntúa la calidad** (`decidir.py puntuar`, con la regla «todo dato con fuente y fecha; nada inventado;
     secciones completas»). Con nota baja se entrega igual, marcada «borrador sin verificar».
   - **Guarda** `starseed_memory_root/produccion-audiovisual/sintesis/AAAA-MM-DD.md`.
   - **Envía al chat propio de las síntesis** (§3.3): primero el resumen (1.500–3.000 caracteres, texto plano) y
     después la síntesis completa troceada.
   - **Google Doc:** si Drive está vinculado (§4), crea también el Doc en la carpeta
     `1PenzAWw1VWpSAMXa7ms2VRrEhJ5uFbmI`.

### 3.3 Telegram: el chat de las síntesis, no el de dirección

- **Bot:** @StarSeed_Design_bot («Síntesis de producción StarSeed»), en chat privado con Maggasukha, chat_id
  8670436815.
- **Módulo nuevo `sintesis_telegram.py`:**
  - llama a la API de bots de Telegram con urllib y trocea a 3.500 caracteres;
  - solo admite ese destino;
  - nunca imprime el token.
- **Variables** (solo nombres): `TELEGRAM_SINTESIS_BOT_TOKEN` y `TELEGRAM_SINTESIS_CHAT_ID`, en `~/.starseed/env`
  del A1 y de la Mac.
- Hermes y `telegram:Maggasukha` no se usan para esto.
- **Sin token propio** (2026-11-11): en la Mac no hay token de @StarSeed_Design_bot. El único bot conectado es
  @starseed_puente_bot («Puente de Mando StarSeed», `TELEGRAM_BOT_TOKEN`). SDP1111P hace que la síntesis salga por él,
  con la cabecera «Síntesis de Producción StarSeed», hasta que exista `TELEGRAM_SINTESIS_BOT_TOKEN`.

### 3.4 Herramientas que usa cada agente

- **Roles:** `contexto_agente.py` con un rol nuevo, `sintesis-produccion`, más los que ya existen:
  `investigador-alcance`, `investigador-diseno`, `analista` y `revisor`.
- **Jev** (`decidir.py`): elige qué temas de la actividad merecen rama propia, puntúa la síntesis y frena lo dudoso.
  Es consejero, nunca oráculo.
- **Laya** (Sistema 1): clasifica cada ficha de actividad como relevante o no para StarSeed antes de gastar un
  modelo grande.
- **LEANN** (`leann_cliente.buscar`): recupera del repo y de la memoria lo que ya se sabe de un tema o contacto, para
  no repetir.
- **Fuentes públicas:** agent-reach y `extractor_web.py`. Las fichas que ya producen el agente de alcance y el de
  referencias se reutilizan.
- **Modelos:** solo la flota gratuita (NIM, AIHubMix, OpenRouter :free, Gemini gratuito, BitNet local). **Nada de
  pago.**

### 3.5 El papel de Claude (opcional)

- **Si la tarea de Claude está activa,** ya no produce la síntesis. Hace esto:
  - lee la del día;
  - la mejora donde aporte dirección creativa;
  - deja notas para el ciclo siguiente en `starseed_memory_root/produccion-audiovisual/direccion-claude.md`.
- **Si está pausada o sin crédito,** el sistema sigue igual.

## 4. Actividad personal de Alex: qué se puede leer y cómo

Todo lo de esta sección es **privado**:
- las fichas llevan `privado: true` y viven solo en los nodos, en `~/.starseed/actividad/`;
- van **fuera** de `starseed_memory_root`, porque en la Mac esa carpeta se sincroniza con Google Drive;
- no van a Supabase, ni al parte diario, ni a Drive, ni a ningún modelo de pago;
- a la síntesis llega el resumen por temas, no el contenido en bruto;
- de los correos se leen solo los **enviados por Alex** que traten de StarSeed o de comunidades.

| Fuente | Vía | Frecuencia real | Qué hace falta de Alex |
|---|---|---|---|
| Gmail (enviados), Drive y Docs de las dos cuentas | API de Google con OAuth de solo lectura (gmail.readonly, drive.readonly) | diaria | crear el cliente OAuth una vez e iniciar sesión con cada cuenta (§5, pasos 2 y 3) |
| YouTube: me gusta, listas, suscripciones, subidas | YouTube Data API (youtube.readonly) | diaria | el mismo inicio de sesión |
| YouTube: **historial de vídeos vistos** | no está en la API: Google Takeout con exportación programada a Drive | cada 2 meses (límite de Google), o cuando Alex lance una exportación | programar Takeout (§5, paso 4) |
| Historial de búsquedas y chats de Gemini | no hay API: van en «Mi actividad» de Takeout | igual que la anterior | el mismo Takeout |
| NotebookLM (cuadernos, fuentes, notas) | CLI `notebooklm` de la Mac (v0.8.6), un perfil por cuenta: `default` = alexbordongarrigos, `fundacion` = fundacionstarseed | diaria, **solo con la Mac encendida** | iniciar sesión una vez por perfil |
| Instagram: guardados | no hay API: exportación «Descargar tu información» (JSON) | cuando Alex exporte | pedir la exportación y dejar el zip en Descargas, sin moverlo (§5, paso 6) |
| Instagram: páginas y grupos públicos | fuentes públicas con agent-reach | diaria | nada |

**Lo que hay que decidir, porque tiene coste:**

- **Historial de YouTube, búsquedas y Gemini a diario.** Takeout solo da una foto cada 2 meses. La alternativa
  diaria es que un agente lea myactivity.google.com con el navegador de la Mac, donde Alex ya tiene la sesión
  abierta.
  - Solo funciona con la Mac encendida.
  - Se rompe cuando Google cambia la página.
  - Queda como tarea opcional, SDP1111M, apagada y fuera de la cola.
- **Instagram con la sesión de Alex.** Automatizar la lectura de los guardados con su cuenta va contra las
  condiciones de Instagram y puede acabar en un bloqueo de la cuenta.
  - Además, `alcance_fuentes.py` (l.17) prohíbe hoy Instagram como fuente.
  - Esta ola solo lee la exportación oficial. Lo otro no se construye salvo que Alex lo pida sabiendo el riesgo.

## 5. Lo que Alex hace una sola vez (todo lo demás es automático)

1. **Token del bot de síntesis.**
   - En la Mac: `bash scripts/puente/guardar-clave.sh TELEGRAM_SINTESIS_BOT_TOKEN --ambos`, y pegar el token que dio
     BotFather.
   - El chat_id no es secreto y lo pone la ola.
   - Al A1 llega con `python3 scripts/puente/oracle_nodo.py claves`, en cuanto SDP1111O esté integrada. Esa tarea añade
     los nombres nuevos y los archivos de cuentas a la orden de claves.
2. **Cliente OAuth de Google** (unos 10 minutos, gratis), en console.cloud.google.com con cualquiera de las dos
   cuentas:
   - crear un proyecto «StarSeed actividad»;
   - activar Gmail API, Google Drive API y YouTube Data API v3;
   - pantalla de consentimiento: tipo «Externo», añadir los dos correos como usuarios de prueba y después **publicar
     la app** (si se queda «en pruebas», el acceso caduca cada 7 días);
   - crear credenciales › ID de cliente de OAuth › «App de escritorio»;
   - pulsar «Descargar JSON» y dejarlo en Descargas. `cuentas_google.py importar` (o el primer `alta`) guarda las dos
     claves sin mostrarlas y aparta el archivo a `~/.starseed/cuentas/` con permisos 0600.
3. **Iniciar sesión con cada cuenta**, cuando SDP1111E esté integrada:
   - `python3 scripts/puente/cuentas_google.py alta alex` y `… alta fundacion`;
   - se abre el navegador. Google avisará de «app no verificada» porque es propia: Avanzado › Continuar.
4. **Takeout programado**, en takeout.google.com, con cada cuenta:
   - desmarcar todo;
   - marcar «YouTube y YouTube Music» (solo historial) y «Mi actividad» (Búsqueda, YouTube y Gemini);
   - formato JSON;
   - «Exportar cada 2 meses durante 1 año»;
   - destino «Añadir a Drive».
5. **NotebookLM:** iniciar sesión una vez por perfil.
   - `default` (alexbordongarrigos): renovado el 2026-11-08.
   - `fundacion` (fundacionstarseed): se lanzó el 2026-11-11 y espera a que Alex entre en la ventana de Chrome.
6. **Instagram:**
   - en Centro de cuentas › Tu información y permisos › Descargar tu información, pedir solo «Guardado», en JSON;
   - dejar el zip en Descargas, tal como llega: el lector busca ahí `instagram-*.zip`, o en `~/.starseed/actividad/entrada/instagram/`.

## 6. Reglas de esta ola

- **Las del repo** (AGENTS.md):
  - un solo orquestador, y nunca se lanza otro;
  - módulo puro nuevo de 3 archivos como mucho y 120 líneas por escritura; el cableado va en tarea aparte;
  - ids únicos, escrituras atómicas y cerrojos;
  - claves solo por nombre de variable;
  - nunca `next build` con el enjambre vivo.
- Si una tarea no cabe en 120 líneas, se parte en dos antes de escribirla.
- **Nada sale hacia terceros:** el único destino es el chat de síntesis de Alex. Lo que sea difusión queda
  «para_aprobar».
- **No se investiga a particulares.** «Emilio» y «The invisible hand» esperan a que Alex diga quiénes son.
- **Normas de marca:**
  - los colores solo de los tokens;
  - el símbolo nunca se genera con IA;
  - lo que no existe se rotula «en desarrollo».
- Sin pago sin la palabra de Alex.

## 7. La cola (`starseed_memory_root/olas/cola-sdp1111.json`)

Antes de encolar se comprobó que ningún id SDP1111 existiera en el histórico (2026-11-11: ninguno). El orquestador
lee la cola como lista de tareas. SDP1111M va aparte: ver «Estado», arriba.

```json
[
 {
  "id": "SDP1111A",
  "ola": "SDP1111",
  "titulo": "Síntesis · fuentes y rotación (módulo puro)",
  "archivos": [
   "scripts/puente/sintesis_fuentes.py",
   "scripts/puente/test_sintesis_fuentes.py"
  ],
  "depende": [],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3.2. Crea el módulo PURO sintesis_fuentes.py: funciones que, dada la raíz, devuelven el contexto común de la síntesis diaria de producción audiovisual: las 3 últimas síntesis de starseed_memory_root/produccion-audiovisual/sintesis/ y su sección «Mañana» (la rotación: 2 vídeos de los 15, 2-3 contactos, 1 categoría nueva; sin repetir lo de las 3 últimas), las salidas de Imaginación de 24 h (starseed_memory_root/imaginacion/agentes/*.json), los informes nuevos de directores y sueños, y el resumen de actividad si existe (~/.starseed/actividad/resumen-AAAA-MM-DD.json). Todo inyectable, sin red. Si no hay síntesis previas, la rotación empieza por los vídeos 4 y 5 y los contactos Cole Hastings, Sunseed y Damanhur. Pruebas con directorios temporales. Máximo 120 líneas por archivo; tsc no aplica; pytest en verde."
 },
 {
  "id": "SDP1111B",
  "ola": "SDP1111",
  "titulo": "Síntesis · envío al chat propio de Telegram",
  "archivos": [
   "scripts/puente/sintesis_telegram.py",
   "scripts/puente/test_sintesis_telegram.py"
  ],
  "depende": [],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3.3. Crea sintesis_telegram.py: enviar(texto, boton_url=None, pedir=None) llama a la API de bots de Telegram (sendMessage) con urllib, en texto plano, troceando a 3500 caracteres por límites de párrafo. Lee TELEGRAM_SINTESIS_BOT_TOKEN y TELEGRAM_SINTESIS_CHAT_ID de ~/.starseed/env y del entorno. Solo admite ese chat. Nunca imprime ni registra el token (tacha cualquier URL con /bot). Sin token devuelve {ok: False, motivo: 'sin token'} sin lanzar. `pedir` inyectable para las pruebas, que van sin red. CLI: `prueba` envía una línea de comprobación. Máximo 120 líneas por archivo."
 },
 {
  "id": "SDP1111C",
  "ola": "SDP1111",
  "titulo": "Síntesis · tareas de análisis por rama",
  "archivos": [
   "scripts/puente/sintesis_tareas.py",
   "scripts/puente/test_sintesis_tareas.py"
  ],
  "depende": [
   "SDP1111A"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3.2 y agente_referencias_diseno.tarea_de (l.954). Crea el módulo PURO sintesis_tareas.py: a partir del contexto de sintesis_fuentes devuelve las tareas de análisis libre (tipo 'analisis', modo 'libre', capacidad 'alta', privado según la rama, salida en starseed_memory_root/imaginacion/agentes/sintesis-<fecha>-<rama>.json) para las ramas: contactos, noticias, referencias, actividad, ideas, guiones; y después las de redacción y revisión. Cada prompt lleva solo el contexto de su rama, las secciones del protocolo que le tocan y la regla «todo dato con fuente y fecha; nada inventado; no se investiga a particulares». Ids con prefijo SIN + MMDD + n. La rama actividad es privado: true. Pruebas puras. Máximo 120 líneas por archivo; si no cabe, deja redacción y revisión para SDP1111D y dilo."
 },
 {
  "id": "SDP1111D",
  "ola": "SDP1111",
  "titulo": "Síntesis · el agente y su ciclo",
  "archivos": [
   "scripts/puente/agente_sintesis.py",
   "scripts/puente/test_agente_sintesis.py"
  ],
  "depende": [
   "SDP1111A",
   "SDP1111B",
   "SDP1111C"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3 entero y agente_alcance.py (patrón de ciclo, l.157). Crea agente_sintesis.py con ciclo(raiz, ahora=None, encargar=None, jev=None, enviar=None, forzar=False, seco=False): máquina de tres fases por día guardada en starseed_memory_root/produccion-audiovisual/estado.json (recolectar→redactar→entregar), horas en America/Mexico_City (00:30, 06:30, 07:54), encola con encargar_por_flota en olas/cola-suenos-sintesis.json, nunca lanza orquestador, puntúa con decidir.consultar('puntuar', …) y entrega con sintesis_telegram.enviar: primero el resumen de 1500-3000 caracteres y luego la síntesis completa. Guarda el markdown en starseed_memory_root/produccion-audiovisual/sintesis/AAAA-MM-DD.md con escritura atómica. Una sola entrega al día. Cerrojo en ~/.starseed/cerrojos/. CLI plan|ciclo|estado [--seco --json]. Pruebas con todo inyectado. Máximo 120 líneas por archivo; parte el módulo si hace falta."
 },
 {
  "id": "SDP1111E",
  "ola": "SDP1111",
  "titulo": "Cuentas de Google · alta por OAuth de solo lectura",
  "archivos": [
   "scripts/puente/cuentas_google.py",
   "scripts/puente/test_cuentas_google.py"
  ],
  "depende": [],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §4 y §5. Crea cuentas_google.py: flujo OAuth de app de escritorio (redirección a 127.0.0.1 con puerto libre, PKCE) con GOOGLE_ACTIVIDAD_CLIENT_ID y GOOGLE_ACTIVIDAD_CLIENT_SECRET, scopes SOLO de lectura: gmail.readonly, drive.readonly, youtube.readonly. CLI: `alta <alias>` (alex|fundacion) abre el navegador y guarda el token de refresco en ~/.starseed/cuentas/<alias>.json con permisos 0600; `estado` lista alias, correo y si el token sigue vivo, sin imprimir tokens; `token(alias)` devuelve un token de acceso renovado. Añade la orden `importar [ruta]`: si no se da ruta, toma el client_secret_*.json más reciente de ~/Downloads (el que descarga la consola de Google al crear el cliente «App de escritorio»), guarda GOOGLE_ACTIVIDAD_CLIENT_ID y GOOGLE_ACTIVIDAD_CLIENT_SECRET en ~/.starseed/env y ~/.hermes/.env con la misma lógica de scripts/puente/guardar-clave.sh (entrecomillar, reemplazar sin duplicar, comprobar que el archivo se carga entero), sin imprimir valores (solo una huella de 8 caracteres), y mueve el JSON a ~/.starseed/cuentas/cliente-oauth.json con permisos 0600. `importar` también se llama sola al empezar `alta` si las variables faltan y hay un client_secret_*.json en Descargas. Solo biblioteca estándar. Pruebas sin red con el intercambio inyectado. Máximo 120 líneas por archivo."
 },
 {
  "id": "SDP1111F",
  "ola": "SDP1111",
  "titulo": "Actividad · Gmail enviados, Drive y Docs",
  "archivos": [
   "scripts/puente/actividad_google.py",
   "scripts/puente/test_actividad_google.py"
  ],
  "depende": [
   "SDP1111E"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §4. Crea actividad_google.py: para cada alias de cuentas_google, lee de las últimas 36 h (a) los correos ENVIADOS por Alex (q='in:sent newer_than:2d'), solo asunto, destinatario, fecha y los primeros 1500 caracteres; (b) los archivos de Drive creados o modificados (nombre, tipo, enlace y, si es Google Doc, el texto exportado, tope 6000 caracteres). Devuelve fichas {fuente, cuenta, fecha, titulo, enlace, texto, privado: true} y las guarda en ~/.starseed/actividad/fichas/AAAA-MM-DD-google-<alias>.json. Nunca escribe en las cuentas. `pedir` inyectable; pruebas sin red. Máximo 120 líneas por archivo."
 },
 {
  "id": "SDP1111G",
  "ola": "SDP1111",
  "titulo": "Actividad · YouTube por API",
  "archivos": [
   "scripts/puente/actividad_youtube.py",
   "scripts/puente/test_actividad_youtube.py"
  ],
  "depende": [
   "SDP1111E"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §4. Crea actividad_youtube.py: con el token de cuentas_google lee de YouTube Data API v3 los «me gusta» recientes, los vídeos añadidos a listas en 7 días, las suscripciones nuevas y las subidas propias. Fichas con título, canal, enlace y fecha, privado: true, en ~/.starseed/actividad/fichas/. Respeta la cuota (pocas llamadas, paginación corta). El historial de vídeos vistos NO está en la API: no lo intentes. Pruebas sin red. Máximo 120 líneas por archivo."
 },
 {
  "id": "SDP1111H",
  "ola": "SDP1111",
  "titulo": "Actividad · Takeout (historial de YouTube, búsquedas, Gemini)",
  "archivos": [
   "scripts/puente/actividad_takeout.py",
   "scripts/puente/test_actividad_takeout.py"
  ],
  "depende": [
   "SDP1111E"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §4. Crea actividad_takeout.py: busca en el Drive de cada alias la exportación más reciente de Google Takeout (carpeta «Takeout», zip), la descarga a un directorio temporal del nodo, y extrae en JSON el historial de vídeos vistos de YouTube y «Mi actividad» de Búsqueda y de Gemini. Incremental: guarda la última marca de tiempo leída y solo emite fichas nuevas. privado: true. Borra el zip al terminar. El lector de los JSON es una función pura con pruebas sobre muestras pequeñas. Máximo 120 líneas por archivo."
 },
 {
  "id": "SDP1111I",
  "ola": "SDP1111",
  "titulo": "Actividad · guardados de Instagram desde la exportación oficial",
  "archivos": [
   "scripts/puente/actividad_instagram.py",
   "scripts/puente/test_actividad_instagram.py"
  ],
  "depende": [],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §4. Crea actividad_instagram.py: lee SOLO la exportación oficial «Descargar tu información» (saved_posts.json y saved_collections.json, sueltos o dentro del zip) que Alex deja en ~/.starseed/actividad/entrada/instagram/ o en ~/Downloads/ (el zip oficial se llama instagram-<usuario>-<fecha>-<id>.zip; solo se leen esos zips y nunca se borran de Descargas). Fichas con enlace, autor y fecha, privado: true. No abre Instagram, no usa la sesión de Alex, no hace peticiones a instagram.com. Incremental por enlace. Pruebas con una muestra. Máximo 120 líneas por archivo."
 },
 {
  "id": "SDP1111J",
  "ola": "SDP1111",
  "titulo": "Actividad · cuadernos de NotebookLM",
  "archivos": [
   "scripts/puente/actividad_notebooklm.py",
   "scripts/puente/test_actividad_notebooklm.py"
  ],
  "depende": [],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §4. Crea actividad_notebooklm.py: si el CLI `notebooklm` existe en este nodo (solo la Mac, /Users/alex/bin/notebooklm, v0.8.6 con perfiles: `-p default` es alexbordongarrigos@gmail.com y `-p fundacion` es fundacionstarseed@gmail.com), lista los cuadernos de cada perfil, y por cuaderno las fuentes y notas nuevas desde la última pasada. Fichas privado: true. Si el CLI no está o la sesión caducó, devuelve {ok: False, motivo} sin fallar y sin reintentar el login. `ejecutar` inyectable; pruebas sin el CLI. Máximo 120 líneas por archivo."
 },
 {
  "id": "SDP1111K",
  "ola": "SDP1111",
  "titulo": "Actividad · resumen diario por temas con Laya y LEANN",
  "archivos": [
   "scripts/puente/actividad_resumen.py",
   "scripts/puente/test_actividad_resumen.py"
  ],
  "depende": [
   "SDP1111F",
   "SDP1111G"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3.4 y §4. Crea actividad_resumen.py: reúne las fichas del día de ~/.starseed/actividad/fichas/, clasifica cada una con Laya (relevante o no para StarSeed y para qué tema: mesh, IA abierta, democracia directa, economía ecológica, comunidades, solarpunk, diseño, programación), pide a LEANN lo ya conocido del tema, y escribe ~/.starseed/actividad/resumen-AAAA-MM-DD.json: por tema, títulos, enlaces y una línea, tope 12000 caracteres. Marca privado: true y nunca incluye cuerpos de correo completos. Este resumen no sale a Supabase, ni al parte diario, ni a Drive. Clasificador y recuerdo inyectables; pruebas puras. Máximo 120 líneas por archivo."
 },
 {
  "id": "SDP1111L",
  "ola": "SDP1111",
  "titulo": "Cablear el agente de síntesis y los lectores de actividad",
  "archivos": [
   "scripts/puente/director_autodesarrollo.py",
   "scripts/puente/contexto_agente.py",
   "scripts/puente/test_director_autodesarrollo.py"
  ],
  "depende": [
   "SDP1111D",
   "SDP1111K"
  ],
  "prompt": "Cablea como _agente_alcance (director_autodesarrollo.py l.170 y l.523): añade _agente_sintesis(raiz, ahora) con import protegido de agente_sintesis.ciclo, llamado en cada ciclo del director cuando este nodo dirige. Antes de la fase recolectar, el agente llama a los lectores de actividad que estén disponibles en este nodo (protegidos: si uno falla, sigue). Añade a contexto_agente.py el rol 'sintesis-produccion' con sus reglas (fuente y fecha, no copiar, no investigar a particulares, normas de marca) y la salida esperada. Prueba: el director sigue si el módulo falta o lanza. Máximo 120 líneas tocadas por archivo."
 },
 {
  "id": "SDP1111O",
  "ola": "SDP1111",
  "titulo": "Claves y cuentas de la síntesis hacia el A1",
  "archivos": [
   "scripts/puente/oracle_nodo.py",
   "scripts/puente/test_oracle_nodo.py"
  ],
  "depende": [
   "SDP1111E"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3.3, §4 y §5 y la orden `claves` de oracle_nodo.py (la lista de NOMBRES de variables que viajan al A1, l.~130-150, y la función claves()). Añade a esa lista, SOLO por nombre: TELEGRAM_SINTESIS_BOT_TOKEN, TELEGRAM_SINTESIS_CHAT_ID, GOOGLE_ACTIVIDAD_CLIENT_ID y GOOGLE_ACTIVIDAD_CLIENT_SECRET. Haz que `claves` lleve también los archivos de ~/.starseed/cuentas/*.json (tokens de refresco de cuentas_google, permisos 0600 en origen y destino, mismo canal ssh que ya usa claves, sin imprimir su contenido ni sus nombres de archivo en registros). Si no existen todavía, sigue sin error. Pruebas: la lista contiene los cuatro nombres y el empaquetado de cuentas respeta 0600 sin leer valores. Máximo 120 líneas tocadas por archivo."
 },
 {
  "id": "SDP1111N",
  "ola": "SDP1111",
  "titulo": "Cerrar BZN1108 y dejar el parte diario cableado",
  "archivos": [
   "memory/workflow-actual.md",
   "deploy/oracle/nodo/systemd/starseed-parte-diario.timer",
   "deploy/oracle/nodo/systemd/starseed-parte-diario.service"
  ],
  "depende": [
   "SDP1111L"
  ],
  "prompt": "El contrato ya está en architecture/sintesis-diaria-autonoma.md (lo guardó Claude el 2026-11-11): léelo, no lo reescribas. Añade una entrada corta en memory/workflow-actual.md sobre la síntesis autónoma. Deja cableado parte_diario_metagenesis.py en el A1 con un timer oneshot diario (patrón starseed-metageminis.timer) para que Claude nube, cuando esté activo, tenga contexto. La migración 20261108120000_metagenesis_buzon.sql la aplica el director al publicar. buzon_telegram.py queda sin cablear: la síntesis ya no pasa por él."
 },
 {
  "id": "SDP1111P",
  "ola": "SDP1111",
  "titulo": "Reutilizar las conexiones que ya existen (bot del Puente y cliente OAuth del OS)",
  "archivos": [
   "scripts/puente/sintesis_telegram.py",
   "scripts/puente/cuentas_google.py",
   "scripts/puente/test_sintesis_conexiones.py"
  ],
  "depende": [
   "SDP1111B",
   "SDP1111E"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3.3 y §5. Alex (2026-11-11) aclaró que el bot y las cuentas YA están conectados en la Mac: no hay que pedirle claves nuevas si se puede usar lo que existe. Ajusta, sin romper sus pruebas: (1) sintesis_telegram.py: si falta TELEGRAM_SINTESIS_BOT_TOKEN, usa el bot ya conectado TELEGRAM_BOT_TOKEN (de ~/.starseed/env o ~/.hermes/.env; es @starseed_puente_bot, el del Puente de Mando, el chat vinculado de MetaGenesis y Hermes) con TELEGRAM_SINTESIS_CHAT_ID y, si falta, TELEGRAM_CHAT_ID; antepone la cabecera «Síntesis de Producción StarSeed · AAAA-MM-DD» para que se distinga en ese chat. Si un día existe TELEGRAM_SINTESIS_BOT_TOKEN, manda ese. (2) cuentas_google.py: antes de pedir un cliente nuevo, prueba el cliente OAuth que el OS ya tiene (NEXT_PUBLIC_GOOGLE_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET de .env.local del repo; leer sin imprimir) con redirección fija http://127.0.0.1:8765/ ; si Google responde redirect_uri_mismatch o el proyecto no tiene activadas Gmail API o YouTube Data API v3, dilo en una línea con el arreglo exacto (añadir esa URI de redirección al cliente existente o activar la API, con el enlace de la consola) y solo entonces cae a GOOGLE_ACTIVIDAD_* o al client_secret_*.json de Descargas. Nunca imprime ni registra tokens ni secretos. Pruebas sin red. Máximo 120 líneas tocadas por archivo."
 }
]
```

## 8. Cómo se sabe que funciona

1. `python3 scripts/puente/sintesis_telegram.py prueba` deja una línea en el chat «Síntesis de producción StarSeed».
2. `python3 scripts/puente/agente_sintesis.py ciclo --seco --json` muestra las tres fases y las tareas que
   encolaría.
3. Al día siguiente de integrar SDP1111L, la síntesis llega al chat con la Mac apagada y la tarea de Claude en pausa.
4. `python3 scripts/puente/cuentas_google.py estado` muestra las dos cuentas vivas, y el resumen de actividad del día
   existe y no ha salido del nodo.
