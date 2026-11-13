# MetaGenesis autónoma · sin Claude y sin esta Mac (IND1029)

**Alex (2026-10-29), con el 3 % del crédito semanal de Claude:** «enruta los procesos activos de dirección que usen
Claude a Hermes… usaremos el chat principal como canal del chat del director de toda la dirección general de
MetaGenesis, completamente vinculado con todas las herramientas, conectores, memorias y contextos, incluyendo los
accesos y permisos de dirección… y mejora la independencia de MetaGenesis con o sin esta computadora… Hermes lo
usemos como la herramienta para conectar, sincronizar y vincularlo con el Puente de Mando, pero que no sea
dependiente. El autodesarrollo y las tareas de MetaGenesis y sus contenedores activos, con los accesos y permisos
de publicación, deben ser independientes, autogestionados en los servidores disponibles inteligentemente, con los
mismos datos de los medidores desde cualquier neurona de la cuenta y desde cualquier dispositivo (automeshrouting).»

## 1. Hecho el 29-10 (DIR1029A, `6c5cfe389`)

- **La dirección va por Hermes:**
  - interruptor `~/.starseed/direccion-motor.json` (`{"motor": "hermes", "sesion": <id>}`) o `STARSEED_DIRECCION_MOTOR`;
  - el cartero contesta por Hermes lo que va a `claude-mac` o `claude-cowork`, en la sesión «Dirección MetaGenesis»;
  - `opus_director.consultar` pregunta a Hermes;
  - el chat del director arranca en `hermes/predeterminado`.
- **Hermes:**
  - modelo `freellmapi/auto` con las 10 pasarelas de respaldo de `enrutar-hermes.py`: el mismo autoenrutado y las
    mismas APIs que MetaGenesis;
  - MCP `starseed-director` (chat del director y producción), más Vercel y Supabase.
- **Reparado:** la app de Hermes se quedó en la página de recuperación tras actualizarse sola. Corría el paquete
  viejo mientras se reemplazaba el nuevo; se reinició.

## 2. La regla

- Ningún proceso de dirección necesita Claude, ni la Mac, ni Hermes para seguir.
- Hermes es el puente (chat, Telegram, herramientas), no el motor.
- La dirección (orquestador, autocuración, autopublicación, autodesarrollo, cartero y reconstructor) corre donde
  haya un **líder** de la cuenta:
  - el A1 siempre encendido;
  - la Mac cuando está;
  - cualquier neurona capaz.
- Todos leen y escriben el **mismo estado**.

## 3. Piezas

| Pieza | Qué hace |
|---|---|
| **Líder de dirección** | Un arriendo con caducidad (3 min) en la puerta de datos del A1. Solo el líder lanza, publica y decide; los demás miran. Si nadie lo renueva, lo toma la neurona siguiente por prioridad (A1 › Mac › otras). Sin puerta, cada uno sigue en local como hoy |
| **Estado compartido** | `progreso.json`, las colas, el chat del director y una foto de los medidores, cada minuto en la puerta (los escribe el líder). Genesis, en cualquier dispositivo, lee de la puerta cuando lo local es viejo o no existe |
| **Dirección en el A1** | `oracle_nodo direccion --aplicar` instala en el A1 (systemd, `# requiere:`) el orquestador, la autocuración, la autopublicación, el cartero y el gateway de Hermes. Las claves vienen de la bóveda del A1, nunca del repo |
| **Builds sin la Mac** | El CI sube el `.next` como artefacto, y el reconstructor de la Mac lo descarga en vez de compilar (hoy Genesis se quedó sin build: la Mac no puede compilar) |
| **Publicación autónoma** | La autopublicación corre en el líder, con un token de despliegue con permisos mínimos que crea Alex (paso único suyo, con enlace y comando) |
| **Genesis desde cualquier dispositivo** | La Genesis publicada lee los medidores de la cuenta desde la puerta, con la sesión de la cuenta y solo para su dueño (o quien la cuenta autorice) |
| **Automeshrouting** | Cada neurona anuncia lo que puede (CPU, RAM, GPU, red), y el líder reparte trabajadores y servicios entre neuronas, contenedores y nube por capacidad y coste (con `buscar_capacidad` y la colmena) |

