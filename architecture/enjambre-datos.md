# Contrato · Enjambre de datos: torrents rediseñados para la malla StarSeed (ENJ1110A · 2026-11-10)

Estado: **análisis, diseño y motor probado en simulación. Nada está enchufado a la app todavía** (eso es ENJ1110B). El motor vive en `src/lib/enjambre/` (TypeScript puro, solo WebCrypto, sin dependencias nuevas).

## 0 · En diez líneas

1. Todo contenido se identifica por su **raíz**: un árbol Merkle SHA-256 con hojas de 16 KiB (como BEP 52). La **pieza** (trozo) es una capa del árbol de 64 KiB a 1 MiB, elegida solo por el tamaño, así que un imán basta para empezar.
2. Una **semilla** (descriptor firmado) y un **imán** (`starseed:?xt=urn:ss256:<raíz>…`, sin claves jamás) bastan para pedir el resto a los pares: la capa de piezas se baja de los pares y se comprueba contra la raíz.
3. Cada trozo se verifica **antes** de guardarse o de volver a servirse, con el hash de la capa o con su prueba Merkle.
4. Cuatro **ámbitos**: público (claro, semilla firmada), y privado / grupo / comunidad (texto cifrado de forma determinista; el árbol se calcula sobre el cifrado, así cualquiera lo verifica y lo re-siembra sin poder leerlo).
5. En lo no público el **id del enjambre** en el cable es `HMAC(secreto, raíz)`: quien no es miembro ni reconoce el contenido.
6. **Descubrimiento por capas**: vecinos de cada enlace, presencia de la cuenta o del grupo, intercambio de pares dentro del enjambre, **espejos** HTTPS con Range (verificados por trozo) y, solo como diseño, un rastreador StarSeed y una tabla Kademlia.
7. **Planificador por vías** (par + carril con capacidad, latencia, coste y fiabilidad medidos): la vía rápida lleva el grueso, Bluetooth solo lo raro o lo que le sale a cuenta; cuatro modos (`secuencial`, `raro-primero`, `final`, `urgente`) y super-siembra para envíos a grupo.
8. **Política cooperativa en lugar de tit-for-tat**: a mis neuronas siempre (con topes de batería y datos); a grupos con reparto por turnos y razón blanda; a lo público solo si la persona lo activa; relé ciego aparte, también opt-in.
9. **Canales**: puntero firmado `(huella del editor, nombre, seq) → raíz`; gana la `seq` más alta; sirve para «última versión de la app para Android», una publicación de la Biblioteca o una capa de conciencia.
10. **No se copia BitTorrent**: se quita el rastreador obligatorio, el DHT público y el ojo por ojo; se añade el cifrado por ámbito, las vías múltiples simultáneas y los espejos verificados.

---

## 1 · Qué pidió Alex (09-11)

Investigar, analizar e integrar los formatos y algoritmos de los torrents (sembradoras y recolectoras, enjambres, imanes, espejos, rastreadores y sus funciones automáticas) para la **máxima eficiencia de transmisión en la malla P2P**; no copiados, sino mejorados y rediseñados para StarSeed OS con las capacidades y ajustes de las neuronas, su fusión de antenas y las transmisiones sincronizadas simultáneas. Debe ser inteligente, autogestionado, seguro, privado o público, configurable y sincronizable con las capas de conciencia colectiva. «Analiza las posibilidades, cómo integrarlo.»

## 2 · Lo que se investigó (consultado el 2026-11-10) y qué se decide frente a cada fuente

| Fuente | Qué dice (verificado en la especificación) | Decisión StarSeed |
|---|---|---|
| **BEP 3** (protocolo) | Conexiones nacen «choked». Cada par «unchoke» a los 4 interesados de mejor tasa (si ya es semilla, ordena por subida), decisión cada ~10 s; un «optimistic unchoke» rota cada 30 s. Peticiones en cola (pipelining) para llenar TCP. Final de partida (endgame): pedir lo que falta a todos y mandar `cancel` al llegar. | Se **conserva** el pipelining (profundidad por vía según ancho de banda × retardo) y el final de partida (`final`, con `enj.cancela`). Se **sustituye** el choking por la política cooperativa de §8: el castigo por no devolver no encaja en una red de cuentas propias y grupos. |
| **BEP 52** (v2) | Hojas de 16 KiB, SHA-256, un árbol por archivo; las **capas de piezas** (`piece layers`) se publican aparte; mensajes `hash request` / `hashes` (con hashes «tío» hasta la raíz) / `hash reject`. | Se **adopta casi tal cual**: hoja de 16 KiB, SHA-256 y capa de piezas pedida a los pares con `enj.capa` (rango + prueba), comprobada contra la raíz. Diferencia: la pieza es adaptativa (64 KiB–1 MiB) y la semilla no lleva la capa, así que un imán solo basta. |
| **BEP 9 + 10** (magnet → metadatos) | Los metadatos se bajan en trozos de 16 KiB a los pares y se verifican contra el infohash. | El equivalente es la **semilla mínima** que sale del imán (raíz, tamaño, ámbito, tamaño de pieza) más la capa de piezas por `enj.capa`. En lo público, el par puede dar además la semilla firmada (`enj.anuncio.semilla`), que se acepta solo si la firma y el certificado de cuenta verifican. |
| **BEP 5** (Kademlia DHT) | Tabla distribuida para hallar pares de un infohash. | **Solo diseño** (§5, E3). Un DHT global filtra qué contenido busca cada IP (análisis de tráfico). Se hará como tabla acotada a la malla, no pública. |
| **BEP 11** (PEX) | Mensaje `ut_pex` ≤ 1 por minuto, ≤ 50 pares añadidos, solo tras conectar, con `dropped`. | Se **adopta** dentro del enjambre (`enj.pares`, máx. 8 por mensaje, cada 10 s a lo sumo y sin repetir pares). |
| **BEP 27** (privados) | Un torrent privado solo habla con su rastreador y **no** usa DHT, PEX ni LSD. | Se **matiza**: PEX es válido en lo privado porque pertenecer al enjambre exige conocer el id derivado del secreto; DHT/rastreador público **no** se usan para lo privado. |
| **BEP 19** (web seeds) | `url-list`: URLs donde bajar los datos; si un trozo falla el SHA se descarta esa URL; pedir un trozo suelto con Range desde cientos de peticiones puede parecer un ataque al servidor. | Se **adopta** como `espejo` (§9) con las mismas reglas: un trozo malo mata ese espejo; las peticiones se agrupan por vía en el planificador; solo HTTPS con filtro anti-SSRF. |
| **BEP 16** (super-siembra) | La semilla se hace pasar por vacía, ofrece a cada par un trozo que nadie tiene y no ofrece más hasta verlo en otro par; ~105 % de subida frente a 150–200 %. | Se **adopta** (`SuperSembrador`), pensado para el envío a un grupo. En la simulación: 1,25× frente a 2,5× (§12). |
| **BEP 29** (uTP) | UDP con control de congestión por retardo (objetivo 100 ms). | No se implementa: los carriles de StarSeed ya traen su control (TCP 47071, GATT, L2CAP, Wi‑Fi directo). La **medición de velocidad real por vía** del planificador cumple la misma función a nivel de aplicación. |
| **BEP 46** (mutables) | Puntero mutable en el DHT (`xs=urn:btpk:<clave>`) a un infohash nuevo. | Se **adopta la idea** como **canal** firmado (§10), pero cotilleado por la malla y por espejos, no por el DHT. |
| **WebTorrent** | En el navegador solo WebRTC; solo habla con pares WebRTC; torrents inmutables, sin streaming en vivo propio. | La neurona web es **solo-recolectar** por defecto. El motor no depende de ningún transporte: ENJ1110B enchufa `transporte-universal`. |
| **IPFS Bitswap** | `want-have` / `want-block` / `have` / `dont-have`, lista de deseos con prioridad y cancelación; sin descubrimiento ni privacidad propios. | Parecido a `enj.tengo` / `enj.pide` / `enj.no` / `enj.cancela`. Se añade lo que a Bitswap le falta: id de enjambre opaco por ámbito y política de a quién se sirve. |
| **iroh-blobs** | Hash BLAKE3 de 32 bytes; verificación en flujo por trozos; rangos pidiendo solo la parte del árbol necesaria. | El diseño es equivalente (verificar por trozo con prueba). **Por qué no BLAKE3 ahora:** WebCrypto no lo tiene, haría falta WASM en cada WebView y no hay ganancia que compense frente a SHA-256 acelerado por hardware. **Dónde podría ir después:** en el lado Rust (servidor local y actualizador), con una raíz `urn:ss-b3` paralela. |
| **Hypercore / Dat** | Registro de solo-añadir con árbol Merkle firmado (Ed25519), descarga dispersa. | La idea de **registro firmado** se usa en el canal (seq creciente). No se adopta el log completo: nuestros contenidos son inmutables y lo que cambia es el puntero. |
| **Syncthing (BEP v1)** | Bloques de 128 KiB–16 MiB, tamaño fijo por archivo, el que responde puede reusar un bloque con el mismo hash de otro archivo. | Misma regla de tamaño de pieza (el menor que dé ≤ 2048 piezas). La **reutilización por hash** entre contenidos queda como mejora de E4 (§11). |

