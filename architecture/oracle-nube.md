# Oracle Cloud Always Free: la nube 24/7 de StarSeed OS (contrato · 2026-10-07)

> Alex (2026-10-07): «acabamos de recibir la cuenta de Oracle Cloud Free que estábamos esperando
> para las capacidades en la nube 24/7 … actívala con todo lo mejor que podamos usarla para los
> sistemas de autoaprendizaje continuo de la IA Astraura 1.58 bits con sus múltiples capas de
> conciencia, las funciones en línea para todos los usuarios (sincronización de datos, IA,
> mensajes, publicaciones, grupos, sesiones en directo, transmisiones, llamadas, canales de
> estaciones, publicaciones con servidores activos en cualquier medio y formato) … iniciemos
> sesión para que lo recuerde el puente de mando y el resto de StarSeed OS».

Este documento es la fuente de verdad para todo lo que toque Oracle. Lo que no esté aquí no se
inventa; si el código real choca con él, se dice en el informe de la tarea.

## 1. Lo que tenemos de verdad (comprobado el 2026-10-07)

Fuente: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm> (modificada el
2026-06-12).

| Recurso Always Free | Cantidad |
|---|---|
| Ampere A1 (ARM, `VM.Standard.A1.Flex`) | **2 OCPU y 12 GB** en total (1.500 OCPU·h y 9.000 GB·h al mes) |
| AMD micro (`VM.Standard.E2.1.Micro`) | 2 máquinas de 1/8 OCPU y 1 GB, 50 Mbps a internet |
| Disco (arranque + bloques) | 200 GB en la región de origen, 5 copias |
| Object Storage | 20 GB, 50.000 peticiones al mes |
| Autonomous AI Database | 2 bases de 20 GB y 1 OCPU |
| NoSQL | 3 tablas de 25 GB |
| MySQL HeatWave | 1 sistema con 50 GB |
| Salida de datos | **10 TB al mes** |
| Balanceadores | 1 flexible de 10 Mbps y 1 de red |
| Vault | 150 secretos |
| Notificaciones | 1 millón HTTPS y 1.000 correos al mes |

**Ojo: el A1 bajó a la mitad el 15-06-2026** (antes 4 OCPU y 24 GB, sin anuncio público). Todo lo
que en el repo diga «4 OCPU / 24 GB» está viejo (`docs/HOSTING_INTEGRACIONES.md`,
`memory/orquestacion-economica.md` §10, `memory/trinidad-razonamiento-astraura.md`,
`src/components/mando/panel-nodos-bitnet.tsx`, `src/lib/mando/nodos-bitnet.ts`).

**Reclamación por inactividad.** Oracle puede recuperar una máquina Always Free si durante 7
días se cumplen a la vez: CPU p95 < 20 %, red < 20 % y, solo en A1, memoria < 20 %. El A1 de
StarSeed tiene siempre cargados BitNet y los servicios (> 20 % de memoria), así que no cae. Las
micro sí pueden caer: todo lo que corre en ellas se recrea con su cloud-init.

**Prueba gratuita.** Una cuenta nueva trae 30 días de crédito de prueba. Al acabar solo sigue lo
Always Free. **Por eso solo se crean recursos Always Free desde el primer día**: nada que se borre
al terminar la prueba. Pasar la cuenta a pago por uso (quita la reclamación por inactividad) lo
decide Alex; nunca se hace desde aquí.

## 2. Para qué la esperábamos (pendientes recuperados)

1. **Capa nube y colectiva de Astraura 1.58 24/7.** Hoy la nube de Astraura es la Mac por un túnel
   rápido de Cloudflare cuya URL cambia en cada arranque, y Cloud Run quedó sin facturación el
   2026-09-25. La capa colectiva (Ola 365) tenía «Oracle Always Free (pendiente)» como su nube
   (`architecture/astraura-158-sistema-primario.md`, `memory/state.md`).
2. **Servidor de Genesis que no se apaga con la Mac** (`architecture/servidor-astraura-mando.md`
   §8): destino de la capa nube y réplica de Genesis.