## 4. Lo que NO se hace

- Mover claves a terceros o al repo: cada servidor usa su bóveda.
- Dos líderes a la vez: la escritura con el arriendo es atómica.
- Publicar sin las puertas de siempre (detector, pruebas del puente, CI y verificación).
- Abrir la Genesis publicada a quien no sea el dueño de la cuenta.

## 5. Ola IND1029 (≤ 3 archivos y ≤ 120 líneas por archivo y tarea)

Cola: `starseed_memory_root/olas/cola-metagenesis-autonoma-1029.json`.

| Tarea | Qué |
|---|---|
| A | artefacto `.next` en el CI y el reconstructor lo descarga |
| B | líder de dirección (arriendo en la puerta) |
| C | los servicios de dirección solo actúan si son líderes |
| D | dirección en el A1 (unidades systemd y `oracle_nodo direccion`) |
| E | estado compartido en la puerta |
| F | la API de medidores lee de la puerta cuando lo local falta |
| G | Hermes y Telegram en el líder |
| H | chat del director compartido entre neuronas |
| I | token de despliegue: acción «Te toca a ti» con enlace y comando |

## 6. El sueño del BitNet de la Mac y el carril del A1 (1031 · 2026-10-31)

El 31-10 la Mac (8 GB) quedó con < 1 GB libre y la swap al 95 %: `llama-server` congelado
horas reteniendo ~1,1 GB de RAM fija (mlock), el enjambre parado por memoria y Google Drive
sin responder. El guardia ya reanuda un motor congelado sin enjambre (7192b966e), pero
congelar no devuelve la RAM: solo dormirla la suelta.

### 6.1 El guardia pide dormir (HECHO en el repo, `scripts/puente/guardia-memoria.py`)

Con falta de memoria (medida bajo `STARSEED_CONGELAR_MB` o presión del kernel ≥ 2) y SIN
conversación en curso (la concesión de voz manda: `prioridad_conversacion`), antes del
congelar el guardia pide al gestor de Astraura que duerma su BitNet local:

```
POST {STARSEED_ASTRAURA_URL | http://127.0.0.1:8000}/api/bitnet/dormir
cuerpo {"min_inactivo_s": 60}
→ 200 {"dormido": bool, "ya_estaba"?: bool, "mb_liberados"?: number}
```

- Es el MISMO endpoint que «Aliviar memoria» de Genesis y `revisor_bloqueadas` ya usan: el
  gestor solo duerme si el motor lleva ese rato sin servicio.
- `dormido: true` ⇒ `llama-server` no queda sirviendo con el modelo cargado (con mlock,
  congelar retiene la RAM; dormida se libera). Desperta solo con el próximo mensaje y
  `availability.ts` ya lo entiende («BitNet dormido: despertará al primer mensaje»).
- `sin_tocar_al_dormido`: en el ciclo del pedido, ni SIGSTOP ni SIGKILL a ese motor (el
  gestor está descargando o recolocando el modelo); descongelarle sigue valiendo. Si el
  gestor no contesta, el congelar de siempre se mantiene como antes.
- Cooldown por INTENTO (éxito o fallo): `STARSEED_SUENO_CADA_MIN` (defecto 10). El reanudar
  a los 15 min sin enjambre (`STARSEED_REANUDAR_SIN_ENJAMBRE_MIN`) no cambia.
- Pruebas: `python3 -m pytest -q scripts/puente/test_guardia_memoria.py` (30/30).

### 6.2 El router de capas usa el BitNet del A1 (CONTRATO — fuera de esta ola)

Cuando el BitNet de la Mac duerme (o no está), la capa de capas de conciencia de la Mac
(`src/ai/astraura/*`) debe dirigirse al nodo del A1, que ya lo sirve permanente y gratis:

- **Servicio:** `starseed-bitnet.service` (systemd) — `llama-server` OpenAI-compatible,
  `/v1/chat/completions`, `/v1/models` y salud en `/health`, publicado por Caddy en
  `https://bitnet.<host-del-A1>` (DNS sslip.io). **Nunca la IP del A1 en el repo, ni en
  documentos, ni en registros ni en el bus.**
