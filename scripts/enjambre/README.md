# scripts/enjambre · orquestador multiagéntico versionado (Ola 259, 2026-09-06)

Aquí vive, **versionado en el repo**, el motor que ejecuta las olas del enjambre:

- **`starseed-enjambre.py`** — orquestador paralelo (Python 3 puro, ~1750 líneas, N trabajadores
  en `git worktree` propios, puertas por tarea: tsc → reparación → vitest → revisión cruzada por
  otro proveedor → commit → integración ff en main). Escritores: opencode con xKiro/NIM gratis;
  revisores: OpenRouter/NIM/Gemini. Gratis primero, relevo ante 429/402.
- **`lanzador.py`** — vigilante de la nube: recoge órdenes firmadas (HMAC) del bus y arranca colas
  en el contenedor. Solo se instala en Linux.
- **`instalar.sh`** — instala (repo → máquina), `--comprobar` (compara md5, sale 1 si difieren e
  indica cuál es más nueva por mtime) y `--traer` (máquina → repo, para versionar cambios en
  caliente). Sin sudo; copia con `cp -p`, nunca enlaces (se ejecuta con `setsid -f` desde rutas
  fijas).

Destinos: Mac → `~/.local/bin/starseed-enjambre.py` · Linux → `~/bin/starseed-enjambre.py` +
`~/starseed-vigia/lanzador.py`. Deben ser **byte a byte** iguales a lo que hay aquí (el test que
verifica md5 vive en la raíz del repo).

## Lanzar una cola

```bash
export STARSEED_MEDIO=claude
setsid -f python3 -u ~/.local/bin/starseed-enjambre.py \
  starseed_memory_root/olas/cola-<n>.json --workers 2 \
  > /tmp/ola-<n>.log 2>&1 < /dev/null
```

Estado y trazas: `starseed_memory_root/olas/{progreso.json,progreso.md,eventos.jsonl,logs/<id>.log}`.

## Variables de entorno

- `STARSEED_ROOT` — raíz del repo (si no, la adivina: Mac `~/Documents/starseed-os-main`, nube
  `~/starseed-system`).
- `STARSEED_WT` — carpeta base de los worktrees.
- `STARSEED_MEDIO` — quién lanza (`claude`, `hermes`, `mando`, `cron`…); viaja en los eventos.
- `STARSEED_APROBACION=1` — nodo humano: integra solo tras tu visto bueno (rama `ola/<id>` lista).

## Puerta de alcance (Ola 259, E2)

Al terminar la escritura, `alcance_tarea` compara los `archivos` pedidos por la cola con lo
tocado de verdad en el worktree (diff sobre `main` + cambios sin commit). Si falta alguno se
hace **una pasada de compleción** con el mismo modelo (fase `completando`, pintada como
«escribiendo» en el Mando), repitiéndole el enunciado y permitiéndole justificar `SIN TOCAR
<ruta>: <motivo>`. Si aun así siguen faltando, se registra el paso `alcance`, se emite el
aviso «TAREA INCOMPLETA» y el revisor recibe el bloque ALCANCE: si el enunciado exigía esos
cambios, debe marcarlo BLOQUEANTE. Nació el 2026-09-06, tras dos tareas integradas a medias
(V8/255 y N2/258) sin que nadie lo notara. Prueba: `python3 -m pytest -q scripts/enjambre/test_alcance.py`.

## Revisores con memoria (Ola 261, 2026-09-06)

Antes, cada revisión intentaba TODOS los `REVISORES` en orden aunque supiera que estaban caídos:
xkiro respondía 429 todo el día, aihubmix su aviso de cuota y tokenrouter quemaba timeouts —
5-12 min perdidos por tarea. Ahora el archivo de salud (`~/.starseed/salud-proveedores.json`)
también memoriza cupo: `marcar_sin_cupo(prov, motivo, horas=24)` se dispara con avisos de cuota
en la respuesta, HTTP 402 o mensajes de «quota»/«daily limit»; un 429 NO apaga (es temporal),
solo guarda `ultimo_429` y el proveedor queda «enfriándose» 10 min (`enfriandose()`).
`candidatos_revision()` filtra caídos/sin cupo/enfriándose y pone primero el último que respondió
con éxito (`REVISOR_ULTIMO_OK`, también persistido como `ultimo_revisor_ok`); si todos quedan
excluidos se vuelve a la lista completa — nunca sin revisor. Los saltados dejan un único evento
`aviso` por revisión y no cuentan como intento en el paso `revision` (que anota revisor, segundos
e intentos). Prueba: `python3 -m pytest -q scripts/enjambre/test_revisores.py`.

## Bloqueos y visto bueno (Ola 261, P4)

