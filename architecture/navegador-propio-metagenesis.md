# Navegador propio de MetaGenesis · contrato y cola NAV1112

**Fecha:** 2026-11-12 · preparado por Claude (nube) a petición de Alex. Amplía `architecture/sintesis-diaria-autonoma.md` (ola SDP1111). **Estado:** encolada el 2026-11-11 (Cowork con la Mac) en `starseed_memory_root/olas/cola-nav1112.json`, 11 tareas. Nada construido todavía. **Destino en el repo:** `architecture/navegador-propio-metagenesis.md` (este texto) y `starseed_memory_root/olas/cola-nav1112.json` (la cola de §8).

## 1\. Qué pidió Alex (2026-11-12, literal en lo esencial)

«Los límites deberían solucionarse con sesiones de los contenedores en la nube disponibles de MetaGenesis, donde puedan instalarse las herramientas para tener navegadores virtuales que los agentes puedan controlar y mantener \[…\] para abrir los navegadores, acceder a las cuentas y visualizar los datos directamente, como agentes de navegador web como el que usa Claude, pero independiente y seguro, con las reglas y direcciones de MetaGenesis, o alguna solución o alternativa.»

Con esto Alex **aprueba** lo que SDP1111M dejaba pendiente (leer «Mi actividad» con un navegador) y pide además leer Instagram con su sesión. Esta ola sustituye a SDP1111M: el navegador vive en el A1, no en la Mac.

## 2\. Qué límites resuelve

| Límite de SDP1111 | Hoy | Con el navegador propio |
| :---- | :---- | :---- |
| Historial de vídeos vistos de YouTube | Takeout, cada 2 meses | diario, leyendo `myactivity.google.com` y el historial de YouTube |
| Historial de búsquedas y chats de Gemini | Takeout, cada 2 meses | diario, por «Mi actividad» |
| Recomendados de YouTube | sin API; se aproximan con búsquedas | diario, leyendo la página de inicio con la sesión de cada cuenta |
| NotebookLM | solo con la Mac encendida (CLI) | diario y sin la Mac, por la web |
| Guardados de Instagram | exportación manual | diario, leyendo «Guardado» con la sesión de maggasukha |

Takeout, la exportación de Instagram y el CLI de NotebookLM **se quedan como respaldo**: si una sesión del navegador cae, la síntesis sigue con lo que haya.

## 3\. Dónde corre

- **En el A1 de Oracle** (2 OCPU, 12 GB, siempre encendido), en un contenedor propio. Es la máquina de Alex.  
- **Nunca en los contenedores compartidos** (GitHub Actions, el contenedor de Claude, CloudRoom): una sesión iniciada equivale a la cuenta entera, y el contrato SDP1111 ya dice que esos medios no reciben datos privados ni claves.  
- El A1 ya tiene un escritorio Linux remoto, **Selkies** (`deploy/oracle/nodo/selkies/`, apagado por defecto, solo por `127.0.0.1` detrás de Caddy y con la sesión del nodo). Se reutiliza para que Alex inicie sesión; no se instala otro escritorio.  
- Imagen `linux/arm64`: Chromium, Xvfb y Playwright. Tope de memoria de 1,5 GB. Solo se enciende en su ventana (de madrugada) y para las altas.

## 4\. Cómo funciona

1. **Una sesión por cuenta**, cada una con su perfil de Chromium en un volumen aparte:  
   - `google-alex` (alexbordongarrigos): Mi actividad, YouTube, Gemini, NotebookLM;  
   - `google-fundacion` (fundacionstarseed): Mi actividad y NotebookLM;  
   - `instagram-maggasukha`: guardados y páginas seguidas;  
   - `instagram-sociedad`: la página oficial (solo su propia actividad).  
