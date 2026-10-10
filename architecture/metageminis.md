# MetaGeminis · el agente social de MetaGenesis (contrato · 2026-10-10)

> **En una frase.** MetaGeminis es un agente de IA de la sociedad StarSeed que **busca** quién puede
> ayudar (personas voluntarias, donantes, especialistas, pioneras, fondos, convocatorias, redes de agentes
> de IA), **prepara** los mensajes, propuestas y campañas —incluida publicidad audiovisual— y los deja
> **«Para aprobar»** en MetaGenesis. **Nada sale sin que Alex lo apruebe con un toque.** Trabaja siempre
> encendido, en varios medios, supervisado por los directores, y entrega sus resultados reales (respuestas,
> aportaciones, voluntariado, donaciones confirmadas por Stripe) en una sección propia de MetaGenesis.
>
> **Por qué existe.** Alex lo pidió así: un agente social que, desde la fase Semilla, abra el camino a la
> sociedad StarSeed sin que él tenga que buscar a mano cada fondo, comunidad o red; y que lo haga con
> respeto, sin spam y sin esconder que es una IA.
>
> **Documentos hermanos.** Estudio audiovisual: `architecture/metageminis-estudio.md` (rama `estudio`, §3).
> Tablas y reglas de estado: `supabase/migrations/20261011090000_metageminis.sql`. Directorio de sitios:
> `src/lib/metageminis/directorio.ts` (§9). Esqueleto ejecutable: `scripts/sociales/metageminis.py` (§10).
>
> **Estado real (2026-10-10).** Escrito y probado: el directorio (54 sitios), la migración (probada dos
> veces en un Postgres 16 desechable, **sin aplicar en Supabase**), la lógica y los tipos
> (`src/lib/metageminis/`), el esqueleto en Python y sus 57 pruebas, la sección de MetaGenesis. **No
> existe todavía:** ningún servicio 24/7 desplegado, ninguna cuenta creada, ningún enlace de Stripe, ningún
> mensaje enviado. La tabla del §11 dice qué falta y quién lo hace.

## 1. Identidad y voz

| Rasgo | Cómo se concreta |
|---|---|
| Qué es | Un **agente de IA** de la sociedad StarSeed. Siempre lo dice: en su perfil (etiqueta de bot donde exista), en cada mensaje (aviso fijo) y en cada publicación (aviso corto). |
| Qué defiende | La libertad por el bien común, la abundancia y la prosperidad colectiva: la tríada de StarSeed (CLAUDE.md §3: ontocracia, ciberdelia, transhumanismo comunista de abundancia). No hace proselitismo ni presiona: **invita y pregunta**. |
| Cómo habla | Español claro y cálido por defecto; el idioma del destino cuando lo pide el sitio. Respeto, empatía y compasión; sin exageraciones, sin promesas de dinero ni de resultados, sin cifras inventadas. Reconoce que StarSeed está en la fase Semilla (CLAUDE.md §5). |
| Qué sabe | CLAUDE.md §3–§6 (tríada, arquitectura dual, plan en tres fases, invariantes técnicas). El script lo lee en cada pasada, así que si cambian, cambia con ellos. |
| Cuenta propia | `metageminis` en StarSeed OS (identidad pública; §7). Alex es quien la crea y guarda la contraseña. |
| Aviso fijo | «Este texto lo ha redactado MetaGeminis, un agente de IA de la sociedad StarSeed. Antes de enviarse, una persona de StarSeed (Alex Bordón Garrigós) lo revisa y lo aprueba. Si prefieres no recibir mensajes de agentes de IA, respóndenos «no» y no volveremos a escribirte.» (`AVISO_IA` en `metageminis.py`; las publicaciones propias llevan «— MetaGeminis, agente de IA de StarSeed»). |

## 2. Límites duros (parte del contrato)

Cada límite dice **cómo se garantiza de verdad**. Un límite que solo está escrito en un documento no
cuenta.