Fuentes con enlace al final (§17).

## 2.1 · Lo que ya existe en el repo (leído, no supuesto)

- **`src/lib/network/archivos-malla.ts`** (3067 líneas): ofertas y aceptación de archivo, trozos de 16 KiB por defecto, 63 KiB en enlace directo y hasta 256 KiB, huecos para reanudar (`huecosDe`, `primerFaltante`), SHA-256 del archivo entero y una «raíz» que es el SHA‑256 de la **concatenación** de los hashes de trozo (`calcularHashLista` / `raizDeHashes`), no un árbol. En `main` el mensaje `fin` ya se reenvía una vez con un periodo de gracia; ARC1110A añade una oferta anticipada con aceptación previa. **El enjambre no toca nada de eso**; E1 lo sustituirá detrás de un interruptor.
- **`src/lib/malla/cifrado-archivo.ts`**: AES‑256‑GCM por trozo con clave aleatoria por transferencia; nonce = 4 bytes del id de transferencia + índice; AAD = id|índice|total|longitud; la clave viaja en la oferta envuelta por destinatario (`recipient-crypto`). **No sirve tal cual para el enjambre** porque el texto cifrado cambia con cada transferencia (la raíz no sería estable). La variante determinista está en `sellado-contenido.ts` (§4).
- **`canal-multitrayecto-vias.ts`**: vías por tipo (`directa`, `cuenta`, `rele-neurona`, `rele-propio`, `rele-starseed`, `router`), reparto entre varias a la vez. **`matriz-enlaces.ts`**, **`conectores/planificador-vias.ts`** y **`transporte-universal.ts`** dicen qué carriles hay hacia cada par y cuánto valen. El planificador del enjambre (`ViaPlan`) recibe esos mismos números inyectados.
- **`puerta/*`**: la puerta de internet compartida y su filtro anti‑SSRF (`hostEsPrivado`, `ipPrivadaOLocal`, capas, decisión por solicitante). Los espejos pasan por ahí (§9).
- **`identidad/*`**: certificado cuenta → neurona y revocaciones. El verificador de firmas del motor admite `verificarCert` inyectado para usarlo.
- **Capas de conciencia** (`architecture/astraura-158-sistema-primario.md` §15 y §19; `astraura-158-aprendizaje-continuo.md`): hoy son cuatro interruptores (`local`, `mesh`, `nube`, `colectiva`) más las capas por personalidad y agente; la colectiva viaja por `setupConcienciaSync` (`lan-sync.ts`) con los temas `astraura/experiencias`, `astraura/capacidades` y `astraura/adaptador`, filtrados por `capaMeshCompartiendo()`. El adaptador se describe con `ManifiestoAdaptador {actual, sha, t, experiencias, exactitud_dorado, base}`. No hay hoy ningún reparto de **pesos** por la malla: el manifiesto solo dice cuál es y su SHA.
- **Actualizador y servidor local** (solo lectura): `native/src-tauri/src/canal_actualizacion.rs` (descarga del APK con SHA‑256 contra manifiesto, comprobación de paquete y firma) y `servidor_capas.rs` (capa `.tar.gz` por `curl` reanudable, firma minisign del manifiesto, SHA‑256 del archivo y de cada fichero). Ambos ya son «descargar un archivo con hash conocido desde una URL»: justo lo que un espejo del enjambre hace por trozo.

## 3 · Vocabulario y contenido direccionado

| Torrent | StarSeed | Archivo del motor |
|---|---|---|
| descriptor (.torrent) | **semilla** | `semilla.ts` |
| infohash / raíz Merkle | **raíz** | `arbol.ts` |
| magnet | **imán** | `iman.ts` |
| piece / block | **pieza** (trozo) / hoja de 16 KiB | `arbol.ts` |
| seeder / leecher | **sembradora** / **recolectora** | `enjambre.ts`, `politica.ts` |
| swarm | **enjambre** | `enjambre.ts` |
| tracker | **rastreador** (diseño, E3) | — |
| PEX | **intercambio de pares** | `protocolo.ts` (`enj.pares`) |
| web seed | **espejo** | `espejo.ts`, `url-segura.ts` |
| mutable torrent (BEP 46) | **canal** | `canal.ts` |

**Árbol.** Hojas de 16 KiB (`TAM_HOJA`), nodo = `SHA-256(izq ‖ der)`, relleno con la raíz de ceros del nivel (como BEP 52). La capa de piezas es el nivel cuya hoja cubre una pieza. `arbolDeBytes` y `ConstructorArbol` (por tandas, para contenido grande sin tenerlo entero en memoria), `pruebaDeNodo`, `verificarPrueba`, `rangoConPrueba` / `verificarRango` (los hashes de la capa con sus «tíos» hasta la raíz, máx. 512 por petición como BEP 52).