2. **El alta la hace Alex, a mano, una vez por sesión.** El sistema enciende Selkies, abre el Chromium de esa sesión en la página de inicio de sesión y avisa por el chat «Síntesis de producción StarSeed». Alex entra desde MetaGenesis › Apps Linux, escribe su contraseña y su segundo factor, y cierra. Ningún agente ve ni teclea contraseñas. Al terminar, Selkies se apaga.  
3. **La lectura la hacen guiones fijos**, no un agente libre. Cada lector (Playwright sobre el puerto de depuración, solo en `127.0.0.1`) abre unas páginas concretas, baja por la lista y extrae título, enlace, fecha y canal o autor.  
4. **Los modelos solo ven el texto ya extraído**, como fichas `privado: true`, igual que el resto de la actividad. Las fichas van a `~/.starseed/actividad/fichas/` y entran en el resumen por temas (SDP1111K).  
5. **Si una sesión caduca** o aparece una verificación, el lector se detiene, no reintenta y avisa por Telegram para rehacer el alta.  
6. **Si Google o Instagram cambian la página** y el guion no reconoce nada, guarda un esqueleto de la página sin textos (solo etiquetas y atributos de estructura) y encola una tarea de reparación para el enjambre. Así se mantiene solo sin que ningún modelo vea los datos.

## 5\. Reglas de seguridad (son parte del contrato)

- **Ningún modelo conduce un navegador con sesión iniciada.** El contenido de una página es texto ajeno y puede traer instrucciones; un agente libre con la cuenta abierta podría obedecerlas. Por eso solo navegan guiones deterministas.  
- **Solo lectura.** Los guiones no pulsan «enviar», «publicar», «eliminar», «seguir» ni «me gusta», no rellenan formularios y no cambian ajustes. La lista de selectores prohibidos se prueba.  
- **Lista de dominios por sesión.** Las sesiones de Google solo abren `myactivity.google.com`, `www.youtube.com`, `gemini.google.com` y `notebooklm.google.com`; las de Instagram, solo `www.instagram.com`. Cualquier otra navegación se corta.  
- **Sin puertos hacia fuera.** El puerto de depuración escucha en `127.0.0.1` dentro del contenedor; nada se publica.  
- **Perfiles protegidos.** Cada volumen pertenece a un usuario propio del servicio, con permisos 0700\. No entran en copias a Drive, ni en `starseed_memory_root`, ni en la orden de claves hacia otros medios, ni en git.  
- **Una sesión a la vez**, con cerrojo, y ritmo humano: pausas entre páginas y un tope de páginas al día por sesión.  
- **Interruptores** (solo nombres): `STARSEED_NAVEGADOR=0` lo apaga todo; `STARSEED_NAVEGADOR_INSTAGRAM=0` apaga solo Instagram.  
- Lo privado sigue las reglas de SDP1111 §4: nada a Supabase, ni al parte diario, ni a Drive, ni a modelos de pago.

## 6\. Lo que sigue teniendo riesgo, aunque se haga bien

- **Google puede rechazar el inicio de sesión** desde un servidor («este navegador puede no ser seguro») o pedir verificaciones más a menudo, porque la IP es de un centro de datos. Por eso el alta es manual y en un Chromium normal, sin automatización en marcha. Si aun así no deja entrar, el plan B es el mismo contenedor en la Mac (mismo `compose`), que solo funciona con la Mac encendida.  
- **Instagram prohíbe la lectura automatizada** y es más agresivo con las IP de centros de datos: puede pedir verificación o bloquear la cuenta temporalmente. Se reduce con una sola pasada al día, pocas páginas y ritmo lento, pero **no se elimina**. Si aparece cualquier aviso, el lector se apaga solo y Alex decide.  
- **Las sesiones caducan** (semanas o meses). Rehacer el alta es de Alex.  
- **El perfil es un secreto grande:** quien entre en el A1 como ese usuario tiene las cuentas. Conviene que las dos cuentas de Google tengan verificación en dos pasos y revisar de vez en cuando «Tus dispositivos» en la cuenta.

## 7\. Lo que Alex hace una vez

1. Cuando NAV1112D esté integrada, llegará un aviso por cada sesión al chat de síntesis. Abrir MetaGenesis › Apps Linux, iniciar sesión en la ventana que aparece y cerrar. Son cuatro altas: dos de Google y dos de Instagram.  
2. Repetirlo cuando llegue el aviso «la sesión X caducó».

