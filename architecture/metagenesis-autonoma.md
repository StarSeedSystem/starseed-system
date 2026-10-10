# MetaGenesis autónoma · el nodo que dirige desde cualquier medio (OPA1011 · 2026-10-10)

> Alex: «no está funcionando MetaGenesis por sí misma: aún no ha sido capaz de continuar con las
> tareas sin tener que decírtelo aquí. Soluciónalo para que realmente sea MetaGenesis
> superinteligente, autoadaptable, autónoma, profesionalmente funcionando desde cualquier medio
> donde lo abra en cualquier neurona, no solo esta Mac … sin necesidad de esta Mac ni de
> pedírtelo a ti; desde cualquier medio se autorrepara y funciona autónomamente».

## 1. Qué faltaba (medido el 2026-10-10)

| Pieza | Antes | Por qué no bastaba |
|---|---|---|
| Directores (vigilante, vigía, autocuración, revisor) | launchd en la Mac | Con la Mac apagada no hay nadie. Y nadie cura a los que curan. |
| Estado del trabajo (colas, progreso, latidos) | disco de la Mac (`starseed_memory_root/olas/`) | Otra neurona no lo ve; el A1 no sabe qué seguir. |
| MetaGenesis desde otra neurona | `/api/mando/*` de la Mac por su túnel | Mac apagada o túnel caído = pantalla vacía y ninguna orden posible. |
| Colas vacías | el vigilante «espera sin inventar tareas» | Lo archivado en `colas-fuente/` sin cerrar se quedaba ahí para siempre. |
| Supabase | 81 % del presupuesto diario a las 11:33 UTC (20.303 de 25.000) | Cualquier pieza nueva tiene que ser frugal. |

## 2. El nodo (un solo programa, cualquier medio)

`scripts/puente/nodo_metagenesis.py` + `nodo_metagenesis_logica.py` (decisiones puras) +
`nodo_metagenesis_bus.py` (Supabase) + `nodo_metagenesis_medio.py` (la máquina). Solo biblioteca
estándar: corre en la Mac (python3 de Homebrew), en el A1 (servicio `starseed-metagenesis` de
OPO1011, que copia `nodo_metagenesis*.py` a `/opt/starseed/nodo/metagenesis/`), en el contenedor
de la nube o en cualquier Linux con el repo.

Cada vuelta (líder cada 120 s, los demás cada 300 s):

1. **Mide su medio** sin nada privado: servicios (`launchctl` + la regla de «Reactivar
   directores» en la Mac; `systemctl` `starseed-*` en Linux), orquestadores (`ps -axo pid=,args=`,
   misma expresión que `higiene_colas.RE`), disco, RAM y, si tiene las colas en su disco
   (`autoritativo`: la Mac), las cifras del **vigía de medidores** —las mismas que ve Alex en
   Genesis— solo si tienen menos de 15 min, la pausa de Genesis (Ajustes › Directores) y cuándo
   pasó el revisor de bloqueadas.
2. **Late y decide quién dirige** (§3). Un nodo solo puede publicar el líder que alguien
   reclamó: las opiniones no suben el término.
3. **Se cura a sí mismo**, dirija o no: servicios caídos (kickstart / restart, cada 10 min como
   mucho) y, fuera de la Mac, disco por debajo de 2,5 GB (en la Mac limpia la autocuración).
4. **Si dirige** (`planificar`), con enfriamientos para no repetir:
   - guardianes de la Mac caídos (`vigia`, `vigilante`, `mando`) → `reactivar_mando.py` (30 min);
   - trabajo listo y ningún orquestador desde hace 10 min → `reactivar_mando.py` (relanza el
     vigilante, que arranca el orquestador) — nunca con la pausa de Genesis puesta;
   - bloqueadas y el revisor automático de OPB1011 sin pasar desde hace 15 min →
     `revisor_bloqueadas.py` (una pasada);
   - nada listo, nada en curso y nadie trabajando desde hace 15 min → **buscar trabajo**:
     rescata de `colas-fuente/` lo que nadie cerró (≤ 21 días, con archivos y prompt, sin visto
     bueno humano, ni cerrado en el progreso, ni en main, ni con sucesora integrada, ni en
     ninguna cola viva; gana la definición más nueva; las falladas son del revisor), Jev solo
     **veta** (p ≥ 0,8) y se enlista en `olas/cola-rescate-<MMDD-HHMM>.json`, que el vigilante
     recoge (cada 3 h como mucho, 12 tareas);
   - **relevo de medio**: si el medio con las colas en disco calla 20 min, las tareas
     portables que publicó (`mg_colas`, como mucho 8, ≤ 3 archivos) siguen en el mejor medio
     real libre, con constancia (`mg_asignacion`) para que la Mac no las repita al volver.
   - publica la **foto** (nodos, quién dirige, cifras, últimas decisiones) solo si cambió o
     cada 30 min.
