# NFC de las neuronas · contrato (NFC1126)

Petición de Maggasukha (2026-11-26): función **nativa** en todas las neuronas y nodos de StarSeed OS, para todos los perfiles. Al acercar por NFC una neurona a otra (o a un nodo o a una etiqueta) aparecen, en **todos** los aparatos implicados, las opciones de vínculo que cada uno tenga configuradas para ese tipo de conexión. Privacidad y acciones automáticas configurables por neurona y para neuronas concretas; sugerencias de Astraura por caso; autoevolutivo con MetaGenesis, la Protomolécula y el lienzo universal.

## 1. Qué viaja por NFC y qué no
NFC es corto y lento (≈ 424 kbit/s, unos cm). Sirve para **presentarse y decidir**, no para mover datos grandes:
- **Tarjeta de neurona firmada** (≤ 1 KB, NDEF o APDU): versión, id de neurona, identidad de cuenta **según la privacidad** (hash, alias público o nada), clave efímera X25519, firma Ed25519 de la neurona, nonce y hora (válida 30 s, contra repeticiones), lo que ofrece (capacidades, capas, almacenamiento, señales, internet) y sus direcciones de transporte (BLE, Wi‑Fi Direct/LAN, malla).
- Con esa tarjeta las dos neuronas abren una sesión cifrada por **el mejor transporte disponible**, autoenrutado y simultáneo (BLE + Wi‑Fi + malla, el enrutador de transportes que ya existe). Archivos, folders y cerebros van por ahí, nunca por NFC.
- Solo lo pequeño (< 32 KB: un enlace, un texto, la oferta de un nodo) puede ir por el propio NFC.

## 2. Plataformas (lo real, sin humo)
| Neurona | Neurona ↔ neurona | Etiquetas / nodos pasivos |
|---|---|---|
| Android (app Tauri) | Sí: modo lector + emulación de tarjeta (HCE, `HostApduService` con AID propio de StarSeed); cada aparato alterna los dos papeles solo. Android Beam ya no existe. | Sí (NDEF) |
| iOS | Leer sí (Core NFC). Emular tarjeta solo donde Apple lo permite (HCE con entitlement, p. ej. UE): si no, el iPhone lee y el otro emula; iPhone↔iPhone usa el respaldo | Sí (leer y escribir NDEF) |
| Mac / Windows / Linux | Solo con lector NFC USB (PC/SC, p. ej. ACR122U) | Con lector USB |
| Web (Chrome Android) | No | Web NFC (`NDEFReader`) para etiquetas |
| **Respaldo sin NFC** | «Acercar» por BLE (RSSI muy alto + confirmación) o código QR con la misma tarjeta firmada | QR |
Cada neurona declara `nfc: lector | emulador | lector_usb | web | ninguno` en sus capacidades; la interfaz nunca ofrece lo que el aparato no puede.

## 3. Relaciones y preferencias
Relaciones: **misma cuenta**, **otra cuenta reconocida** (recordada), **otra cuenta nueva**, **nodo propio privado**, **nodo público**, **etiqueta pasiva**.
Por relación (y con excepciones por neurona concreta) se configura:
- **Perfil:** mostrar públicamente · no mostrar ni ofrecer · pedir permiso desde la notificación.
- **Acciones automáticas** (sin preguntar) y **acciones ofrecidas** (con botón): del catálogo del §4.
- **Avisos:** notificar · silenciar · **ignorar** esta neurona · **recordar** (pasa a «reconocida» y aplica sus preferencias la próxima vez).
- **Ubicación:** registrar el encuentro en el mapa de señales (privado, público o no), en ambos sentidos.
Valores por defecto seguros: con otras cuentas **nada automático** salvo mostrar las opciones; con la misma cuenta, sugerencias de Astraura; nunca se acepta un archivo, un cerebro ni un permiso de una neurona desconocida sin un toque.

