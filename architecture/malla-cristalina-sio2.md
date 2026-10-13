# 💠 Malla de sílice (SiO₂ amorfo): la retícula mesh P2P de StarSeed OS, en tiempo real

> **Contrato y fuente de verdad** de la Ola 1012Q (2026-10-12). Petición de Alex: que la malla
> actúe sola, al instante y P2P «simulando la cristalización del dióxido de silicio»: el silicio
> es la neurona, el dióxido son las señales; cada triangulación con la perspectiva de la retícula
> completa; todos los sistemas ven la misma retícula; cada dato elige su mejor vía, cifrada y
> verificada, sin servicios externos; antivirus propio reforzado por toda la red; cada mensaje,
> llamada, publicación y archivo vinculable a los almacenamientos de sus cerebros; confirmaciones
> de enviado, recibido, publicado y llamada en directo; todas las antenas del aparato, con sus
> permisos. Y los routers Wi‑Fi convertidos en nodos de la malla multifrecuencia, sin cables.
>
> **No duplica**: se apoya en `src/ai/astraura/mesh/*` (LoRa, códec, `planTransmission`,
> `DeliveryReceipt`, identidad ECDSA, `relay-crypto`, `recipient-crypto`, `replay-guard`, reloj de
> Lamport, CAMR), `src/lib/malla/*` (transporte universal, `elegirEnlaces`, reparto multitrayecto,
> emparejado sin internet, llamada directa), `src/lib/network/*` (autovínculo, WebRTC, vínculos entre
> cuentas, NetJSON con `buildMeshNode` 802.11s), `src/lib/senales/*` (mapa único), `src/lib/nativa/*`
> y el guardián de antenas en Rust (`native/src-tauri`). Mapa de lo existente: §9.

---

## 1. La metáfora, traducida a ingeniería

| SiO₂ | StarSeed OS |
|---|---|
| Átomo de **silicio (Si)** | Una **neurona** (aparato; `neuronas-un-aparato.md`). Un router con OpenWrt también es un Si. |
| Átomo de **oxígeno (O)** | Una **señal medida** entre dos neuronas por un medio (LoRa, BLE, Wi‑Fi LAN, WebRTC, 802.11s, Reticulum, serie, servidor). |
| **Puente Si–O–Si** | Un **enlace** aceptado por LOS DOS extremos (un O siempre une dos Si). |
| **Coordinación tetraédrica (4)** | Cada neurona mantiene **4 enlaces principales** por defecto (2 con batería baja, hasta 6 en routers y aparatos fuertes). Cuatro dan redundancia sin el coste de la malla completa de hoy (`decidirAutovinculo` enlaza todo con todo). |
| **Retícula** | El **grafo de enlaces elegidos** que todos comparten (§2): una red aleatoria continua (vidrio), no un cristal periódico. |
| **Triangulación** | Triangulación de Delaunay de las posiciones (reales o estimadas) + los enlaces medidos: los candidatos a puente salen de ahí y se prefieren los que **cierran triángulos** (si cae un enlace, el triángulo sigue conectado). |
| **Sólido amorfo** (vidrio de sílice, red aleatoria continua de Zachariasen) | **Así es la retícula** (Alex, 2026-10-12: «debe ser *amorphous solid* en tiempo real»). Como en el vidrio, solo hay **orden de corto alcance**: cada Si busca 4 O y cada O une 2 Si, pero **no hay patrón periódico** ni celdas que se repitan: los puentes siguen la geometría real y la calidad de cada señal. Se admiten **defectos de coordinación** (3 o 5 enlaces) cuando la geometría lo pide. |
| **Temperatura y transición vítrea** | La **temperatura** de cada zona es la **volatilidad medida** de sus señales (cuánto cambian RSSI/SNR/RTT en la última ventana). Caliente = **fundido** (los puentes se recolocan libremente y se añade redundancia); templado = **subenfriado**; frío = **vítreo** (los puentes se congelan y solo cambian si el nuevo es claramente mejor: la histéresis crece con la estabilidad). El estado sale de las medidas, no se elige a mano, y puede ser distinto en cada zona de la red. |
| **Relajación en tiempo real** | No hay «recristalizaciones» de golpe: cada tesela que llega **relaja solo su vecindario** (las neuronas a ≤ 2 saltos) al momento, con histéresis = margen que depende de la temperatura local (5 % fundido → 30 % vítreo) para no oscilar. El ritmo de medida también se adapta: cada 5 s en zona fundida, cada 60 s en zona vítrea. |
| **Dominios** (un vidrio no tiene granos: la red es continua) | Escala: la retícula completa se ve dentro de un **dominio** (la cuenta + los grupos vinculados + las neuronas cercanas por faro). Entre dominios se ve un resumen; las neuronas del borde hacen de pasarela. |
| **Resonancia** | Lo que la red sabe en conjunto: confianza de cada nodo y veredictos del antivirus (§5). |