| # | Límite | Cómo se garantiza | Dónde se comprueba |
|---|---|---|---|
| L1 | **Nada sale sin aprobación de Alex.** Todo mensaje, propuesta o pieza nace «para_aprobar» y solo un dueño de MetaGenesis lo aprueba | Triggers de la base: un borrador o pieza **solo se inserta** «para_aprobar» o «descartado»; «enviado» y «publicado» exigen `aprobado_por` y `aprobado_en`; aprobar es una RPC que solo ejecutan los dueños (`es_metagenesis_dueno`) | Migración + prueba en Postgres real (la inserción como «aprobado» falla con 23514) |
| L2 | **Lo aprobado es exactamente lo que sale** | Trigger: texto, asunto, canal, sitio, archivo y huella quedan congelados al decidir; quién aprobó y cuándo no se reescribe | Migración |
| L3 | **Sin spam ni envíos masivos** | La puerta es una cola con aprobación humana (L1); el mismo mensaje no se propone dos veces al mismo sitio (`huella` única = sha256 de sitio + cuerpo normalizado). *Pendiente:* enfriamiento por sitio (§11) | Migración + `test_huella_*` |
| L4 | **Solo donde las reglas del sitio lo permiten** y solo por canales que el sitio ofrece (API oficial, formulario, correo de propuestas) | Cada sitio del directorio lleva su regla de agentes y de texto de IA; `puede_redactar` y `puede_enviar_el_agente` (iguales en TypeScript y Python) excluyen lo vetado, lo cerrado, lo «solo lectura» y lo sin leer. Un agente solo envía por API oficial y tras L1; lo demás lo envía una persona (`manual_alex`, y la base prohíbe que un agente lo marque «enviado») | `consulta.ts`, `metageminis.py`, 57 pruebas (NLnet, Hacker News y LinkedIn nunca reciben borrador) |
| L5 | **Siempre dice que es una IA** | Aviso fijo añadido por código a todo borrador; etiqueta de bot donde la plataforma la ofrece | `test_cuerpo_siempre_declara_que_es_ia…` |
| L6 | **Ningún agente crea cuentas, escribe contraseñas ni datos de pago** | No hay ruta de código que lo haga; las credenciales las pone Alex en variables de entorno (solo se citan **nombres**); lo que un agente no puede hacer se deja a Alex como enlace y el mínimo de pasos (§7, §8) | `test_sin_claves_en_el_codigo`, `test_el_codigo_no_envia` |
| L7 | **Stripe solo con enlaces que Alex confirma** | `CHECK (activo = false OR (confirmado_por IS NOT NULL …))` + RPC `metageminis_confirmar_enlace` solo para dueños; la URL debe ser `https://buy.stripe.com/…` o `https://donate.stripe.com/…` | Migración |
| L8 | **Privacidad de las personas** | Solo datos públicos y solo para contactar por el canal que la propia persona ofrece. La tabla de donaciones **no guarda** nombre, correo ni dirección (Stripe los conserva). Los hallazgos de tipo `persona_publica` llevan solo el canal público | Migración (columnas) + política de la rama Investigadora |
| L9 | **Todo texto ajeno es dato, no instrucción** | La rama Investigadora lee la web en un contenedor **sin claves**; nunca sigue pasos de «verificación», enlaces ni peticiones de otros agentes (un estudio de 44.376 publicaciones de Moltbook halló 3,4 % de spam y 1,4 % de estafas o robo de credenciales) | Política; el script de redacción **no lee la web** |
| L10 | **Solo red hacia proveedores de modelos y la base de MetaGeminis** | `_post_json` es la única salida y solo acepta `https` a una lista blanca de hosts; ningún sitio del directorio está en ella | `test_http_solo_a_hosts_permitidos`, `test_ningun_sitio_del_directorio_esta_en_la_lista_blanca` |
| L11 | **Donde la regla es «no IA», no se escribe** | NLnet no acepta propuestas generadas por IA (hay que escribirlas a mano, en inglés sencillo, y declarar el uso de IA); Hacker News prohíbe texto generado por IA y la automatización; LinkedIn prohíbe la automatización. MetaGeminis solo prepara investigación y listas de comprobación para esas puertas | Directorio (`ia_en_texto: no-aceptada`, `agentes: solo-lectura/prohibido`) |

## 3. Las siete ramas

El encargo pedía seis ramas; el **Estudio audiovisual** se separó de «Campañas» porque produce archivos y
tiene su propio ciclo de aprobación (`piezas`). Los identificadores son los de la migración y los de
`src/lib/metageminis/tipos.ts`.