**Tamaño de pieza.** `elegirTamanoPieza(tamano)`: la menor potencia de dos entre 64 KiB y 1 MiB que deja ≤ 2048 piezas. Es **función del tamaño**: dos neuronas que solo conocen raíz y tamaño (un imán) coinciden. El imán lleva `ps` solo si no es el de por defecto. Tope de contenido 2⁴⁰ B.

**Semilla** (`Semilla`, `leerSemilla` estricta): `v, raiz, tamano, tamanoHoja, tamanoPieza, nombre, mime, ambito, creada, meta?, espejos?, firma?`. En ámbitos no públicos `nombre` va vacío y el nombre, el MIME y la clave de la colección viajan **sellados** en `meta`. La firma cubre un cuerpo canónico (`cuerpoFirmable`) y es una `FirmaEnj {fp, sig, pub, cert?}`: ECDSA P‑256 hoy; la firma se **inyecta** (`FirmarBytes`) y el verificador también (`crearVerificador({aceptarFp, verificarCert, exigirCert})`), así que ENJ1110B enchufa la clave de dispositivo y el certificado de cuenta de `identidad/` sin cambiar el motor.

**Colección (varios archivos).** Un blob pequeño que mapea rutas → raíz (cada archivo es su propio árbol y su propio enjambre). No hace falta código nuevo: es un contenido más con `mime: application/vnd.starseed.coleccion+json`. Se deja a E3 (Biblioteca).

**Imán** (`parsearIman` / `formatearIman`): `starseed:?xt=urn:ss256:<raíz>&dn=<nombre>&xl=<bytes>&am=<ámbito>&fi=<huella de quien publica>&es=<espejo>&ra=<pista>&ps=<tamaño de pieza>`.
- Una sola vez cada clave salvo `es` y `ra` (repetibles). Cualquier clave desconocida (incluida `k=`, `key=`…) → **rechazo total**, no «ignorar»: un imán nunca lleva claves.
- Máx. 2048 caracteres y 16 parámetros; sin caracteres de control; texto sin marcas de dirección (nada de `fdp.exe` invertido); `xl` entero acotado; `am` ∈ {privado, grupo, comunidad, publico}.
- Los espejos pasan por `validarUrlEspejo` (§9) y las pistas de rastreador son identificadores opacos (`[A-Za-z0-9:_.\-/]`), nunca URLs que se abran sin pasar por la puerta.

**Por qué no BLAKE3 ahora**, y dónde podría ir después: ver la fila de iroh-blobs en §2. La raíz lleva el prefijo del algoritmo (`urn:ss256`) justamente para poder convivir con `urn:ss-b3` más adelante.

## 4 · Ámbitos y sellado de contenido

| Ámbito | Qué viaja | Quién puede verificar y re-sembrar | Quién puede leer | Id del enjambre |
|---|---|---|---|---|
| **público** | claro | cualquiera | cualquiera | `SHA-256("ss-enj-id-pub-v1|" + raíz)`: derivable de la raíz (no hay nada que ocultar) |
| **comunidad** | texto cifrado | quien conozca el id (miembros y relés ciegos que se lo hayan dado) | miembros (clave de contenido) | `HMAC(secreto, raíz)` |
| **grupo** | texto cifrado | ídem | miembros del grupo | `HMAC(secreto, raíz)` |
| **privado** | texto cifrado | mis neuronas, mis servidores, el relé StarSeed y relés ciegos si lo permito | mis neuronas | `HMAC(secreto, raíz)` |

**Sellado determinista** (`sellado-contenido.ts`). El árbol se calcula sobre el **texto cifrado**, así cualquiera que lo tenga lo verifica trozo a trozo contra la raíz sin poder abrirlo.
- Clave de contenido aleatoria de 256 bits, **una por contenido y versión**; es un secreto de un solo uso (no se vuelve a sellar otro texto con ella; por eso la API de alto nivel crea la clave y no expone «sellar con esta clave y este nonce»).
- Nonce de 12 bytes = `HMAC-SHA256(clave, "ss-enj-nonce-v1|" + índice)[0..12]`: depende de la clave y del índice de la pieza, **no** del id de una transferencia (a diferencia de `cifrado-archivo.ts`, que sigue intacto).
- AAD = `"ss-enj-v1|índice|total|longitud en claro"`: una pieza no se puede reordenar, duplicar, truncar ni pasar a otro contenido sin que el tag falle.
- Cada pieza del árbol es **un sellado independiente** de `U − 16` bytes de claro (U = tamaño de pieza; el tag GCM añade 16): se puede abrir sin las demás, útil para reproducir mientras se baja.
- Mismo claro y misma clave → mismo texto cifrado → misma raíz (probado). Otra clave → otra raíz.
- La clave se envuelve **por neurona destinataria** con el sobre que ya existe (`recipient-crypto`, vía el gancho `GanchosSobre` que ENJ1110B conecta: `envolverClave` / `abrirPaqueteClave`). El paquete lleva clave **y** secreto del enjambre, ligados a la raíz. Nunca va en el imán, ni en un anuncio, ni en la semilla.
- Metadatos sellados (`sellarMetadatos`): nombre, MIME y lo demás que no debe ver un relé.

**Consecuencia de diseño que hay que decir claro:** quien tiene el texto cifrado ve **el tamaño y la raíz** del contenido (no el nombre ni el contenido). Dos personas con el mismo archivo y distinta clave producen raíces distintas, así que el enjambre **no deduplica entre cuentas**; es el precio de que lo privado sea privado.

## 5 · Descubrimiento (automático, por capas) y sesión

Una **sesión** (`SesionEnjambre`) es una neurona dentro de UN enjambre. Hace de recolectora mientras le falten trozos y de sembradora con los que tiene, a la vez. No tiene temporizadores propios: quien integra llama a `tick()` cada ~500 ms y le pasa un `reloj()`; así se prueba con tiempo virtual.

Las capas, de la más cercana a la más lejana. Cada una añade pares a la misma sesión, que los trata igual:
- **(a) Vecinos de cada enlace ligado** (Bluetooth, TCP 47071, Wi‑Fi directo / Aware / AWDL): ENJ1110B llama `conectarPar(neurona, vías)` con las vías que da `matriz-enlaces`. Cobertura: lo que hoy ya está ligado.
- **(b) Presencia de la cuenta o del grupo en la malla**: la neurona sabe qué miembros hay; se les anuncia el contenido (E1).
- **(c) Intercambio de pares dentro del enjambre** (`enj.pares`, BEP 11): hasta 8 por mensaje, cada ≥ 10 s, sin repetir; el que recibe decide si conectar (`alDescubrirPar`).
- **(d) Espejos**: cualquier URL HTTPS con Range (Supabase Storage, GitHub Releases, servidor propio), verificada por trozo y pasando por la puerta (§9). Es la única capa que no necesita que haya otra neurona despierta.
- **(e) Rastreador StarSeed y tabla Kademlia sobre la malla — solo diseño**: un servicio opcional (`ra=` del imán) que contesta «qué neuronas de este enjambre id han anunciado en las últimas N horas» con identificadores opacos, y una tabla Kademlia acotada a neuronas que ya están en la malla (no pública). Hacen falta tablas en Supabase y un endpoint: **no se hace aquí** (sin migraciones).

