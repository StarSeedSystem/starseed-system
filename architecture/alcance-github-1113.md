# Alcance por GitHub y comunidad técnica en la síntesis diaria · contrato y cola ALC1113

**Fecha:** 2026-11-13
**Destino en el repo:** `architecture/alcance-github-1113.md`

## 1. Pedido de Maggasukha (2026-11-13, resumen fiel)

Usar **GitHub** en las investigaciones de la síntesis diaria como fuente de contactos: perfiles, organizaciones,
grupos y programadores con proyectos, repos y apps relacionados de cualquier forma con StarSeed (sistemas operativos,
descentralización, código abierto, redes sociales, IA, democracia, redes mesh p2p, comunicaciones…).
- **Puntos de partida:** los repos que ya usa StarSeed OS (la Librería) y la búsqueda de más usuarios, páginas y repos
  similares.
- **Para qué:**
  1. Recomendar mejoras e implementaciones nuevas para StarSeed OS en cualquier área.
  2. Contactarlos con la idea de StarSeed OS: el repo, la información del proyecto y las fases. El objetivo es
     encontrar desarrolladores que quieran participar o aportar, pedir su opinión o sugerencias, y comunidades donde
     implementarlo o que ayuden a difundirlo.
- **La lista de contactos de Maggasukha** se usa y se enriquece con notas y datos de cada contacto.
- **Aprobación previa obligatoria:** antes de cualquier envío automático se aprueban **los mensajes, los
  destinatarios y los medios**, también los de GitHub y los de cualquier otro sitio.
- **Contenido de las síntesis:**
  - contactos nuevos recomendados y mensajes listos para aprobar;
  - **los agentes y bots de MetaGenesis envían lo aprobado** por los medios elegidos;
  - recomendaciones para el repo y para cada canal y página de StarSeed OS;
  - medios y sitios nuevos para promoverlo (foros, grupos, páginas, canales, comunidades), con próximos pasos;
  - mensajes con material audiovisual profesional para público general y especializado;
  - posts y contenido comercial y social en todos los formatos de redes.

## 2. Lo que ya existe y se REUTILIZA (no se duplica)

- **Librería:** `config/repos-libreria-*.json` y `src/lib/library/` (al menos 18 repos de GitHub hoy). Son las
  semillas.
- **Agente de alcance (INV1025M):**
  - `agente_alcance.py`, `alcance_plan.py`, `alcance_fichas.py`, `alcance_objetivos.py`, `alcance_fuentes.py`;
  - fichas con `canal_oficial` y borradores en estado `esperando-aprobacion`.
  - GitHub entra como **fuente nueva de fichas** de este mismo sistema.
- **Lista de contactos de Maggasukha (Drive):**
  - «Lista de quien contactar con mensajes personalizados», `1jH5S4_pIhovSE6aW-xW4LlXCWbKPJba4d2QiTsLO9XY`, en la
    carpeta `1OET1RNosKr0aX9BjX7Pg_GyY9ERqX7BG`. Es suya: **se lee, no se edita**.
  - Las notas y los datos de cada contacto van a un documento compañero en esa misma carpeta, «Fichas de contacto ·
    notas y datos (MetaGenesis)», creado con la cuenta `alex-docs` y enlazado desde los avisos.
  - También existe «Red de resonancia · plan de contactos» (`1TWmtpoy01pmLszLupzczBuymPH3vz2Zh5nW42XdGWiI`).
- **Síntesis diaria:** `agente_sintesis.py` (SDP1111) y la entrega por @StarSeed_Design_bot.
- **Bot de Telegram del A1:** `peticiones_telegram` (PET1112). Ahí se aprueba desde el móvil.
- **Lista de acciones de Alex en Genesis:** `acciones-de-alex.py`. La misma aprobación se ve ahí.

## 3. Reglas que no cambian

1. **Aprobación exacta y previa.** Nada se envía sin que Maggasukha apruebe ese mensaje, a ese destinatario y por
   ese medio.
   - La aprobación guarda el hash del texto, el destinatario, el canal y la hora.
   - Cualquier cambio en el texto o en el canal la invalida y obliga a aprobar de nuevo.
   - Un seguimiento (como máximo uno, después de 14 días sin respuesta) es otra aprobación.
2. **Reglas de GitHub y de cada plataforma.** Las Políticas de Uso Aceptable de GitHub prohíben usar información del
   servicio para spam o correo no solicitado. Por eso:
   - **nunca** se sacan correos de perfiles ni de commits;
   - **nunca** se abren issues ni PR no pedidos;
   - **nunca** hay envíos masivos;
   - solo se usan los canales que el proyecto **publica para eso**: Discussions abiertas con una categoría de ideas,
     presentaciones o general; el foro o el chat comunitario que enlaza (Matrix, Discord, Zulip); y el correo o
     formulario de contacto publicado por la organización;
   - en los demás sitios (Reddit, foros, fediverso) se respetan sus normas de autopromoción.