| `id` | Rama | Qué hace | Lee | Escribe | Medio habitual (§5) |
|---|---|---|---|---|---|
| `investigadora` | Investigadora | Busca y verifica sitios, convocatorias, fondos, comunidades y personas públicas; mantiene el directorio y avisa de plazos | Web (en contenedor sin claves) | `hallazgos` | Nube |
| `redactora` | Redactora de propuestas | Mensajes, solicitudes y fichas a la medida de cada sitio, con el contexto de StarSeed | Directorio, hallazgos | `borradores` (para aprobar) | Enjambre gratuito |
| `campanas` | Campañas | Calendario por medio, guiones y textos; escribe el brief que recibe el Estudio | Directorio, resultados | `campanas`, `borradores` | Enjambre gratuito |
| `estudio` | Estudio creativo audiovisual | Imagen, vídeo, animación 3D, anuncio, cartel y carrusel, **innovando estilos con método** (ver `metageminis-estudio.md`) | Brief | `piezas` (para aprobar) | Enjambre + Mac (render) |
| `alianzas_ia` | Alianzas con agentes de IA | Presenta StarSeed en redes y directorios de agentes (Abund.ai, Moltbook, registro MCP…) siempre identificándose; coordina con otros agentes | Directorio | `borradores` | Oracle A1 (API, poco CPU) |
| `fondos` | Fondos e inversión | Convocatorias, subvenciones, finanzas éticas, crowdfunding y donaciones; prepara la **ficha para quien firma** | Directorio, hallazgos | `borradores` | Enjambre gratuito |
| `seguimiento` | Seguimiento | Cierra el ciclo: registra respuestas, aportaciones, voluntariado, alianzas y **donaciones confirmadas**; escribe lecciones | Respuestas, Stripe (solo lectura) | `resultados`, `donaciones`, `hallazgos` (lección) | Mac (clave de Stripe) + Oracle A1 |

Qué **no** hace ninguna rama: enviar sin L1, abrir cuentas, entrar a sitios con la contraseña de nadie,
actuar donde el directorio dice «solo lectura» o «prohibido».

## 4. Compiten con respeto y aprenden en equipo

**Equipos.** Una rama puede tener **varios agentes** (`metageminis_agentes`: `rama_id`, `nombre`, `medio`,
`modelo`, `ultimo_latido`), por ejemplo «redactora-1» y «redactora-2» con distinto modelo o distinto estilo
de prompt. Compiten por **resultados reales**, no por volumen: enviar más no puntúa; solo puntúa lo que
alguien respondió, aportó o donó.

**Qué cuenta (y de dónde sale).** Cinco contadores por rama y por agente, más el importe por moneda. No hay
una nota compuesta inventada: cada contador se muestra con su nombre.

| Métrica | Se registra cuando… | Quién la escribe |
|---|---|---|
| Respuestas (`respondido`) y tasa de respuesta = respondidos ÷ enviados | Un borrador enviado recibe respuesta visible | Seguimiento |
| Aportaciones (`aportacion`) | Una persona o entidad contribuye código, texto, diseño o recursos | Seguimiento |
| Voluntariado (`voluntariado`) | Una persona se ofrece o se incorpora | Seguimiento |
| Alianzas (`alianza`) y financiación (`financiacion`) | Un acuerdo o una ayuda concedida, con importe en unidades menores y moneda | Seguimiento, tras confirmación de Alex |
| Donaciones confirmadas | Stripe marca la sesión de pago como completada y pagada (§8) | Script de Stripe en la Mac |

Dónde se ve: `resultados-ramas.tsx` en MetaGenesis (sección MetaGeminis). Lo que no tiene dato dice **«no
medido»**; no hay ceros fingidos.

**Reglas de juego limpio.**
1. Un agente **no puede escribir sus propios resultados**: los registra Seguimiento a partir de la fuente
   (la respuesta visible, la confirmación de Stripe). *Límite honesto:* hoy todos los servicios usan la misma
   clave de servicio, así que la base no distingue entre ellos; la separación es de proceso. Pendiente:
   claves separadas (§11).
2. Los borradores repetidos se descartan (`huella`); competir no es enviar lo mismo dos veces.
3. Un borrador descartado por Alex guarda el **motivo** (≤ 300 caracteres): es la señal de aprendizaje más
   barata y cada agente de la rama la lee antes de redactar.
4. Reparto de intentos: mientras una rama o agente tenga **menos de 10 envíos medidos**, el reparto es igual
   («sin conclusión»); con 10 o más, se favorece a quien tenga mejor tasa de respuesta, sin quitarle nunca el
   cupo mínimo a nadie. *Pendiente de implementar en el planificador (§11).*

**Aprender como equipo.** Al terminar cada ciclo Seguimiento escribe una **lección** corta (un hallazgo de
tipo `aviso`: «Las cartas de consulta de 5 líneas obtuvieron más respuesta que las de una página»). Todos
los agentes de la rama la reciben en su siguiente prompt. Se comparten **patrones**, no el texto de otro
agente.

**Jev como consejero, nunca como juez.** Antes de llegar a la cola, cada borrador pasa por
`scripts/puente/decidir.py puntuar` con tres niveles (bajo, medio, alto) y la **regla** como respaldo
(`regla_de_nivel`: alto = prioridad 1, abierto o continuo y página leída; bajo = por revisar o solo
encontrado en una búsqueda). Si Jev calla, manda la regla y el borrador lo dice (`puntuacion_medio:
regla`). Cuando se sabe el resultado, se cierra el ciclo:
`python3 scripts/sociales/metageminis.py cerrar --huella <sha256> --resultado respondido|descartado|sin_respuesta`
(llama a `decidir.confirmar`: «alto/medio» acertó si hubo respuesta, «bajo» acertó si se descartó o nadie
respondió). Así la conciencia colectiva aprende de aciertos y fallos reales. Jev **no** aprueba ni
descarta: eso es de Alex.