## 8\. La cola (copiar tal cual a `starseed_memory_root/olas/cola-nav1112.json`)

Antes de encolar, el director comprueba que ningún id `NAV1112*` exista en el histórico. Mismas reglas que SDP1111 §6: módulo puro, 3 archivos y 120 líneas por escritura como mucho, cableado aparte, y si no cabe se parte.

```json
{
  "ola": "NAV1112",
  "tareas": [
    {"id": "NAV1112A", "ola": "NAV1112", "titulo": "Navegador propio · sesiones y reglas (módulo puro)", "archivos": ["scripts/puente/navegador_reglas.py", "scripts/puente/test_navegador_reglas.py"], "depende": [], "prompt": "Lee architecture/navegador-propio-metagenesis.md §4 y §5. Crea el módulo PURO navegador_reglas.py: el registro de sesiones (google-alex, google-fundacion, instagram-maggasukha, instagram-sociedad) con su lista de dominios permitidos, sus topes (páginas al día, pausa mínima entre páginas) y su estado (viva, caducada, sin alta, última comprobación) guardado en ~/.starseed/navegador/estado.json con escritura atómica. Funciones: permitida(sesion, url) (solo https y solo dominios de la lista), selector_prohibido(texto_o_selector) (enviar, publicar, eliminar, seguir, me gusta, guardar cambios y sus equivalentes en inglés), dentro_de_tope(sesion, ahora), apagado(entorno) con STARSEED_NAVEGADOR y STARSEED_NAVEGADOR_INSTAGRAM. Sin red. Pruebas de cada regla. Máximo 120 líneas por archivo."},
    {"id": "NAV1112B", "ola": "NAV1112", "titulo": "Navegador propio · contenedor en el A1", "archivos": ["deploy/oracle/nodo/navegador/compose-navegador.yml", "deploy/oracle/nodo/navegador/Dockerfile", "deploy/oracle/nodo/navegador/LEEME.md"], "depende": [], "prompt": "Lee architecture/navegador-propio-metagenesis.md §3 y §5 y deploy/oracle/nodo/selkies/ (patrón). Crea un contenedor linux/arm64 con Chromium, Xvfb y Playwright para Python. Apagado por defecto (restart: no). Un volumen por sesión para el perfil (navegador_google_alex, etc.), propiedad de un usuario sin privilegios. Chromium arranca con el perfil de la sesión pedida y --remote-debugging-address=127.0.0.1; NINGÚN puerto publicado. Tope de memoria 1500M. Para el alta manual, el mismo perfil se abre dentro del escritorio Selkies existente (comparte el volumen); documenta cómo. LEEME: encender, apagar, dónde están los perfiles y que nunca se copian fuera. No toques compose-a1.yml."},
    {"id": "NAV1112C", "ola": "NAV1112", "titulo": "Navegador propio · cliente de solo lectura", "archivos": ["scripts/puente/navegador_cliente.py", "scripts/puente/test_navegador_cliente.py"], "depende": ["NAV1112A"], "prompt": "Lee architecture/navegador-propio-metagenesis.md §4 y §5. Crea navegador_cliente.py: con un cerrojo en ~/.starseed/cerrojos/ (una sesión a la vez), enciende el contenedor de NAV1112B para una sesión, se conecta por el puerto de depuración local con Playwright y ofrece SOLO: abrir(url) (pasa por navegador_reglas.permitida; si no, lanza), esperar, desplazar(n), extraer(selector, campos) que devuelve texto y enlaces, esqueleto() que devuelve la estructura de la página SIN textos, y cerrar(). No expone click, fill ni teclado. Corta cualquier navegación o petición de documento a un dominio no permitido. Respeta las pausas y el tope. El conector es inyectable; pruebas con un navegador falso, sin red. Máximo 120 líneas por archivo."},
    {"id": "NAV1112D", "ola": "NAV1112", "titulo": "Navegador propio · alta manual y vigilancia de sesiones", "archivos": ["scripts/puente/navegador_alta.py", "scripts/puente/test_navegador_alta.py"], "depende": ["NAV1112A", "NAV1112B"], "prompt": "Lee architecture/navegador-propio-metagenesis.md §4 y §7. Crea navegador_alta.py. CLI `alta <sesion>`: enciende Selkies y el Chromium de esa sesión en su página de inicio de sesión, avisa a Alex con sintesis_telegram.enviar («abre MetaGenesis › Apps Linux e inicia sesión en <sesion>»; nunca la IP ni una URL del nodo), espera hasta 30 minutos a que la sesión esté viva y apaga Selkies siempre al terminar. `estado`: para cada sesión abre una página de comprobación y marca viva o caducada. `vigilar`: si una sesión pasa a caducada avisa una vez por Telegram y no reintenta. Ningún paso teclea ni lee contraseñas. Todo inyectable; pruebas sin red. Máximo 120 líneas por archivo."},
    {"id": "NAV1112E", "ola": "NAV1112", "titulo": "Actividad · Mi actividad de Google a diario (YouTube, Búsqueda, Gemini)", "archivos": ["scripts/puente/actividad_miactividad.py", "scripts/puente/test_actividad_miactividad.py"], "depende": ["NAV1112C"], "prompt": "Lee architecture/navegador-propio-metagenesis.md §2 y §4. Crea actividad_miactividad.py: con navegador_cliente y las sesiones google-alex y google-fundacion, lee de myactivity.google.com las entradas de las últimas 36 h de YouTube (vídeos vistos), Búsqueda y Gemini (solo el título de cada conversación y su fecha). Fichas {fuente, cuenta, fecha, titulo, enlace, privado: true} en ~/.starseed/actividad/fichas/AAAA-MM-DD-miactividad-<alias>.json. Incremental por marca de tiempo. Si no reconoce la página, guarda el esqueleto en ~/.starseed/navegador/reparar/ y devuelve {ok: False, motivo: 'pagina cambiada'}. El extractor de la lista es una función pura con pruebas sobre HTML de muestra inventado. Máximo 120 líneas por archivo."},
    {"id": "NAV1112F", "ola": "NAV1112", "titulo": "Actividad · inicio e historial de YouTube con sesión", "archivos": ["scripts/puente/actividad_youtube_web.py", "scripts/puente/test_actividad_youtube_web.py"], "depende": ["NAV1112C"], "prompt": "Lee architecture/navegador-propio-metagenesis.md §2. Crea actividad_youtube_web.py: con la sesión google-alex lee los primeros 40 recomendados de www.youtube.com y las entradas del día de www.youtube.com/feed/history. Fichas con título, canal, enlace y origen ('recomendado' o 'historial'), privado: true. Son candidatos para SDP1111S; este módulo no ve ni transcribe vídeos. Misma regla de página cambiada que NAV1112E. Extractor puro con pruebas sobre HTML de muestra. Máximo 120 líneas por archivo."},
    {"id": "NAV1112G", "ola": "NAV1112", "titulo": "Actividad · NotebookLM por la web, sin la Mac", "archivos": ["scripts/puente/actividad_notebooklm_web.py", "scripts/puente/test_actividad_notebooklm_web.py"], "depende": ["NAV1112C"], "prompt": "Lee architecture/navegador-propio-metagenesis.md §2. Crea actividad_notebooklm_web.py: con las sesiones de Google lee en notebooklm.google.com la lista de cuadernos (título y fecha de modificación) y, de los modificados desde la última pasada, los títulos de sus fuentes y de sus notas. Fichas privado: true. No crea, edita ni borra nada. actividad_notebooklm.py (CLI de la Mac) sigue como respaldo: si este lector da fichas, el otro no se llama. Extractor puro con pruebas. Máximo 120 líneas por archivo."},
    {"id": "NAV1112H", "ola": "NAV1112", "titulo": "Actividad · guardados de Instagram con sesión (aprobado por Alex el 2026-11-12)", "archivos": ["scripts/puente/actividad_instagram_web.py", "scripts/puente/test_actividad_instagram_web.py"], "depende": ["NAV1112C"], "prompt": "Lee architecture/navegador-propio-metagenesis.md §5 y §6. Crea actividad_instagram_web.py: con la sesión instagram-maggasukha lee UNA vez al día la página de guardados y sus colecciones (enlace, autor y colección; máximo 60 elementos nuevos) y la lista de cuentas seguidas (solo nombre público y enlace, para la red de resonancia). Con instagram-sociedad, solo las publicaciones propias recientes. Pausas largas entre páginas y tope diario de navegador_reglas. Ante cualquier verificación, aviso de actividad inusual o cierre de sesión: se detiene, pone STARSEED_NAVEGADOR_INSTAGRAM en apagado en el estado, avisa por Telegram y no reintenta hasta que Alex lo encienda. No da me gusta, no sigue, no comenta, no envía mensajes. Incremental por enlace. Extractor puro con pruebas. Máximo 120 líneas por archivo."},
    {"id": "NAV1112I", "ola": "NAV1112", "titulo": "Navegador propio · reparación de guiones por el enjambre", "archivos": ["scripts/puente/navegador_reparar.py", "scripts/puente/test_navegador_reparar.py"], "depende": ["NAV1112E"], "prompt": "Lee architecture/navegador-propio-metagenesis.md §4.6. Crea navegador_reparar.py: si hay esqueletos nuevos en ~/.starseed/navegador/reparar/, comprueba que no llevan textos (solo etiquetas, roles y nombres de atributos; si alguno lleva texto, lo descarta) y encola UNA tarea de código por lector roto en olas/cola-nav-reparar.json, con el esqueleto como contexto y la instrucción de ajustar solo el extractor puro y sus pruebas. Nunca más de una tarea abierta por lector. Pruebas puras. Máximo 120 líneas por archivo."},
    {"id": "NAV1112J", "ola": "NAV1112", "titulo": "Cablear el navegador propio en la síntesis y en el A1", "archivos": ["scripts/puente/agente_sintesis.py", "deploy/oracle/nodo/systemd/starseed-navegador.service", "deploy/oracle/nodo/systemd/starseed-navegador.timer"], "depende": ["NAV1112D", "NAV1112E", "NAV1112F", "NAV1112G", "NAV1112H", "NAV1112I"], "prompt": "Depende también de SDP1111L. Añade un timer oneshot diario en el A1 (patrón starseed-metageminis.timer, MemoryMax=1500M, a las 23:40 de America/Mexico_City) que ejecuta en orden y protegidos: navegador_alta.py vigilar, los cuatro lectores, navegador_reparar.py, y apaga el contenedor al terminar. En agente_sintesis.py no cambies el ciclo: los lectores de actividad ya recogen todas las fichas del día. Si STARSEED_NAVEGADOR=0 el servicio termina sin hacer nada. Prueba: un lector que lanza no impide los demás."},
    {"id": "NAV1112K", "ola": "NAV1112", "titulo": "Documentar el navegador propio y retirar SDP1111M", "archivos": ["architecture/navegador-propio-metagenesis.md", "architecture/sintesis-diaria-autonoma.md", "memory/workflow-actual.md"], "depende": ["NAV1112J"], "prompt": "Guarda el contrato en architecture/navegador-propio-metagenesis.md. En architecture/sintesis-diaria-autonoma.md §4 actualiza la tabla de fuentes (vía y frecuencia reales con el navegador propio; Takeout, la exportación de Instagram y el CLI de NotebookLM como respaldo) y marca SDP1111M como sustituida por NAV1112E, sin borrar su historia. Entrada corta en memory/workflow-actual.md."}
  ]
}
```

## 9\. Cómo se sabe que funciona

1. `python3 scripts/puente/navegador_alta.py estado` muestra las cuatro sesiones vivas.  
2. `~/.starseed/actividad/fichas/` tiene cada mañana las fichas de Mi actividad, YouTube, NotebookLM e Instagram, y nada de eso ha salido del A1.  
3. La síntesis del día cita vídeos vistos ayer y guardados nuevos, con la Mac apagada.  
4. Al cerrar a mano una sesión, llega un único aviso al chat de síntesis y el resto de lectores sigue.