3. **Personas, solo en su papel público.**
   - De los individuos solo se registra lo que publican como mantenedores o autores de proyectos públicos: login,
     nombre público, proyectos y canal de contacto del proyecto.
   - Nada personal: domicilio, teléfono, correos no publicados para contacto, empleo o vida privada.
   - Sin perfiles psicológicos.
   - Prioridad a organizaciones y comunidades sobre personas.
4. **Privado y fuera del repo público.**
   - Las fichas, los borradores, las aprobaciones y los envíos viven en `starseed_memory_root/alcance/` (privado),
     en Drive y en el chat de la síntesis. El repo es **público**: aquí solo va código y este contrato.
   - Nada va a Supabase ni a la nube compartida.
5. **Volumen humano.**
   - Hasta 15 proyectos nuevos analizados al día.
   - Hasta 5 contactos nuevos propuestos al día.
   - Hasta 5 envíos al día.
   - Un único mensaje por contacto, salvo el seguimiento aprobado.
   - Registro de baja: quien diga que no, no vuelve a recibir nada.
6. **Mensajes.**
   - En el idioma del proyecto, 220 palabras como máximo.
   - Personalizados: citan algo concreto de su proyecto y dicen qué tiene en común con StarSeed.
   - Llevan el repo `https://github.com/StarSeedSystem/starseed-system`, StarSeed OS en una línea, las fases
     (Semilla, Fruto y Cosecha, Mente Digital) y **una** petición concreta: opinión, colaborar, comunidades donde
     implementarlo o ayudar a difundirlo.
   - Llevan una línea de baja.
   - Sin el nombre de Maggasukha (firma «Fundación StarSeed» o «Equipo de StarSeed OS»).
7. **Instalar en la Librería** es solo una propuesta en `esperando-aprobacion`; nunca se instala nada solo.
8. **Publicar** en canales propios o ajenos sigue siendo de Maggasukha. Aquí todo son recomendaciones y piezas listas
   para aprobar.

## 4. Cuentas de envío (configuración única de Maggasukha; hasta entonces, envío asistido)

- **GitHub:**
  - un token de la cuenta de StarSeed (`GITHUB_ALCANCE_TOKEN`) con permiso para crear Discussions en repos
    públicos;
  - se guarda con `guardar-clave.sh GITHUB_ALCANCE_TOKEN --ambos`.
- **Correo:**
  - el alta de `fundacion` con el permiso `gmail.send`, añadido a `alta-cuentas-google.py`;
  - envía desde fundacionstarseed.
- **Lo demás** (Reddit, fediverso, foros, formularios) y todo **mientras falten las claves**: **envío asistido**.
  - El bot manda a Maggasukha el texto final y el enlace del lugar, y marca «enviado» cuando él responde
    `/enviado <id>`.
- **Seguridad:** `ALCANCE_ENVIO=0` por defecto (simulacro); solo `=1` envía de verdad.

## 5. Cola ALC1113