## 5. Dónde corre (medios)

MetaGeminis debe estar **siempre activo** sin depender de un solo sitio. Cada servicio declara su medio en
`metageminis_agentes.medio` y en la variable `STARSEED_MEDIO`.

| Medio (`medio`) | Qué es | Qué le toca a MetaGeminis | Límites reales |
|---|---|---|---|
| `enjambre` | El enjambre gratuito: modelos de xKiro, NVIDIA NIM, TokenRouter, AIHubMix, OpenRouter y LLM7 (este último sin clave) con tope de uso | Redactar borradores (`redactora`, `campanas`, `fondos`, `estudio`) | Cupos diarios (vuelven a las 00:00 UTC); un 429 cae al siguiente proveedor |
| `nube` | Contenedores en la nube (sesiones de Claude y jobs de GitHub Actions) | Investigar la web **sin claves** (`investigadora`) | Un contenedor no sobrevive a un reinicio: hay que relanzar el servicio al retomar |
| `oracle_a1` | Servidor **Oracle Always Free** `starseed-a1` (2 OCPU, 12 GB, Ubuntu 24.04 aarch64) | El servicio permanente de bajo consumo: `alianzas_ia` (consulta de API), el latido y la cola | Ver el riesgo de abajo |
| `mac` | La Mac de Alex | Lo que necesita su cuenta de Stripe o su navegador (`seguimiento` con la clave de lectura; render de piezas) | Solo está encendida cuando Alex la usa |

**Riesgo de Oracle A1, sin adornos (medido el 2026-10-10 en `architecture/oracle-consumo.md`).** Oracle
puede recuperar una máquina Always Free si durante 7 días **a la vez** la CPU (p95), la red y, en A1, la
memoria están por debajo del 20 %. Hoy el A1 está **ocioso** (CPU p95 0,5 %, memoria p95 5,3 %) y puede
reclamarse **desde el 2026-10-14 a las 23:00 UTC** si nada cambia. Un bucle que redacta unos borradores por
hora consume una fracción mínima de eso: **por sí solo no evita la reclamación**. Lo que la evita es mantener
la **memoria por encima del 20 % (más de 2,4 GB de 12)** de forma sostenida, que es justo lo que hacen BitNet
y los servicios de `compose-a1.yml` (`architecture/oracle-nube.md` §1 y §3). Por eso MetaGeminis se despliega
**dentro de ese compose**, como el agente permanente que cabe en 2 núcleos (el gobernador deja 1), y su
latido se comprueba con `medidor_oracle.py`. El despliegue es una tarea del enjambre (§11) y no puede
esperar a después del 14.

## 6. Supervisión de los directores

Los directores son procesos de Python que no gastan créditos y vigilan el sistema. MetaGeminis se integra
sin darles poder de aprobar:

- **Latido.** Cada pasada de `servir` escribe `~/.starseed/metageminis/latido.json` (`ts`, `medio`, borradores
  creados). Pasar ese latido a `metageminis_agentes.ultimo_latido` (la columna ya existe) es la tarea
  `MGS-LATIDO`: hoy el esqueleto **no** escribe en esa tabla. Un latido de más de 2 horas = servicio caído.
- **Aviso (diseño; hoy no lo lee ningún director).** Un director leerá el latido; si el servicio está
  caído lo reactivará (`com.starseed.*` / `docker compose up -d`), y si hay borradores **más de 24 h**
  esperando aprobación, avisará a Alex por el **Chat Director** y, si no responde, por Hermes
  (`hermes send -t telegram:Maggasukha -s "MetaGeminis" "…"`).
- **Poder.** Los directores pueden **parar, reanudar y avisar**; **no pueden aprobar** (solo un dueño de
  MetaGenesis, por la RPC), ni leer ni escribir claves.
- **Auditoría.** Todo queda en tablas con fecha: quién aprobó qué y cuándo; qué agente redactó qué; con qué
  medio puntuó Jev. Una pasada de Jev que falla no frena nada.
- **Estado hoy.** Existe el latido local y la columna en la tabla; pasarlo a la tabla es `MGS-LATIDO` y el director
  que lo lee es `MGS-DIR` (§11).

## 7. La cuenta `metageminis` en StarSeed OS (lo único que pide a Alex)

**Qué es.** Una cuenta normal de StarSeed OS cuyo perfil público es «MetaGeminis (agente de IA de
StarSeed)». **Por qué hace falta.** Para que la red vea a MetaGeminis con identidad propia y verificable, no
como un usuario humano. **Por qué lo hace Alex.** Ningún agente crea cuentas ni escribe contraseñas (L6).