Qué descubre cada capa a quién: (a)(b)(c) solo a pares ya ligados; (d) al dueño del espejo, que ve IP, URL y rangos pedidos; (e) al rastreador, que ve el id del enjambre (opaco en lo no público) y qué neurona lo anuncia.

## 6 · Protocolo (`protocolo.ts`)

Todo mensaje es JSON con `t: "enj.*"`, `v: 1` y `id` (64 hex). `leerMensajeEnj` devuelve un objeto **nuevo** con solo los campos conocidos, decodificados y acotados; ante cualquier irregularidad, `null`. Los binarios van en base64 en el cable.

| Mensaje | Para qué | Notas |
|---|---|---|
| `enj.anuncio` | quién soy: rol (`sembradora` / `recolectora` / `relevo`), `completo`, `capa`, `kbps`; en lo público, opcionalmente la semilla firmada | `relevo` = guardo texto cifrado que no puedo leer |
| `enj.tengo` | qué piezas tengo: `todo`, `mapa` de bits o `rangos`; `inc` = se suma a lo dicho | el motor elige la forma más corta |
| `enj.pide` | pido la pieza `i`; con `prueba` pido además los hashes hermanos | `rq` identifica la petición |
| `enj.trozo` | la pieza `i` (y su prueba) | solo se acepta si coincide con una petición abierta de ESE par |
| `enj.no` | no te la doy: `no-tengo`, `ocupada`, `no-autorizado`, `sin-prueba`, `limite`, `no-ofrecida`, `invalido` | cada motivo tiene su castigo suave en el planificador |
| `enj.cancela` | ya no la quiero (final de partida) | |
| `enj.pares` | intercambio de pares | |
| `enj.capa` | pide / da un rango de la capa de piezas con prueba (BEP 52 `hashes`) | rango máx. 512 hashes; las peticiones de 256 |
| `enj.canal` | un registro de canal firmado (cotilleo) | §10 |

Límites: 400 mensajes por segundo por par (el exceso se descarta en silencio), un mensaje inválido cuenta como falta del par, un trozo que nadie pidió también. Un mensaje con otro `id` se ignora.

**Orden de verificación de un trozo recibido** (`enjambre.ts`): longitud exacta → hash de la pieza → si ya se conoce el hash de la capa, igualdad; si no, la prueba Merkle contra la raíz (y entonces ese hash entra en la capa) → solo entonces `guardar`. Un trozo malo da golpe a la vía y al par y se vuelve a pedir a otro.

## 7 · Planificación por vías (`planificador.ts`)

**Vía** = (par, carril) con capacidad medida (kbit/s), latencia, coste (0..1) y fiabilidad (0..1). Una neurona con Bluetooth y red local hacia el mismo par tiene dos vías. Los números salen de `matriz-enlaces` y de `canal-multitrayecto-vias` (inyectados); el planificador además **mide la velocidad real** de cada vía en peticiones «limpias» (vía vacía al pedir) y la mezcla con la declarada.

**Asignación.** Para cada trozo, en el orden del modo, se calcula la llegada estimada por cada vía que puede darlo: `(cola ya comprometida + tamaño) / capacidad + latencia`, dividida por la fiabilidad y multiplicada por `1 + 2·coste`. Va a la de llegada más temprana; si esa vía no tiene hueco, **el trozo espera** en lugar de ir a una vía peor. Efecto: las vías rápidas llevan el grueso y las lentas (Bluetooth) solo reciben lo que ninguna rápida puede dar (trozos raros) o lo que de verdad les sale a cuenta.

**Profundidad de cola por vía** = producto ancho de banda × retardo en trozos (+1), entre 1 y 24; una vía «lenta» (menos de una décima de la mejor o < 1 Mb/s) nunca pasa de 2.

**Modos:**
- `raro-primero`: los trozos con menos copias conocidas entre pares no vetados (salud del enjambre). Desempate por hash de la semilla de la neurona: dos neuronas no piden lo mismo.
- `secuencial` (ver mientras se baja): ventana deslizante desde el cursor de reproducción (`reproduciendo(cursor, ahora)`); con `ritmoBps` los trozos cuyo plazo vence en < 2 s ignoran el coste y pueden duplicarse; lo que sobra de la ventana se rellena como raro‑primero.
- `urgente`: contenido pequeño; por orden y a la vía más rápida sin mirar el coste.
- `final`: partida final; lo ya pedido se pide también a otra vía/par (hasta `maxDuplicados`) y al llegar uno se cancelan los demás. Se activa **solo** en los otros modos cuando quedan pocos trozos y ninguno por pedir.

**Castigos.** Trozo corrupto: golpe a la vía (veto con espera creciente `4 s · 2^(n−1)`, máx. ×64) y al par (vetado al tercer golpe). `no-tengo` / `no-autorizado` se recuerdan por pieza; `ocupada` veta la vía 1,5 s; `timeout` veta tras 3 seguidos; una petición vence a las 4× la estimada (mínimo 4 s). Un par que se va devuelve sus peticiones y los trozos quedan pendientes.

**Super‑siembra** (`SuperSembrador`). Cuando UNA sembradora alimenta a MUCHAS recolectoras (envío a un grupo): a cada par que conecta se le «ofrece» un puñado de trozos distintos (por defecto 2, máx. 3 sin confirmar) y no se le ofrece más hasta ver que lo ofrecido aparece en **otra** recolectora; si lleva 8 s sin confirmar, se suelta más. En el servicio solo se sirve lo ofrecido (`no-ofrecida` si no). Con menos de dos pares esperados se ofrece todo.

## 8 · Política de compartir y almacén

**Política** (`politica.ts`, pura). StarSeed es cooperativo, sin ojo por ojo:
- **Mi cuenta**: se sirve siempre a mis neuronas, dentro de los topes de batería, datos medidos y tope diario.
- **Grupo / comunidad**: se sirve a los miembros. La equidad es de **prioridad**, no de bloqueo: reparto por turnos y una razón blanda (`ratioSuave`: servido a una neurona frente a recibido de ella). Quien la pasa queda al final de la cola y solo recibe «ocupada» si la neurona ya va justa. Jamás un «no» duro por la razón.
- **Público**: opt‑in «Sembrar contenido público», con topes y horario.
- **Relé ciego**: guardar y servir texto cifrado ajeno. Opt‑in aparte; quien lo pide demuestra conocer el id del enjambre (derivado del secreto), así que el relé no mantiene lista de miembros.
- **Roles automáticos por capacidad** (`rolAutomatico`): servidor o escritorio → sembradora fija; portátil enchufado o con ≥ 50 % → fija, si no ocasional; móvil o tableta enchufados, con Wi‑Fi y sin datos medidos → ocasional; navegador o con < 512 MiB libres → solo‑recolectar. El rol limita lo que se hace por **otras** personas y por el público; a mis neuronas se les sirve aunque sea «solo recolectar», porque ahí mandan los topes.