3. **Un medio más para el enjambre** (`memory/orquestacion-economica.md` §10), corriendo su propio
   orquestador contra la misma cola.
4. **Instancias oficiales StarSeed** de los conectores (`docs/HOSTING_INTEGRACIONES.md`):
   SearXNG (prioridad 1), Crawl4AI (2), Stirling-PDF (3) y n8n, que hoy duerme en Hugging Face y
   así pierde los webhooks.
5. **Sincronización 24/7** que una sesión de Claude en la nube no puede dar (§14 de la
   orquestación económica).
6. **Motor «servidor propio» del Mando para todos** (`architecture/puente-mando-para-todos.md`).

## 3. Reparto de la máquina

El A1 (2 OCPU y 12 GB, 100 GB de disco) lleva todo lo que necesita memoria. Las dos micro llevan
lo que necesita red, no memoria.

| Máquina | Servicio | Memoria tope | Puertos | Para qué |
|---|---|---|---|---|
| A1 | Caddy | 128 MB | 80, 443 | HTTPS automático para todos los subdominios |
| A1 | Astraura 1.58 (backend + BitNet + Needle3) | 3 GB | interno | IA 24/7: capas nube y colectiva |
| A1 | Postgres | 1 GB | interno | Corpus colectivo y servidor de malla |
| A1 | Servidor de malla StarSeed (`docs/examples/starseed-mesh-server`) | 384 MB | interno | Sincronización, faros, relés cifrados, feed público, federación |
| A1 | MediaMTX | 256 MB | 8189/udp | Estaciones: entra WHIP, sale HLS y WebRTC |
| A1 | SearXNG + Valkey | 640 MB | interno | Búsqueda oficial StarSeed |
| A1 | n8n | 768 MB | interno | Automatizaciones con webhooks que no duermen |
| A1 | Orquestador del enjambre | 2,5 GB | — | 1 agente permanente (§8) |
| A1 | Sistema y margen | ~2 GB | 22 | — |
| micro 1 | coturn | 512 MB | 3478 tcp/udp, 5349, 49160–49200/udp | TURN para llamadas, directos y la malla WebRTC |
| micro 2 | Vigía de la nube | 256 MB | — | Sondea los servicios del A1, el túnel de la Mac y Supabase; avisa a Genesis |

Disco: A1 100 GB y cada micro 50 GB (total 200). Object Storage guarda la copia nocturna del corpus,
de la base de la malla y de n8n.

Nombres: mientras no haya dominio propio, `<servicio>.<ip-con-guiones>.sslip.io` (Let's Encrypt
funciona con sslip.io). Subdominios: `astraura`, `malla`, `media`, `buscar`, `n8n`, `turn` y `capas` (espejo de capas de
`architecture/capas-autoadaptables.md` §6: Caddy sirve el volumen del espejo, solo lectura).

## 4. Vinculación: cómo lo recuerdan Genesis y el OS

- **Inicio de sesión (lo hace Alex):** `oci setup bootstrap` en la Terminal de la Mac. Abre el
  navegador, Alex entra con su usuario y la CLI crea y sube su llave de API. Queda en
  `~/.oci/config` y `~/.oci/sessions/…` con permisos 600. **Nunca** se copia al repo, a memorias,
  a registros ni al chat, y nadie imprime OCIDs.
- **Llave SSH de los servidores:** `~/.ssh/starseed_oracle_ed25519` (ya creada en la Mac). Su
  parte pública se pone en cada máquina al crearla.
- **Estado que Genesis lee:** `~/.starseed/oracle.json` (0600). Solo datos no secretos:
  `{vinculada, perfil, region, comprobado, limites:{a1_ocpu, a1_gb, micro}, instancias:[{nombre,
  forma, ocpus, gb, estado, ip_publica}], servicios:[{nombre, url, ok, ms, t}]}`. Lo escribe
  `scripts/puente/oracle_nube.py`.