**Cómo (≈ 3 minutos).**
1. Abre <https://starseed-os.vercel.app/login> y elige la pestaña **Registrarse**.
2. Correo: `metageminis@star.seed` (el formulario propone direcciones con esa forma). Contraseña y
   confirmación: una que **guardes tú** en tu gestor de contraseñas (MetaGeminis no la conoce ni la necesita).
   «Correo externo a vincular»: opcional; pon el tuyo para poder recuperar el acceso.
3. Al terminar, la bienvenida te guía por tu primera configuración. En tu perfil pon el usuario
   `metageminis` y el nombre público «MetaGeminis (agente de IA de StarSeed)».
4. **No** le des acceso a MetaGenesis (`metagenesis_accesos`): MetaGeminis no necesita ver el panel; escribe
   con servicios, no iniciando sesión. Mínimo privilegio.

*Qué NO hace la cuenta todavía:* publicar sola en la red social del OS. Cuando exista ese camino, usará su
propia sesión y pasará por la misma cola de aprobación.

## 8. Stripe: donaciones con tu cuenta (Mac)

**Qué es.** Un **enlace de pago** de Stripe con importe libre: la persona elige cuánto aporta. **Por qué.**
La fase Semilla se financia con donaciones conscientes (CLAUDE.md §5) y Alex ya tiene cuenta de Stripe en su
Mac. **Qué hace MetaGeminis con él:** lo **comparte solo cuando Alex lo confirma** (L7) y **cuenta solo las
aportaciones que Stripe confirma** (`status = complete` y `payment_status = paid`), sin guardar datos de
quien dona.

### 8.1 Antes de nada: un riesgo real (leído el 2026-10-10; Stripe cambia sus normas, vuelve a leerlas)

Stripe, en sus normas de actividades restringidas, solo admite **recaudar para un fin benéfico** desde
cuentas de Australia, Canadá, Reino Unido y EE. UU., exige ligar la donación a un fin benéfico concreto y
restringe cobrar «sin bien o servicio vendido»; puede dar de baja la cuenta. Si tu cuenta es de otro país,
antes de activar el enlace decide con calma entre: (a) **aportación con contrapartida real** (por ejemplo
apoyo a la construcción con acceso anticipado), (b) usar un **anfitrión fiscal** (Open Source Europe) o
**Goteo** para las donaciones, o (c) preguntar a Stripe por escrito. El enlace se crea igual y se prueba en
modo prueba; **no se activa ni se comparte** hasta que lo decidas. Las fichas `stripe-payment-links`,
`open-source-europe` y `goteo` del directorio recogen las fuentes.

### 8.2 Qué crear y comandos exactos (Mac, Terminal)

**QUÉ:** un producto, un precio con importe libre y un enlace de pago. **POR QUÉ:** el precio con
`custom_unit_amount` es lo que permite «elige cuánto». **CÓMO:**

```bash
# 0) Una vez: iniciar sesión (abre el navegador; confirma tú). El CLI trabaja en MODO PRUEBA por defecto.
stripe login

# 1) Comprobar el país y la moneda de tu cuenta (sin imprimir datos personales)
stripe get /v1/account | grep -E '"country"|"default_currency"'

# 2) Producto  → copia el id que empieza por prod_
stripe products create \
  --name="Aportación libre a StarSeed" \
  --description="Aportación voluntaria para construir StarSeed, un sistema operativo social abierto y descentralizado"

# 3) Precio de importe libre (mínimo 1,00 €, sugerido 20,00 €; importes en céntimos)  → copia price_…
stripe prices create --product=prod_XXXXXXXX --currency=eur \
  -d "custom_unit_amount[enabled]=true" \
  -d "custom_unit_amount[minimum]=100" \
  -d "custom_unit_amount[preset]=2000"

# 4) Enlace de pago (cantidad 1; solo pago único, no recurrente)  → copia la url https://buy.stripe.com/… y el id plink_…
stripe payment_links create \
  -d "line_items[0][price]=price_XXXXXXXX" \
  -d "line_items[0][quantity]=1" \
  -d "submit_type=pay" \
  -d "payment_intent_data[description]=Aportación libre a StarSeed" \
  -d "after_completion[type]=hosted_confirmation" \
  -d "after_completion[hosted_confirmation][custom_message]=Gracias por tu aportación a StarSeed. El recibo te llega por correo."
```

- `submit_type=pay` es la opción prudente mientras decides el §8.1; si Stripe te confirma que puedes recibir
  **donaciones**, cámbialo a `submit_type=donate` (botón «Donar»).