Un bloqueo confirmado por segunda opinión (`confirmar_bloqueo`) o un alcance que sigue
incompleto tras la pasada de compleción **ya no se integran en main**: la rama `ola/<id>` queda
lista y la tarea entra en el flujo de visto bueno humano (`esperando_aprobacion` con campo
extra `motivo`, a la espera de `aprobar`/`rechazar` como con `--aprobacion`); sin decisión,
`pendiente_aprobacion` con la rama conservada. La bandera `--integrar-bloqueantes` recupera el
comportamiento antiguo y se anota en la nota del commit; el evento de integración es siempre
`commit` (nunca «bloqueante» sobre código ya dentro de main). La decisión vive en la función
pura `debe_pedir_visto_bueno`. Prueba: `python3 -m pytest -q scripts/enjambre/test_bloqueo.py`.

## Puertas según el tipo de repo

Si la raíz **no** tiene `tsconfig.json`, el orquestador lo trata como repo Python: compila con
`python3 -m py_compile` y corre `pytest` en vez de tsc/vitest (ver `repo_es_python`).

## Límites

En la nube el techo es **2 trabajadores** (`--workers 2`): más saturan el contenedor.

## Claves

**Nunca en el repo ni en memorias** (solo nombres de variable). Viven en `~/.starseed/env`
(chmod 600) y `~/.hermes/.env`.

## Claves por medio (Ola 271, P9 · 2026-09-07)

Pedido de Alex: si se agotan los recursos de un proveedor, el orquestador **tira de otra
clave del MISMO proveedor de otro medio** antes de darlo por caído. Cada proveedor puede
tener varias claves repartidas entre los archivos de entorno (`.env.local` del repo,
`~/.hermes/.env`, `~/.starseed/env` y los `.env.local` de la Mac y la nube), con sufijos
`NOMBRE`, `NOMBRE_2` … `NOMBRE_9`; cada archivo se lee por separado (ya no se pisan) y los
valores repetidos se deduplican. Cuando una clave recibe 402, un aviso de cuota o tres 429
en 10 min, `agotar_clave` la marca en `~/.starseed/salud-proveedores.json`
(`claves_agotadas[huella]`) y se salta a la siguiente; solo cuando TODAS están agotadas se
llama a `marcar_sin_cupo`. Los **valores solo viven en los archivos de entorno (chmod
600)**: en logs, eventos, JSON y el Mando aparecen únicamente el nombre de la variable, el
medio y una huella sha256 corta (`estado_claves`, escrito bajo `claves` en cada sondeo).
Pruebas: `test_claves.py`.

## Regla de Alex

Todo lo ejecuta el enjambre; Claude **diseña, supervisa y verifica** — no edita a mano lo que una
ola puede escribir.

## Un solo tsc (Ola 261, P6b · 2026-09-07)

Tres `tsc` simultáneos tumbaron el contenedor (6,4 GB, load 21), así que en TODA la máquina
los pasa pesados comparten un único turno: el cerrojo-directorio `~/.starseed/cerrojos/pesado.lock`.
Los agentes ya no ejecutan `npx tsc` suelto: el contexto de cada tarea manda usar
`bash scripts/enjambre/tsc-turno.sh`, que toma el MISMO cerrojo que la puerta del orquestador
(`cerrojo("pesado")` → `cerrojo_pesado`, mkdir atómico con `dueno` pid+epoch, liberado siempre
por trap/finally, huérfanos —pid muerto o > 30 min— limpiados solos). El script cachea la
pasada en verde por hash de contenidos (`git ls-files -co`: incluye archivos sin `git add`,
arreglo del falso «sin cambios») en `~/.starseed/cerrojos/tsc-cache-<repo>`, fuera del árbol.
El vigilante mata además los `node …/bin/tsc` huérfanos cada 60 s. Pruebas: `test_cerrojo.py`.

## Retiros y dependencias (Ola 261, P7 · 2026-09-07)

Un modelo **solo se retira si el catálogo del proveedor confirma que ya no existe**
(`debe_retirar`, con el catálogo cacheado 10 min por `catalogo_proveedor`); las pistas
«does not exist» / «model not found» que salen de la salida de una HERRAMIENTA del agente
(p. ej. `git show main:archivo`) ya no retiran nada — solo se anotan como aviso. Si el
proveedor no tiene catálogo (tokenrouter, llm7), la pista solo cuenta en una línea de
error real de la API (`Error…`, `AI_APICallError…`, `{"error"` o «HTTP Error»).
Dependencias: `depende: ["ID"]` exige que la dependencia se INTEGRE (`commit`); si terminó
en otro estado (`sin_cambios`, `fallo`…), la tarea queda «bloqueada» (evento `bloqueada`,
listada aparte en el resumen final) y no se ejecuta. `depende_opcional` solo avisa.
Pruebas: `test_retiros.py`.