```json
{"ola": "ALC1113", "tareas": [
{"id": "ALC1113A", "ola": "ALC1113", "titulo": "Alcance · lector de GitHub (fuente nueva de fichas)", "archivos": ["scripts/puente/alcance_github.py", "scripts/puente/alcance_github_temas.py", "scripts/puente/test_alcance_github.py"], "depende": [], "prompt": "Lee architecture/alcance-github-1113.md (§2, §3 y §5) y el agente de alcance existente (alcance_fuentes.py, alcance_fichas.py). Crea alcance_github.py (núcleo PURO y E/S inyectable): (1) semillas = los repos de GitHub de config/repos-libreria-*.json y src/lib/library/; (2) búsqueda por temas en alcance_github_temas.py (sistemas operativos, descentralización, local-first, fediverso/ActivityPub, Nostr, Matrix, redes sociales libres, IA abierta y local, democracia directa y participación (Decidim, Consul, Loomio, Polis), cooperativas de plataforma, redes mesh y p2p (Meshtastic, Reticulum, Briar, Yggdrasil), comunicaciones, solarpunk y tecnología regenerativa), con rotación diaria; (3) por repo, con la API de GitHub de solo lectura (GITHUB_TOKEN del líder; respeta los límites y la cabecera de rate limit): nombre, descripción, temas, licencia, estrellas, último push, lenguaje, organización o mantenedores públicos (login y nombre público) y los canales de contacto que el proyecto PUBLICA (Discussions abiertas y sus categorías; enlaces de comunidad del README: Matrix, Discord, Zulip, foro, web; correo de contacto de la organización si lo publica para eso). Nunca correos de commits ni de perfiles personales. (4) Área de StarSeed OS con la que se relaciona. Tope de 15 proyectos nuevos al día. Escribe fichas candidatas en starseed_memory_root/alcance/github/<fecha>.json con el formato de alcance_fichas (fuente 'github', canal_oficial). Pruebas sin red. Máximo 120 líneas por archivo."},
{"id": "ALC1113B", "ola": "ALC1113", "titulo": "Alcance · lista de Maggasukha y fichas de contacto en Drive", "archivos": ["scripts/puente/alcance_lista.py", "scripts/puente/test_alcance_lista.py"], "depende": ["ALC1113A"], "prompt": "Lee architecture/alcance-github-1113.md §2 y §3. Crea alcance_lista.py, que solo actúa en el líder con claves (lider_direccion.soy_lider). (1) Lee, sin editarla, la lista de Maggasukha (Drive 1jH5S4_pIhovSE6aW-xW4LlXCWbKPJba4d2QiTsLO9XY, cuenta alex, exportada como texto) y la red de resonancia (1TWmtpoy01pmLszLupzczBuymPH3vz2Zh5nW42XdGWiI), y obtiene los contactos que ya nombra. (2) Fusiona sus contactos con las fichas de GitHub y las existentes (sin duplicar; misma entidad por URL o login). (3) Mantiene el documento compañero «Fichas de contacto · notas y datos (MetaGenesis)» en la carpeta 1OET1RNosKr0aX9BjX7Pg_GyY9ERqX7BG (cuenta alex-docs; si no existe, lo crea). Por contacto: tipo (organización, proyecto, mantenedor o comunidad), enlace, qué hace, relación con StarSeed, canal oficial publicado, idioma, notas, estado (propuesto, aprobado, enviado, respondió, no contactar) y fecha. Solo datos públicos profesionales (§3.3). Si un contacto de la lista de Maggasukha no tiene identidad clara, lo marca «identidad por confirmar» y no lo investiga más. Pruebas sin red."},
{"id": "ALC1113C", "ola": "ALC1113", "titulo": "Alcance · recomendaciones técnicas para StarSeed OS desde GitHub", "archivos": ["scripts/puente/alcance_recomendaciones.py", "scripts/puente/test_alcance_recomendaciones.py"], "depende": ["ALC1113A"], "prompt": "Lee architecture/alcance-github-1113.md y architecture/repos-libreria-1104.md §0. Crea alcance_recomendaciones.py: de cada ficha de GitHub del día, una recomendación para StarSeed OS con área del sistema, qué adoptar (patrón, función, biblioteca o idea), por qué, compatibilidad de licencia con la de StarSeed OS, esfuerzo (S, M o L) y riesgo. Las mejores (hasta 5 al día) se proponen a la Librería como fichas en 'esperando-aprobacion' con el formato de config/repos-libreria-*.json, en un archivo propuesta-<fecha>.json que NO se instala solo. Usa el analista de la flota gratuita (encargar_por_flota, modo libre) para redactar y valida la salida (campos, longitudes, https). Pruebas sin red."},
{"id": "ALC1113D", "ola": "ALC1113", "titulo": "Alcance · mensajes personalizados para contactos de GitHub", "archivos": ["scripts/puente/alcance_plan.py", "scripts/puente/agente_alcance.py", "scripts/puente/test_agente_alcance.py"], "depende": ["ALC1113A", "ALC1113B"], "prompt": "Lee architecture/alcance-github-1113.md §3.1, §3.2 y §3.6. Amplía el agente de alcance existente (no hagas uno nuevo) para que acepte fichas de fuente 'github'. Hasta 5 borradores al día en estado 'esperando-aprobacion', cada uno con: id corto, destinatario, canal (github_discussion con repo y categoría, email de contacto publicado, foro o chat, o 'asistido'), idioma, asunto, texto de 220 palabras como máximo con las reglas de §3.6 (personalizado, repo de StarSeed, fases, una petición, línea de baja, firma de la Fundación, sin el nombre de Maggasukha) y motivo de la elección. Valida: el canal debe estar en canal_oficial de la ficha; si no hay canal publicado, no hay borrador. Nunca issues ni PR. Pruebas sin red, incluida una que rechaza un correo sacado de un commit."},
{"id": "ALC1113E", "ola": "ALC1113", "titulo": "Alcance · aprobación por Telegram y en Genesis", "archivos": ["scripts/puente/alcance_aprobacion.py", "scripts/puente/test_alcance_aprobacion.py", "scripts/puente/peticiones_telegram.py"], "depende": ["ALC1113D"], "prompt": "Lee architecture/alcance-github-1113.md §3.1 y el bot de peticiones (architecture/peticiones-telegram-a1.md). Crea alcance_aprobacion.py (PURO): registro de aprobaciones en starseed_memory_root/alcance/aprobaciones.jsonl con el hash sha256 del texto, el destinatario, el canal, quién y cuándo; aprobar, editar (invalida y deja el borrador nuevo pendiente) y rechazar (pasa a 'no contactar' si se pide). En el bot (peticiones_telegram.py del repo, PET1112A): /alcance lista los pendientes (id, destinatario, canal y los primeros 300 caracteres, con /ver <id> para el texto completo); /aprobar <id>, /editar <id> <texto nuevo>, /rechazar <id>, /baja <id> y /enviado <id> (envío asistido). Los mismos pendientes aparecen en acciones-de-alex para Genesis. Pruebas: un texto editado no hereda la aprobación."},
{"id": "ALC1113F", "ola": "ALC1113", "titulo": "Alcance · envío de lo aprobado (con simulacro por defecto)", "archivos": ["scripts/puente/alcance_envio.py", "scripts/puente/test_alcance_envio.py"], "depende": ["ALC1113E"], "prompt": "Lee architecture/alcance-github-1113.md §3 y §4. Crea alcance_envio.py, que solo corre en el líder con claves. Envía SOLO los borradores con una aprobación cuyo hash, destinatario y canal coinciden. Adaptadores: github_discussion (GraphQL createDiscussion en la categoría indicada del repo destino, con GITHUB_ALCANCE_TOKEN, solo si Discussions está abierto); email (API de Gmail desde fundacion con el permiso gmail.send); asistido (envía a Maggasukha por sintesis_telegram el texto final y el enlace del lugar, y espera /enviado). Si falta la clave de un canal, pasa a asistido. ALCANCE_ENVIO=0 (por defecto) es simulacro: registra lo que haría sin enviar. Tope de 5 envíos al día; registro de baja; nunca reenvía; registro en starseed_memory_root/alcance/envios.jsonl; aviso por Telegram de cada envío hecho. Pruebas con falsos de cada adaptador, sin red."},
{"id": "ALC1113G", "ola": "ALC1113", "titulo": "Síntesis diaria · GitHub, alcance y promoción", "archivos": ["scripts/puente/agente_sintesis.py", "scripts/puente/test_agente_sintesis.py"], "depende": ["ALC1113C", "ALC1113D"], "prompt": "Lee architecture/alcance-github-1113.md §1 y architecture/sintesis-diaria-autonoma.md. Añade tres secciones a la síntesis diaria. (1) «GitHub y comunidad técnica»: de 5 a 10 proyectos del día con enlace, qué hacen, qué aprender o implementar en StarSeed OS (de alcance_recomendaciones) y las propuestas para la Librería. (2) «Alcance: contactos y mensajes para aprobar»: los borradores pendientes con id, destinatario, canal y motivo, y cómo aprobarlos (/alcance). (3) «Promoción y canales»: recomendaciones para el repo (README, CONTRIBUTING, good first issues, Discussions, topics, roadmap, vista previa social); para cada canal y página de StarSeed (YouTube, Instagram Sociedad StarSeed, Telegram, web); sitios nuevos donde presentar el sistema según su contexto (foros, subreddits, fediverso, Nostr, Matrix, Discord, Show HN, dev.to, Product Hunt, academia, comunidades locales y ecoaldeas) respetando sus normas; y próximos pasos con piezas y mensajes audiovisuales para público general y especializado, con posts y contenido comercial y social en todos los formatos. Rotación diaria por áreas del OS. Todo como recomendación; nada se publica. Pruebas sin red."},
{"id": "ALC1113H", "ola": "ALC1113", "titulo": "Documentar el alcance por GitHub", "archivos": ["architecture/sintesis-diaria-autonoma.md", "memory/workflow-actual.md", "CLAUDE.md", "AGENTS.md"], "depende": ["ALC1113F", "ALC1113G"], "prompt": "Lee architecture/alcance-github-1113.md. Añade a architecture/sintesis-diaria-autonoma.md una sección corta sobre las fuentes de GitHub, las fichas, la aprobación exacta y el envío (simulacro por defecto). Añade a CLAUDE.md y AGENTS.md «Alcance por GitHub» (3 a 5 líneas: nada se envía sin aprobar mensaje, destinatario y canal; nunca correos de commits ni issues no pedidos; datos privados fuera del repo público). Añade también una entrada corta en memory/workflow-actual.md."}
]}
```