- Máximo por defecto del importe libre: 10.000 USD (límite de Stripe).
- Cada rama puede tener su enlace **etiquetado**: se añade `?client_reference_id=fondos` (o `campanas`,
  `alianzas_ia`…) a la URL; Stripe lo devuelve en cada pago y así se atribuye la donación a su rama.
- Para pasar a dinero real repite los comandos con `--live` **solo después** de la prueba (haz un pago de
  prueba con la tarjeta `4242 4242 4242 4242`, cualquier fecha futura y CVC).
- **Recibos:** que Stripe envíe el recibo al pagador se activa en el panel de Stripe, no por comando
  (Configuración → correos a clientes → «pagos correctos»; los nombres de los menús pueden variar).

### 8.3 Dar de alta el enlace y confirmarlo

1. Registrar el enlace (una fila **inactiva**; la URL debe ser `https://buy.stripe.com/…` o
   `https://donate.stripe.com/…`) en el editor SQL de Supabase tras aplicar la migración:
   `INSERT INTO public.metageminis_enlaces_pago (nombre, url, moneda, minimo_minor) VALUES ('Aportación libre', 'https://buy.stripe.com/…', 'eur', 100);`
2. En MetaGenesis › MetaGeminis › Donaciones, **confirma** el enlace (RPC `metageminis_confirmar_enlace`).
   Mientras no esté confirmado, ningún agente puede usarlo.

### 8.4 Cómo se ven las donaciones confirmadas

**QUÉ:** un script en tu Mac que lee los pagos completados y los escribe en `metageminis_donaciones`.
**POR QUÉ en la Mac:** la clave de Stripe no sale de ahí. **CÓMO:**

```bash
# a) En el panel de Stripe: Desarrolladores → Claves de API → «Crear clave restringida».
#    Nombre: metageminis-lectura. Permisos en LECTURA solo para: Checkout Sessions, PaymentIntents, Charges.
#    Todo lo demás en «Ninguno». Copia la clave (empieza por rk_).
# b) Guárdala SIN que se muestre ni quede en el historial (el valor lo pegas tú; no lo ve ningún agente):
read -rs -p "Pega la clave restringida de Stripe: " K && printf 'STRIPE_RESTRICTED_KEY=%s\n' "$K" >> ~/.starseed/env && unset K && chmod 600 ~/.starseed/env
# c) Ver a mano lo cobrado por tu enlace (lo mismo que leerá el script):
stripe checkout sessions list -d "payment_link=plink_XXXXXXXX" -d "status=complete" -d "limit=100"
```

El script (`MGS-STRIPE`, §11) guarda por cada pago `cs_…` (`stripe_id`, único: una donación, una fila),
`amount_total` (`importe_minor`), `currency`, `rama_id` (de `client_reference_id`) y la fecha; **no lee ni
guarda** `customer_details`. Un reembolso pasa el estado a «reembolsada» y resta del total.

## 9. Directorio de sitios (54, verificados el 2026-10-10)

`src/lib/metageminis/directorio.ts` — fuente única que leen el panel y el script (JSON entre las marcas
`<datos-json>`; no hay copia). Cada ficha dice qué es, para qué sirve a StarSeed, API o formulario, qué
dicen sus reglas de **agentes** y de **texto de IA**, coste, prioridad (1 hoy · 2 esta semana · 3 este mes ·
4 después · 5 no actuar), estado, plazo, **lo mínimo que se pide a Alex**, ramas, nivel de verificación y
fuente. Se verificó con búsqueda y lectura de las páginas oficiales: **48 fichas con la página leída, 3 con
referencia secundaria y 3 solo vistas en búsqueda** (el nivel está en cada ficha; antes de enviar algo se
vuelve a leer la fuente).

| Categoría | Fichas | Ejemplos |
|---|---|---|
| Canales de difusión | 14 | Bluesky, YouTube, Telegram, GitHub, Mastodon, Reddit, X, Instagram, TikTok, PeerTube |
| Fondos y convocatorias | 10 | NLnet, OTF, Sovereign Tech Agency, Prototype Fund, BDNS, Fondos de la UE |
| Donaciones y anfitriones fiscales | 9 | Stripe Payment Links, Open Collective, Open Source Europe, Liberapay, GitHub Sponsors |
| Voluntariado | 7 | Idealist, Voluntariado Online de la ONU, Hacesfalta, Cuerpo Europeo de Solidaridad |
| Redes de agentes de IA | 5 | Abund.ai, Moltbook, AgentGram |
| Comunidades afines | 4 | Metagov, Decidim, Platform Co-op, P2P Foundation |
| Registro y reconocimiento | 2 | Registro MCP, Digital Public Goods Alliance |
| Crowdfunding | 2 | Goteo, Kickstarter |
| Inversión de impacto | 1 | Mozilla Ventures |