5. **Atiende las órdenes** para él (`lider`, su medio o su id) — §4.

Todo lo que se lanza va por los caminos que ya existían (el vigilante, `reactivar_mando`,
`revisor_bloqueadas`, `buscar_capacidad`): el nodo **no** es un segundo orquestador. En el A1,
una cola llega a la bandeja `~/.starseed/nodo-metagenesis/entrantes/` del medio de OPO1011.

**Modo seco** (`--seco`): decide, late y publica la foto, pero no lanza nada; un nodo seco nunca
le gana el mando a uno real (+1000 puntos al real).

## 3. Un solo líder y relevo automático

Puntos: Mac 300 · A1 250 · otra neurona 120 · nube 80 · GitHub 10; +200 si tiene las colas en su
disco; +1000 si trabaja de verdad; −60 sin repo, −40 sin orquestador, −80 con < 2 GB de disco;
hasta +40 por RAM libre. Quien cede (orden `ceder`) va 30 min en negativo y ni toma ni renueva.

- **Modo bus (hoy)**: eventos `mg_latido` (cada 5 min), `mg_lider` (reclamo con término + 1),
  `mg_baja` (al parar). El líder vigente sigue mientras late (TTL 15 min); si calla o se despide,
  el mejor vivo reclama término + 1. **Relevo ordenado**: un nodo estable (racha actual ≥ 10 min,
  sin contar latidos de antes de un apagón) con +100 puntos lo reclama él mismo (la Mac real que
  vuelve frente al A1). Dos reclamos del mismo término: gana más puntos y luego el id menor — el
  mismo orden total en todos los nodos, Python y TypeScript.
- **Modo tablas** (migración aplicada): UNA llamada por vuelta,
  `metagenesis_nodo_latir(nodo, llave, …)`, que late, toma o renueva el arriendo de forma atómica
  en Postgres con las mismas reglas y devuelve los nodos vivos y las órdenes para ese nodo
  (marcadas «tomada» con `FOR UPDATE SKIP LOCKED`: nadie las ejecuta dos veces).

Medido en la Mac (seco): primera vuelta 5 peticiones (lectura, reclamo, latido, foto, colas),
luego 1–2 por vuelta. Por nodo ≈ 300 escrituras/día; dos nodos ≈ 1.700 peticiones/día (~7 % del
tope propio de 25.000).

## 4. Órdenes desde cualquier neurona

Lista blanca (Python, TypeScript y CHECK de la tabla): `continuar`, `revisar_bloqueadas`,
`buscar_capacidad`, `reactivar`, `buscar_trabajo`, `lanzar_cola`, `detener_cola`, `pausar`,
`reanudar`, `ceder`; argumentos solo `cola`, `trabajadores` (1–4) y `tareas_sha`.

- **Bus**: `relevo_eventos` lo puede escribir cualquiera con la clave anónima, así que el nodo
  solo ejecuta órdenes con **firma HMAC-SHA256** (`STARSEED_LANZADOR_SECRETO`) sobre
  `accion|para|t|nonce|args canónicos` (vector compartido en las pruebas de ambos lados),
  caducidad 15 min, fecha en UTC y antirepetición por `nonce` (24 h). Las tareas que viajan con
  un `lanzar_cola` llevan su huella **dentro** de lo firmado. Desde el navegador firma el
  servidor: `POST /api/metagenesis/orden` (Bearer de la sesión, nunca cookie → nada de CSRF;
  `es_metagenesis()`; 20/hora/cuenta; en el bus la cuenta va como `cuenta:<10 hex>`). Sin el
  secreto en ese servidor responde 503 y lo explica. Desde una terminal con el secreto:
  `python3 scripts/puente/nodo_metagenesis.py orden revisar_bloqueadas --esperar`.
- **Tablas**: la persona inserta la orden y la RLS garantiza que es miembro y que va a su
  nombre (`por = auth.uid()`), 30/hora; el nodo escribe el resultado
  (`metagenesis_nodo_orden_resultado`). No hace falta ningún secreto en Vercel.

## 5. Vista desde cualquier neurona