- **Registro de servidores de Genesis:** cuando el A1 exista, se añade a
  `servidores-astraura.json` como tipo `oracle` con la URL de `astraura`, y se marca como
  **destino activo** (§6).
- **Memorias:** la del proyecto (`starseed-oracle`) dice que la cuenta existe y para qué es; nunca
  ids.

## 5. Despliegue (`deploy/oracle/`)

- `cloud-init-a1.yaml` y `cloud-init-micro.yaml`: Ubuntu 24.04 arm64/amd64, Docker y compose,
  usuario `starseed`, solo llave SSH, sin contraseña, `unattended-upgrades` y fail2ban. **Las
  imágenes Ubuntu de OCI traen iptables cerrado**: además de la lista de seguridad de la VCN hay
  que abrir 80/443 (y los de la tabla) en iptables y guardarlo con `netfilter-persistent`.
- `compose-a1.yml`: los servicios de §3 con `mem_limit`, `restart: unless-stopped`, imágenes
  `linux/arm64`, red interna y solo Caddy publicado (más 8189/udp de MediaMTX).
- `Caddyfile`: un bloque por subdominio con `{$STARSEED_HOST}`.
- `env.ejemplo`: SOLO nombres de variables. Los valores viven en `/etc/starseed/env` (600, root)
  de cada máquina y los pone Alex con `scripts/puente/oracle_claves.py`, que copia por SSH solo
  las variables pedidas de `~/.starseed/env` sin imprimirlas.
- `scripts/puente/oracle_desplegar.py`: crea VCN, subred pública, puerta a internet, reglas de §3,
  las tres máquinas y una alerta de presupuesto de 1 USD. Por defecto `--simular`; con
  `--aplicar` crea de verdad (solo con la palabra de Alex). Guardias que no se saltan: solo
  formas Always Free, nunca más de 2 OCPU y 12 GB de A1 en total, ni más de 2 micro, ni más de
  200 GB de disco. Idempotente: lo que ya existe no se duplica. Ante «Out of host capacity»
  reintenta cada 10 min hasta 24 h y lo dice en el Chat Director.

## 6. Astraura 1.58 en Oracle: capas y aprendizaje continuo

- **Inferencia 24/7** con el backend del repo `StarSeedSystem/astraura` (FastAPI + BitNet +
  Needle3) en `ASTRAURA_MODE=nube` y `ASTRAURA_AUTH_MODE=key`. Los pares de la malla le hablan con
  `ASTRAURA_MESH_KEY` (`memory/astraura-nucleo-158-needle3.md`).
- **Destino activo:** un servidor del registro marcado como destino se publica en
  `astraura_state` como `destino_fijo` (como hoy `tunel_publico`, con su lista blanca de hosts), y
  `destinoNube()` lo prueba primero. Cambiar de la Mac a Oracle es configuración, no código ni
  variable de Vercel.
- **Capa colectiva:** el corpus vivo (`backend/app/core/aprendizaje/corpus.py`) ya respeta
  `aprendizaje_colectivo`. En Oracle recoge los turnos de todas las personas que lo permiten,
  con su filtro de privacidad. Nunca entra un turno privado o con la capa apagada.
- **Aprender sin GPU, de verdad:**
  - cada turno: memoria y recuperación (Needle) al momento;
  - cada noche: limpieza del corpus, valoración con Jev y entrenamiento del modelo de conocimiento
    ligero (`llm_federated_trainer.py`, en CPU), con sus deltas publicados al micelio;
  - cada semana, opcional: el `train.jsonl` del corpus va a un trabajo con GPU gratuita (Kaggle o
    Colab) para un LoRA. El modelo nuevo vuelve a Oracle y solo se promueve si gana en el banco de
    pruebas.
  - Reentrenar los pesos de BitNet en 2 núcleos ARM no es viable y no se promete.
- **Capas:** local (cada dispositivo), mesh (pares), nube (Oracle, siempre encendida) y colectiva
  (corpus común de Oracle). El indicador de capas del OS la ve como «nube» viva.