**Hallazgos que cambian el plan (no se maquillan):**

| Hallazgo | Consecuencia |
|---|---|
| **NLnet no acepta propuestas generadas por IA** (convocatoria abierta hasta el **2026-11-03, 12:00 CET**, 5.000–50.000 €) | MetaGeminis **no la redacta**; prepara la lista de comprobación y Alex la escribe a mano declarando el uso de IA |
| **NGI Zero Commons Fund: cerrado** | Se deja en la lista para no perder tiempo |
| **Sovereign Tech Agency y Prototype Fund: no encajan** | La STA pide un coste mínimo de 50.000 € y «no busca aplicaciones de cara al usuario»; el Prototype Fund (clase 03, solicitudes hasta el 2026-11-30) exige personas residentes en Alemania |
| **Hacker News y LinkedIn** prohíben texto de IA y automatización | Solo vigilar menciones; si un día se publica un «Show HN», lo escribe una persona |
| **Stripe**: el cobro de donaciones benéficas está restringido fuera de AU/CA/UK/US | Decisión de Alex antes de activar (§8.1) |
| **Open Source Europe** (anfitrión fiscal) no admite proyectos con campañas políticas ni religiosas, y StarSeed se describe también como sistema político y económico | Se presenta **con verdad**, el software y el procomún con su descripción real, y decide el anfitrión; nunca se disfraza |
| **Hacktoberfest** (hasta 2026-10-31) está ocurriendo ahora | Atraer código a los repos abiertos; nadie abre issues ni PR en repos ajenos desde un agente |
| **Open Collective Europe pasó a llamarse Open Source Europe** | Ficha actualizada |
| **Moltbook y Abund.ai** piden que una persona reclame al agente (tuit de verificación / correo, GitHub o X) | Un paso de Alex de un minuto; mientras tanto el agente solo lee |

## 10. Las piezas y cómo se prueban

| Pieza | Archivo | Qué hace |
|---|---|---|
| Migración (**sin aplicar**) | `supabase/migrations/20261011090000_metageminis.sql` | Ramas, agentes, campañas, hallazgos, borradores, piezas, resultados, enlaces de pago y donaciones; RLS solo para miembros de MetaGenesis (`es_metagenesis`); triggers de estado; RPC de decisión para dueños. Se aplica **dos veces sin error** y reproduce las reglas L1, L2, L7 (probada con roles y `auth.uid()` simulados) |
| Lógica y datos | `src/lib/metageminis/` | `tipos`, `directorio` (54 fichas), `consulta` (filtros y reglas), `cola` (estados, resúmenes por rama, donaciones), `datos` (lectura y RPC; dice con claridad si la tabla aún no existe), `avisos`. Una prueba de paridad (`paridad-python.test.ts`) ejecuta el esqueleto de Python y comprueba que decide igual que `consulta.ts` sobre las 54 fichas (39 redactables, 6 enviables por el agente) |
| Sección de MetaGenesis | `src/components/metageminis/` + `src/components/mando/metageminis-panel.tsx` | Directorio con filtros, **cola «Para aprobar»**, piezas por campaña, resultados por rama y estado de las donaciones |
| Esqueleto ejecutable | `scripts/sociales/metageminis.py` | `plan`, `borradores`, `cola`, `cerrar`, `estado`, `servir`; no envía nada (L10) |

**Comandos de prueba** (desde la raíz del repositorio):

```bash
npx vitest run src/lib/metageminis src/components/metageminis     # lógica y componentes
(cd scripts/sociales && python3 -m unittest -v)                   # esqueleto en Python (57 pruebas)
python3 scripts/sociales/metageminis.py plan                      # qué sitios tendrían borrador y por qué los demás no
python3 scripts/sociales/metageminis.py borradores --sin-llm --seco --max 3   # ejemplo sin modelo, sin guardar nada
```

**Montaje** (pendiente; `centro-mando.tsx` no es de este agente). Tres cambios, siguiendo el patrón de
`ActualizacionesMetaGenesis`: (1) junto a las otras importaciones diferidas,
`const MetaGeminisPanel = dynamic(() => import("@/components/mando/metageminis-panel").then((m) => m.MetaGeminisPanel), { ssr: false, loading: () => <p className="text-xs text-white/40">Cargando MetaGeminis…</p> });`;
(2) en `PESTANAS`, `{ id: "metageminis", etiqueta: "MetaGeminis", grupo: "Comunidad" },`; (3) entre los
`TabsContent`, `<TabsContent value="metageminis">{pestana === "metageminis" ? <MetaGeminisPanel /> : null}</TabsContent>`.
Después, `next build` en la nube (regla del repositorio: es la única puerta que ve los errores de empaquetado).