`/metagenesis` monta `MetaGenesisAutonoma` (`src/components/metagenesis/metagenesis-autonoma.tsx`)
encima de la consola: quién dirige, cada medio con su latido, el trabajo (las cifras del vigía),
lo último que decidió el líder y los botones de órdenes (pausar y cambiar de líder piden dos
pulsaciones). Lee de Supabase con la sesión (`remoto-nodos-cliente.ts`: tablas si existen; si
no, dos lecturas pequeñas del bus por vuelta y la foto solo cuando cambia), cada 90 s con la
pestaña visible y al momento cuando el bus avisa (Realtime, `tipo=in.(mg_foto,mg_orden_hecha,
mg_lider,mg_baja)`). Solo miembros de MetaGenesis. Funciona con la Mac apagada.
Los latidos y fotos de los nodos no ensucian el chat del bus (`TIPOS_SILENCIOSOS_BUS`).

## 6. Estado compartido · migración `20261011100000_metagenesis_nodos.sql` (escrita, probada, NO aplicada)

Tablas: `metagenesis_nodos` (huella de la llave invisible incluso para miembros),
`metagenesis_arriendo` (fila única + foto), `metagenesis_colas` (portables), `metagenesis_ordenes`,
`metagenesis_bitacora`. RLS: leen solo miembros (`es_metagenesis()`); escriben los nodos por
funciones `SECURITY DEFINER` que comprueban **nodo + llave** (cada nodo tiene su secreto propio;
en la base solo su sha256; revocar = un clic de un dueño). Realtime en arriendo y órdenes.
Probada en Postgres 16 con los roles de Supabase (`test_nodo_metagenesis_migracion.py`): dos
aplicaciones seguidas, RLS impersonando roles, arriendo (toma, caducidad, relevo ordenado,
ceder), órdenes (solo miembros, a su nombre, lista blanca, tope), foto solo del líder, revocar, y
el **nodo de Python de verdad** hablando con esas funciones (contrato Python ↔ SQL).

Para activarla (Alex):
1. Aplicar la migración en el proyecto del OS (SQL editor o Management API).
2. En cada medio: `python3 scripts/puente/nodo_metagenesis.py llave` (enseña SOLO la huella).
3. En la Mac: `python3 scripts/puente/nodo_metagenesis.py registrar --nodo <id> --huella <h> --medio <medio>`.
   Sin esto, el nodo sigue en modo bus y lo dice (`tablas_motivo` en su estado).

## 7. Servicio

- Mac: `python3 scripts/puente/nodo_metagenesis.py instalar [--seco]` → launchd
  `com.starseed.nodo-metagenesis` (python3 de Homebrew directo: tiene el permiso de disco),
  registro `/tmp/starseed-nodo-metagenesis.log`, estado `~/.starseed/nodo-metagenesis/estado.json`.
- A1: el `starseed-metagenesis.service` de OPO1011 (`nodo_metagenesis.py servir`).
- Linux cualquiera: el mismo `instalar` (systemd --user).
- Una vuelta a mano: `python3 scripts/puente/nodo_metagenesis.py ciclo --seco`.

## 8. Coordinación con OPO1011 (A1) y OPB1011 (bloqueadas)

- **OPO1011**: el A1 recibe `NEXT_PUBLIC_SUPABASE_*` (`CLAVES_A1`) → late y puede dirigir. Para
  que además ejecute órdenes del bus hace falta `STARSEED_LANZADOR_SECRETO` en su entorno (o la
  migración de tablas + su llave). Para el relevo de medio, `oracle_a1.py` debería tomar las colas
  de `~/.starseed/nodo-metagenesis/entrantes/*.json` como toma las ramas `colas/oracle-*`.
- **OPB1011**: el nodo no decide sobre bloqueadas: si el revisor automático no pasa en 15 min,
  lo lanza (`revisor_bloqueadas.py`) y nada más. Las falladas nunca entran en el rescate.

## 9. Lo que NO hace (a propósito)

No publica ni empuja nada (eso sigue con su autopublicación y sus puertas), no borra datos, no
aplica migraciones, no usa la clave de servicio fuera de la Mac, no imprime claves ni IPs ni el
nombre de la máquina (id = `<medio>-<6 hex>` de una huella del aparato), no lanza un segundo
orquestador donde ya hay uno y no inventa tareas: rescata las que existían.

## 10. Siguiente (para el enjambre)

- Convertir las peticiones de Alex del Chat Director/Telegram en colas sin Claude
  (`dream_a_cola.py` + Diseñador de olas) cuando el líder no tenga trabajo.
- Pestaña propia en Genesis local con el mismo panel y la bitácora de tablas.