**Almacén** (`almacen.ts`). Interfaz `AlmacenTrozos` y lógica común `AlmacenBase`; dos soportes: memoria (pruebas) y `AlmacenOPFS` (la app, sobre una interfaz mínima de directorios para poder simularla). Por contenido: trozos por índice y la capa de piezas; cuenta de referencias (`retener` / `soltar`: una sesión que lo usa lo retiene), `fijar` (no se desaloja nunca), **cuota por ámbito** y desalojo LRU de contenido entero (un contenido a medias no sirve a nadie). El almacén **no verifica hashes**: lo hace la sesión antes de guardar. Con la cuota llena la descarga se pausa y se avisa.

## 9 · Espejos (BEP 19 a la StarSeed) y la puerta

Un **espejo** (`FuenteEspejo`) es cualquier URL HTTPS que sirva el contenido entero y entienda `Range`: Supabase Storage, GitHub Releases, un servidor propio. No habla el protocolo: el motor le pide `bytes=desde-hasta` por trozo y **verifica cada trozo igual que el de un par** (con la capa de piezas, o con la capa que el espejo publique como sidecar `<url>.enj-capa`, que se comprueba contra la raíz antes de usarla).

Reglas (las de BEP 19, más estrictas):
- Un trozo que no casa **mata ese espejo** para la sesión (`marcarMalo`); tres fallos seguidos también. «Ocupado» no lo mata.
- Respuesta aceptada solo si: `206` con `Content-Range` exacto, o `200` pidiendo el archivo entero; `Content-Length` y bytes recibidos iguales al rango; sin `Content-Encoding` distinto de `identity`.
- Se piden con `Accept-Encoding: identity` y `redirect: manual`.
- El planificador trata al espejo como una vía más (coste 0,3, fiabilidad 0,9, capacidad por medir); así comparte el trabajo con los pares y el reparto sale de la velocidad real. En la simulación: 12 de 16 trozos por el espejo y 4 por el par (§12).
- Como pide BEP 19, no se lanzan cientos de peticiones sueltas: el techo es la profundidad de cola de la vía; agrupar rangos contiguos en una sola petición queda para ENJ1110B.

**Anti‑SSRF en dos capas** (el motor solo es la primera):
1. **Sintáctica** (`url-segura.ts`, `validarUrlEspejo`): solo `https:`, sin usuario ni contraseña, sin fragmento, puerto 443; ninguna IP literal que no sea IPv4 pública (el analizador WHATWG ya normaliza `0x7f.1`, `2130706433`, `0177.0.0.1`…); ninguna IPv6 literal; ni `localhost`, `.local`, `.internal`, `.lan`, `.home`, `.corp`, `.home.arpa`, ni nombres de una etiqueta. `crearFetchEspejoSeguro` repite la validación en **cada redirección** (máx. 3).
2. **De resolución**: el `fetch` inyectado debe ser el de la puerta (`puerta/fetch-puerta.ts`), que resuelve el DNS **una vez** y comprueba la IP ya resuelta (`hostEsPrivado`, `ipPrivadaOLocal`) antes de conectar, evitando el rebinding. Un espejo en la LAN propia (servidor propio) solo se admite si la puerta concede esa capa (`decidirCapa`). **Esta capa no está en el motor ni se ha probado aquí**: la enchufa ENJ1110B.

## 10 · Canales (punteros mutables firmados)

`RegistroCanal {v, fp, nombre, seq, raiz, tamano, ts, ambito, firma}`: el editor `fp` afirma «el canal `nombre` apunta ahora a `raiz`». El cuerpo firmado incluye la huella, el nombre y la `seq`.

`AlmacenCanales.recibir` devuelve qué pasó: `nuevo`, `actualizado`, `igual`, `viejo`, `conflicto`, `invalido`, `firma-mala`, `lleno`, `futuro`.
- Gana la `seq` más alta que **verifique**; una menor es `viejo` y no cambia nada (repetición de versiones antiguas).
- Misma `seq` y otra raíz: el editor se contradijo; todos convergen en la raíz menor.
- `ts` más de 24 h en el futuro → `futuro`. Tope de 512 canales.
- La verificación admite lista de editores aceptados (`aceptarFp`) y certificado de cuenta (`verificarCert`).
- Se cotillean por `enj.canal` y se reenvían a los demás pares al aceptar uno nuevo; en la simulación, un registro cruza una neurona intermedia entre dos que no se ven.

Usos: «última versión de la app para Android» (`app/android/estable`), la versión vigente de una publicación de la Biblioteca, la capa de conciencia vigente de un ámbito (§11). **Límite honesto:** una neurona sin historia puede recibir de un par malicioso un registro **antiguo pero válido** (ataque de congelación). Mitigación: preguntar a varios pares y a un espejo y quedarse con la `seq` máxima, mostrar `ts` y no bajar nunca de la `seq` ya vista (un retroceso real se publica con una `seq` mayor que apunta a la raíz vieja).

## 11 · Capas de conciencia por el enjambre

Hoy (§2.1) la capa colectiva intercambia **experiencias** y un **manifiesto** (`actual`, `sha`, `exactitud_dorado`…) por la malla, pero no los pesos del adaptador. El enjambre cierra ese hueco así:

1. **Versión de capa = contenido.** Los pesos del adaptador (y su manifiesto) se empaquetan, se calcula su raíz y se publica una **semilla** por ámbito: *personal* → ámbito `privado` (clave envuelta a mis neuronas); *grupo* → `grupo`; *colectiva* → `comunidad` o `publico` según lo decida la persona/colectivo (decisión abierta).
2. **Convergencia = canal.** El publicador (la neurona o el servicio que entrenó) firma un registro de canal `capas/<ámbito>/<nombre>` con `seq` creciente. Las neuronas del ámbito cotillean el registro, comparan `seq`, bajan la raíz nueva por el enjambre (pares + espejos), la verifican y **solo entonces** la activan, pasando por el mismo umbral de evaluación que ya existe (`exactitud_dorado`). El canal no decide qué se activa: decide qué hay disponible.
3. **Sincronía con los interruptores.** `capaMeshCompartiendo()` apagado → ni se anuncia ni se sirve ni se acepta; una neurona con `capa:colectiva` apagada no publica ni baja capas colectivas. El anuncio de capas (`anuncio-capas.ts`) ya dice cuáles tiene encendidas cada vecina.
4. **Reutilizar trozos entre versiones** (barato, sin tocar el motor): partir la capa en varios archivos (un fichero por bloque de pesos), cada uno con su propia raíz; lo que no cambió conserva la raíz y **no se vuelve a bajar** (la colección del §3). El *content‑defined chunking* (cortes por hash rodante, estilo FastCDC) permitiría reutilizar también dentro de un mismo archivo, pero obliga a un árbol sobre trozos de tamaño variable: se deja como diseño futuro, no es barato.
5. **Reversión.** Un fallo de evaluación en una neurona deja la versión anterior activa (ya existe en el entrenamiento) y marca esa raíz como mala **localmente**; no hace falta un canal para eso.