## 7. Funciones en línea para todas las personas

- **Sincronización y malla:** el servidor de malla oficial en Oracle recibe faros, relés cifrados
  y el feed público que hoy cargan `os_mesh_relay` en Supabase. Es lo que agotó la salida de
  Supabase el 28-09. Supabase se queda con cuentas, mensajes, publicaciones, grupos y páginas.
  Mover eso supondría autoalojar Supabase entero y no entra en esta ola.
- **Llamadas, directos y la malla WebRTC:** `/api/llamadas/ice` da credenciales TURN temporales
  firmadas con `TURN_SECRET` (REST de coturn, una por persona y hora). `webrtc-mesh.ts` y
  `live-channel.tsx` pasan a pedir sus servidores ICE ahí, en vez de usar solo STUN.
- **Estaciones:** el estudio ofrece «Servidor StarSeed» además de la URL propia: WHIP a MediaMTX
  con un token por estación, HLS para todo el mundo y WebRTC para la baja latencia. Esto depende
  de que la ola de Estaciones (ES1010*) esté integrada.
- **Búsqueda y automatizaciones:** SearXNG oficial (JSON activado) como destino por defecto del
  conector, y n8n sin dormir.

## 8. Enjambre

El gobernador limita a núcleos − 1, así que en 2 OCPU cabe **1 agente permanente**: no 3, que era
la cuenta con 24 GB. Corre con su `~/.starseed/env` propio, que Alex pone con
`oracle_claves.py`. Publica como la nube de GitHub: ramas que la Mac trae y pasa por sus puertas.

## 9. Lo que enseña Genesis

- **Servidor 1.58:** la tarjeta «Oracle Always Free» deja de ser «pendiente» cuando
  `oracle.json` dice `vinculada`. Enseña región, límites, máquinas con su estado, servicios con
  su sonda y botones «Comprobar», «Vincular» (abre la Terminal con `oci setup bootstrap`) y
  «Desplegar» (simulación y, con confirmación, aplicar).
- **Medios:** `medios_disponibles.py` y `contenedores_nube.py` dejan de decir «descartado»: Oracle
  aparece como `requiere_alex` sin vincular, `usable` vinculada sin máquina y `listo` con la
  máquina y el orquestador vivos, con la capacidad real (2 OCPU · 12 GB).

## 10. Lo que NUNCA

- Ningún secreto, OCID ni llave en el repo, memorias, registros o chat.
- Nada público sin autenticación: Astraura con clave, n8n con usuario, SearXNG con límite de
  peticiones. OpenHands y Browser Use nunca se exponen.
- Ningún recurso fuera de Always Free, ni pasar la cuenta a pago, sin la palabra de Alex.
- No se apaga ni se cambia el túnel de la Mac hasta que Oracle responda verde 24 h seguidas.

## 11. Estado real (2026-10-07, 16:50 hora de la Mac)

Alex eligió «Crear todo ahora». Se creó con la CLI (`.transfer/oracle/crear.py`, fuera del repo,
idempotente por nombre; `oracle_desplegar.py` de OR1007G debe reconocer estos MISMOS nombres):

- Región de origen `mx-queretaro-1` (Querétaro), 1 dominio de disponibilidad.
- Red: VCN `starseed-vcn` (10.0.0.0/16), puerta `starseed-igw`, subred `starseed-publica`
  (10.0.0.0/24) con la tabla y la lista de seguridad por defecto (solo 22/tcp e ICMP), y un grupo
  de seguridad por papel: `starseed-nsg-a1` (80, 443/tcp y 8189/udp), `starseed-nsg-turn` (3478
  tcp/udp, 5349/tcp, 49160–49200/udp) y `starseed-nsg-vigia` (nada más que SSH).