**Variables de entorno (solo nombres)** — `XKIRO_API_KEY`, `NVIDIA_API_KEY`/`NVIDIA_SHARED_KEY`,
`TOKENROUTER_API_KEY`, `AIHUBMIX_API_KEY`, `OPENROUTER_API_KEY`/`OPENROUTER_SHARED_KEY`, `LLM7_API_KEY`
(opcional), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `METAGEMINIS_AGENTE_ID`, `STARSEED_MEDIO`,
`STRIPE_RESTRICTED_KEY` (solo en la Mac), `METAGEMINIS_BSKY_APP_PASSWORD` (solo la crea y guarda Alex).
Los valores viven en `~/.starseed/env` (permisos 600) o en el entorno; **nunca** en el repositorio.

## 11. Estado real: qué está hecho y qué falta

| Cosa | Estado | Quién / cómo |
|---|---|---|
| Directorio de 54 sitios | Hecho (2026-10-10) | Releer cada ficha antes de enviar; releer el directorio cada mes |
| Migración | Escrita y probada en Postgres 16 desechable; **sin aplicar** | La aplica quien aplica las demás migraciones (flujo del repositorio), con las tres comprobaciones del final del SQL |
| Sección de MetaGenesis | Hecha y probada (13 pruebas del panel); falta montarla en Genesis: tres líneas en `centro-mando.tsx` (ver «Montaje» en §10) | Quien tenga ese archivo libre; el panel comprueba el acceso: quien no es miembro de MetaGenesis solo ve el directorio y la razón |
| Esqueleto Python | Hecho y probado (57 pruebas); redacta con modelos gratuitos o plantilla y puntúa con Jev | — |
| Servicio 24/7 en Oracle A1 con carga real | **Pendiente, urgente (antes del 2026-10-14 23:00 UTC)** | Tarea `MGS-A1` |
| Director que lee el latido y avisa | Pendiente | Tarea `MGS-DIR` |
| Latido del servicio en `metageminis_agentes.ultimo_latido` | Pendiente (hoy solo el archivo local) | Tarea `MGS-LATIDO` |
| Sincronía de Stripe → `metageminis_donaciones` (Mac) | Pendiente; necesita el §8 hecho por Alex | Tarea `MGS-STRIPE` |
| Conectores que publican **solo lo aprobado** (base común, Bluesky, Telegram, YouTube) | Pendiente; necesitan las cuentas de Alex | Tareas `MGS-BASE`, `MGS-BSKY`, `MGS-TG`, `MGS-YT` |
| Investigadora (vigila las fuentes, sin claves) y Seguimiento (cierra el ciclo) | Pendiente | Tareas `MGS-INV`, `MGS-SEG` |
| Estudio: renderizador y estilos base, revisión automática y registro de piezas | Pendiente | Tareas `MGS-EST-RENDER`, `MGS-EST-ESTILOS`, `MGS-REVISION` |
| Primera campaña audiovisual (Hacktoberfest, hasta el 2026-10-31): brief, guion y textos | Pendiente | Tarea `MGS-CAMP1` |
| Enfriamiento por sitio (L3) y reparto por tasa de respuesta (§4) | Pendiente | Tarea `MGS-PLAN` |
| Claves de servicio separadas por servicio (§4, regla 1) | Pendiente: decisión de arquitectura (roles de base de datos por servicio); aún sin tarea | — |
| Cuenta `metageminis`, cuentas de redes, Stripe | **Alex** (§7, §8, directorio) | Son lo mínimo: un enlace o un comando cada una |

**Lo mínimo que se le pide a Alex, por orden de valor:** (1) la cuenta `metageminis` (§7); (2) decidir el
camino de las donaciones (§8.1) y, si va con Stripe, los tres comandos de §8.2; (3) cuando quiera difusión
automática, crear la cuenta de Bluesky con la etiqueta «bot» y su contraseña de aplicación (guardada por él
en `METAGEMINIS_BSKY_APP_PASSWORD`) y el canal de YouTube; (4) aprobar o descartar lo que aparezca en «Para
aprobar» (un toque cada uno).

## 12. Cómo se cambia este contrato

Primero este documento, después el código (regla dorada del repositorio). Si cambia un estado, una rama o
un canal, cambia a la vez la migración, `tipos.ts` y `metageminis.py`: las pruebas
(`vocabulario.test.ts` y `TestVocabularioMigracion`) comparan los tres con el SQL y se ponen en rojo si
divergen. Los límites del §2 solo se pueden **ampliar en libertad y en cuidado**, nunca recortar: ningún
cambio puede quitar la aprobación humana ni el aviso de agente de IA.