## 12 · Lo que probó la simulación (`__tests__/simulacion-enjambre.test.ts`)

Red en memoria con tiempo virtual (`red-simulada.ts`): enlaces con capacidad y latencia por sentido, cola por enlace, nodos que caen, mensajes corrompibles y un servidor HTTP de espejo. Sesiones **reales** de `SesionEnjambre`; sin temporizadores reales. Los bytes incluyen la expansión base64 del JSON. 66 pruebas del motor pasan (56 unitarias y 10 de simulación).

| Escenario | Resultado |
|---|---|
| 1 sembradora + 4 recolectoras sobre 1 MiB; una recolectora tras Bluetooth (300 kb/s) y las demás en red local (20 Mb/s); una se va a los 300 ms; otra manda todos sus trozos corrompidos | Las 3 vivas completan y el contenido coincide byte a byte, en **2 720 ms virtuales**. La corrupta recibe **5 golpes** de las demás. A la recolectora del Bluetooth le llegan 1 317 634 B por red local y 351 584 B por Bluetooth (el 21 %): la vía lenta no lleva el grueso. |
| Envío a grupo: 1 origen y 4 recolectoras sobre 1 MiB, origen a 4 Mb/s | Siembra ingenua: el origen sube **2,50×** el contenido y tarda 1 624 ms. Super‑siembra: **1,25×** y 798 ms. |
| Secuencial frente a raro‑primero (2 MiB, reproducción a 96 KB/s, enlace de 3 Mb/s, 20 ms) | Trozos contiguos por delante del cursor, cada 250 ms: secuencial `[0,1,1,2,3,3,3,2,2,3,2,3,3,2,3,2]` (nunca menos de 2 tras el arranque); raro‑primero `[0,0,0,…,0,14]` (nada reproducible hasta el final). |
| Privado con relé ciego | El relé completa sin la clave, **no puede abrir** el contenido, pero lo guarda cifrado; el origen se apaga; un miembro llega después, solo habla con el relé y abre el contenido. Una neurona sin el secreto tiene otro id de enjambre y no completa. De los 43 mensajes que viajaron, ninguno contiene la raíz ni el texto claro. |
| Canal | Un registro nuevo llega a una neurona que no ve al editor, pasando por otra; el reenvío de la versión vieja da `viejo`; el mismo registro con la raíz cambiada, `firma-mala`; el estado no cambia. |
| Solo con un imán | La recolectora arranca con raíz, tamaño y ámbito del imán, pide la capa de piezas al par, la verifica contra la raíz y completa. |
| Imanes hostiles | 13 entradas hostiles (esquemas ajenos, `xt` repetido o no hexadecimal, `es=javascript:`, `es=http://127.0.0.1`, clave `k=`, byte nulo, `xl` negativo, ámbito inventado, nombre de 3000 caracteres, marca de dirección derecha‑a‑izquierda) → todas rechazadas. |
| Espejo + par a la vez (6 Mb/s con 30 ms el espejo; 2 Mb/s el par) | Completa en **1 494 ms**: 786 432 B por el espejo (13 peticiones Range) y 262 144 B por el par. |
| Espejo que miente | Se descarta, la descarga termina con el par y del espejo no entra ningún trozo. |
| Determinismo | Dos ejecuciones dan los mismos tiempos y bytes. |

Esto prueba la **lógica**; no prueba rendimiento en radios reales (§18).

## 13 · Modelo de amenazas

| Amenaza | Qué pasa | Defensa | Límite |
|---|---|---|---|
| **Envenenamiento** (par o espejo manda datos falsos) | Un trozo no casa con la capa o con su prueba | No se guarda ni se reenvía; golpe a vía y par (veto exponencial, par vetado al 3.º); un espejo malo se descarta | Ralentiza, no corrompe. Un editor malicioso con firma válida publica contenido «válido» malo: eso es de confianza en el editor (`aceptarFp`, revocaciones) |
| **Sybil** (muchas neuronas falsas para dominar el enjambre) | Saturan pares o acaparan peticiones | Los golpes y límites van por id de neurona (en el transporte real, ligado al certificado cuenta → neurona); `raro-primero` cuenta copias solo de pares no vetados; servir depende de la relación (cuenta, miembro, id conocido) | En un enjambre **público** cualquiera entra: puede degradar la disponibilidad, no la integridad |
| **Análisis de tráfico** | Un observador ve tamaños, tiempos y quién habla con quién | Id de enjambre opaco en lo no público; sin nombres ni MIME en anuncios; el cifrado de enlace (`sesion-cifrada`) oculta los mensajes | No hay relleno (padding) ni mezcla: tamaño y momento de las piezas se ven. Un relé ciego ve tamaño, raíz y quién pide |
| **Fuga de metadatos en anuncios** | El anuncio delata contenido | `enj.anuncio` lleva rol, estado y, solo en público, la semilla firmada; nunca nombres de archivos privados ni claves | La raíz de un contenido privado es visible para quien lo guarda |
| **Agotamiento de recursos** | Inundar de mensajes o peticiones, imanes enormes, rangos gigantes | 400 mensajes/s por par; validación y longitudes máximas por campo; imán ≤ 2048 caracteres y 16 parámetros; rango de capa ≤ 512 hashes; `maxSubidas`; tope diario por categoría; cuota por ámbito con desalojo; tope de contenido 2⁴⁰ B | Los números son iniciales y se afinarán con datos de dispositivo |
| **Repetición de canales viejos** | Se hace bajar a una versión antigua pero válida | `seq` monótona, `viejo` sin efecto, `ts` acotado | Ataque de congelación en neuronas sin historia (§10) |
| **SSRF por espejos** | Un imán con `es=` apunta a la red interna | Dos capas (§9); redirecciones revalidadas; imán y semilla solo admiten URLs HTTPS válidas (≤ 4) | La segunda capa pertenece a la puerta |
| **Clave de contenido filtrada / miembro expulsado** | Quien tuvo la clave lee esa versión | Clave por versión: al expulsar a alguien se publica otra versión con clave nueva | No hay secreto retroactivo |
| **Sellado mal usado** (nonce repetido con la misma clave) | Rompería AES‑GCM | La API crea la clave y no deja elegir nonce; clave de un solo contenido y versión | Depende de que ningún llamador reutilice `ClaveSellado` |

**Qué revela cada ámbito y a quién.**