**Amorfo pero determinista.** «Desordenado» describe la FORMA (sin periodicidad), no el cálculo:
con la misma retícula de entrada, cualquier neurona calcula **los mismos puentes** (orden total por
id, desempates fijos, semilla de la relajación = huella de la retícula). Así «cada sistema percibe
la misma retícula» sin un coordinador: no hace falta votar quién enlaza con quién.

## 2. Una retícula para todos: teselas que se fusionan solas

- Cada neurona publica una **tesela**: sus datos (capacidad, posición si la comparte, fase de
  batería) y sus señales medidas (medio, RSSI/SNR, RTT, ancho de banda, pérdida, frecuencia y ancho
  de canal), con reloj de Lamport y **firmada** con su clave de neurona (`mesh-identity.ts`).
- La retícula es la **fusión** de las teselas (CRDT: por origen manda la de mayor reloj; empate,
  el id). Fusionar en cualquier orden da el mismo resultado. Teselas viejas caducan (3 latidos).
- **Huella** de la retícula (hash canónico): Genesis y Señales enseñan «misma retícula en N de M
  neuronas». Si no coincide, se dice cuál está atrasada y por qué medio le llega.
- **Por dónde viajan las teselas**: por los enlaces que ya hay (canal WebRTC compartido, vínculos
  entre cuentas, LoRa P3 comprimido solo con el delta, faro UDP de la app nativa) y, si hay
  internet, `os_mesh_topology` como respaldo. Ningún servidor es necesario para converger.
- **Privacidad**: otra cuenta solo ve lo que el faro ya publica (etiqueta HMAC, medio, fuerza);
  la posición exacta solo si el dueño la comparte, y redondeada.

## 3. Cada dato elige su vía: viabilidad por dato

Para cada dato (`mensaje`, `llamada`, `archivo`, `publicacion`, `sincronia`, `conciencia`) con su
**clase** (`interno` = misma cuenta · `privado` · `publico`), tamaño y prioridad (P0–P3):

1. **Viabilidad de cada enlace** (0–1, con su motivo): latencia, ancho de banda disponible,
   pérdida, tiempo de aire y ciclo de trabajo legal (LoRa), energía del aparato, tamaño (LoRa solo
   lleva lo que cabe en sus tramas), coste (un servidor es externo: solo para `publico` o como
   último recurso) y **compatibilidad de privacidad** (un dato privado nunca va en claro ni por un
   relevo público; uno interno solo por neuronas de la cuenta). Reutiliza las métricas de CAMR.
2. **Rutas** sobre los puentes de la retícula: las k mejores (Dijkstra/Yen con coste = 1 −
   viabilidad). Archivos grandes: reparto multitrayecto (`planReparto`).
3. **Ancho de banda**: reparto max‑min justo por enlace con pesos por prioridad (P0 nunca espera
   a un P3), sobre los cubos de `sync.ts`.
4. **Señalización por la retícula**: para abrir un WebRTC con alguien al que ya se llega por la
   retícula, la oferta viaja por la retícula, no por Supabase.
5. Una sola función de puntuación para los tres elegidores que hay hoy (`planTransmission`,
   `elegirEnlaces`, `decideRoute`), que pasan a consultarla.

**Instantáneo, con números honestos**: Wi‑Fi/WebRTC en la LAN y BLE responden en milisegundos;
LoRa tarda segundos y lleva ~200 B por trama; recalcular la retícula de ~200 neuronas cuesta
milisegundos y relajar un vecindario, menos. Lo que tarda es que la tesela llegue por el medio más
lento: se enseña.

