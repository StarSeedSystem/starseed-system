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