| | Contenido | Nombre / MIME | Tamaño y raíz | Que pido o sirvo | Id del enjambre |
|---|---|---|---|---|---|
| Público | A cualquiera | A cualquiera | A cualquiera | A mis pares y al rastreador | Derivable de la raíz |
| Comunidad / grupo | Solo miembros | Solo miembros | A quien lo guarde (miembros, relés ciegos) | A mis pares | Solo con el secreto |
| Privado | Solo mis neuronas | Solo mis neuronas | A quien lo guarde (mis neuronas y relés si los permito) | A mis pares | Solo con el secreto |

---

## 14 · Mapa: del torrent a StarSeed

| Concepto | En StarSeed | Qué hay hoy | Lo que añade esta tarea | Lo que queda |
|---|---|---|---|---|
| .torrent / metainfo v2 | **semilla** firmada | `archivos-malla`: la «raíz» es el SHA‑256 de la concatenación de los hashes de trozo (sin árbol: no hay prueba por trozo) | `semilla.ts`: descriptor estricto, firma y verificación inyectadas | Firmante real (clave de dispositivo + certificado de cuenta) en ENJ1110B |
| Hash y piezas | Árbol SHA‑256, hojas 16 KiB, pieza 64 KiB–1 MiB | SHA‑256 de archivo entero y de cada trozo; trozos de 16/63/256 KiB | `arbol.ts` con pruebas y capa de piezas | Árbol incremental en disco para archivos muy grandes en OPFS |
| Magnet | **imán** sin claves | Nada equivalente | `iman.ts` estricto + prueba de imán solo | Botón «Copiar imán», escáner QR |
| Metadatos desde pares (BEP 9) | Semilla mínima + `enj.capa` | — | Protocolo y verificación | — |
| Seeder / leecher | **sembradora / recolectora** a la vez | Quien ofrece y quien acepta, 1 a 1 (con relevos) | `SesionEnjambre`: ambos roles en una sesión | Roles configurables en la interfaz |
| Swarm | **enjambre** por contenido | Una transferencia = un par | Sesión con N pares y vías | E1 |
| Tracker | **rastreador** | Presencia de neuronas en la malla | — (diseño §5) | E3: servicio y tablas |
| DHT (BEP 5) | **tabla de la malla** | Descubrimiento por señal y presencia | — (diseño) | E3 |
| PEX (BEP 11) | **intercambio de pares** | — | `enj.pares` | Decidir a quién conectar según vías |
| Choking | **política cooperativa** | Topes de la puerta (`puerta/politica.ts`) | `politica.ts` | Panel en Ajustes |
| Rarest‑first / endgame | `raro-primero`, `final` | Trozos en orden, reanudar por huecos | `planificador.ts` | Ajuste fino con datos reales |
| Secuencial / streaming | `secuencial` con plazos | — | Modo y simulación | Conectar con el reproductor y las Estaciones (E3) |
| Super‑siembra (BEP 16) | `SuperSembrador` | Un envío a grupo repite el archivo a cada miembro | Implementado y medido (1,25× frente a 2,5×) | Activarlo en envíos a grupo (E1) |
| Web seed (BEP 19) | **espejo** | Descargas HTTP de actualizador y servidor de capas, sin verificación por trozo | `espejo.ts`, `url-segura.ts` | Fetch de la puerta; agrupar rangos (E2) |
| uTP (BEP 29) | Medición de velocidad por vía | Cada carril trae su control | Velocidad real medida en `Planificador` | — |
| Torrent privado (BEP 27) | **ámbitos** privado/grupo/comunidad | Cifrado de archivo por transferencia | `sellado-contenido.ts` | Conectar el sobre por destinatario |
| Mutable (BEP 46) | **canal** | `latest.json` / `latest-servidor.json` del actualizador | `canal.ts` | Publicar y consumir canales reales |
| Multi‑archivo | **colección** | Lotes de archivos (`sanearLote`) | Descrito | E3 |
| Cliente web | Neurona **solo‑recolectar** | Navegadores en la LAN | Rol automático | — |
| Store y pines | **almacén** con fijar, referencias, cuota y LRU | OPFS para el archivo en curso | `almacen.ts` (memoria y OPFS) | Probar `AlmacenOPFS` en WebView real |
| Capas de IA | **canales + enjambre** | Capas de conciencia sin reparto de pesos | Diseño §11 | E4 |

## 15 · Fases de integración

**E1 · Envíos de archivo y de grupo pasan a ser enjambres.**
- *Toca:* un adaptador nuevo bajo `src/lib/enjambre/` que implemente `TransporteEnj` sobre `transporte-universal.ts` y lea las vías de `matriz-enlaces.ts` / `canal-multitrayecto-vias.ts`; en `archivos-malla.ts`, un único punto de entrada para decidir «oferta clásica» u «oferta con imán»; el diálogo de envío y el panel del vínculo; el cifrado por destinatario con `recipient-crypto`.
- *Riesgo:* **alto**, toca el camino que ya funciona y que ARC1110A está cambiando. Por eso: primero solo envíos a **grupo** o de más de N MiB; el envío 1 a 1 sigue como hoy hasta pasar la autoprueba en los dos aparatos; cada decisión deja líneas `enjambre:` en `enlaces.log`.
- *Prueba en aparatos:* Mac y tableta con la misma cuenta: la Mac siembra 50 MiB, la tableta recolecta por Bluetooth L2CAP; cortar el Bluetooth a mitad y comprobar que se reanuda; inyectar un trozo corrupto (gancho de prueba) y comprobar el golpe y la repetición. **Con dos aparatos no se puede probar la super‑siembra ni el reparto entre recolectoras**; eso solo existe en simulación hasta tener un tercer aparato.

**E2 · Actualizaciones de la app, del servidor local y capas de modelos de IA, por enjambre + espejos.**
- *Toca:* `native/src-tauri/src/canal_actualizacion*.rs` (el manifiesto lleva además la raíz y los espejos), `android/ActualizadorApk.kt` (Kotlin, que no se compila en local), `servidor_capas*.rs`, y el adaptador TS de E1. El **canal** `app/<sistema>/<canal>` firmado con la clave de publicación sustituye a mirar `latest.json` como única verdad.
- *Idea:* una neurona que ya tiene la actualización la **siembra** a vecinas sin internet por Bluetooth o Wi‑Fi directo; quien no tenga la ruta usa el espejo (GitHub Releases).
- *Regla de confianza:* el enjambre solo transporta bytes. La verificación final sigue siendo la que hay (minisign del manifiesto, SHA‑256 del archivo, firma y paquete del APK, y la confirmación del sistema en Android).
- *Riesgo:* **medio‑alto** (Rust y Kotlin). El Rust se verifica en el contenedor con `cargo check`/`cargo test` y para tres destinos.
- *Prueba en aparatos:* con la tableta sin internet y la Mac con la versión nueva, la tableta recibe el APK por Bluetooth, comprueba la raíz y el SHA‑256 y llega a la pantalla de instalar; luego repetir con el espejo y con un trozo corrupto.

