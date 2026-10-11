# Puerta de datos en el A1 de Oracle (PDA1010 · 2026-10-10)

> Alex (2026-10-10), con el freno de Supabase puesto a las 19:48 UTC: «y esas peticiones de
> Supabase ¿no podrían manejarse por nuestro servicio de nube de Oracle que disponemos?».

Sí, buena parte. Este documento dice **qué** pasa al A1, **qué se queda** en Supabase y **por qué**,
cuánto se ahorra **por ruta con lo medido**, cómo se corta por fases y cómo se vuelve atrás.
Si el código choca con él, gana el código y se anota aquí. Lo que toque la máquina sigue
`architecture/oracle-nube.md` (OPO1011): este servicio vive **dentro** del A1 que ya existe y no
crea nada en Oracle.

## 1. Lo medido (registros de Supabase, 2026-10-10 00:00–20:52 UTC)

26.127 peticiones (freno propio de 25.000/día puesto a las 19:48; un aparato llegó a su tope de
8.000). Por grupo, con quién llama (agente de usuario de los registros):

| # | Grupo | Rutas | Hoy | Quién | Destino |
|---|---|---|---|---|---|
| 1 | Malla de Astraura | `astraura_mesh_nodes` POST 3.444 · GET 574 | **4.018** | backend Astraura (curl) | **A1** |
| 2 | Estado de Astraura | `astraura_state` GET 1.708 (Node) · POST 1.524 · GET 1.190 (curl) | **4.422** | servidores Next + backend | destino, túnel y estado de cerebros → **A1**; secciones con memoria → **Supabase** |
| 3 | Neuronas | `neuron_devices` GET 3.050 + 580 · PATCH 103 · OPTIONS 76 | **3.809** | navegador (Mac, Android) | presencia y latido → **A1**; registro → **Supabase** |
| 4 | Preferencias | `rpc/merge_user_prefs` 3.187 + 381 | 3.568 | navegador | **Supabase** (dato personal) |
| 5 | Sesión en el navegador | `/auth/v1/user` 2.060 + 161 | 2.221 | navegador | **Supabase** (Auth); fase 3 verificación local |
| 6 | Bus del enjambre | `relevo_eventos` 370 + 236 + 228 + 193 | **1.027** | Next, enjambre, nodos | **A1** (réplica por lotes de lo importante) |
| 7 | Sesión en servidores | `/auth/v1/user` 524 · `/auth/v1/admin/users/:id` 269 | 793 | Next | la puerta nunca llama a Auth; middleware en fase 3 |
| 8 | Presencia «en línea» | `os_presencia` POST 447 + 106 | **553** | navegador | **A1** (réplica cada 30 min) |
| 9 | Faros y relé | `os_mesh_relay` ≈ 442 | 442 | navegador | fase 3 (el relé ya va cifrado) |
| 10 | Freno | `os_freno` GET 138 | **138** | navegador | **A1** (la vigía lo empuja; nadie lo pide a Supabase) |
| 11 | Realtime | `/realtime/v1/websocket` 278 | 278 | navegador | Supabase |
| 12 | Datos de la cuenta | `user_settings`, `brain_memory_files`, `profiles`, `onboarding_state`, `brains`, `aurora_conversations`, `os_*`, `notifications`… | 3.109 | navegador | **Supabase** (RLS) |
| 13 | Contenido | `entity_state` 269 | 269 | Next | Supabase |
| — | Resto (cola larga) | | 1.480 | | Supabase |

Ritmo por hora (UTC): 2.000–3.400/h entre las 00 y las 04 (tarde de la Mac), 400–900/h el resto;
las 2 últimas horas, 843/h. Los arreglos de derroche de CON1010 (latido de Hermione, respaldo de
tableros, `getUser` compartido 60 s, destino de la nube 5 min) y de Astraura (`30e31a3f`: malla
cada 5 min, secciones cada 15 min, cerebros cada 10 min) bajan esa base; la puerta trabaja sobre
lo que queda y, sobre todo, **sobre lo que crece con cada persona y cada aparato nuevo**.

## 2. La regla de reparto

**Supabase sigue siendo la fuente de verdad** de cuentas, inicio de sesión, datos personales con
RLS y almacenamiento. **El A1 sirve el tráfico de máquina a máquina y lo que se lee mucho y cambia
poco.** Tres preguntas deciden cada ruta:

1. ¿Es dato personal con RLS (preferencias, memoria, conversaciones, perfiles)? → **Supabase.** En
   el A1 solo puede haber lo que la RLS dejaría leer a esa MISMA cuenta (su presencia, sus
   neuronas vivas) y nada de contenido: ni memorias, ni mensajes, ni preferencias.