- **Clave:** `Authorization: Bearer` con el valor de la variable
  `STARSEED_ORACLE_BITNET_KEY` — solo el NOMBRE en código y documentos; el valor vive en
  `~/.starseed/env` (Mac) y `/etc/starseed/bitnet.key` (A1). El Caddyfile no lleva la clave
  ni su bandera (test `test_genesis_a1`).
- **Conexión propuesta** (tarea aparte, esta queda con la parte del guardia): fuente nueva
  `astraura-158-a1` en `free-catalog.ts` con la clave por `{env:STARSEED_ORACLE_BITNET_KEY}`,
  tier `nube`; la disponibilidad sondea `GET /v1/models` con la clave y **sin registrar
  nunca el valor**; el router de capas la coloca tras la capa local y antes del resto de la
  nube (gratis-primero, sin coste: es el A1 ya pagado con su Free Tier). `capas-conciencia`
  la apaga con el maestro; sin clave o sin URL declarada, la fuente no entra en la lista y
  no se sondea nada.
- **URL por entorno** (nunca hardcode): `STARSEED_ORACLE_BITNET_URL` en `~/.starseed/env`
  de la Mac; ante 429/402/errores, relevo a la cadena del sistema sin insistir.

## 7. De dónde leen los medidores lo que corre ahora (MED1111E · 2026-11-11)

**Alex (2026-11-11):** «reporta los procesos activos, ya que en MetaGenesis siguen sin aparecer, que ya te lo había
pedido, los medidores». Durante seis horas un director de Claude repartió cuatro agentes y corrió cuatro puertas de
integración, y Genesis marcó cero procesos: leía el enjambre, las nubes y el A1, pero no los dos sitios donde vive ese
trabajo. Ahora los lee, y la regla de siempre manda («basta de ilusiones»): algo es un proceso vivo solo mientras haya
rastro reciente de que lo está.

### 7.1 Las fuentes de «Agentes» y de «Qué corre ahora»

| Fuente | Dónde está | Qué cuenta | Módulo |
|---|---|---|---|
| Enjambre de la Mac, nubes, Cloudroom, A1 | latidos del bus, `alta-capacidad-nube.json`, `cloudroom-hilos.json`, ciclo del nodo | agentes por tarea (sin cambios) | `agentes-*.ts`, `medidores.ts` |
| **Carril de Claude** | `starseed_memory_root/olas/carril-claude/registro.json` (lo escribe `relevo_carril_claude.py`) | cada tarea `en_curso` es un agente **solo si el latido del carril tiene ≤ 45 min** (el mismo umbral con que Python lo da por muerto y relevo); con el latido viejo se enseña «sin latido desde hace N min» y no cuenta; las `pendiente` son cola, nunca agentes | `carril-claude.ts` |
| **Puerta de integración** | `~/.starseed/produccion/puerta-estado.json` y, de respaldo, el `~/.starseed/opus1031/aplicar-*.log` más nuevo | ramas, paso (esperando, integrando, pruebas, tipos, final, terminado), minutos en el paso, resultado con cuentas o el primer fallo; «en curso» sin rastro en 40 min = «sin señal», no «corriendo» | `puerta-integracion.ts`, `en-marcha-disco.ts` |
| Publicación | `autopublicar-estado.json` | fase `ci`/`verificando` = publicando (sin novedad en 90 min = sin señal) | `en-marcha.ts` |

`en-marcha.ts` junta las tres en un solo lugar y **en este orden** (carril, puerta, publicación). Sin nada corriendo
dice «No corre nada ahora» y nombra lo último que terminó y cuándo. Se ve en `EnMarchaAhora`
(`src/components/mando/en-marcha-ahora.tsx`): arriba del panel de procesos y arriba de los medidores «Agentes» y
«En curso». `GET /api/mando/medidores` lo devuelve como `enMarcha` (nivel superior, junto a `detalle`).