## 4. Catálogo de acciones
Añadir a contactos (auto o manual) · mandar mensaje · enviar archivo, folder o cerebro P2P · crear grupo con los presentes · invitar a grupo o comunidad · compartir capacidades, almacenamiento, señales o internet (modo banco o mesh, ver `internet-compartido-malla`) · vincular una capa de conciencia (específica o general) · control remoto local mesh P2P y acceso a cerebros (solo misma cuenta o permiso explícito) · registro de entrada a un evento · abrir la oferta de un nodo · registrar ubicación en el mapa de señales.

## 5. Nodos NFC
Un nodo (una neurona en modo nodo o una etiqueta escrita desde la Protomolécula o el lienzo universal) declara:
- **Oferta:** información, app, publicación, página de StarSeed OS, enlace funcional, archivo, folder o capa de conciencia; o transferencia P2P directa.
- **Acciones del lugar:** registro de entrada a eventos interactivos, casa, espacio público, registro de visitas, notificaciones, ubicación para el mapa.
- **Privacidad del visitante:** qué guarda el nodo (nada, alias, cuenta) y por cuánto tiempo; el visitante lo ve antes de aceptar.

## 6. Dónde se ve
- Hoja **«Cerca de ti»** en todos los aparatos implicados, con las opciones de cada uno según sus preferencias.
- **Señales ›** registro de encuentros NFC (con la vía que tomó la sesión) y en el mapa si se permitió.
- **Notificaciones** con botones: añadir a contactos, mensaje, enviar, invitar, permitir capacidades, ignorar, recordar.
- **Ajustes de la neurona › NFC y cercanía:** preferencias por relación y por neurona concreta.

## 7. Seguridad
Tarjetas firmadas y de vida corta (30 s); comprobación de que la firma corresponde a la neurona y, si se muestra, a la cuenta; límite de encuentros por minuto; registro auditable de cada encuentro y de lo concedido; revocar desde Señales cualquier vínculo; los permisos de capacidades caducan si así se configura. Nada de lo de la tarjeta sale si la privacidad dice «no mostrar».

## 8. Tareas (ola `nfc-1126`)
NFC1126A lógica pura (tarjeta, preferencias, decisión de opciones) · NFC1126B Android nativo (lector + HCE) · NFC1126C ajustes «NFC y cercanía» · NFC1126D hoja «Cerca de ti», Señales y notificaciones · NFC1126E traspaso al mejor transporte para archivos/folders/cerebros/capacidades · NFC1126F nodos NFC, eventos y etiquetas desde la Protomolécula · NFC1126G escritorio (PC/SC), iOS y respaldo BLE/QR · NFC1126H pruebas de MetaGenesis.

# Ampliación (Maggasukha, 26-11 noche)

## 9. Dónde se configura y se usa
Todo lo de este contrato es accesible y configurable desde: el **centro de control del lado derecho** (`layout/trinity/control-center.tsx`: un mosaico «NFC y cercanía» con encender/apagar, modo de la neurona y acceso a sus ajustes), el **Centro de notificaciones** (`layout/notification-center.tsx`: los encuentros, tarjetas y ofertas con sus botones), **Señales** (`mesh/signals-center.tsx`: registro, vínculos activos, revocar) y el **hub social** (`network/culture/social-hub.tsx`: personas conocidas por cercanía, tarjetas recibidas, grupos creados al acercarse). Un mismo estado, cuatro puertas.

## 10. Aparatos personales (audífonos, bocinas, wearables)
- **Tocar para emparejar:** muchos audífonos y bocinas llevan una etiqueta NFC con un registro NDEF de emparejamiento Bluetooth (OOB, `application/vnd.bluetooth.ep.oob` o `.le.oob`). La neurona lo lee y empareja/conecta sin buscar en listas. Preferencias por aparato: conectar solo, preguntar, a qué perfil de audio, volumen inicial, y si es **personal** (solo mis neuronas), **compartido** (mis neuronas y contactos) o **público** (acceso automático en un lugar).
- **Wearables:** mismas reglas; lo que exponen (pulso, pasos, botones) se ofrece como capacidad con permiso explícito.
- **Audífonos que se acercan a una neurona que suena:** se conectan a lo que suena en esa neurona (BT al aparato que reproduce, o el audio viaja por la malla a la neurona del dueño de los audífonos). Si la neurona es de otra cuenta, el dueño ve una solicitud y decide (una vez, siempre para esa neurona, nunca); si reproduce algo privado, solo se ofrece cuando él lo marca como compartible.