2. ¿Es un latido, un evento de coordinación o un descubrimiento (alguien diciendo «sigo aquí» cada
   pocos minutos)? → **A1.** A Supabase solo llega el resumen que haga falta conservar, por lotes
   y con tope diario.
3. ¿Es lectura semipública que muchos piden igual (freno, directorio de estaciones, versiones)? →
   **A1 con caché** de TTL corto y deduplicación (una sola petición en vuelo por recurso). Si lo
   escribe una máquina nuestra (el freno), se **empuja** a la puerta: así nadie lo pide.

Por eso las secciones de `astraura_state` con memoria (mem0, grafo, vectores) **no** pasan al A1:
son memoria personal y el A1 es una máquina expuesta. Al A1 van el destino, el túnel publicado y
el **estado** de los cerebros (cuáles hay y cuándo sincronizaron), no su contenido.

## 3. Estimación de ahorro por ruta (con los números de hoy)

| Grupo | Hoy | Lo que sigue yendo a Supabase con la puerta | Ahorro/día | Fase |
|---|---|---|---|---|
| Malla de Astraura | 4.018 | 0 (la tabla queda de respaldo) | **≈ 4.000** | 1 |
| Destino/túnel de Astraura (Next) | 1.708 | 0 (lo publican las máquinas en la puerta) | **≈ 1.700** | 1 |
| Estado de cerebros (backend) | ≈ 144 de los 1.190 GET | 0 | ≈ 140 | 1 |
| Secciones con memoria (backend) | ≈ 2.570 | las mismas, ya espaciadas por `30e31a3f` | 0 | — |
| Bus | 1.027 | ≤ 1 lote cada 5 min con lo importante (≈ 100/día) | **≈ 900** | 1 |
| Freno | 138 | 0 (lo empuja la vigía) | 138 | 1 |
| Neuronas (sondeo de «quién está vivo») | 3.630 | registro al abrir (≈ 50) + 1 lote cada 30 min para todas (48) | **≈ 3.500** | 2 |
| Presencia | 553 | 1 lote cada 30 min por cuenta activa (≈ 48) | ≈ 500 | 2 |
| Sesión del navegador | 2.221 | Auth sigue en Supabase; verificación local con JWKS | ≈ 1.800 | 3 |
| Sesión del middleware | 793 | ídem | ≈ 520 | 3 |
| Faros y relé | 442 | 0 | ≈ 400 | 3 |
| **Total** | **26.127** | | **fase 1 ≈ 6.900 (26 %) · +2 ≈ 10.900 (42 %) · +3 ≈ 13.600 (52 %)** | |

La puerta gasta en Supabase: la JWKS cada 10 min (144/día), `es_metagenesis` por cuenta cada 10
min mientras la use (≤ 6/h por miembro activo) y los lotes de réplica (tope `PUERTA_REPLICA_DIA`
= 1.500/día; medido en uso normal: decenas). Ese gasto ya está restado arriba.

Con una sola persona, la caché de lo semipúblico ahorra poco (cada recurso lo pide casi siempre
el mismo aparato); con N personas ahorra N−1 de cada N lecturas. La fila de Genesis enseña el
número **medido**, no esta estimación.

## 4. El servicio (`servicios/puerta-datos/`)

Node ≥ 22.13 sin dependencias (`node:http`, `node:crypto`, `node:sqlite`), un proceso, ~40 MB.

- **Dónde**: en el A1, `127.0.0.1:8791`, servicio systemd `starseed-puerta-datos` (usuario
  `starseed`, `Restart=always`, `MemoryHigh=256M`/`MemoryMax=384M`, endurecido:
  `ProtectSystem=strict`, `NoNewPrivileges`, solo escribe en `/var/lib/starseed/puerta-datos`).