### 7.2 El estado de la puerta (el script del supervisor lo escribe en cada paso)
`scripts/puente/puerta_estado.py` (`iniciar`, `paso`, `pruebas`, `cerrar`; también por línea de órdenes). Campos de
`puerta-estado.json`: `nombre`, `ramas`, `base`, `paso`, `inicio`, `actualizado` (cuándo empezó el paso actual),
`fin`, `resultado` (`en_curso`, `verde`, `rojo`), `pruebas` {`archivos`, `pruebas`, `falladas`, `omitidas`}, `fallo`
(una frase sin rutas). Nunca lanza: si no puede escribir devuelve `False` y la puerta sigue. El lector es tolerante:
sin el archivo cae al log, que cubre la puerta que ya corre.
`relevo_carril_claude.py cerrar` anota ahora `cerrada` en la tarea para que Genesis diga cuándo terminó lo último.

### 7.3 A otras neuronas
La foto de medidores que el líder copia a la puerta (`espejo_puerta.py · resumen_medidores`) lleva `en_marcha`; la
Genesis de otra neurona lo lee con `parsearFoto` y lo pinta igual. Viaja **solo** ids de tarea y de rama, títulos
(recortados a 160 caracteres), estados, cuentas y tiempos. **Nunca** el `prompt` de una tarea, sus `archivos`, ninguna
ruta absoluta (se tachan como `[ruta]`) ni claves: lista blanca de campos en Python y en TypeScript, con pruebas en
ambos lados.

### 7.4 Lo que no hace
No toca el script de la puerta (es del supervisor y vive fuera del repo); no escribe en `~/.starseed/produccion/`
más que `puerta-estado.json` y solo desde el script de la puerta; no cuenta como agente nada que no tenga latido.

## 8. Procesos de la dirección: ver sin relevar (MED1113A · 2026-11-13)

**Alex (2026-11-12, noche):** «en metagenesis no aparecen todos los procesos y agentes activos en los medidores
aparecen en 0 cuando hay varios procesos activos». Unos quince agentes de Claude de la dirección trabajaron horas,
cada uno en `~/Documents/starseed-opus/OPUS1106-<ID>`, y corrieron puertas de integración; «Agentes», «En curso» y
«Ola activa» decían 0.

### 8.1 Por qué daba 0 (el fallo de diseño)
El carril de Claude (§7) era la única vía para que Genesis viera un agente de la dirección, y el carril **releva**:
con el latido de más de 45 min, `relevo_carril_claude.py revisar` entrega lo abierto al enjambre gratuito. Ese relevo
rehízo dos veces trabajo terminado (y dejó commits que hubo que quitar), así que la dirección dejó de anotar a sus
agentes y desaparecieron de los medidores. **Ver y relevar iban atados.** Las otras vías tampoco servían: los latidos
externos (`latido_externo.py`) son declarados (`hasta`) y nadie los escribía; los latidos del enjambre, las nubes,
Cloudroom y el A1 no ven un agente de Claude en su árbol.

### 8.2 El contrato
- **Ficha**: `~/.starseed/direccion/procesos/<ID>.json` (una por proceso, escrita de forma atómica): `id`, `titulo`,
  `modelo`, `tipo` (`agente` · `puerta` · `servicio`), `arbol`, `rama`, `desde`, `latido`, `fase`, `cerrado`,
  `cierre` (`hecho` · `cancelado`), `relevable`. Nunca un prompt, una clave ni una dirección.
- **Vida medida, no declarada** (`scripts/puente/procesos_direccion.py`): la señal más reciente entre su `latido`, su
  apertura, `logs/HEAD` del gitdir de su árbol (commits, rebases), los archivos cambiados o nuevos de su árbol
  (`git --no-optional-locks status`, sin tocar el índice: el `index` NO cuenta, cualquier `git status` ajeno lo
  reescribe) y su carpeta de trabajo (`~/.starseed/opus1031/<ID>-informe.md`, `~/.starseed/opus1031/<id>/`).
  - **activo**: alguna señal en los últimos **30 min** (`VIDA_MIN` en Python = `VIDA_DIRECCION_MIN` en TypeScript; una
    prueba de vitest compara los dos);
  - **en silencio desde <hora>**: abierto y sin señal; no cuenta como activo y no desaparece: se nombra con su hora;
  - **terminado**: su marcador `~/.starseed/opus1031/<ID>.listo` o `cerrar`; se enseña 12 h como «terminado hace poco».
