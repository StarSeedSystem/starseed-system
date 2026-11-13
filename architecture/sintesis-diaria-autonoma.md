# Síntesis diaria autónoma en MetaGenesis · contrato y cola SDP1111

**Fecha:** 2026-11-11.
**Origen:**
- preparado por Claude en la nube a petición de Alex;
- encolado por Claude (Cowork, con la Mac) el mismo día.

**Estado:** la cola `starseed_memory_root/olas/cola-sdp1111.json` está encolada con 20 tareas (A–L y N–U).
- SDP1111M (lectura diaria de «Mi actividad» con el navegador) **no** está en la cola: espera la aprobación de Alex y
  su texto está en `starseed_memory_root/olas/pendientes/tarea-sdp1111m-pendiente.json`.
- Nada está construido todavía.

- **SDP1111M queda sustituida por NAV1112E** («Navegador propio de MetaGenesis», `architecture/navegador-propio-metagenesis.md`), aprobada por Alex el 2026-11-12. Su texto se conserva en `starseed_memory_root/olas/pendientes/tarea-sdp1111m-sustituida-por-nav1112e.json`.

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

### 3.6 Peticiones de Alex por el chat de la síntesis

El bot @StarSeed_Design_bot atiende peticiones de Alex en el chat «Síntesis de producción StarSeed» y las ejecuta desde el A1 (Oracle, líder de dirección), sin necesidad de la Mac:

- **Qué hace el bot:** escucha por *long polling* (getUpdates), guarda cada petición en `~/.starseed/peticiones/cola.json`, acusa recibo y la procesa con FreeLLMAPI local (modelos con nombre, nunca `auto` ni Claude). Comandos: `/estado` (muestra sesión NotebookLM, cola y uptime), `/ayuda` (lista comandos), `/encargos` (lista y control de encargos largos), `/pausa`, `/sigue`, `/cancela`.
- **NotebookLM:** genera infografía, audio tipo podcast, vídeo, presentación, mapa mental, informe, cuestionario, tarjetas y tabla. La fuente es la última «Síntesis diaria AAAA-MM-DD» de Drive, un Doc enlazado o el cuaderno de producción. Lanza todo a la vez, espera, descarga y envía al chat.
- **Renovación de NotebookLM:** cada 20 minutos hace `auth refresh`. Si la sesión cae, la petición espera hasta 24 h y reintenta 3 veces. Si `auth refresh` falla, `navegador_alta.py` con orden `notebooklm` usa la sesión `google-alex` del navegador propio (si está viva) para extraer cookies de Google e importarlas al CLI (`notebooklm auth import-cookies`), y avisa del resultado por Telegram. Texto de renovación: «MetaGenesis › Apps Linux».
- **Encargos de varias horas:** el bot distingue *encargo*, *ajuste*, *preferencia*, *notebooklm* y *respuesta*. Un encargo se planifica por frentes, investiga con NotebookLM (`source add-research --mode deep`), produce informes, documentos, infografías, presentaciones, mapas, tablas y vídeo; guarda cada entregable en su carpeta de Drive (cuenta `alex-docs`), lleva un panel en Drive y manda avances. Ajustes en marcha se aplican a lo que falta. Preferencias en `~/.starseed/peticiones/preferencias.json`.
- **Solo el chat de Alex manda:** el bot nunca publica, ni escribe a terceros, ni toca cuentas, ni hace push. Todo con modelos gratuitos con nombre.

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

**Papeles de cada cuenta (Alex, 2026-11-11):**
- **alexbordongarrigos@gmail.com** («alex»): cuenta Google Pro y **principal**. Es donde se sincroniza todo Drive, y
  la de YouTube, Docs y NotebookLM.
- **fundacionstarseed@gmail.com** («fundacion»): sobre todo **Gmail** y las cuentas de algunos servicios. Sus
  correos se consideran.