**E3 · Publicaciones de la Biblioteca, segmentos en vivo de Estaciones, rastreador y tabla de la malla.**
- *Toca:* `packages.ts` y el catálogo de la Biblioteca (la semilla va en el registro de cada publicación; la «colección» agrupa los archivos); Estaciones usa `secuencial` y `urgente` con `ritmoBps`; un servicio rastreador (tablas Supabase nuevas — migración propia, no aquí) y la tabla Kademlia acotada a la malla.
- *Riesgo:* **medio**. Tablas y políticas RLS nuevas; el rastreador filtra metadatos y hay que decidir qué ve (§13).
- *Prueba en aparatos:* publicar una app de la Biblioteca y que la tableta la instale desde la Mac sin internet; un segmento de directo con el reproductor de la tableta.

**E4 · Capas de conciencia.**
- *Toca:* `conciencia-colectiva.ts` y `lan-sync.ts` (el tema `astraura/adaptador` pasa de anunciar a repartir por semilla), el aprendizaje continuo (publicar versión y firmar el canal) y el umbral de evaluación (activar solo si pasa).
- *Riesgo:* **medio**. Los pesos son grandes y la evaluación es lo que protege de un adaptador malo.
- *Prueba en aparatos:* publicar una versión de un adaptador pequeño; la otra neurona la baja por la malla, la verifica, la evalúa y la activa o la rechaza; apagar `capa:mesh` y comprobar que no se anuncia ni se sirve.

## 16 · Ajustes y decisiones

### 16.1 · Lo que verá Alex en Ajustes (clave de almacenamiento `starseed.enjambre.v1`)

| Ajuste | Por defecto |
|---|---|
| Rol de esta neurona | **Automático** (según capacidad; también «Sembradora fija», «Sembradora ocasional», «Solo recolectar») |
| Compartir con mis neuronas | Sí |
| Compartir con mis grupos y comunidades | Sí |
| **Sembrar contenido público** | **No** (activarlo es una decisión de la persona) |
| Ser relé ciego de contenido ajeno cifrado | No |
| Batería mínima para compartir | 20 % (40 % para público y relé) |
| Usar datos medidos | No |
| Tope diario de subida (propia / grupo / público) | 4096 / 1024 / 256 MiB |
| Subidas simultáneas | 8 |
| Horario para sembrar lo público | Sin límite |
| Razón blanda de grupo | 4 |
| Espacio para contenido ajeno (privado / grupo / comunidad / público) | 4096 / 2048 / 1024 / 512 MiB |
| Modo de descarga (propuesto; no está en `AjustesEnjambre`) | Automático: `raro-primero`; el motor pasa solo a `final` al terminar y quien reproduce pide `secuencial` |
| Espejos permitidos (propuesto; no está en `AjustesEnjambre`) | Sí, solo HTTPS y por la puerta |

Todos se leen con `interpretarAjustesEnjambre`, que acepta lo que falte y descarta lo inválido (nadie tiene que migrar nada).

### 16.2 · Decisiones abiertas, con recomendación

1. **¿Relés ciegos de terceros?** Recomiendo **apagado por defecto**, con solo mis servidores y el relé de StarSeed como relés mientras no haya reputación; que se pueda activar por grupo.
2. **¿Rastreador propio o solo malla?** Recomiendo empezar por **el rastreador sobre Supabase** (E3), con identificadores opacos y borrado a las 24 h, y dejar la tabla Kademlia para cuando haya muchas neuronas. Un DHT público: no.
3. **¿«Sembrar contenido público» por defecto?** Recomiendo **no**, y preguntar una vez la primera vez que la persona publica algo público, con los topes a la vista.
4. **¿BLAKE3?** Recomiendo **no ahora**; revisarlo cuando el servidor local en Rust sea el que más reparte (raíz paralela `urn:ss-b3`).
5. **¿Qué ámbito tienen las capas colectivas?** Recomiendo `comunidad` (cifrado, con la clave a los miembros de la colectividad) hasta que haya una forma de publicar que no dependa de una sola clave de editor.
6. **¿Deduplicar entre cuentas?** Recomiendo **no**: rompería lo privado. Sí dentro de una cuenta y dentro de un grupo.
7. **¿Orden de las fases?** Recomiendo **E1 primero** (adaptador y envíos a grupo, cuando ARC1110A haya terminado), y E2 después, porque necesita ese adaptador y toca Rust y Kotlin.
8. **¿Hasta qué MiB se manda 1 a 1 por el camino clásico?** Recomiendo 8 MiB, y por encima siempre por enjambre.

## 17 · Fuentes (consultadas el 2026-11-10)

- BEP 3 — https://www.bittorrent.org/beps/bep_0003.html
- BEP 5 — https://www.bittorrent.org/beps/bep_0005.html (Kademlia; conocida, no releída en esta tarea)
- BEP 9 — https://www.bittorrent.org/beps/bep_0009.html · BEP 10 — https://www.bittorrent.org/beps/bep_0010.html (solo referenciada)
- BEP 11 — https://www.bittorrent.org/beps/bep_0011.html
- BEP 16 — https://www.bittorrent.org/beps/bep_0016.html
- BEP 19 — https://www.bittorrent.org/beps/bep_0019.html
- BEP 27 — https://www.bittorrent.org/beps/bep_0027.html
- BEP 29 — https://www.bittorrent.org/beps/bep_0029.html
- BEP 46 — https://www.bittorrent.org/beps/bep_0046.html
- BEP 52 — https://www.bittorrent.org/beps/bep_0052.html
- WebTorrent FAQ — https://github.com/webtorrent/webtorrent/blob/master/docs/faq.md
- IPFS Bitswap — https://specs.ipfs.tech/bitswap-protocol/
- iroh‑blobs — https://docs.iroh.computer/protocols/blobs/
- Hypercore — https://docs.pears.com/reference/building-blocks/hypercore/
- Syncthing BEP v1 — https://docs.syncthing.net/specs/bep-v1

## 18 · Qué está verificado y qué no

**Verificado (2026-11-10):** `vitest` sobre `src/lib/enjambre` (4 archivos, 66 pruebas) y `tsc` limitado a `src/lib/enjambre/**` con `EXIT=0`; la simulación determinista del §12.
**No verificado:** nada ha corrido en un aparato real ni por una radio real; el `AlmacenOPFS` no se ha probado en un WebView (solo su lógica común con memoria); la segunda capa anti‑SSRF y el firmante de cuenta no están enchufados; los parámetros del planificador (profundidades, vetos, umbral del final de partida) son razonados, no medidos; de `archivos-malla.ts` solo se leyó el código; no se ejecutó nada contra él.
**Leído de otras ramas:** la espera de gracia del mensaje `fin` está en `main` (no en el árbol de esta rama); la oferta anticipada de ARC1110A está en su rama y no se ha leído.