- **Relevo solo si se pide**: `abrir … --relevable --prompt ARCHIVO` es lo único que anota el proceso en el carril de
  Claude (y entonces su `latido` mantiene vivo el carril y `cerrar` lo cierra allí). Sin esa marca, ningún proceso de
  la dirección llega al enjambre. Un despliegue o un arreglo del motor de llamadas no se abre nunca así.
- **Puertas de integración**: salen solas de `puerta-estado.json` (§7.2) y se pintan dentro de «Procesos de la
  dirección» mientras corren; cuentan una vez (como la puerta de §7).

### 8.3 Órdenes (una línea)
```
python3 scripts/puente/procesos_direccion.py abrir <ID> "<título>" --modelo claude-opus-5-5   # al lanzar (árbol y rama se deducen de OPUS1106-<ID>)
python3 scripts/puente/procesos_direccion.py latido <ID> [--fase "esperando la puerta"]        # opcional: el árbol ya late solo
python3 scripts/puente/procesos_direccion.py cerrar <ID> [--cancelar]                          # o `touch ~/.starseed/opus1031/<ID>.listo`
python3 scripts/puente/procesos_direccion.py estado [--json] [--todos]
python3 scripts/puente/procesos_direccion.py descubrir --horas 12 [--aplicar]                  # relleno: árboles OPUS1106-* con señal
```

### 8.4 Una sola fuente para pastilla, ventana y comprobación
- `GET /api/mando/medidores` llama a `procesos_direccion.py estado --json` en cada reunión (`procesos-direccion-disco.ts`),
  lo pasa por la lista blanca (`leerEstadoDireccion`) y lo devuelve en `enMarcha.direccion` (siempre presente:
  `null` = el script no contestó, y se dice; ausente = lectura antigua u otra neurona).
- Los **activos** de tipo `agente` entran en los latidos con `donde: "direccion"` (`agentesDeDireccion`): salen en
  «Agentes» (estado «trabajando», con la fuente y la edad de su señal, su árbol y su rama) y en «En curso». Los «en
  silencio» van en el aviso de «Agentes» con su hora. Un proceso también anotado en el carril o con latido externo
  cuenta una vez.
- `DetalleMedidor.cuenta` (solo «Agentes» y «En curso») es **la cifra de la pastilla** (`cifraDePastilla`), la de la
  ventana («N en total» / «N en marcha») y la que coteja «Comprobar ahora» (`comprobar_medidor.agentes_que_dice`).
  «En curso» ya no suma a la pastilla las rancias ni los sueños sin agente: siguen en la ventana con su porqué.
- «Comprobar ahora» (`comprobar_medidor.py`) coteja las filas de la dirección con `procesos_direccion.estado()` medido
  en ese momento: si sobra o falta uno, «NO COINCIDEN» con sus ids. Con el medidor en 0 y agentes medidos, también.
- «Qué corre ahora» (`EnMarchaAhora`) abre con «Procesos de la dirección»: activos (id, título, modelo, árbol, rama,
  desde cuándo y la señal), la puerta en marcha, los en silencio y los terminados hace poco; `vivos` los suma.
- «Ola activa» vacía ya no sugiere que nada trabaja: nombra los agentes de la dirección fuera de las olas.

### 8.5 Lo que todavía no se mide
- Si un agente de Claude escribe o espera en este instante: su sesión vive en la app de Claude y no deja proceso
  atribuible en la Mac; se mide su rastro en disco, no su pensamiento.
- Los tokens de la dirección («Tokens» no tiene contador para ellos).
- Otras neuronas: `espejo_puerta.py · resumen_medidores` aún no copia `en_marcha.direccion` (lista blanca de Python
  por ampliar); `sanearEnMarcha` ya lo acepta.
- La pestaña Director, la Oficina y el panel de procesos que leen `/api/mando/estado` siguen sin ver a la dirección.