- **`starseed-a1` RUNNING**: 2 OCPU, 12 GB, 100 GB, Ubuntu 24.04 aarch64, IP pública fija de la
  máquina en `~/.starseed/oracle.json`. cloud-init base (`.transfer/oracle/cloud-init-a1.yaml`):
  Docker 29 + compose 2.40, fail2ban, actualizaciones automáticas, swap de 4 GB e iptables con
  80/443/8189 abiertos y guardados. Usuario `ubuntu`, solo llave `~/.ssh/starseed_oracle_ed25519`.
- `starseed-turn` y `starseed-vigia` (micro): **«Out of host capacity»** en la región. Un
  reintento corre en la Mac cada 20 min durante 24 h (`.transfer/oracle/reintentar.sh`, registro
  `/tmp/oracle-reintentos.log`). Si no llegan, coturn y el vigía van al A1 (hay sitio en §3).
- Presupuesto `starseed-alerta-1usd`: 1 USD al mes con aviso por correo al 100 % real y previsto.
- Los límites de servicio de la cuenta (prueba) permiten hasta 41 OCPU de A1: **no se usan**; las
  guardias de §5 siguen mandando.

## 12. El A1 como nodo de MetaGenesis (OPO1011 · 2026-10-10)

> Alex (2026-10-10), con el medidor de Oracle delante: «starseed-a1 lleva 2,3 días ocioso (CPU p95
> 0,52 %, memoria 5,26 %, red 0 %; umbral 20 %). Si sigue así, Oracle puede reclamarlo desde el
> 14 oct … solucionala».

**Qué es.** El A1 deja de ser una máquina vacía y pasa a ser el **nodo siempre encendido** de
MetaGenesis: trabaja aunque la Mac esté apagada y se maneja desde cualquier neurona que tenga la
llave SSH (`~/.ssh/starseed_oracle_ed25519`). **Por qué así:** Oracle reclama una máquina Always
Free si en 7 días la CPU (p95 de puntos de 1 h), la red y, en A1, la memoria quedan TODAS bajo el
20 %. La salida honesta no es un bucle que caliente la CPU: es darle el trabajo que nos faltaba
hacer en algún sitio que no se apague.

### 12.1 Lo que corre en el A1 (servicios systemd, usuario `starseed`, sin contraseña ni llave)