## 4. Capas de seguridad (las «capas de conciencia»)

1. **Identidad**: clave por neurona y certificado firmado por la clave maestra de la cuenta (ya existe).
2. **Cifrado de extremo a extremo** de todo dato `interno` y `privado`, por cualquier medio
   (también LoRa, que hoy solo tiene la PSK del canal): ECDH P‑256 → HKDF → AES‑GCM‑256 (WebCrypto).
3. **Automodulación de claves**: trinquete simétrico (HKDF en cadena); clave nueva cada 15 min o
   cada 500 datos, la que llegue antes; los datos llevan la época en los datos asociados (AAD).
4. **Autoverificación**: firma + hash + frescura (`replay-guard`) en la entrada; un fallo se
   cuenta contra la confianza del nodo que lo reenvió.
5. **Centinela (antivirus propio)** antes de aceptar archivos y adjuntos: tipo real por bytes
   mágicos frente al declarado, ejecutables y guiones, doble extensión, HTML/SVG con código, macros
   de Office, rutas de escape en ZIP, bombas de compresión, tamaño; y, en salida, el escáner de
   secretos que ya existe (`security/scanner.ts`). En la app nativa, además, ClamAV/YARA si están
   instalados (se detecta, no se promete).
6. **Resonancias**: cada neurona comparte sus veredictos firmados (hash → peligroso/limpio con el
   motivo). Un hash marcado por **≥ 2 cuentas distintas** con confianza suficiente queda en
   **cuarentena** en toda la red; nada se borra solo: cuarentena y pregunta. La confianza de cada
   nodo (media móvil) baja si reenvía tramas con firma mala y la retícula lo evita.

## 5. Vínculo a almacenamientos

Cada dato puede llevar **destinos** de guardado elegidos de los cerebros vinculados (aparato,
cerebro → Drive/Supabase/GCS/NAS de neurona, Biblioteca, servidor propio). Por defecto, la
política del contexto (chat, grupo, página); se puede cambiar por dato. Un dato privado nunca va a
un destino público. Se guarda con los motores reales que existen (`putObjectToBackend`, `starseed`,
`gcs`, `gdrive`); los demás tipos se enseñan como «aún sin motor», con su motivo.

## 6. Confirmaciones (recibos)

Un modelo único, monótono (un estado nunca retrocede) y firmado por quien confirma:

- **Mensaje / archivo**: preparado → **enviado** (salió por al menos un enlace) → **recibido**
  (acuse firmado del destinatario) → **leído** (solo si el destinatario lo permite).
- **Publicación**: enviada → **publicada** (el servidor o el feed lo confirmó) → propagada a N vecinos.
- **Llamada**: llamando → **en directo** (medios fluyendo, con RTT y jitter medidos) → terminada.

Cada recibo dice **por qué medio y por qué ruta** pasó. Lo alimentan los productores que ya hay
(`DeliveryReceipt`, acuse `tu.ack`, `archivo.ok`, fases de `llamada-directa`) y se pinta como
pastillas en mensajes, llamadas, publicaciones y archivos.

## 7. Antenas y permisos

- **Inventario por medio**, honesto: web Chromium (WebRTC, Web Bluetooth, Web Serial en escritorio,
  Web NFC en Android, geolocalización); iOS/Firefox (WebRTC y geolocalización); app nativa de
  escritorio (faro UDP multicast, Meshtastic TCP, radios por serie en macOS/Linux, detección de
  Reticulum); app Android (servicio en primer plano; Bluetooth y USB nativos pendientes del plugin
  de Kotlin). Lo que un medio no puede, se dice con su motivo y lo que haría falta.
- **Un solo flujo de permisos** («Permisos de antenas» en Señales): pide cada permiso con su
  explicación, recuerda lo concedido y enseña lo que falta. **Ningún sistema se concede permisos a
  sí mismo**: los da la persona, una vez (invariante «permisos visibles»).
- El guardián nativo (`src/lib/nativa/*`, ya escrito y sin cablear) entra en el motor: es el único
  que hoy descubre neuronas **sin internet** de verdad (faro UDP en la LAN).

## 8. Routers como nodos de la retícula (malla Wi‑Fi sin cables)