- **TLS**: Caddy (el de OPO1011, Let's Encrypt con sslip.io) en `datos.<host>`. La puerta **no
  toca** `deploy/oracle/**`: añade su sitio por la API de administración de Caddy (solo
  `localhost:2019`) y lo **reconcilia** cada 10 min, porque `preparar-a1.sh` recarga Caddy con su
  propio Caddyfile y la ruta desaparecería. Ningún puerto nuevo: solo el 443 que ya estaba.
- **Almacén**: SQLite en WAL con `synchronous=FULL` (un evento escrito es un evento guardado),
  `/var/lib/starseed/puerta-datos/puerta.db`. Retención: bus 30 días o 200.000 filas, latidos 7
  días, métricas 60 días.
- **Secretos**: solo por nombre de variable, en `/etc/starseed/puerta-datos.env` (root:starseed,
  640) y `/etc/starseed/puerta-datos/tokens.json` (huellas sha256 de las fichas, nunca las fichas).
  **No hay clave de servicio de Supabase en el A1** (regla de OPA1011: no debe vivir en una máquina
  expuesta): la puerta habla con Supabase con la clave pública y su **llave propia** (§6).

### 4.1 Quién entra

| Credencial | Cómo se comprueba | Para qué |
|---|---|---|
| Sesión de una cuenta (`Authorization: Bearer <jwt de Supabase>`) | **En local** con las claves públicas JWKS del proyecto (ES256), `iss`, `aud=authenticated`, `exp`/`nbf` con 30 s de margen. Nunca `/auth/v1/user`. JWKS en caché 10 min; un `kid` desconocido la relee como mucho una vez por minuto. Sin JWKS: 503 y el cliente vuelve a Supabase. `HS256` y `none` se rechazan siempre. | Sus neuronas, su presencia, leer el bus, MetaGenesis si es miembro |
| Ficha de máquina (`Bearer pd_…`, 256 bits) | sha256 en `tokens.json`, comparación en tiempo constante; cada ficha con sus **ámbitos** | Backend de Astraura (`malla`, `astraura`), enjambre (`bus`), vigía (`freno`), Genesis (`metricas`), admin |
| Llave de nodo de MetaGenesis | sha256 registrada por una ficha `admin` (misma llave que usa con las tablas de OPA1011) | Arriendo de líder |

`es_metagenesis` se pregunta a Supabase **con la sesión de esa misma cuenta**
(`rpc/es_metagenesis`, la misma RLS) y se guarda 10 min si es sí y 2 min si es no. Los permisos
de la puerta nunca son más amplios que la RLS: el bus, que en Supabase lee hasta `anon`, aquí pide
sesión o ficha.

Límites: 120 peticiones/min por cuenta, 600/min por ficha, cuerpo ≤ 64 KB, solo JSON, CORS solo
para los orígenes del OS (sin cookies), cabeceras de seguridad, registros sin fichas ni IPs.

### 4.2 Rutas (v1)

| Ruta | Quién | Qué |
|---|---|---|
| `GET /salud` | cualquiera | `{ok, version, arriba_s, almacen, jwks, replica:{pendientes, hoy}}` — sin secretos |
| `GET /v1/yo` | sesión o ficha | cuenta/ámbitos/es_metagenesis (el cliente lo usa para probar) |
| `POST /v1/bus/eventos` · `GET /v1/bus/eventos?desde=&tipos=&limite=&esperar=` | ficha `bus` / sesión | mismo contrato que `relevo_eventos` (quien ≤ 40, tipo ≤ 40, texto ≤ 4.000, datos ≤ 16 KB); lectura por cursor y **espera larga** hasta 25 s (sustituye al sondeo y a Realtime para el bus) |
| `POST /v1/latidos` · `GET /v1/latidos` | ficha / miembro | latidos de agentes y directores (fase, modelo, medio) |
| `POST /v1/neuronas/latido` · `GET /v1/neuronas` | sesión | presencia y señales de las neuronas de **esa** cuenta; «en línea» = latido < 12 min (`neuronas-un-aparato.md`) |
| `POST /v1/presencia` · `GET /v1/presencia?cuentas=` | sesión | «en línea / última vez» con la regla de `os_presencia` (visible o tú) |
| `POST /v1/metagenesis/latir` · `ceder` · `baja` · `foto` · `GET …/arriendo` · `POST …/ordenes` | llave de nodo / miembro | arriendo de líder con las **mismas reglas** que `metagenesis_nodo_latir` (toma libre o caducado, renueva el líder, relevo ordenado ≥ 100 puntos con racha ≥ 600 s, quien cede no toma) y órdenes con su lista blanca y 30/h por cuenta |
| `POST/GET /v1/malla/nodos` | ficha `malla` | descubrimiento de la malla de Astraura (lo que hoy hace `astraura_mesh_nodes`) |
| `PUT/GET /v1/astraura/estado/{destino_fijo,tunel_publico,cerebros}` | ficha `astraura` | destino y túnel publicados y estado de cerebros (sin contenido) |
| `PUT /v1/freno` · `GET /v1/freno` | ficha `freno` / cualquiera | el freno de consumo, empujado por la vigía |
| `GET /v1/cache/{estaciones,versiones}` | cualquiera / sesión | lecturas semipúblicas con TTL 60/300 s y una sola petición en vuelo |
| `GET /v1/metricas` | ficha `metricas` / miembro | servidas sin Supabase, peticiones a Supabase y ahorro de hoy por grupo |

## 5. El cliente del OS (`src/lib/datos/puerta-a1*.ts`)

- `puerta-a1-tipos.ts` (puro, sin `node:*`): configuración, validación de URL (solo `https://`
  salvo `localhost`), decisión de destino, cola de escrituras pendientes, contadores del día.
- `puerta-a1.ts`: `crearPuertaA1({ fetch, almacen, ahora, url, sesion })` → `salud()`, `yo()`,
  `publicarEvento()`, `leerEventos()`, `latirNeurona()`, `neuronas()`, `presencia()`, `freno()`,
  `cache()`, `arriendo()`, `ordenMetagenesis()`, y `conRespaldo(op, respaldoSupabase)`.
- **Elección automática**: la salud se prueba como mucho cada 30 s (60 s si va mal, hasta 10 min
  con espera creciente); con la puerta sana se usa; si no responde, da 5xx o tarda más de 4 s, la
  operación se repite **en Supabase** por la función de respaldo que pasa quien llama, que sale
  por el cliente singleton y, por tanto, por el **guardián de consumo**. Un 401/403 de la puerta no
  vuelve a Supabase (sería saltarse un permiso).
- **Nunca se pierde una escritura**: puerta → Supabase → cola local (`localStorage`, 200 como
  mucho, la más vieja sobra con aviso) que se vacía sola al volver cualquiera de las dos.
- **Por neurona**: `starseed.puerta-datos.v1` en este aparato: `auto` (por defecto) o `apagada`
  (todo a Supabase como antes). Sin URL configurada, el modo `auto` equivale a `apagada`.
- **URL**: `NEXT_PUBLIC_PUERTA_DATOS_URL` o la fila `os_puerta_datos` (solo cuentas con sesión;
  en caché 6 h en el aparato; «no hay puerta», 30 min — PDA1012). Nunca se escribe en el repo ni en documentos.
- **Genesis › Consumo y créditos**: fila «Puerta de datos (A1)» (`fila-puerta-datos.tsx`) con la
  salud (verde/ámbar/rojo y cuándo se midió), peticiones ahorradas hoy (las de la puerta, medidas
  allí) y las de este aparato, la réplica pendiente y el interruptor de esta neurona. Datos:
  `GET /api/mando/puerta-datos` (solo local, `guardianMando`) que lee
  `~/.starseed/puerta-datos.json`, escrito por `scripts/puente/puerta_datos.py medir` (por SSH, sin
  IPs ni URLs en el archivo).

Para Python (enjambre, directores, nodos): `scripts/puente/puerta_datos_cliente.py`, solo
biblioteca estándar, mismo contrato y mismo respaldo (puerta → Supabase → cola en disco).

## 6. Réplica a Supabase (lo que hay que conservar, por lotes y con tope)

Migración `supabase/migrations/20261011120000_puerta_datos.sql` (**aplicada el 2026-10-10** con la
autorización de Alex; RLS comprobada: un no-dueño no lee llaves ni registra ninguna): tablas `puerta_datos_llaves` (huella sha256 de la llave de la puerta) y
`os_puerta_datos` (fila única: URL de la puerta, activa, versión y salud; la leen solo cuentas con
sesión) y la función `puerta_datos_replicar(_llave, _lote)` (`SECURITY DEFINER`, ejecutable con la
clave pública, comprueba la llave dentro) que aplica un lote acotado:

- `eventos` → `relevo_eventos` (≤ 200 por lote, mismos límites de tamaño);
- `neuronas` → `neuron_devices.last_seen_at = greatest(...)` **solo en filas que existen y solo si
  `owner` es la cuenta del latido** (nunca crea ni cambia de dueño);
- `presencia` → `os_presencia.visto` hacia delante, sin tocar `visible`;
- `arriendo` → la foto de `metagenesis_arriendo` si esa tabla existe (to_regclass).

Una llave robada solo podría adelantar «visto» de lo que ya existe o escribir eventos (que hoy ya
puede escribir `anon`). La puerta manda un lote cada 5 min si hay algo, reintenta con espera
creciente (402/429/5xx), respeta el freno (con freno solo réplica esencial: arriendo y presencia),
y la cola de réplica vive en SQLite: un corte no la pierde. Rollback:
`20261011120000_puerta_datos_rollback.sql`.

## 7. Plan de corte y vuelta atrás

| Fase | Qué cambia | Cómo se activa | Vuelta atrás |
|---|---|---|---|
| 0 · sombra (hecha, PDA1010) | Puerta desplegada y sana en el A1; bus, arriendo, JWKS y métricas vivos; nadie depende de ella | `python3 scripts/puente/puerta_datos.py desplegar` | `systemctl stop starseed-puerta-datos` |
| 1 · máquinas (**encendida 2026-10-10, PDA1011**; §10.2) | Backend de Astraura (malla, estado de cerebros), nodo de MetaGenesis (arriendo), vigía (freno), publicadores del bus y latidos de agentes → puerta con respaldo. Next (destino) queda para la integración siguiente | fichas en `~/.starseed/env` (`PUERTA_DATOS_URL`, `PUERTA_DATOS_FICHA_*`) | por consumidor: `ASTRAURA_PUERTA_DATOS`, `STARSEED_NODO_PUERTA`, `STARSEED_BUS_PUERTA`, `STARSEED_LATIDO_PUERTA` = `apagada`; o quitar la variable |
| 2 · navegador | Neuronas, presencia, freno y bus de MetaGenesis por el adaptador; arriendo de MetaGenesis en la puerta (OPA1011 añade el transporte `puerta` a `nodo_metagenesis_bus.py`) | aplicar la migración, registrar la llave, `os_puerta_datos.activa = true` | por neurona: interruptor en Genesis; global: `activa = false` (≤ 6 h; al momento con recarga) |
| 3 · sesiones y malla | `getClaims()` local en navegador y middleware; faros y relé cifrado en la puerta; caché de estaciones y versiones | ola propia | interruptor por neurona |

Antes de parar la puerta a propósito: `node bin/puerta-datos.mjs vaciar` (manda la réplica
pendiente). Si el A1 cae, los clientes vuelven solos a Supabase en ≤ 30 s y el guardián de consumo
vuelve a ser la única defensa (como hoy).

## 8. Despliegue y medida

```
python3 scripts/puente/puerta_datos.py desplegar      # empaqueta servicios/puerta-datos, lo sube por SSH, instala y reconcilia Caddy
python3 scripts/puente/puerta_datos.py fichas         # crea las fichas que falten y las guarda en ~/.starseed/env (solo nombres en pantalla)
python3 scripts/puente/puerta_datos.py medir          # salud + métricas → ~/.starseed/puerta-datos.json
python3 scripts/puente/puerta_datos.py estado         # lo mismo, en pantalla, sin IPs ni URLs
python3 scripts/puente/puerta_datos.py registrar-llave # huella de la llave de réplica en Supabase
python3 scripts/puente/puerta_datos.py alta-nodos      # llaves (solo huellas) de los nodos de MetaGenesis de la Mac y del A1
```

En el A1 a mano: `sudo bash /opt/starseed/puerta-datos/deploy/instalar.sh /opt/starseed/puerta-datos`.

## 9. Lo que NUNCA

- Datos personales con contenido fuera de Supabase; la clave de servicio de Supabase en el A1.
- Fichas, llaves, IPs ni URLs de la puerta o de túneles en el repo, memorias, registros o el chat.
- Puertos abiertos sin TLS: la puerta solo escucha en `127.0.0.1`.
- Una escritura que se pierda en silencio: si la puerta y Supabase fallan, se guarda y se dice.
- Tocar `deploy/oracle/**`, `scripts/puente/oracle_*.py` (OPO1011) ni `nodo_metagenesis*.py` /
  `src/lib/metagenesis/remoto*.ts` (OPA1011): la puerta se integra por sus contratos públicos.

## 10. Estado real

### 10.0 Fase 0 · sombra (PDA1010, 2026-10-10, 21:15–21:35 UTC)

**Desplegada y sana en el A1, en fase 0 (sombra).** Medido:

- `starseed-puerta-datos.service`: `enabled`, `active`, 0 reinicios, **34,7 MB** de memoria;
  escucha solo en `127.0.0.1:8791`; `/salud` dentro del A1 en 1,4–4 ms.
- **HTTPS** por Caddy (`datos.<host>`, Let's Encrypt al primer intento): sonda desde la Mac en
  **219–258 ms** ida y vuelta (México ↔ Querétaro, conexión nueva cada vez). La ruta se añade por la
  API de Caddy y se reconcilia cada 10 min; ningún archivo de OPO1011 se tocó.
- **JWKS** del proyecto leída (ES256): 1 petición por arranque y cada 10 min. Una sesión con `kid`
  desconocido → 503 (el cliente vuelve a Supabase) y relectura como mucho cada 5 min.
- Entorno `/etc/starseed/puerta-datos.env` y `tokens.json`: root:starseed 640, solo la clave
  pública y la llave de réplica (sin clave de servicio). 5 fichas creadas (astraura, enjambre,
  vigía, genesis, admin) y guardadas en `~/.starseed/env` de la Mac (600) junto con
  `PUERTA_DATOS_URL` y `PUERTA_LLAVE_REPLICA`; en pantalla, solo nombres.
- Prueba de punta a punta desde la Mac por HTTPS con el cliente Python: 5 eventos publicados
  (p50 **204 ms**), lectura por cursor, **espera larga** (llegó a los 1,2 s de publicarse), latido,
  malla (alta + lista), freno empujado, métricas; nodo de prueba de MetaGenesis dado de alta con
  ficha admin → `latir` 200 en 171 ms (líder, término 1) → llave mala 403 → vista con ficha genesis
  → `baja` → revocado; sesión falsa 401/503, sin credencial 401. Los datos de prueba se borraron y
  los eventos `prueba*` no se replican.
- Réplica: activa con llave, **esperando la migración** (sin aplicar: la primera pasada con algo que
  replicar dirá «la migración de la puerta aún no está aplicada» y esperará 6 h).
- Consumo de Supabase de la propia puerta hoy: 5 lecturas de la JWKS (una por despliegue).

**Medido después de CON1010 y `30e31a3f` (20:53–21:23 UTC, con el freno puesto):** 211 peticiones
en 30 min (≈ 420/h). Lo que más pide ahora: `merge_user_prefs` 61 (navegador, dato personal: se
queda), `relevo_eventos` 59 (37 del **nodo de MetaGenesis** `starseed-nodo-metagenesis/1`, 12 del
enjambre, 10 de Next), `astraura_state` 42, `os_presencia` 15, `astraura_mesh_nodes` 10. El nodo de
MetaGenesis por el bus (≈ 1.780/día) es hoy el mayor consumidor de máquina a máquina y es justo lo
que la ruta `/v1/metagenesis/latir` sustituye con las mismas reglas.

### 10.1 Para activar (en orden; cada paso se deshace solo)

1. ✅ **Nodo de MetaGenesis** (PDA1011) — transporte `puerta` en `nodo_metagenesis_bus.py`
   (`EnlacePuerta`): arriendo por `metagenesis_latir` antes del bus; si devuelve `None`, esa misma
   vuelta sigue por el bus y la puerta se reprueba a los 5 min. Llaves de la Mac y del A1 dadas de
   alta con `python3 scripts/puente/puerta_datos.py alta-nodos` (solo viaja la huella).
2. ✅ **Migración y llave** — aplicada con la autorización de Alex (2026-10-10) y
   `puerta_datos.py registrar-llave` → `{"ok": true}`.
3. ✅ **Backend de Astraura** — commit `32a54ef9` en el repo `IA 1.58 bit` (local, sin push):
   `app/core/puerta_datos.py` + `mesh_network.py` + `cerebros_manager.py`.
4. ✅ **Navegador** (PDA1012, §10.3) — antes faltaba: la build instalada no trae `src/lib/datos/puerta-a1*.ts` (en
   `localhost:9002`, `/api/mando/puerta-datos` → 404) y, además, el adaptador aún no está cableado
   en neuronas, presencia y freno (solo existe en el contenedor, sin integrar). Queda listo lo demás:
   `os_puerta_datos.url` puesta (`activa = false`), el freno empujado a la puerta por la vigía y las
   llaves registradas. Paso siguiente: una ola que cablee `puertaA1()` en esos tres sitios →
   integración → build → `update os_puerta_datos set activa = true`.
5. ✅ **Next (destino)** (PDA1012, §10.3) — antes `src/lib/astraura/destino-nube.ts` leía `astraura_state` en
   Supabase (8–10 lecturas por 30 min): necesita código de servidor, `PUERTA_DATOS_URL` y la ficha
   `astraura` en el entorno de Next (Mac y Vercel) y una build.

### 10.2 Fase 1 encendida (PDA1011, 2026-10-10, 22:10–23:10 UTC)

Encendido, con respaldo automático a Supabase e interruptor en cada consumidor:

| Consumidor | Qué va por la puerta | Respaldo | Interruptor |
|---|---|---|---|
| Backend de Astraura (`com.starseed.astraura`, reiniciado 22:19, salud 200) | malla: alta y descubrimiento (`/v1/malla/nodos`); estado de cerebros: la HUELLA del registro (`/v1/astraura/estado/cerebros`), nunca su contenido; Supabase se mira igualmente 1 vez/h | Supabase como antes si la puerta no responde (salud con espera 1–10 min) | `ASTRAURA_PUERTA_DATOS=apagada` |
| Nodo de MetaGenesis (Mac 22:27, A1 22:33 reinstalado con `oracle_nodo.py instalar`) | arriendo de líder, latido y órdenes de miembros (`/v1/metagenesis/*`) | el bus de siempre en la misma vuelta | `STARSEED_NODO_PUERTA=apagada` |
| Vigía de consumo (`vigia_consumo.py`) | el freno, empujado en cada vuelta (`PUT /v1/freno`) | `os_freno` sigue siendo la verdad (se escribe antes) | — |
| Publicadores del bus del enjambre | eventos importantes (`/v1/bus/eventos`, réplica a `relevo_eventos` por lotes ≤ 5 min); `latido`/`tunel`/`mg_*` siguen directos a Supabase | Supabase directo | `STARSEED_BUS_PUERTA=apagada` |
| `latido_externo.py` | el latido del agente en `/v1/latidos` (clase `agente`) | el archivo local de siempre | `STARSEED_LATIDO_PUERTA=apagada` |

Lo que el bus de Supabase sigue llevando del nodo, a propósito: la vista de MetaGenesis del OS
(`remoto-nodos.ts`) aún lee el bus, así que el nodo deja allí su latido como ESPEJO cada 10 min (la
vista da por vivo 15 min), lee órdenes firmadas y asignaciones cada 10 min y publica foto,
decisiones y resultados. Con el freno puesto el nodo ya da una vuelta cada 10 min, así que hoy el
ahorro del nodo es menor que el estimado (≈ 1.700/día): llega entero cuando la vista del OS lea la
puerta (fase 2). Como la puerta vive en el A1, si el A1 cae caen a la vez la puerta y su nodo y la
Mac vuelve sola al bus: no hay dos líderes salvo un corte de la puerta que solo vea un medio.

**Medido (registros de Supabase por ruta y agente, ventanas de 30 min, freno puesto en ambas):**

| Ruta (quién) | Antes 21:40–22:10 | Después 22:35–23:05 |
|---|---|---|
| `astraura_mesh_nodes` (backend, curl) | 12 | **0** |
| `astraura_state` GET (backend, curl) | 17 | **0** |
| `astraura_state` POST (backend: secciones con memoria, se quedan) | 10 | 10 |
| `relevo_eventos` (nodo de MetaGenesis) | 26 | **14** |
| `rpc/puerta_datos_replicar` (coste de la puerta) | 0 | 3 |
| `astraura_state` GET (Next, destino — fase 1 sin hacer) | 10 | 8 |
| `relevo_eventos` (enjambre de la Mac, python — su copia de `~/.local/bin` aún no tiene el cambio) | 12 | 21 |
| `relevo_eventos` GET (Next, Genesis leyendo el bus) | 10 | 10 |
| **Total del proyecto** | **217** | **87** |

- Ahorro atribuible a la fase 1: **−41 peticiones por 30 min** en las rutas encendidas, **+3** de
  réplica → **neto ≈ −76/h ≈ −1.800/día** con el freno puesto. El total del proyecto bajó un 60 %,
  pero la mayor parte de esa bajada es del navegador (`merge_user_prefs` 17 → 0, `/auth/v1/user`
  20 → 0, `rpc/es_metagenesis*` 14 → 0, Realtime 10 → 0): estuvo quieto y **no** es mérito de la
  puerta. El enjambre de la Mac publicó más (21 frente a 12) por trabajo, no por la puerta.
- La puerta, en el mismo rato: **52 peticiones servidas**, 3 a Supabase (réplica), 0 errores;
  el backend de Astraura hizo 30 operaciones por ella, **0 respaldos**; HTTPS 208–232 ms desde la Mac.
- Réplica por lotes: un evento `prueba_replica` se quedó en la puerta (no se replica) y uno real
  llegó a `relevo_eventos` con su hora original (id 40823, 5 min después).

**Corte de 68 s a propósito (23:08:21–23:09:29), con `vaciar` antes:**

- Evento del bus escrito con la puerta parada → `via: supabase` (llegó: id 40878). Alta de la malla
  de Astraura → Supabase (respaldo 1). `latido_externo.py` → archivo local. **Ninguna escritura perdida.**
- La vuelta del nodo de la Mac cayó dentro del corte (23:08:50): «bus (la puerta no respondió)»,
  mismo líder y mismo término (sin relevo en falso).
- Al volver: el bus y la malla de Astraura otra vez por la puerta al primer intento; el nodo de la
  Mac volvió a la puerta en su vuelta siguiente (23:21). Pero con el freno el nodo solo daba una
  vuelta cada 10 min: entre su último latido por la puerta (22:58) y el siguiente (23:21) pasaron más
  de 15 min, su arriendo caducó y el A1 tomó el mando (término 2) por las reglas de siempre (un
  solo líder en todo momento). La Mac lo recuperó por relevo ordenado (≥ 100 puntos más y racha
  ≥ 600 s) a las 23:37 (término 3). Arreglado (`espera_tras`): por la puerta la vuelta no cuesta Supabase, así que el nodo
  sigue su ritmo normal (líder 120 s, resto 300 s) aunque haya freno; el espejo y las órdenes del
  bus siguen cada 10 min.

**Con el freno puesto la réplica solo lleva lo esencial (§6: arriendo y presencia)**: desde que la
vigía empuja el freno a la puerta (22:41), los eventos del bus que entran por ella esperan en su
cola de SQLite (4 a las 23:15) y llegan a `relevo_eventos` cuando el freno se levanta (00:00 UTC). No
se pierden, pero quien los lea en Supabase (Genesis de otra neurona) los ve tarde. Hoy solo afecta al
enjambre del A1 (el de la Mac publica directo con su copia vieja). Decisión pendiente: replicar
también los eventos importantes con freno, a menos ritmo (p. ej. cada 15 min), o que el enjambre
publique directo mientras haya freno.

**Pendiente de esta fase:** Next (destino, §10.1.5); poner al día `~/.local/bin/starseed-enjambre.py`
en la Mac (`bash scripts/enjambre/instalar.sh` con el enjambre quieto: va por detrás de main, sin
CAP1010 ni PDA1011); `/salud` dice `jwks: "sin-claves"` cuando la JWKS lleva > 30 min sin usarse
(la clave ES256 sí está: se recarga en la primera sesión), etiqueta engañosa que conviene cambiar.

### 10.3 Fase 2 · navegador y Next (PDA1012, 2026-10-11)

Cableado de verdad, con respaldo automático a Supabase (por el cliente único y, por tanto, por el
guardián de consumo) y un interruptor por neurona:

| Qué | Dónde | Por la puerta | Respaldo |
|---|---|---|---|
| Latido ligero de la neurona (cada 5 min) | `neurons.ts` → `neuronas-puerta.ts` | `POST /v1/neuronas/latido` | `update neuron_devices.last_seen_at` (y, si la fila no existe, la ficha) |
| Vida de las neuronas en la lista | `listNeurons()` | `GET /v1/neuronas` (caché 60 s, también con freno) | `last_seen_at` de Supabase |
| Registro (nombre, capacidades) | `listNeurons()` | — | Supabase al abrir y cada **30 min** con la puerta sana (5 min sin ella); la ficha propia sube al abrir y cada 30 min |
| Presencia de la mensajería | `mensajeria/presencia.ts` | `POST/GET /v1/presencia` | `os_presencia` |
| Freno | `consumo/freno.ts` (`leerFilaFreno`) | `GET /v1/freno` (lo empuja la vigía) | `os_freno` |
| Destino y túnel de Astraura (servidor de Next) | `destino-nube.ts` (`publicadoEnLaPuerta`) | `GET /v1/astraura/estado/{destino_fijo,tunel_publico}` con `PUERTA_DATOS_URL` + `PUERTA_DATOS_FICHA_ASTRAURA` (en `.env.local` de la Mac; Vercel no las tiene) | `astraura_state`; un 404 de la puerta (aún sin copiar) también va a Supabase |
| Copia de lo publicado | `publicar_tunel_astraura.py`, `publicar_destino_astraura.py` → `espejo_puerta.py` | `PUT /v1/astraura/estado/…` si cambió o cada 30 min | — (Supabase sigue siendo la verdad) |

- «No hay puerta» (`os_puerta_datos.activa = false` o sin sesión) se recuerda **30 min** en el
  aparato (antes 6 h): encender la puerta llega a todos en ≤ 30 min; la URL buena, 6 h.
- Genesis › Consumo y créditos › **Puerta de datos · A1**: salud (medida por SSH/HTTPS y renovada
  sola si tiene > 15 min), ahorradas hoy medidas en la puerta, réplica, **lo de esta neurona por
  grupo** (`neuronas 6/6 · presencia 2/3 · freno 1/1` = por la puerta / total) y si esta pestaña
  habla con la puerta, con el interruptor Automática/Apagada (el adaptador vivo lo nota al momento).
- Pruebas que fallan si se desconecta: `neuronas-puerta.test.ts`, `freno-puerta.test.ts`,
  `presencia-puerta.test.ts`, `destino-nube-puerta.test.ts`, `test_espejo_puerta.py` y los nuevos
  casos de `puerta-a1.test.ts` y `fila-puerta-datos.test.tsx`.
- Se queda en Supabase, a propósito: la presencia del widget de Mensajes (una lectura cada ≥ 5 min,
  junto a los perfiles), el bus de MetaGenesis de la vista remota (archivo de OPA1011) y el registro.