| Servicio | Qué hace | Memoria tope | Reinicio |
|---|---|---|---|
| `starseed-medio.service` (`/opt/starseed/nodo/oracle_a1.py servir`) | **Medio del enjambre**: cada 2 min mira (HTTPS, solo lectura) las ramas `colas/oracle-*`; con una cola nueva pone `main` en ese commit y corre el orquestador de siempre (`~/bin/starseed-enjambre.py`, 2 trabajadores, opencode con los proveedores gratuitos de la nube de GitHub). Lo hecho queda en ramas `nube/a1-<fecha>` (lo que pasó sus puertas aquí) y `nube/a1-<fecha>-<id>` (el trabajo de cada tarea). **Guardián de main**: sin cola, cada 2 h (o 45 min después de que cambie el main de la Mac) comprueba ese main con las cuatro puertas del CI —`tsc --noEmit`, `vitest run`, núcleo mesh y `next build` (la única que ve un módulo de servidor colado en el paquete del navegador, y que en la Mac no cabe)— y deja el veredicto; si llega una cola entre paso y paso, le cede la máquina sin anotar nada. Medido en la primera pasada (main 4f2ead81): tsc 210 s · vitest 546 s (8.128 pruebas) · mesh 5 s · **verde**. Estado sin IPs ni claves cada minuto en `/var/lib/starseed/nodo/estado.json`, con la carga medida (CPU y memoria por hora). | 8 GB alto · 9 GB máx. | siempre, 30 s |
| `starseed-bitnet.service` (`bitnet-servir.sh`) | **BitNet b1.58 2B-4T de Astraura** para las neuronas de la cuenta: el `llama-server` vendorizado, perfil de `nodo-bitnet.sh` (hilos/contexto/slots según la máquina), pesos en memoria propia (`--no-mmap`), solo en 127.0.0.1 y **con clave** (`--api-key-file /etc/starseed/bitnet.key`). | 1,8 GB alto · 2,2 GB máx. | siempre, 20 s |
| `starseed-caddy` (Docker, red del anfitrión, 128 MB) | HTTPS automático (Let's Encrypt con sslip.io): `bitnet.<ip-con-guiones>.sslip.io` → BitNet. `/health` abierto para las sondas; todo lo demás pide la clave. | 128 MB | `unless-stopped` |
| `starseed-metageminis.timer` → `.service` | **MetaGeminis en BORRADOR** cada 6 h: redacta hasta 3 borradores para aprobar (`--cola local`); nunca envía nada. Solo se instala si el paquete trae `scripts/sociales/metageminis.py`. | 512 MB | temporizador |
| `starseed-metagenesis.service` | El nodo de MetaGenesis que deje OPA1011 (`scripts/puente/nodo_metagenesis*.py`): viaja solo en el paquete cuando exista. | — | — |

Registros: journald con tope (400 MB, 14 días) y `logrotate` semanal de `/var/log/starseed/*.log`
y `~starseed/registros/*.log`. Disco del A1: 96 GB, el nodo ocupa ≈ 6 GB (repo + `node_modules` +
BitNet + pesos).

**El repo del A1 es de SOLO LECTURA de verdad**: clonado por HTTPS sin credenciales y con
`git remote set-url --push origin no-se-empuja-desde-el-a1`. Las claves de los proveedores van a
`/home/starseed/.starseed/env` (600) y son las MISMAS que tiene la nube de GitHub
(`nube-gh.py secretos`): solo proveedores con modelos gratuitos y las públicas del bus. Nada de
pago (Anthropic, OpenAI, DeepSeek) y nada que apunte a `127.0.0.1` de la Mac.

### 12.2 Lo que hace una neurona con él (`scripts/puente/oracle_nodo.py`)

```
python3 scripts/puente/oracle_nodo.py instalar [--esperar]   # sube el paquete y corre preparar-a1.sh (idempotente)
python3 scripts/puente/oracle_nodo.py claves                 # claves gratuitas al A1 (solo nombres en pantalla)
python3 scripts/puente/oracle_nodo.py estado                 # estado del nodo → ~/.starseed/oracle.json (nodo, servicios)
python3 scripts/puente/oracle_nodo.py ciclo                  # estado → traer → lanzar si está libre
python3 scripts/puente/oracle_nodo.py probar-bitnet          # una pregunta al BitNet por HTTPS y con clave
```

- **Trabajo de ida** (`lanzar`): reparte N tareas del atraso con las MISMAS reglas que la nube de
  GitHub (`repartir_nube.elegir`, envíos contados, nada de lo que la Mac escribe ahora) y las sube
  en un commit SUELTO a `colas/oracle-<fecha>` (como `colas/nube-*`: main no se toca). Marca las
  tareas `reasignada · oracle` — préstamo, no traspaso.
- **Trabajo de vuelta** (`traer`): el A1 no puede empujar; la neurona trae por SSH sus ramas
  `nube/a1-*` y las sube a GitHub con el mismo nombre. `traer_nube.py` ya lee `nube/*`: las trae a
  main con SUS puertas (cherry-pick + tsc + pruebas relacionadas) o crea la tarea de reparación.
  Lo que el A1 terminó vuelve a `pendiente` para que `traer_nube` pueda decidir (con la tarea
  «reasignada» no la toca); si el nodo no late en 3 h, todo lo prestado vuelve.
- **Qué se le puede dar hoy, medido** (2026-10-10, 11:15): el reparto NO toca la tanda viva de la
  Mac (lo que su orquestador ya tiene en la cola que está leyendo: 81 ids en ese momento), igual que
  con la nube de GitHub (RM6b, 2026-10-08). Con todo el atraso elegible dentro de esa tanda (32
  tareas de XR, Protomolécula y el revisor) el reparto da 0 y el A1 hace de guardián de main. En
  cuanto haya atraso fuera de la tanda, el ciclo se lo manda solo. Sacar tareas de la tanda viva
  de la Mac necesita una orden `soltar` y cuidar que el orquestador de la Mac no pise su estado al
  guardar (en `fusionar_progreso` manda la memoria para sus propias tareas): es trabajo aparte.
- **Dos trabajadores**, no uno (§8 decía 1 con el gobernador de núcleos − 1): los agentes esperan
  a los modelos casi todo el tiempo y la CPU la gastan las puertas; con BitNet por delante en
  prioridad (`CPUWeight=400` frente a 50) caben dos sin que las neuronas lo noten.
- **Cada 30 min, solo**: la autocuración de Genesis (`autocuracion_mando._traer_en_fondo`) corre
  `oracle_nodo.py ciclo --y-traer-nube` antes de `traer_nube`. Cualquier otra neurona con la llave
  y la sesión de GitHub puede correr el mismo ciclo.
- **Avisos** al Chat Director solo cuando algo cambia: el nodo deja de latir o vuelve, el guardián
  de main pasa de verde a rojo (o al revés), sube ramas, devuelve tareas o recibe una cola.

### 12.3 Dónde se ve

- `~/.starseed/oracle.json` gana `nodo` (latido, fase, guardián, carga por hora) y `servicios`
  (`[{nombre, titulo, ok, activo, ms, t, detalle}]`, sin URLs). `oracle_nube.py comprobar` ya no
  los borra.
- **Medios** (`medios_disponibles.clasificar_oracle`): con el nodo vivo (latido de menos de 45 min)
  Oracle pasa a **`listo`** con «nodo de MetaGenesis vivo (fase, guardián verde/ROJO)».
- **MetaGenesis › Consumo y créditos** (`oracle-consumo-tipos.ts`): fila «Nodo de MetaGenesis (A1)»
  con servicios ok/total, el guardián y la CPU/memoria medidas en el A1; y, mientras Oracle siga
  marcando riesgo, el texto dice cuántas horas lleva ya el nodo por encima del 20 % (el p95 de
  Oracle usa 7 días de puntos de 1 h: tarda en reflejarlo). `medidor_oracle.py` copia el resumen
  (`nodo_resumen`) en `oracle-consumo.json` y lo da también al contexto de directores y agentes.
- **Servidor 1.58** (`panel-servidor.tsx`): la lista de servicios de Oracle ya no sale vacía.

### 12.4 Trampas medidas al montarlo (2026-10-10)

- `nodo-bitnet.sh preparar` (repo astraura) compila con `-DBITNET_ARM_TL1=ON` en arm64 y, con el
  llama.cpp vendorizado de hoy, `bitnet-lut-kernels.h` no compila («no member named 'backend' in
  'ggml_tensor'»). La Mac (arm64) compila con TL1 apagado: `preparar-a1.sh` compila igual y deja a
  `nodo-bitnet.sh` solo los pesos y el perfil. **Pendiente en el repo astraura**: que el guion use
  TL1 apagado (o lo detecte).
- La interfaz web de ese llama.cpp se descarga de Hugging Face en versión «latest», que no trae
  `loading.html`, y el enlazado falla. Se compila sin ella (`-DLLAMA_BUILD_UI=OFF
  -DLLAMA_USE_PREBUILT_UI=OFF`): Astraura habla con la API.
- `traer_nube.py` solo lee `nube/*`; las ramas `nube-ola/<run>/ola/<id>` que deja la nube de
  GitHub (trabajo a medias de cada tarea) **no las trae nadie**. Para el A1 se usan ramas hermanas
  `nube/a1-<fecha>-<id>`. Arreglarlo para la nube de GitHub es otra tarea (no es de Oracle).
- Las puertas del orquestador se niegan a arrancar con archivos sin commitear en el árbol de main
  de la Mac: para probar el paquete sin ensuciarlo, `STARSEED_NODO_FUENTE=<carpeta>` le da a
  `oracle_nodo.py` otra fuente para los archivos nuevos.