## 11. Sala de sonido compartida
Varias neuronas se unen por NFC (o desde Señales) a **un mismo sistema de sonido** (una bocina, una neurona con altavoces o un grupo de ellas):
- **Cola común:** cualquier neurona añade audio de cualquier archivo, sonido o app suya; la cola y lo que suena se ven en todas en tiempo real (sincronía por la malla con reloj común).
- **Quién controla:** una sola neurona, las elegidas, o todas a la vez; con **mezcla** (varias fuentes encima, cada una con su nivel, ecualizador y limitador) o **turnos**.
- **Apps externas como Spotify:** se integra lo que la app permite con la cuenta de cada persona: elegir el aparato con Spotify Connect, la cola y el control con su API (control de reproducción solo con Premium), y «Jam» cuando exista. El audio de Spotify no se retransmite por la malla (licencias); los archivos y producciones propias sí.
- **Mostrar lo que suena:** público, solo contactos, solo la sala, o nada; compartible por el vínculo NFC.

## 12. Nodos de audio por lugar
Un nodo (o etiqueta) puede ofrecer audio: audioguías de museos, descripciones de zonas geográficas, nodos informativos o de capacidades. Preferencias del visitante: reproducir solo al acercarse, preguntar, o no; idioma (traductor universal); volumen; guardar en la Biblioteca. Funciona sin conexión si el audio está en el propio nodo o ya descargado.

## 13. Tarjetas y ofertas digitales (no publicitarias)
Al vincularse, una neurona puede enviar a las notificaciones de la otra una **tarjeta** diseñada libremente (desde la Protomolécula o el lienzo): presentación o amistad (se guarda en contactos), evento, página, grupo, partido, perfil, cuenta, cerebro, repositorio, archivo, app, programa o enlace de formato libre. No se permiten tarjetas comerciales o publicitarias no pedidas: Astraura las marca y el receptor puede bloquear su envío. Cada tarjeta lleva firma del emisor y caducidad opcional.

## 14. Seguridad de lo recibido: Astraura ciber multicapa
Todo lo que llega por un vínculo (tarjeta, enlace, archivo, app, cerebro, permiso) pasa por el agente ciber de Astraura antes de abrirse: firma y reputación del emisor, análisis del enlace y del archivo con el escáner que ya existe (`src/lib/security/scanner.ts`), permisos que pide, y una explicación corta. Resultado: **seguro** (se abre), **sugerencia** (qué conviene), **aviso** (pide confirmar) o **alerta** (bloqueado, con el motivo). Aprende de las decisiones de la persona.

## 15. Lo que ofrece cada neurona
Cada neurona tiene un **perfil de ofertas por audiencia**: qué ofrece y qué automatiza para (a) mis neuronas y nodos, (b) contactos, (c) cualquier cuenta de StarSeed, (d) otras señales y aparatos no StarSeed. Por cada audiencia: perfil visible, tarjetas, capacidades, almacenamiento, señales, internet, sala de sonido, acciones automáticas y nivel de escaneo. Se adapta a cualquier señal (NFC, BLE, Wi‑Fi, LoRa, cable…) con el mismo modelo.

## 16. Tareas de la ampliación
NFC1126I accesos (centro de control, notificaciones, Señales, hub social) · NFC1126J aparatos personales (tocar para emparejar, audífonos a lo que suena) · NFC1126K sala de sonido: motor (cola común, sincronía, control y mezcla) · NFC1126L sala de sonido: interfaz · NFC1126M Spotify y apps externas · NFC1126N nodos de audio por lugar · NFC1126O tarjetas y ofertas digitales · NFC1126P escaneo de Astraura ciber · NFC1126Q perfil de ofertas por audiencia.