- **Instagram:**
  - **Sociedad StarSeed** es la página oficial, de la fundación;
  - **maggasukha** es la personal de Alex: guardados (referencias) y páginas que sigue (contactos y referencias).
  - Las exportaciones se dejan en Drive (alex), en «Actividad StarSeed (privado …)» (`1PvBnBhoxxNSBuCLSC2aQZ89Oe8mdJGB-`):
    una subcarpeta por cuenta. Así se leen sin la Mac.
- **Bot de las síntesis:** @StarSeed_Design_bot, con el token guardado por Alex el 2026-11-11 y probado ese día
  (getMe y un mensaje al chat privado). Al A1 llega solo, con la orden de claves (SDP1111O y SDP1111R).
- **NAV1112 (navegador propio, aprobado 2026-11-12):** lectores diarios en el A1 que leen con sesiones iniciadas por Alex:
  - `myactivity.google.com` (YouTube visto, Búsqueda, Gemini) — diario;
  - `www.youtube.com` (inicio y `/feed/history`) — diario;
  - `notebooklm.google.com` (cuadernos, fuentes, notas) — diario, sin la Mac;
  - `www.instagram.com/saved` y seguidos (maggasukha) / publicaciones propias (sociedad) — diario.

**Altas hechas (2026-11-11, 17:15):**
- `~/.starseed/cuentas/alex.json` y `fundacion.json` (Mac, 0600) funcionan: renuevan y leen Gmail, Drive y YouTube.
  fundacionstarseed no tiene canal de YouTube, así que YouTube sale sobre todo de alex.
- **alex-docs** (alexbordongarrigos, solo `drive.file`, 18:18): un alta aparte para crear el Doc de cada síntesis,
  porque Google no deja pedir `youtube.readonly` y `drive.file` juntos. Probado: crea archivos en la carpeta «Síntesis
  diarias».
- **A1:** recibió las cuatro fichas con `oracle_nodo.py claves` y, tras el arreglo de dueño, renueva alex y fundacion.
  El bot @StarSeed_Design_bot responde desde el A1.
- La app «StarSeed actividad» sigue en estado «Prueba», con las dos cuentas como usuarias de prueba, y los tokens
  caducan a los 7 días (hacia el 2026-11-18).
- **SDP1111U** crea /privacidad y /terminos para poder publicarla; después se rehace el alta una vez.

**Autonomía:** todo funciona sin Claude y sin la Mac. Los lectores y la entrega corren en el líder de dirección; los
contenedores compartidos de la nube nunca reciben datos privados ni claves.

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
| YouTube: **historial de vídeos vistos** | navegador propio (myactivity.google.com + YouTube /feed/history) | **diaria** | alta manual de la sesión google-alex en el A1 (NAV1112D) |
| Historial de búsquedas y chats de Gemini | navegador propio (myactivity.google.com) | **diaria** | misma sesión google-alex / google-fundacion |
| NotebookLM (cuadernos, fuentes, notas) | navegador propio (notebooklm.google.com) | **diaria**, sin la Mac | alta manual de las sesiones google-alex y google-fundacion |
| Instagram: guardados (maggasukha) | navegador propio (www.instagram.com/saved) | **diaria** | alta manual de la sesión instagram-maggasukha |
| Instagram: páginas y grupos públicos | fuentes públicas con agent-reach | diaria | nada |

**Respaldo (si una sesión del navegador cae, la síntesis sigue con lo que haya):**
- Google Takeout (historial YouTube, Búsqueda, Gemini) — exportación programada cada 2 meses a Drive
- Exportación oficial de Instagram («Descargar tu información», JSON) — cuando Alex la pida
- CLI `notebooklm` de la Mac (v0.8.6, perfiles `default` y `fundacion`) — diaria, solo con la Mac encendida

**Lo que hay que decidir, porque tiene coste:**

- **Historial de YouTube, búsquedas y Gemini a diario.** Takeout solo da una foto cada 2 meses. La alternativa
  diaria era que un agente leyera myactivity.google.com con el navegador de la Mac (SDP1111M, apagada).
  - **Resuelto con NAV1112E:** el navegador propio en el A1 lo lee diario, sin la Mac.