- **Qué es formatear un router**: instalarle **OpenWrt** (sistema libre). Solo en modelos de la
  tabla de hardware de OpenWrt; muchos routers de operador están bloqueados. StarSeed **comprueba
  el modelo**, da el enlace exacto a su imagen y los pasos; quien flashea es la persona (un fallo
  puede dejar el router inservible: se avisa antes, nunca se hace a escondidas).
- **Tras OpenWrt**, el router se **adopta** desde la configuración de la neurona o del cerebro:
  StarSeed genera su configuración (NetJSON/UCI; ya existe `buildMeshNode` 802.11s) con
  **802.11s + batman‑adv** (enrutado por capacidad medida, BATMAN_V), y la aplica la app nativa en
  la LAN o un controlador OpenWISP (`red-por-neurona-openwisp.md`).
- **Bandas por enlace**: radio de 5/6 GHz para el enlace entre routers (troncal) y 2,4 GHz para
  los aparatos; canal y ancho (20/40/80/160 MHz) por enlace con un **coloreado del grafo de
  interferencias** y la tabla legal de la región (`PERFILES_WIFI`, DFS, PIRE máxima).
- **Automodulación**: la modulación fina (MCS) la hace el controlador de tasa del propio chip
  (minstrel); StarSeed ajusta lo que sí puede: canal, ancho y potencia dentro de lo legal, bajando
  de 80 a 40 o 20 MHz si el SNR cae o suben los reintentos, y volviendo con histéresis.
- **Internet sin servicio externo**: la malla une a todos sin internet (StarSeed OS funciona P2P
  sobre ella). Para salir a la internet global hace falta **al menos una pasarela** en la malla
  (la conexión de alguien, compartida si quiere): la retícula la encuentra y reparte su ancho.

## 9. Lo que ya existe y cómo encaja

| Pieza | Dónde | Papel en la retícula |
|---|---|---|
| Elegidores de vía | `mesh/synaptic-router.ts`, `lib/malla/eleccion-enlace.ts`, `mesh/decision-router.ts` | Pasan a consultar `viabilidad` |
| Recibos | `mesh/delivery.ts`, `lib/malla/transporte-universal.ts`, `lib/network/archivos-malla.ts` | Productores del recibo único |
| Cifrado | `mesh/mesh-identity.ts`, `recipient-crypto.ts`, `relay-crypto.ts`, `replay-guard.ts` | Base de las capas 1–4 |
| Topología | `mesh/federation.ts` (`os_mesh_topology`), `upsertMeshEdge` (sin uso) | Respaldo de teselas; las aristas por fin se llenan |
| Señales y mapa | `mesh/signals.ts`, `lib/senales/*` | Medidas de entrada y vista de la retícula |
| Nativo | `lib/nativa/*`, `native/src-tauri/src/{antenas,faro,serie}.rs` | Descubrimiento sin internet |
| Routers | `lib/network/netjson.ts`, `components/network/router-center.tsx`, `camr/regulacion.ts` | Base de §8 |

## 10. Límites y decisiones pendientes

- **Relevo privado entre cuentas** (palabra de Alex, 2026-10-13): migración
  `20261013010000_os_mesh_relay_entre_cuentas.sql` aplicada y probada con las cuentas reales.
  `recipient_owner` = cuenta destinataria; la lee y la retira solo ella; solo se dirige a otra cuenta
  con relación (vínculo aceptado, DM o grupo en común) y con sobre v:3 por destinatario; tope de 600
  por hora; pg_cron borra lo caducado. El cliente lo cablea la Ola 1013R (RC1013A–D).
- **Bluetooth nativo** (btleplug en escritorio, plugin de Kotlin en Android) y serie en Windows/
  Android: siguen pendientes; se enseñan como tales.
- **Reticulum**: solo detección; un transporte RNS es una ola aparte.
- Nada de esto da acceso a radios que el sistema operativo no expone a la app.

## 11. Código (Ola 1012Q)

Núcleo puro en `src/lib/malla/cristal/` (≤ 120 líneas por archivo, cada uno con su prueba en
`__tests__/`), cifrado con WebCrypto en `src/lib/malla/cristal/cifrado/`, routers en
`src/lib/network/routers-malla/`. Cola: `starseed_memory_root/olas/cola-malla-cristalina-1012.json`.