- **Instagram con la sesión de Alex.** Automatizar la lectura de los guardados con su cuenta va contra las
  condiciones de Instagram y puede acabar en un bloqueo de la cuenta.
  - **Mitigado con NAV1112H:** una sola pasada al día, pocas páginas, ritmo lento, cerrojo y aviso ante cualquier
    verificación. `STARSEED_NAVEGADOR_INSTAGRAM=0` lo apaga si hace falta. La exportación oficial queda como respaldo.

## 5. Lo que Alex hace una sola vez (todo lo demás es automático)

1. **Token del bot de síntesis.**
   - **Hecho el 2026-11-11:** guardado con `guardar-clave.sh TELEGRAM_SINTESIS_BOT_TOKEN --ambos`.
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
3. **Iniciar sesión con cada cuenta.** Desde el 2026-11-11 se hace **antes** de que SDP1111E esté integrada, con la herramienta local
   `~/.starseed/herramientas/alta-cuentas-google.py`:
   - las APIs Gmail, Drive y YouTube ya están activadas en el proyecto `starseed-system`;
   - los tokens se guardan en `~/.starseed/cuentas/<alias>.json`;
   - SDP1111P hace que `cuentas_google.py` los acepte.

   Antes era así, cuando SDP1111E estuviera integrada:
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
   "SDP1111A-d2"
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
   "SDP1111A-d2",
   "SDP1111B",
   "SDP1111C"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3 entero y agente_alcance.py (patrón de ciclo, l.157). Crea agente_sintesis.py con ciclo(raiz, ahora=None, encargar=None, jev=None, enviar=None, forzar=False, seco=False): máquina de tres fases por día guardada en starseed_memory_root/produccion-audiovisual/estado.json (recolectar→redactar→entregar), horas en America/Mexico_City (00:30, 06:30, 07:54), encola con encargar_por_flota en olas/cola-suenos-sintesis.json, nunca lanza orquestador, puntúa con decidir.consultar('puntuar', …) y entrega con sintesis_telegram.enviar: primero el resumen de 1500-3000 caracteres y luego la síntesis completa. Guarda el markdown en starseed_memory_root/produccion-audiovisual/sintesis/AAAA-MM-DD.md con escritura atómica. Una sola entrega al día. Cerrojo en ~/.starseed/cerrojos/. CLI plan|ciclo|estado [--seco --json]. Pruebas con todo inyectado. Máximo 120 líneas por archivo; parte el módulo si hace falta. ESCRITURA DEL DOC (2026-11-11): Google no deja pedir youtube.readonly y drive.file en la misma alta, así que hay un tercer alias, «alex-docs» (alexbordongarrigos, solo drive.file), en ~/.starseed/cuentas/alex-docs.json, ya en la Mac y en el A1. El Doc de cada síntesis se crea con cuentas_google.token('alex-docs', pedir) en la carpeta 1PenzAWw1VWpSAMXa7ms2VRrEhJ5uFbmI (probado: drive.file puede crear archivos en esa carpeta) subiendo el markdown con conversión a Google Doc. LECCIONES DE LA PRUEBA SIN CLAUDE (2026-11-11, ~/.starseed/herramientas/sintesis-prueba.py): (a) la cadena completa funcionó con modelos gratuitos: 45.000 caracteres con fuentes y fechas, Doc en Drive con alex-docs y aviso por @StarSeed_Design_bot; (b) `hermes -z` dejó la salida vacía en stdout cuando la respuesta larga terminó por longitud y siguió en un segundo mensaje (el texto completo estaba en ~/.hermes/state.db), y se colgó tras un error del proveedor Gemini de Hermes (GOOGLE_API_KEY no válida en ~/.hermes/.env; GEMINI_API_KEY sí es válida). Por eso: redacta con encargar_por_flota y la pasarela propia, no con Hermes; une las continuaciones cuando finish_reason sea 'length'; pon un tiempo límite a cada paso; y separa investigación (con web) de redacción (sin herramientas y con el contexto recortado: con 60 KB el modelo gratuito se perdía en herramientas)."
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
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3.3 y §5. Alex (2026-11-11) aclaró que el bot y las cuentas YA están conectados en la Mac: no hay que pedirle claves nuevas si se puede usar lo que existe. Ajusta, sin romper sus pruebas: (1) sintesis_telegram.py: si falta TELEGRAM_SINTESIS_BOT_TOKEN, usa el bot ya conectado TELEGRAM_BOT_TOKEN (de ~/.starseed/env o ~/.hermes/.env; es @starseed_puente_bot, el del Puente de Mando, el chat vinculado de MetaGenesis y Hermes) con TELEGRAM_SINTESIS_CHAT_ID y, si falta, TELEGRAM_CHAT_ID; antepone la cabecera «Síntesis de Producción StarSeed · AAAA-MM-DD» para que se distinga en ese chat. Si un día existe TELEGRAM_SINTESIS_BOT_TOKEN, manda ese. (2) cuentas_google.py: antes de pedir un cliente nuevo, prueba el cliente OAuth que el OS ya tiene (NEXT_PUBLIC_GOOGLE_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET de .env.local del repo; leer sin imprimir) con redirección fija http://127.0.0.1:8765/ ; si Google responde redirect_uri_mismatch o el proyecto no tiene activadas Gmail API o YouTube Data API v3, dilo en una línea con el arreglo exacto (añadir esa URI de redirección al cliente existente o activar la API, con el enlace de la consola) y solo entonces cae a GOOGLE_ACTIVIDAD_* o al client_secret_*.json de Descargas. (3) ALTA YA HECHA FUERA DEL OS (2026-11-11): Claude dejó la herramienta local ~/.starseed/herramientas/alta-cuentas-google.py (google-auth-oauthlib, venv ~/.starseed/venv-cuentas). Crea ~/.starseed/cuentas/alex.json y ~/.starseed/cuentas/fundacion.json en formato authorized_user de google-auth (client_id, client_secret, refresh_token, token_uri, scopes, alias, correo; 0600), con el cliente «App de escritorio» del proyecto starseed-system (~/.starseed/cuentas/cliente-oauth.json) y las APIs Gmail, Drive y YouTube ya activadas. cuentas_google.py debe ACEPTAR esos archivos tal cual (token(alias) renueva con refresh_token en https://oauth2.googleapis.com/token) y `estado` debe mostrarlos vivos; no pidas un alta nueva si existen. (4) AVISO DE CADUCIDAD: si el token de una cuenta deja de renovarse (invalid_grant) o falta, sintesis_telegram.enviar avisa UNA vez al día a Alex con la orden exacta para rehacer el alta (~/.starseed/venv-cuentas/bin/python ~/.starseed/herramientas/alta-cuentas-google.py <alias>) y la síntesis sigue con lo demás. Nunca imprime ni registra tokens ni secretos. Pruebas sin red. Máximo 120 líneas tocadas por archivo. ESCRITURA DEL DOC (2026-11-11): Google no deja pedir youtube.readonly y drive.file en la misma alta, así que hay un tercer alias, «alex-docs» (alexbordongarrigos, solo drive.file), en ~/.starseed/cuentas/alex-docs.json, ya en la Mac y en el A1. El Doc de cada síntesis se crea con cuentas_google.token('alex-docs', pedir) en la carpeta 1PenzAWw1VWpSAMXa7ms2VRrEhJ5uFbmI (probado: drive.file puede crear archivos en esa carpeta) subiendo el markdown con conversión a Google Doc."
 },
 {
  "id": "SDP1111Q",
  "ola": "SDP1111",
  "titulo": "Papeles de cada cuenta e Instagram desde Drive (sin la Mac)",
  "archivos": [
   "scripts/puente/cuentas_actividad.py",
   "scripts/puente/actividad_instagram.py",
   "scripts/puente/test_cuentas_actividad.py"
  ],
  "depende": [
   "SDP1111E",
   "SDP1111I-d2"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §4 y §5. PAPELES DE LAS CUENTAS (Alex, 2026-11-11): «alex» = alexbordongarrigos@gmail.com, cuenta Google Pro y PRINCIPAL: Drive (donde se sincroniza todo), Docs, YouTube, NotebookLM, Takeout y el Doc de la síntesis. «fundacion» = fundacionstarseed@gmail.com: sobre todo Gmail (correos enviados a comunidades y avisos de algunos servicios registrados con ella) y, en segundo plano, su Drive y YouTube. Instagram: «sociedadstarseed» = página oficial Sociedad StarSeed (cuenta de la fundación): sus publicaciones y a quién sigue; «maggasukha» = cuenta personal de Alex: guardados (referencias) y páginas que sigue (contactos y referencias). TAREA: (1) módulo PURO cuentas_actividad.py con esos papeles como datos (alias, correo, para_que, prioridad) y funciones que digan qué lector usa qué cuenta: Gmail enviados de las dos (fundacion primero); Drive, Docs, YouTube, NotebookLM y Takeout de alex primero y fundacion después con menos frecuencia. (2) actividad_instagram.py lee las exportaciones oficiales DESDE DRIVE de alex con cuentas_google (sin la Mac): carpeta «Actividad StarSeed (privado …)» id 1PvBnBhoxxNSBuCLSC2aQZ89Oe8mdJGB-, subcarpetas «Instagram maggasukha …» id 19_ymNnvy4iDpVuCLDiC47GyG2j2DVQ5U (saved_posts, saved_collections, following) e «Instagram Sociedad StarSeed …» id 1YWcHxOXG_zbE_Ea9ehuHCcVBGQcf0Z3U (publicaciones propias y following); en la Mac también mira ~/Downloads/instagram-*.zip. Cada ficha lleva la cuenta de origen y privado: true. Sigue sin abrir instagram.com ni usar la sesión de Alex. Pruebas puras con muestras pequeñas. Máximo 120 líneas tocadas por archivo."
 },
 {
  "id": "SDP1111R",
  "ola": "SDP1111",
  "titulo": "Autonomía sin la Mac: claves, cuentas y NotebookLM en el líder",
  "archivos": [
   "scripts/puente/oracle_nodo.py",
   "scripts/puente/actividad_notebooklm.py",
   "scripts/puente/test_autonomia_sintesis.py"
  ],
  "depende": [
   "SDP1111J",
   "SDP1111O"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3 y §4. Alex (2026-11-11): «todo debe funcionar aun sin Claude ni la computadora, desde MetaGenesis con todos sus medios, con los accesos y permisos completos desde cualquier medio donde se use MetaGenesis». TAREA: (1) en oracle_nodo.py, que la orden `claves` se lance SOLA desde el director cuando cambie la huella (sha256 corto, nunca el valor) de TELEGRAM_SINTESIS_BOT_TOKEN, TELEGRAM_SINTESIS_CHAT_ID, GOOGLE_ACTIVIDAD_*, de ~/.starseed/cuentas/*.json o del perfil de NotebookLM; guarda las huellas en ~/.starseed/claves-sintesis-huellas.json. (2) NotebookLM en el A1: `claves` lleva también ~/.notebooklm/profiles/default/storage_state.json (0600, mismo canal ssh, sin imprimir nada) y el instalador del A1 añade notebooklm-py en un venv propio; actividad_notebooklm.py corre en el líder que tenga el CLI y la sesión. Si Google invalida la sesión fuera de la Mac, devuelve {ok: False, motivo: 'sesión de NotebookLM no válida en este nodo'} y la Mac la cubre cuando esté encendida; nunca reintenta el login. (3) Los lectores de actividad y la entrega solo corren en el LÍDER de dirección (A1, Mac u otra neurona capaz con las claves); los contenedores de la nube compartida (GitHub Actions) nunca reciben datos privados ni claves. (4) ARREGLO detectado el 2026-11-11: `claves` copió ~/.starseed/cuentas/*.json al A1 con dueño uid 501:staff (el de la Mac) y el usuario de servicio starseed no podía leerlas; tras copiar, haz `chown -R starseed:starseed` del directorio, 700 en el directorio y 600 en los archivos (con sudo sh -c para que el comodín se expanda con permisos). Pruebas sin red y sin ssh real. Máximo 120 líneas tocadas por archivo."
 },
 {
  "id": "SDP1111S",
  "ola": "SDP1111",
  "titulo": "YouTube a fondo: canales seguidos, publicaciones relevantes y candidatos del día",
  "archivos": [
   "scripts/puente/youtube_candidatos.py",
   "scripts/puente/test_youtube_candidatos.py"
  ],
  "depende": [
   "SDP1111G",
   "SDP1111Q"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §4 (YouTube) y actividad_youtube.py. Alex (2026-11-11): la vinculación con YouTube sirve para analizar el historial y las publicaciones de canales relacionados y relevantes, y para investigaciones y referencias de estilos, storyboards, guiones, diseños, noticias, activistas y temas relevantes. Los agentes pueden buscar herramientas para VER y TRANSCRIBIR los vídeos y sacar contexto de los recomendados, del historial y de los canales seguidos, todo analizado con inteligencia para cada síntesis. Se usan LAS DOS cuentas (alex y fundacion) para el contexto y el acceso completo a YouTube. TAREA: youtube_candidatos.py, con los tokens de cuentas_google de las DOS cuentas (alex y fundacion): (a) suscripciones de cada cuenta → vídeos nuevos de 48 h de esos canales por su lista de subidas (playlistItems, 1 unidad de cuota; nunca search.list para esto); (b) «me gusta», listas propias y subidas propias recientes; (c) historial de vistos desde las fichas de Takeout (actividad_takeout) cuando existan; (d) los recomendados: la API ya no los da; usa como aproximación los vídeos relacionados por tema con search.list, como mucho 5 búsquedas al día (100 unidades cada una) con los temas del día (los del resumen de actividad y la rotación de la síntesis); (e) los canales de la red de resonancia y de activistas, noticias y temas relevantes que nombren las síntesis previas. Puntúa cada vídeo con Laya (relevante o no para StarSeed y para qué: estilo, storyboard, guion, diseño, noticia, activista, tema) y quita lo ya visto con LEANN. Devuelve como mucho 40 candidatos al día, ordenados, con id, canal, título, fecha, origen (cuenta y motivo) y privado: true cuando venga de la actividad personal. Guarda en ~/.starseed/actividad/youtube/candidatos-AAAA-MM-DD.json. Respeta la cuota diaria (registra las unidades gastadas). Pruebas sin red. Máximo 120 líneas por archivo; si no cabe, separa (d) y (e) y dilo."
 },
 {
  "id": "SDP1111T",
  "ola": "SDP1111",
  "titulo": "Ver y transcribir los vídeos candidatos y llevarlos a la síntesis",
  "archivos": [
   "scripts/puente/video_contexto.py",
   "scripts/puente/test_video_contexto.py",
   "scripts/puente/sintesis_tareas.py"
  ],
  "depende": [
   "SDP1111S",
   "SDP1111C"
  ],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §3.4 y §4. Alex (2026-11-11): la vinculación con YouTube sirve para analizar el historial y las publicaciones de canales relacionados y relevantes, y para investigaciones y referencias de estilos, storyboards, guiones, diseños, noticias, activistas y temas relevantes. Los agentes pueden buscar herramientas para VER y TRANSCRIBIR los vídeos y sacar contexto de los recomendados, del historial y de los canales seguidos, todo analizado con inteligencia para cada síntesis. Se usan LAS DOS cuentas (alex y fundacion) para el contexto y el acceso completo a YouTube. TAREA: (1) Antes de escribir, busca la mejor herramienta GRATUITA y local para cada paso en la Librería (architecture/repos-libreria-*.md, vigia-modelos.md, forja-voz-158.md: VibeASR/whisper.cpp) y en el nodo, y deja la elección justificada en ~/.starseed/herramientas-video.json. Orden por defecto: subtítulos con yt-dlp (--skip-download --write-auto-subs --sub-langs es,en; no descarga el vídeo); si no hay subtítulos, audio con yt-dlp y transcripción local (whisper.cpp, faster-whisper o VibeASR), borrando el audio al terminar; para VER el vídeo, Gemini gratuito con la URL de YouTube (GEMINI_API_KEY, respetando su cupo gratuito) o, si no, fotogramas clave con ffmpeg (detección de escena) descritos por un modelo de visión gratuito. Si falta yt-dlp o el transcriptor, el instalador del nodo lo añade (venv propio) y lo dice; nada de pago. (2) video_contexto.py: por cada candidato de youtube_candidatos (hasta 8 a fondo y el resto ligeros, a lo largo de la noche: calidad antes que tiempo) produce una ficha con: resumen de la transcripción, ideas útiles para guiones, notas de estilo (ritmo, montaje, color, tipografía, música, transiciones), storyboard extraído (escenas con marcas de tiempo), diseño, noticias, personas públicas o activistas citados y por qué importa para StarSeed; enlace y canal siempre, privado según el origen. Guarda en ~/.starseed/actividad/youtube/fichas/. (3) En sintesis_tareas.py añade la rama «youtube», que lleva esas fichas a las secciones de referencias, ideas, guiones y storyboards, creadores y noticias de la síntesis, con fuente (enlace y minuto) y fecha. Uso solo para análisis interno: no se redistribuye nada descargado. Pruebas sin red. Máximo 120 líneas tocadas por archivo."
 },
 {
  "id": "SDP1111U",
  "ola": "SDP1111",
  "titulo": "Páginas públicas de privacidad y términos (para publicar la app OAuth «StarSeed actividad»)",
  "archivos": [
   "src/app/privacidad/page.tsx",
   "src/app/terminos/page.tsx",
   "src/app/privacidad/__tests__/page.test.tsx"
  ],
  "depende": [],
  "prompt": "Lee architecture/sintesis-diaria-autonoma.md §4 y §5. Contexto: el 2026-11-11 se conectaron las cuentas alexbordongarrigos y fundacionstarseed a la app OAuth «StarSeed actividad» (proyecto de Google Cloud starseed-system, solo lectura: gmail.readonly, drive.readonly, youtube.readonly). La app está en estado «Prueba» y así los tokens caducan cada 7 días. Para PUBLICARLA, Google exige enlaces públicos a una página principal y a una política de privacidad en un dominio autorizado; hoy starseed-os.vercel.app/privacidad y /terminos dan 404. TAREA: crea las páginas públicas estáticas /privacidad y /terminos de StarSeed OS: sin sesión, accesibles a buscadores, con el estilo del OS (solo tokens de color, tipografía de la casa), en español con un resumen en inglés. Contenido real y breve: qué es StarSeed OS (en desarrollo, código abierto); que la app «StarSeed actividad» la usa SOLO su dueño para que sus agentes lean en modo de solo lectura su propia actividad (correos enviados, archivos de Drive, YouTube) y preparen síntesis privadas; que esos datos se quedan en los nodos del dueño, no se venden, no se comparten ni se usan para publicidad; cómo revocar el acceso (myaccount.google.com/permissions); contacto fundacionstarseed@gmail.com; fecha de vigencia. Cumple la Política de datos de usuario de los servicios de API de Google (uso limitado). Prueba de que ambas rutas renderizan. Máximo 120 líneas por archivo. DESPUÉS de publicarse (lo hace el director de producción), deja en tu respuesta los pasos para la consola: en Información de la marca, página principal https://starseed-os.vercel.app, privacidad …/privacidad, términos …/terminos, dominio autorizado starseed-os.vercel.app; luego Público › Publicar app; luego rehacer una vez el alta con ~/.starseed/herramientas/alta-cuentas-google.py para tener tokens sin caducidad de 7 días."
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
