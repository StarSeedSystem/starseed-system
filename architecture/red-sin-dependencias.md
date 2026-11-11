# Contrato · Red sin dependencias: todo StarSeed OS sin internet externo (2026-11-08)

## 1 · Qué pidió Alex (08-11)
Toda la red, cada función de cada sistema y las capas de conciencia deben funcionar sin internet externo.
Eso incluye publicar y transmitir en páginas, comunidades, grupos, canales y transmisiones, con todo tipo de formatos.

Debe servir con cualquier combinación de medios:
- antenas del aparato;
- zonas Wi‑Fi;
- routers propios;
- antenas mesh P2P;
- servidores privados o públicos.

Cada pieza debe poder configurarse y vincularse, y se debe poder conectar más hardware y firmware sin depender de él.

Todo debe autoconfigurarse con inteligencia, con sugerencias y opciones para cada caso.

## 2 · Dónde estamos (medido hoy en el código, no en los contratos)

| Sistema | Sin internet hoy | Por qué |
|---|---|---|
| Mensajes entre neuronas | **Sí** | Red local nativa y WebRTC sin servidores. Bluetooth y Wi‑Fi directo ya están en main (INT1108C). |
| Mensajes de cuenta (DM) | **Sí, en código (MSJ1108C), sin probar en aparatos** | Almacén IndexedDB, historial unificado con la cuenta, subida idempotente; adjuntos, formato, citas y ediciones también por la malla (§7.1.1). |
| Llamadas 1:1 y de grupo (≤ 6) | **Sí, sin probar en aparatos** | `iceServers: []`; vídeo y pantalla viajan por el canal de datos. |
| Archivos | **Sí** | Trozos con SHA y reanudación. Por TCP 47071 va a unos 550 KB/s; con Wi‑Fi directo, más. |
| Publicaciones y feed | **No** | Primero se escribe en Supabase y solo después se difunde. El feed lee la tabla. |
| Páginas, comunidades, canales | **No** | Viven solo en Supabase. |
| Grupos y gobierno | **No** | Membresías y votos en Supabase; el resultado lo sella el servidor. |
| Transmisiones y estaciones | A medias | Los espectadores se pasan los segmentos entre sí, pero sigue haciendo falta el origen y el directorio está en Supabase. |
| Biblioteca | A medias | Lo instalado funciona; el catálogo y las instalaciones nuevas, no. |
| Capas de conciencia | A medias | Un modelo local o Ollama en la LAN sirve. WebLLM y transformers.js se cargan de CDNs. `ia-por-malla` necesita la malla de cuenta señalizada por Supabase. El reparto de capas entre pares está escrito y sin cablear. |
| Cuenta y acceso | **No** | El primer inicio, el registro y la renovación del token dependen de Supabase Auth. La clave maestra de cuenta existe sin interfaz. |
| Avisos | A medias | Los de mensajes de la malla son locales. Los demás vienen de Supabase o de ntfy.sh. |
| Actualizaciones | **No** | Solo desde GitHub. Por la malla viaja la petición, no los archivos. |
| Routers mesh | A medias | Genera la configuración UCI (802.11s + batman‑adv) pero no la aplica; sin probar en un router real. |
| LoRa / Meshtastic | A medias | Funciona en Chrome con Web Serial, Web BLE o HTTP. El puente serie nativo está sin cablear. |
| Reticulum | **No** | Solo lo detecta y lo etiqueta. |

**Raíz del problema.** Supabase es la única fuente de verdad: 276 archivos lo importan y unas 133 tablas. Su URL queda fija al compilar. La malla lleva copias o avisos, pero no tiene un dato propio.

**Otros huecos:**
- El canal nativo TCP 47071 firma el saludo pero **no cifra el contenido**.
- Hay 7 módulos útiles que nadie importa:
  - `chat-directo`
  - `estaciones/malla-directa`
  - `nativa/nas`
  - `malla/localsend`
  - el puente Meshtastic nativo
  - `capas/repartir`
  - `master-identity`

## 3 · La idea central
**Cada neurona es un nodo completo y la nube es una puerta más.** Hoy los datos viven en la nube y la malla los copia. Hay que darle la vuelta: cada dato nace firmado en la neurona que lo crea. Se replica por el medio que haya hacia quien tenga derecho a tenerlo, y la nube (Supabase o un servidor propio) es una réplica más, que se pone al día cuando hay internet.

El sistema se organiza en cuatro capas, y cada una funciona sin la de arriba:

```
4 · Servicios   páginas · comunidades · grupos · canales · transmisiones · mensajes · conciencia
3 · Datos       registro vivo firmado de cada entidad, réplicas por ámbito, fusión sin conflictos
2 · Vías        planificador único · guardar y reenviar · multisalto · cifrado E2E · identidad sin servidor
1 · Medios      conectores enchufables: BLE · Wi‑Fi directo · zona Wi‑Fi · LAN · routers mesh · LoRa · Reticulum · serie · internet
```

## 4 · Capa 1 · Medios: conectores enchufables, sin depender de ninguno

Un contrato único, `ConectorMedio`, con estas piezas:
- `descubrir()`, `enlazar()`, `enviar()`, `alRecibir()` y `cerrar()`;
- una **ficha de capacidades medida**: ancho, latencia, MTU, alcance, energía, tiempo de aire, coste, privacidad y si lleva flujos;
- los permisos que necesita.

Lo que ya existe se envuelve con este contrato: red local nativa, WebRTC local, Bluetooth, Wi‑Fi directo, cuenta, relé y LoRa. Cada medio nuevo es un conector más, sin tocar los sistemas de arriba.

| Medio | Alcance | Ancho | Qué lleva |
|---|---|---|---|
| Bluetooth LE directo | 10–50 m | decenas a cientos de kbps | Descubrir, mensajes, avisos, votos, voz Opus de 16–24 kbps, imágenes pequeñas, negociar el Wi‑Fi directo |
| Wi‑Fi directo / zona local del Android | 50–100 m | 50–300 Mbps | Todo: archivos grandes, vídeo, pantalla, transmisiones |
| LAN del router (Wi‑Fi o cable) | el edificio | 100+ Mbps | Todo |
| Routers mesh OpenWrt (802.11s + batman‑adv) | un barrio, por saltos | 10–300 Mbps | Todo, en varios saltos |
| LoRa (Meshtastic) | 1–15 km | ≤ 200 B por mensaje, poco tiempo de aire | Texto, avisos, votos, recibos, estaciones paramétricas (se manda `t0` y los parámetros, no el audio) |
| Reticulum (RNode, serie, TCP/UDP, paquete) | según la interfaz | de bps a Mbps | Pendiente de decisión (§11) |
| Serie / USB / Ethernet | cable | según el cable | Nodos y radios conectados |
| Internet (SIM, Wi‑Fi público, satélite) | global | variable | Opcional: «puerta» para unir islas y respaldar en la nube |

**Hardware y firmware sin dependencia.** Un registro de conectores con perfiles:
- Meshtastic por serie, BLE o HTTP;
- RNode;
- router OpenWrt (adoptar o configurar);
- ESP32 y Raspberry Pi como «nodo base StarSeed» (servidor local, malla y radios en un aparato fijo);
- módem SIM o satélite como puerta.

Cada perfil dice qué detecta, qué ofrece y qué permisos pide. Si el hardware no está, el sistema sigue con lo que hay. Al flashear o reconfigurar un router siempre decide la persona, con aviso.

### 4.1 · F0 hecha en código: `ConectorMedio`, planificador único y Mapa de vías (MED1108B · 2026-11-08)

Carpeta nueva `src/lib/malla/conectores/` (no confundir con `src/lib/mensajeria/medios/`, que son los medios de un chat).

**Interfaz** (`tipos.ts`): `id`, `tipo`, `etiqueta`, `descubrir()` (enlaces vivos, leídos de los registros que ya hay), `enlazar(destino)`,
`enviar(enlaceId, datos)`, `alRecibir(cb)` (devuelve la baja), `cerrar(enlaceId?)` y `ficha(enlace?)`. Ninguna lanza hacia arriba.
`registrarConector(c)` (`registro.ts`) enchufa hardware o firmware nuevo y devuelve la función que lo quita; `descubrirVias()` junta los enlaces de todos con la ficha de su conector.

**Ficha de capacidades** (`FichaCapacidades`, `fichas.ts`): `anchoKbps` y `latenciaMs` (medidos; `null` si no hay medida, nada se inventa), `mtu`, `alcanceM`,
`energia`, `tiempoAire` (`escaso`/`normal`/`libre`), `coste` (`gratis`/`datos`/`servidor`), `privacidad` (`local`/`cuenta`/`servidor`), `llevaFlujos`,
`cifrado` (el `cifrado` de CIF1108A del enlace, o `propio` en WebRTC), `permisos` y `medida` (true si hay cifras reales). Lo medido del enlace manda sobre el valor de diseño.

**Adaptadores base** (`adaptadores.ts`): `local`, `nativo` (el TCP 47071; el Wi‑Fi directo viaja por él), `ble`, `cuenta`, `par`, `rele` y `lora`.
Solo leen `enlacesDisponibles()`; no cambian el transporte. Solo `local` envía/recibe/cierra por su registro; el resto lo sigue enviando el transporte universal.
Pendientes de enchufar (F6): Meshtastic por serie nativo, RNode/Reticulum, routers OpenWrt y nodos base.

**Planificador** (`planificador-vias.ts`, puro): `planificarVias(dato, vias, contexto)` devuelve `pasos` ordenados, `rechazadas` con motivo, `reparto` multitrayecto
(archivos ≥ 1 MiB con 2+ enlaces del mismo aparato), `escalera` y `escalon` (§9: vídeo → audio → paramétrico; miniatura primero por Bluetooth; LoRa ≤ 200 B → solo aviso),
`miniaturaPrimero` y `proponer`/`propuestas` (p. ej. Wi‑Fi directo para un archivo grande por Bluetooth). La regla de orden es `evaluarEnlaces`, movida desde
`elegirEnlaces` sin cambios; `elegirEnlaces` delega en ella y una matriz de más de 4.000 casos (`__tests__/caracterizacion-eleccion.test.ts`) fija que devuelve lo mismo que antes.

**Los 8 elegidores y cómo delegarán**

| Elegidor | Estado | Cómo delega |
|---|---|---|
| `elegirEnlaces` / `alcanzaDestino` (`malla/eleccion-enlace.ts`) | **Hecho** | `elegirEnlaces` → `evaluarEnlaces`; resultado idéntico (caracterización) |
| `planTransmission` (`synaptic-router.ts`) | Pendiente | Convertir sus candidatos a `ViaViva` y usar `planificarVias`; hoy pondera por salto/riesgo, que el planificador aún no modela |
| `decideRoute` (`decision-router.ts`) | Pendiente | Igual: su `puntuar` ya cabe en `OpcionesEleccion.puntuar`; falta equivalencia de sus umbrales |
| CAMR (`camr/*`) | Pendiente | `camr/enlaces.ts` (adaptadores en blanco) pasa a leer `descubrirVias()`; la política «masivo» ya reutiliza `planReparto` |
| `planParaDatos` (`mensajeria/neuronas/datos-neurona.ts`) | Pendiente (agente de mensajería) | `DatoVia{tipo:"mensaje"/"archivo"}` + `planificarVias`; no se toca desde MED1108B |
| `planDeEnvio` (`malla/sincronizacion-neuronas.ts`) | Pendiente | `DatoVia{tipo:"control"}` sobre los enlaces de neurona |
| `planLlamadaChat` (`llamadas/medio-llamada-chat.ts`) | Pendiente (agente de llamadas) | `flujo-audio`/`flujo-video`/`pantalla`: la escalera ya da voz por Bluetooth y vídeo por Wi‑Fi |
| `mediosParaEnviar` / `recorrerPlan` (`mensajeria/medios/*`) | Pendiente (agente de mensajería) | Cada `PasoVia` es un intento de `recorrerPlan`, con el motivo ya escrito |

Los tres últimos y `planParaDatos` viven en carpetas que llevan otros agentes: se migran cuando terminen, con sus pruebas actuales como red.

**Mapa de vías** (solo lectura): panel `src/components/malla/panel-mapa-vias.tsx`, montado en Señales (pestaña Antenas, bajo la Retícula).
Por cada uno de los 14 sistemas cruza los conectores vivos con la tabla de `mapa-vias-datos.ts` (copia del §2 y único sitio que hay que tocar cuando una fase aterriza):
si funciona ahora, por qué medio (con su estado de cifrado) y qué falta.

### 4.2 · Permisos y antenas desde la instalación (PER1108A · 2026-11-08)

Medido en aparatos reales con la prueba 0.5.1-prueba.26: el panel de Bluetooth directo del Mac decía «macOS no deja a StarSeed usar el Bluetooth» aunque Alex lo
hubiera activado en Ajustes del Sistema. Causa: la `.app` instalada solo llevaba la firma mínima del enlazador (`flags=0x20002(adhoc,linker-signed)`, identificador
`starseed_native-<hash>`); el bundle no estaba firmado, el `Info.plist` (con `NSBluetoothAlwaysUsageDescription` y los demás textos) no iba atado a la firma y TCC negaba sin
preguntar. Comprobado: `codesign --force --deep --sign - --identifier app.starseed.os` sobre la app instalada llevó el panel de «macOS no deja…» a «enlazada». La firma del
bundle en el CI está en `centro-versiones-1105.md` «Firma de macOS».

**Antenas encendidas de fábrica** (`src/lib/malla/defectos-antenas.ts`, puro):

| Antena | Defecto | Dónde vive |
|---|---|---|
| Bluetooth directo | encendido | Rust `PreferenciaBle.activo = true` (ya era así) |
| Faro de la red local (LAN beacon) y malla local | encendido | Rust `ConfigAntenas.faro_apagado = false` |
| Wi-Fi directo | **Automático** en Android con radio no única; **Preguntar** en lo demás (el Mac deja su Wi-Fi de casa mientras dura el enlace) | `ajusteWifiPorDefecto(capacidades)`; solo vale sin elección guardada |

Migración (regla «toda mejora de defaults DEBE migrar las configs persistidas»): marca `starseed.antenas.defectos.v1 = {version, explicitos[]}`. Una vez por versión,
quien nunca tocó un interruptor recibe el defecto; lo tocado a propósito (botón «Apagar» del Bluetooth y selector de Wi-Fi directo: ambos escriben la marca) se conserva.
Un Bluetooth apagado o un selector guardado ANTES de la migración solo pudo salir de la interfaz: se respeta y se marca. El faro no tenía interruptor, así que un `faro_apagado`
sin marca no fue decisión de nadie y se enciende. Se aplica al montar `AsistentePermisos` (`aplicarDefectosAntenas`).

**Asistente de permisos del primer arranque** (`src/components/nativa/asistente-permisos.tsx`; máquina pura en `src/lib/nativa/permisos-inicio.ts`; quien pide al sistema en
`permisos-inicio-ejecutor.ts`, que reutiliza `ble_activar`/`ble_estado`/`ble_pedir_permiso`, `enlace_wifi_permiso`, `getUserMedia` y el plugin de notificaciones; no duplica nada):

- macOS: Bluetooth (arrancar los gestores de CoreBluetooth es lo que hace preguntar a macOS), red local, notificaciones, micrófono, cámara y Ubicación (solo para ver los nombres de Wi-Fi con CoreWLAN; opcional).
- Android: «Dispositivos cercanos» (BLE y Wi-Fi directo, uno tras otro), notificaciones, micrófono, cámara, «Instalar apps desconocidas» (opcional; el actualizador) y exención de batería (opcional). Micrófono, cámara, notificaciones e instalar los pide Kotlin por `peticion.json` (`permiso:<id>`, comando Rust `permisos_inicio_pedir`) y contesta en `servicio.json` (`permisos_inicio_estado`). Intents de pantalla completa o llamadas: no hay ninguno declarado hoy (LLA1108D traerá los suyos en su propio bloque del manifiesto).
- **De uno en uno**: la máquina ignora «pedir» mientras haya un aviso del sistema sin contestar y bloquea omitir/cerrar mientras espera. En macOS, con un aviso de privacidad (TCC) pendiente, la ventana no recibe clics: los botones se desactivan y el texto lo dice. Cada espera tiene tope (90 s; 120 s los que abren Ajustes) y pasado el tope el permiso queda «omitido» sin colgarse.
- Se abre solo en la primera instalación y cuando una actualización AÑADE permisos (`VERSION_ASISTENTE`; cada permiso lleva su `desde`); lo omitido cuenta como visto. Se puede omitir cada uno o todo, y se reabre desde Ajustes › Permisos y antenas («Repasar permisos», evento `starseed:permisos-inicio-abrir`). Windows y Linux no tienen asistente (el sistema pregunta al usar).

**Pantalla completa sin congelar** (`src/lib/nativa/pantalla-completa.ts`). Evidencia del 08-11 12:40 CST: `system-chrome.tsx` pedía `documentElement.requestFullscreen()` en el primer gesto; WKWebView
la lleva a otro Space y deja en la ventana el marcador borroso «Click to Exit Full Screen»; tras relanzar volvía así y un clic en el marcador dejaba la ventana sin repintar ni clics (el servidor local seguía contestando; Esc salía bien; Cmd+Q lo arreglaba). Arreglo: en la app nativa nunca se pide pantalla completa de elemento (el primer gesto no la pide; el alternador y `useFullscreen` usan `ventana_pantalla_completa`, es decir `set_fullscreen` de la ventana); un vigilante sale de la de elemento al abrir con una restaurada, al ocultarse o descargarse la página y si quedó obsoleta (`isConnected === false`), con un repaso de 4 s solo en la nativa y un `console.warn` de rastro. No se encontró en el código ningún bucle de eventos BLE en `sin-permiso` (`useEstadoBluetooth` lee cada 15 s y por evento, y se salta lo oculto). La causa es la mejor explicación con la evidencia, no está reproducida en una app real: si vuelve, el `console.warn` del vigilante es el rastro.

**Dashboard y Librería**: «Inicio» y «Red» ya no llevan el widget «Feed de la Red» (retirado con FEED1108A; `NETWORK_FEED_MINI` pasa a `RECENT_ACTIVITY`; `VERSION_PREDETERMINADOS` = gen13 renueva las pestañas intactas y respeta las tocadas). La tarjeta «Descarga StarSeed OS» de la Librería enseña también la versión y el canal instalados con enlace a Ajustes › Versión y actualizaciones.

## 5 · Capa 2 · Vías
- **Un planificador único.** Hoy hay 8 elegidores: `elegirEnlaces`, `planTransmission`, `decideRoute`, CAMR, `planParaDatos`, `planDeEnvio`, `planLlamadaChat` y `mediosParaEnviar`. Se unen en uno que lee las fichas de §4 y elige por dato según tamaño, urgencia, privacidad, energía y coste. Puede repartir un archivo entre varios medios a la vez (multitrayecto) y cambia de medio en caliente cuando aparece uno mejor.
- **Guardar y reenviar.** Si no hay ruta ahora, el dato espera firmado y sale cuando la haya. Es la base del correo por la malla, ampliada a todo.
- **Multisalto con consentimiento.** Las neuronas vecinas, también de otras cuentas, pueden pasar datos cifrados que no pueden leer. Cada persona decide si su neurona hace de relevo, con tope de batería y de datos.
- **Cifrado E2E en todos los medios.** Primero, cifrar el canal TCP 47071; el Bluetooth y el Wi‑Fi directo nacen cifrados. Se usa el trinquete existente: ECDH, HKDF, AES‑GCM y rotación de claves.
  - **Capa de sesión (CIF1108A, 2026-11-08; detalle en `datos-por-la-malla.md` §6.7).** Hecha para el TCP 47071 (que también lleva el Wi‑Fi directo) y para el Bluetooth LE; el inventario halló que ambos llevaban los datos en claro (solo el saludo iba firmado).
  - Se cifra en TypeScript, encima del canal, porque el Rust solo traslada tramas JSON opacas. Módulo puro `src/lib/malla/sesion-cifrada.ts`, sin dependencias nuevas.
  - Acuerdo `nl.cs` firmado con la identidad que el saludo ya probó: ECDH P‑256 efímero → HKDF‑SHA256 → una clave AES‑256‑GCM por sentido, nonce con contador y rechazo de repeticiones.
  - Renovación a los 15 min o 500 tramas (política del trinquete) y a los 32 MiB cifrados.
  - Si los dos lados anuncian `cif:1`, el cifrado es obligatorio y un fallo cierra el enlace. Con una app anterior se sigue en claro, marcado «sin cifrar»; el ajuste «Exigir cifrado en la red local» (apagado por defecto hasta el siguiente lanzamiento oficial) la bloquea.
  - Queda un gancho tipado `certificado?` en el saludo, con verificador inyectado, para el certificado cuenta → neurona de IDN1108A (ya enchufado, ver §5.1). Por defecto se ignora.
  - Coste: el trozo de archivo baja de 46 a 34 KiB por TCP y de 10 a 7 KiB por Bluetooth; la CPU no es el cuello de botella.
- **Identidad sin servidor.**
  - La clave maestra de la cuenta firma un certificado por neurona: cuenta → neurona.
  - Las huellas de otras cuentas se aprenden por QR, por la malla (teselas firmadas) y por las resonancias de confianza.
  - Revocar una neurona también viaja por la malla.

### 5.1 · Identidad de cuenta sin servidor (IDN1108A, 2026-11-08)
Hecha en código (módulos en `src/lib/identidad/`). Pendiente: probarla en dos aparatos reales.

**Piezas**
- **Clave maestra con interfaz** (Ajustes › Cuenta, `identidad-sin-servidor.tsx`): crear, importar y exportar. La exportación va cifrada con contraseña (PBKDF2‑SHA256 600 k → AES‑GCM, mínimo 12 caracteres), como QR y como archivo `.ssm`. La clave privada nunca se envía a un servidor. La pantalla dice qué neurona la guarda («neurona titular») y la huella `acct:…`.
- **Certificado cuenta → neurona** (`certificado-neurona.ts`, API pura): la maestra firma `{cuenta, neuronaId, clavePublicaAparato, emitido, caduca, permisos}`. `verificarCertificadoNeurona(cert, anclas, opts)` devuelve `valido`, `sin-ancla` (coherente, pero no conozco esa cuenta) o `invalido` (firma, caducidad, revocación, portador). Vida por defecto: 180 días, se renueva solo en la neurona titular.
- **Anclas** (`anclas.ts`): huellas de maestras en las que confía la neurona, con nivel y confianza al estilo de las resonancias: `propia` (1; se fija al crear/importar), `qr` (0,9; se comprobó mirando el QR de la otra cuenta) y `anunciada` (0,5; llegó en un anuncio firmado de la malla). Una ancla anunciada solo sirve para verificar cuando sube de 0,6 por eventos de `actualizarConfianza` (`firma-ok`, `veredicto-confirmado`…). Un anuncio prueba que su emisor tiene la clave, no que merezca confianza.
- **Enrolar sin internet** (`enrolar.ts`): una neurona titular certifica a la nueva por QR (o por texto, o por LAN/Bluetooth con el mismo protocolo).
  - Código de confirmación de **6 cifras (SAS)** = SHA‑256 de las dos claves públicas y de los dos nonces, módulo 10⁶. Se enseña en las dos pantallas y la persona lo compara.
  - En un canal que no es de fiar se añade un **compromiso** (hash de la solicitud) y una **oferta** previa de la titular, para que nadie pueda «moler» claves hasta que el SAS coincida (sin compromiso, 6 cifras caen con ~10⁶ intentos).
  - La neurona nueva no guarda nada hasta que se escribe el código correcto. Solicitud y respuesta caducan a los 10 minutos.
- **Revocación por la malla** (`revocaciones.ts`): la maestra firma una lista acumulativa con `seq` creciente. Se difunde por el canal `identidad.revocaciones` del transporte universal (`enviarMensaje` / `alRecibirMensaje`), por todos los enlaces abiertos, reenviando solo lo nuevo. Se acepta solo si la ancla es conocida y de fiar y `seq` supera al guardado. Quien verifica certificados rechaza lo revocado, por `neuronaId` o por huella del aparato.
- **Ganchos de saludo sin tocar el transporte** (`enlace.ts`): `verificarHolaConCertificado(hola)` → `{ok, mismaCuenta, estado, motivo}`.
  - Nativo/Bluetooth: se enchufa en `certificadoPropio`, `verificarCertificado` (hueco de CIF1108A) y en `certificadoMismaCuenta` (nuevo, mínimo): un certificado válido de la propia cuenta cuenta como prueba de cuenta, así que se acepta sin vínculo previo.
  - WebRTC `enl.hola`: el saludo no va firmado, así que lleva el certificado más una prueba de posesión firmada con el aparato; un certificado malo cierra el enlace.
  - Sin certificado, o de una cuenta que no se conoce, todo sigue como antes.
- **Sesión sin internet** (`modo-sin-internet.ts`, decisión pura): con internet no cambia nada. Sin red y con sesión guardada la persona se queda dentro, con la etiqueta «Sin internet · identidad de cuenta certificada» (si hay certificado válido) o «Sin internet · usando la sesión guardada». El servidor local de la app nativa ya no echaba a nadie por un fallo de red (APP1107A). Modo estricto opcional: exigir certificado. Pendiente: montar la etiqueta en el cliente y leer la decisión allí (IndexedDB no se lee en el middleware).

**Límites honestos**
- Quien tiene la maestra puede certificar y revocar; una neurona titular robada compromete la cuenta (hasta rotar la maestra, Adenda 122). Por eso la pantalla pide exportarla y deja decidir en qué neuronas vive.
- Revocar no obliga a la neurona revocada a olvidar su certificado: solo que las demás no la acepten. La lista es acumulativa, pero una copia vieja de la maestra podría firmar una lista con `seq` alto sin entradas anteriores.
- La clave privada maestra se queda en `master-identity.ts` (almacenamiento seguro del navegador), porque tiene que ser exportable; en IndexedDB solo van anclas, certificado propio, tenencia y revocaciones.
- Los relojes de aparatos sin internet pueden desviarse: se tolera 24 h hacia el futuro.

### 5.2 · Cifrado de archivo de punta a punta y multitrayecto (MPT1108A, 2026-11-08)
Hecho en código y probado con el motor real y vías simuladas. Pendiente: dos aparatos reales y un relé de verdad.

**Cifrado de archivo, independiente del camino** (`src/lib/malla/cifrado-archivo.ts` + `canal-sellado.ts`; sin dependencias nuevas, solo WebCrypto y `recipient-crypto`)
- Cada transferencia lleva una **clave de contenido** aleatoria de 256 bits. Cada trozo se sella con **AES‑256‑GCM**.
  - **Nonce** de 12 bytes: 4 bytes de SHA‑256 del id de la transferencia + índice del trozo en 8 bytes. Es único por (clave, trozo) sin contador compartido entre caminos.
  - **AAD** = `ss-arch-v1|id|índice|total|longitud en claro`. Un trozo reordenado, cambiado por el de otra transferencia, con otro total o truncado no pasa el tag.
  - El trozo gana 16 bytes (el canal anuncia 16 menos de `tamanoTrozo`).
- **La clave solo viaja dentro de la oferta, y la oferta va cifrada para el receptor**: ECDH P‑256 efímero → HKDF‑SHA256 → AES‑GCM (`encryptEnvelopeForMany`, un sobre v:3 por neurona destinataria: misma cuenta o grupo, cada una con su par efímero).
  - Dentro del sobre: la oferta original, la clave, el **manifiesto** (id, nombre, tamaño, mime, nº de trozos, tamaño de trozo, SHA‑256 del archivo en claro) y la **firma del remitente** sobre el manifiesto (`mesh-identity.signContent`).
  - El receptor comprueba que el manifiesto firmado coincide con la oferta y con el id. Una firma rota se rechaza. Que la huella del firmante sea de fiar lo decide la política de recepción ya existente (cuenta propia, anclas de §5.1).
  - Por la red solo pasa `archivo.oferta.cif {id, sobres[]}`: el nombre, el tamaño, la vista previa y la clave no se ven.
- **Quién ve qué.** Relés, routers, servidores y neuronas intermedias: id, índices y longitudes de texto cifrado. El receptor: abre cada trozo al llegar, descarta (sin avisar al motor) los que no pasan el tag y, al final, el motor comprueba el SHA‑256 del archivo antes de «Verificado». El archivo solo se puede usar completo.
- **Dónde se pone.** `crearCanalSellado(canal, opts)` envuelve cualquier `CanalArchivos` (directo, multitrayecto o relé): el motor sigue hablando en claro con él y no cambia.
- **Par antiguo.** El par anuncia la capacidad `archivo.e2e.v1` (`parCifraArchivo`). Sin ella, el archivo va como antes y la transferencia queda marcada «sin cifrado de archivo» (`EstadoTransferencia.cifradoArchivo`). `exigirCifrado` en el receptor rechaza ofertas en claro. Nunca se manda en claro una oferta que debía ir sellada.
- **Límites honestos.** El cifrado de archivo no oculta quién habla con quién ni cuánto pesa el archivo (la longitud total se ve). La clave de contenido es de un solo uso por transferencia; si la neurona destinataria pierde su clave ECDH, no hay forma de recuperar lo recibido.

**Multitrayecto por todas las vías** (`src/lib/malla/canal-multitrayecto-vias.ts`; generaliza `canal-multitrayecto.ts`)
- Una transferencia usa a la vez todas las vías permitidas que llegan al destino: directas (Bluetooth, Wi‑Fi directo, TCP de LAN, WebRTC local), cuenta/par, **relés** (otras neuronas de la cuenta, servidores propios, relé de StarSeed) y un router/OpenWrt (interfaz `ViaMulti` de tipo `router`; el adaptador real es un stub hasta que haya firmware).
- **Reparto**: selector ponderado suave; peso = capacidad medida ÷ (1 + latencia/250 ms). Cada vía tiene su contrapresión: con la cola llena se salta en esa vuelta, así que Bluetooth lleva pocos trozos y la LAN casi todos. Con las vías de la prueba (LAN 30 Mbps · Wi‑Fi directo 9 Mbps · Bluetooth 1,5 Mbps) el reparto fue en ese orden.
- **Reequilibrio dinámico**: `agregarVia` / `quitarVia` / `marcarMuerta` / `actualizarVia` en caliente. Dos fallos seguidos, o un enlace que ya no está arriba, dan la vía por muerta durante un rato (se reprueba después) y se **reenvían por las demás los últimos 24 trozos** que llevaba (el receptor ignora duplicados y reensambla por índice). Lo que aun así falte lo pide el «huecos» del motor.
- **Relés**: vías de terceros solo con permiso (`permitirTerceros`, apagado por defecto) y con tope de bytes por vía (`maxBytesRele`, 64 MiB). Como el archivo va sellado, el relé solo lleva texto cifrado.
- **Planificador**: `planificarVias` ya propone el reparto para archivos ≥ 1 MiB con 2+ enlaces; con el ajuste «Automático» se usan todas las vías permitidas. Enchufado en `enviarArchivo` del transporte universal por MPT1108B (ver más abajo).
- **Interfaz**: `EstadoTransferencia.repartoVias` («LAN 72 % · Wi‑Fi directo 20 % · Bluetooth 8 %») y `velocidadBps` los anota el motor desde `CanalArchivos.resumenVias?()`.

**Enchufado en el producto (MPT1108B, 2026-11-08)** — detalle en `archivos-malla-p2p.md` §10b.1
- Hecho: capacidades `archivo.e2e.v1` y `multitrayecto.v1` anunciadas (sincronización de neuronas, `nl.hola` nativo y Bluetooth, ficha WebRTC, presencia de cuenta); claves del destinatario por vivo → instantánea → certificado → servidor, con una copia por neurona; `canalParaArchivo`/`enviarArchivo` y el buzón de neuronas arman sellado + todas las vías con `planificarVias` y el ajuste «Automático»; receptor único que abre el cifrado (`recibirArchivo`); relés (otra neurona tuya como salto, con topes de batería y datos; relé cifrado de StarSeed, con tope de 64 MiB por vía; terceros solo con permiso); candado, reparto, velocidad y «Verificado (SHA-256)» en la burbuja, la ventana de recepción y el panel de transferencias.
- **Pendiente**
  - Probar con dos aparatos reales y un relé de verdad (todo está probado con el motor real y vías simuladas).
  - El adaptador de router/OpenWrt sigue siendo un stub.
  - Probar en aparatos reales lo de PTA1108C (abajo): relé de dos vías contra el relé real de StarSeed y `rele-propio` contra un servidor que cumpla el contrato.

**Cerrado por PTA1108C (2026-11-08)**
- **Pantalla «Envíos de archivos»** (Ajustes › Neuronas › Medios, `ajuste-envios-archivos.tsx`, justo después de «Internet compartido»). Ligada a `ajustes-vias-archivo.ts` (localStorage `starseed.archivos.vias.v1`), sin estado propio:
  - «Cifrado de archivo de punta a punta: activo» (informativo, sin interruptor: siempre encendido) con su explicación;
  - Multitrayecto: *Automático* / *Solo directo* (con «Solo directo» el grupo de relés queda desactivado);
  - Relés: *mis neuronas* (ENCENDIDO; batería mínima 20/30/50/70 % y datos al día 64 MiB–4 GiB), *relé de StarSeed para trozos sellados* (ENCENDIDO, tope por vía visible) y *terceros* (APAGADO);
  - Envíos sellados recientes (los últimos 5 con `cifradoArchivo: "archivo"`), con el `repartoVias` o la vía que anotó el motor.
- **Clave certificada desde el saludo.** `registrarHolaArchivo(neurona, ar, ep, {certificado, huella})` (llamado desde `nl.hola` nativo y Bluetooth, con la huella que firmó el sobre) llama a `registrarClaveDeHolaCertificada`: verifica con `verificarHolaConCertificado` (IDN1108A) y solo si `ok` y `estado === "valido"` (ancla conocida y de fiar, firma, caducidad, revocación y portador = neurona + huella del aparato) llama a `recordarClaveCertificada`. `sin-ancla`, `invalido`, sin huella probada, sin certificado, clave con parte privada o un verificador que lanza: no se guarda nada. Orden de resolución sin cambios (vivo → instantánea → certificado → servidor): una neurona vista una vez con certificado sigue teniendo clave sin internet ni saludo vivo. El `enl.hola` de WebRTC no se enchufa: la clave no va firmada por el aparato en ese saludo.
- **Relé de dos vías** (`rele-bidireccional.ts`). Cada trozo que sale por un relé va envuelto `{"t":"archivo.rele2","fr":<mi identidad de relé>,"fu":<mi cuenta>,"p":<trozo sellado>}`; el receptor arma un canal de vuelta (`canalDe(emisor)`, uno por emisor y estable, porque el motor guarda estado por canal) que contesta (aceptar, reanudar, huecos) por el MISMO relé. Sirve igual para el relé de StarSeed y para el servidor propio. Un receptor antiguo descarta el envoltorio y el emisor sigue contando con las vías directas, como antes. El contenido sigue sellado de punta a punta; el envoltorio solo añade quién manda.
- **`rele-propio`** (`rele-propio.ts` + vía en `viasDeRele`). Se activa al configurar `starseed.archivos.rele-propio.v1 = {url, token?}` (https, o http solo a hosts privados) y con «Relé de StarSeed/servidor» encendido. Contrato HTTP del servidor: `POST {url}/v1/rele/enviar {id, para, de:{rele,uid?}, p}` y `GET {url}/v1/rele/recibir?yo=<rele>&desde=<cursor>` → `{mensajes:[{id,de,p}], sig}` (Bearer opcional, ≤160 KiB por mensaje). Sus peticiones usan `fetchConPuerta`: si el servidor está en tu LAN y esta neurona no, salen por una neurona tuya que sí llega (§5.3, capa «servidor propio»). **HECHO**: adaptador, vía, recepción por sondeo (cada 5 s, se lee al arrancar) y pruebas con servidor simulado. **PENDIENTE**: el servicio del lado del servidor (no existe en el repo; encaja en el A1/Coolify), una pantalla para escribir la URL (hoy solo la clave de almacenamiento) y probarlo con un servidor real.

### 5.3 · Puerta de internet compartida (MPT1108A + PTA1108A, 2026-11-08)
**Idea.** Mientras una neurona tenga ALGÚN enlace (Bluetooth, Wi‑Fi directo, LAN, cuenta) con otra que tenga salida —a internet o a otra capa (servidor propio, LAN, router)—, comparte esa salida de forma automática. Es la forma de que una neurona sin red abra datos de Supabase, busque actualizaciones, baje capas o abra un sitio fuera de StarSeed.

**Diseño construido** (`src/lib/malla/puerta/*`, `native/servidor-local/puerta.cjs`)
1. **Quién comparte** — cada neurona con salida detecta su upstream (sonda ligera al Supabase del OS cada 8 s, `navigator.onLine`, batería, red medida) y anuncia `AnuncioPuerta` (capas de salida, latencia, ancho, medida, batería) por TODOS sus enlaces. Las vecinas lo reanuncian con un salto más (hasta 3, con `via` contra bucles; caduca a los 90 s) y cada una guarda la mejor ruta por puerta (`TablaPuertas`).
2. **Quién usa** — sin salida propia (o si falla), `abrirTunel` elige la mejor puerta por puntuación (saltos, latencia, ancho, red medida, batería, Bluetooth penaliza, fallos recientes vetan con backoff) y, si dice que no o se cae, prueba la siguiente (hasta 3) en la misma petición.
3. **Niveles de uso**
   - **(a) Tráfico de la propia app**: `fetchConPuerta(fetch)` envuelve el `global.fetch` del cliente de Supabase (`utils/supabase/client.ts`) sin cambiar a quien llama. Sin respaldo registrado es el `fetch` base. Lecturas (`GET/HEAD/OPTIONS`) que fallan por red se repiten por la puerta; un `POST` solo va por la puerta si se SABÍA de antemano que no había salida (nunca se duplica). Una salida caída se recuerda 15 s. Si la puerta también falla se lanza el error original, así el reintento/backoff de quien llama sigue igual. **Hecho (PTA1108B)**: las llamadas relativas `/api/*` hacia la web publicada (`aLaWeb` en `starseed-arranque.cjs`) salen por un `https.Agent` que abre los túneles de `puerta.cjs` (`agenteMalla`): si se SABE que no hay salida directa y hay malla, van directas por ella (una sola vez); si falla la conexión directa ANTES de conectar, o la petición es repetible (`GET/HEAD/OPTIONS`), se reintenta por la malla; un `POST` ya enviado nunca se duplica. La respuesta lleva `x-starseed-ruta: web-malla`. Los manifiestos de actualización hechos desde JS son relativos (`/version.json`, `/api/os/versiones`) y entran por esa misma ruta; los de Rust y las descargas usan el proxy (ver (c)).
   - **(b) HTTPS de punta a punta por túnel TCP (hecho)**: tipo CONNECT. La puerta abre un socket a `host:443` (Node, tras resolver el DNS y rechazar toda dirección privada) y copia bytes; el TLS lo hace Node del lado de quien pide (`/__starseed/puerta/fetch`) o el navegador (proxy). Ni la puerta ni los relés leen el contenido: solo ven a qué host:puerto y cuántos bytes.
   - **(c) Sitios externos en el navegador de la app y descargas nativas (hecho en código, PTA1108B; falta probar en aparatos)**: `puerta.cjs` abre un proxy HTTP en `127.0.0.1:<puerto al azar>` (CONNECT y HTTP simple) mientras la página lo activa (solo sin salida propia y con al menos una puerta; apagable con `STARSEED_PUERTA=0`). La página le dice el puerto a la app nativa con el comando `puerta_proxy_local({ puerto|null, neurona?, via? })` (`proxy-nativo.ts`, llamado desde `servicio.ts` en cada cambio; no hace nada en la web, no repite envíos idénticos y serializa las peticiones). Rust (`puerta_proxy*.rs`) lo guarda en estado gestionado, lo aplica EN CALIENTE sin recrear el webview y emite `puerta://estado` (`{puerto, neurona, via, aplicado, soportado, plataforma, motivo, error, descargas}`); `puerta_proxy_estado` lo devuelve a quien llega tarde. Ambos comandos llevan su `allow-*` en `capabilities/default.json`.
     - **Qué cubre por plataforma**:
       - **macOS 14+**: `WKWebsiteDataStore.proxyConfigurations` con `nw_proxy_config_create_http_connect` (Network.framework, símbolos por `dlsym` para que macOS 10.15–13 arranque igual) y dominios excluidos `localhost`, `127.0.0.1`, `::1`, `local`. Cubre las páginas de la app y el navegador de la app (usa `<iframe>` dentro del webview principal, no ventanas propias). macOS 10.15–13: capacidad `false` con motivo en llano (la interfaz lo muestra).
       - **Android**: `androidx.webkit.ProxyController.setProxyOverride` (de todo el proceso) con `WebViewFeature.PROXY_OVERRIDE` y `SDK_INT >= 21`; reglas de salto directo `127.0.0.1`, `localhost`, `*.localhost`, `[::1]`, `<local>`; `clearProxyOverride` al recibir `null`. Rust y Kotlin hablan por la cola de archivos `filesDir/starseed/proxy-puerta/` (mismo patrón que `LlamadaNativaStarSeed.kt`). `build.rs` añade de forma idempotente el `ContentProvider` de arranque y la dependencia `androidx.webkit:webkit:1.8.0` (marcadores `STARSEED-PROXY-PUERTA`); escape `STARSEED_SIN_PROXY_PUERTA=1` (en tiempo de ejecución, en escritorio, también la deja sin efecto).
       - **Windows y Linux** (corregido en PTA1110B; antes decía «no sale»): SÍ salen. Windows (WIN1109B): `puerta_proxy_windows::instalar()` deja el WebView2 apuntando SIEMPRE a una pasarela local `127.0.0.1:47077` (`--proxy-server` por `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, antes de crear el primer webview) que va directa a internet y solo encadena con el proxy de `puerta.cjs` mientras haya puerto; si el equipo ya usa un proxy, la variable ya trae uno o el puerto está ocupado, no se pisa y la capacidad es `false` con su motivo. Linux (LNX1109B): `WebKitWebsiteDataManager::set_network_proxy_settings` en caliente, con el bucle local ignorado. Sin probar en aparatos reales.
       - **Descargas de Rust (todas las plataformas)**: actualizador (`UpdaterBuilder::proxy`), `reqwest::Proxy::all` en `canal_actualizacion.rs`, y `curl -x` (con `--noproxy localhost,127.0.0.1`) en `disco.rs` y `servidor_capas.rs`. Sin puerto, nada cambia.
     - **Regla fija**: el bucle local (la propia app en `127.0.0.1`/`localhost`/`*.localhost`/`::1`) NUNCA pasa por el proxy.
     - **Túnel `/api` y anti-SSRF (MRG1108W)**: el `agenteMalla` de `puerta.cjs` (HTTPS de la propia app hacia la web publicada) corta antes de abrir túnel cualquier destino interno (IP privada, `localhost`, `.local`, `.internal`) y nunca lleva concesión de capas; el resto lo valida la puerta al resolver el DNS (comprobación contra la dirección ya resuelta, anti-rebinding de PTA1108C). La web publicada es pública, así que pasa.
     - **Navegador de la app** (`src/components/browser/indicador-internet-malla.tsx`, en `/navegador`): «Internet por: <neurona> (vía Bluetooth directo, 1 salto)» mientras navega por una puerta; si la plataforma no puede, un aviso con el motivo; con internet propio no aparece.
     - **Prueba en aparatos (pendiente)**: (1) Mac con macOS 14+ sin internet y un iPhone/Android con internet enlazados: abrir `/navegador` y cargar un sitio externo; el indicador nombra la neurona y la vía; al volver el internet propio, el indicador desaparece y la navegación sale directa. (2) Android 7+ igual (comprobar `chrome://net-export`/registro de la puerta). (3) macOS 13 y Windows: ver el aviso en llano. (4) Comprobar que `http://127.0.0.1:<puerto de la app>` sigue cargando con el proxy encendido. (5) Buscar una actualización con la malla encendida y sin salida propia: debe salir por la puerta.
4. **Transporte** — tramas JSON `{abrir, ok, esp, err, dat, ack, fin, anuncio}` por el canal «puerta» de `enviarMensaje`/`alRecibirMensaje` (enlace directo concreto, nunca el relé del servidor). Cada enlace del túnel lleva su numeración, reordenación y ventana de 8 tramas con acuses (hasta PTA1110A; ahora adaptativa, ver «Todo por la malla»): la contrapresión es de punta a punta (un relé no acusa hasta haber reenviado); el trozo es de 4 KiB por Bluetooth y 8 KiB por el resto. **Varios saltos**: un relé abre su propio túnel hacia la siguiente puerta (`ttl` y `via` de la trama), solo para quien sus ajustes sirven. No toca `transporte-universal.ts`.
5. **Valores por defecto** (PTA1108C añade: servidores propios ENCENDIDO para mi cuenta, red local APAGADA; ver «Capas compartibles»)
   - Entre neuronas de la MISMA cuenta: **ENCENDIDO**, hasta 2 GiB/día, batería ≥ 20 % (o cargando), nunca por datos móviles/red medida, 16 túneles.
   - Otras cuentas: **«Preguntar»** (Nunca / Preguntar / Automático; «Permitir siempre» y «Nunca» se recuerdan por neurona; sin respuesta en 28 s se deniega), hasta 100 MiB/día, batería ≥ 40 %, 4 túneles.
   - Puertos: 80, 443, 8080 y 8443 públicos (PTA1110A; otros según política, por defecto Preguntar) y los declarados por una capa propia concedida). Red privada/LAN: solo por capas concedidas (PTA1108C; antes, el interruptor `permitirRedPrivada`). Usar puertas ajenas cuando falte internet: encendido. Interruptor de emergencia: `localStorage["starseed.malla.puerta.activo"]="0"`.
6. **Seguridad** — anti-SSRF en dos capas (la puerta valida host literal incluidas formas numéricas/octales/hex, `.local`, `.internal`; Node resuelve el DNS y rechaza si CUALQUIERA de las direcciones es loopback/privada/enlace local/CGNAT/multicast/IPv6 local o mapeada); cuota por grupo y por día con corte en caliente; **anillo de auditoría** (neurona, vecina, host, puerto, bytes, resultado; jamás ruta ni contenido); revocar corta los túneles abiertos y veta a la neurona; **botón Parar**; misma cuenta = la vecina llega por la malla de la cuenta o por un vínculo que YO recordé con la misma cuenta, y cada salto del relé la hereda (`mc && vecina de mi cuenta`), así que una neurona ajena no puede hacerse pasar por mía. Las rutas `/__starseed/puerta/*` son siempre POST y pasan por la guarda del pase.
7. **Interfaz** — Ajustes › Neuronas › Medios › «Internet compartido por la malla» (`ajuste-puerta-internet.tsx`): «Compartir mi internet con mis neuronas», «Con otras cuentas», «Internet por: <neurona> (vía Bluetooth directo, 1 salto)», «Compartiendo internet con: …» con Parar y Revocar, preguntas de otras cuentas y últimos usos.

**Límites reconocidos**
- La puerta SÍ ve el host y el volumen (no el contenido). No es un VPN ni oculta nada a la puerta.
- La misma cuenta se prueba por vínculo recordado (TOFU de la huella) hasta que lleguen los certificados (IDN1108A) a este camino.
- Solo la app nativa (con Node) puede ser puerta o usar el túnel TLS; en la web/PWA queda el `GET` sellado de `puerta-internet.ts` (MPT1108A), aún sin transporte enchufado.
- El router/OpenWrt como puerta de internet sigue siendo siguiente fase; sus servicios como capa ya se pueden ofrecer (ver «Capas compartibles»).
- UDP/DNS y HTTP/3 no viajan; el DNS lo resuelve la puerta.

**Primera rebanada MPT1108A** (`puerta-internet.ts`): proxy `GET https` sellado (ECDH → AES‑GCM) con lista de hosts; sigue disponible como respaldo sin lado de Node.

**Capas compartibles: servidores propios, red local y routers (PTA1108C, 2026-11-08)** — `puerta/capas.ts`, `puerta/capas-fuentes.ts`
- **Detección** (`detectarCapas`, cada 8 s con el ciclo de la puerta; nunca lanza):
  - *servidor-propio*: `NEXT_PUBLIC_SUPABASE_URL` si es autoalojado en red privada y los servidores que el dueño declara en `starseed.malla.puerta.capas.v1`. Solo cuentan hosts que NO están en internet público (IP privada/loopback, `.local/.lan/.home/.internal`, nombre de una etiqueta); los públicos ya salen por «internet». Una capa por host y puerto (`srv:host:puerto`), con latencia si se midió.
  - *router-publico*: routers declarados (host o IP, puertos). `routers-malla/*` solo genera UCI y no guarda direcciones, así que hoy los declara el dueño.
  - *lan*: subredes de las interfaces (las da el lado de Node: `estado` devuelve `subredes`) y, sin ellas, la /24 de cada vecino de la red local nativa.
  - Solo IPv4; rangos privados, CGNAT y loopback (para servicios de la misma máquina, p. ej. el túnel al A1). Nunca públicos, enlace local (metadatos de la nube) ni multicast.
- **Anuncio**: `AnuncioPuerta.detalle` lleva cada capa (hosts, rangos, puertos, latencia) y `capas` suma sus tipos. Solo se anuncia lo que el dueño comparte (la LAN apagada no anuncia ni su subred). Una neurona SIN internet pero con una capa también es puerta. Lo recibido se sanea (rangos públicos o hosts públicos se descartan): sirve para ELEGIR puerta, nunca para conceder.
- **Matriz de política** (`decidirCapa`; ajustes nuevos en `AjustesPuerta`):

| Solicitante | Servidor propio / router | Red local |
|---|---|---|
| Misma cuenta | `compartirServidoresPropios` (**ENCENDIDO**) | `compartirRedLocal` (**APAGADO**; «Compartir mi red local con mis neuronas») |
| Otra cuenta | solo con permiso explícito por neurona (`capasPorNeurona[id]`, nunca por defecto) | permiso explícito por neurona **y** `compartirRedLocal` encendido |
| Revocada | nunca | nunca |

  Se aplica en la puerta (`evaluarDestino`) y los topes de siempre (batería, cuota, túneles) siguen valiendo; una capa privada no gasta datos ni red medida, así que se sirve aunque la puerta no tenga internet. `permitirRedPrivada` queda **obsoleto**: ya no abre nada.
- **Anti-SSRF con capas**: lo privado que una puerta toca es EXACTAMENTE una capa propia concedida y su puerto.
  1. Página (`evaluarDestino`): un destino privado sin capa que lo cubra es `destino-interno` (incluidas formas numéricas raras, `localhost`, `169.254.169.254`); con capa pero sin permiso, `capa-no-concedida`. Puertos: 443 o los declarados por esa capa, nunca otro (`22` en el NAS → `destino-interno`). Una puerta que no tiene la capa pero puede retransmitir (`ttl`) la pasa a otra.
  2. Node (`puerta.cjs`): la página manda una *concesión* `{hosts, cidrs, puertos, subredes}` calculada de las capas PROPIAS y la política (nunca de lo que dice el solicitante). `resolverSeguro` resuelve el DNS UNA vez y rechaza si CUALQUIER dirección interna cae fuera de la concesión (y solo se conceden rangos privados/loopback/CGNAT, jamás enlace local ni públicos); un nombre público no concedido que resuelva a la LAN, o un nombre concedido que de pronto apunte a otra máquina (DNS rebinding), se rechaza. Se conecta a la IP ya validada (sin volver a resolver) y, al conectar, se comprueba `socket.remoteAddress` contra las validadas. El viejo `permitirPrivadas` de la petición `tcp` se ignora.
- **Selección por capa**: `TablaPuertas.elegir/candidatas({host, puerto})` solo propone puertas que alcanzan ese destino (privado → una capa anunciada que lo cubra; público → «internet»). `abrirTunel` y los relés intermedios lo usan, así que el túnel, el proxy y `fetch` lo aplican sin cambios para quien llama; si ninguna puerta ofrece la capa, `sin-capa`. `fetchConPuerta` envía directo por la puerta (sin probar antes la red propia y sin duplicar un `POST`) el destino privado que esta neurona no alcanza y alguna puerta ofrece (`RespaldoFetch.requiereCapa`); si esta neurona sí lo alcanza, va por su red. Solo `https` (el `fetch` de Node hace el TLS); un servidor propio con `http` plano no se tuneliza porque los relés verían el contenido.
- **Interfaz** (tarjeta «Internet compartido»): los dos interruptores, «Esta neurona alcanza: … (compartida / no compartida)», «<puerta> ofrece: <capa · dónde · ms>» y, para neuronas de otras cuentas que usan mi puerta, «Permitir mis capas» / «Retirar».
- **Límites reconocidos**: la LAN anunciada revela la subred a quien reciba el anuncio (por eso solo se anuncia encendida); los servidores propios con nombre dependen de que Node resuelva el nombre a una IP de las subredes de la máquina; no hay IPv6 privado ni `http` plano; faltan los servicios de router/OpenWrt reales y probar todo en dos aparatos en redes distintas.

**Todo por la malla (PTA1110A, 2026-11-10)** — `puerta/{binario,actividad,ia,politica,tunel,servicio}.ts`, `puerta.cjs`, `bluetooth-directo-motor.ts`. Sustituye lo dicho arriba sobre «solo 443», «ventana de 8» y «sin `http` plano».

**Tabla de cobertura** (con la neurona SIN salida propia y una puerta disponible). «Probado» = test en este repo; ninguna fila se ha probado en aparatos reales.

| Tráfico | Mecanismo | Estado |
|---|---|---|
| `fetch`/XHR del webview a Supabase | `fetchConPuerta` (envuelve `global.fetch`) y, para el resto, el proxy del webview | Pasa. Probado (túnel, reintentos, sin duplicar `POST`) |
| Otros `fetch`/XHR, imágenes, vídeo con `Range`, `EventSource`, iframes, navegador de la app, navegación externa | Proxy local `127.0.0.1` aplicado al webview (macOS 14+, Android 7+) | Pasa en macOS 14+, Android 7+, Windows (pasarela local) y Linux (WebKitGTK); por debajo (macOS 10.15–13, Windows con proxy propio) el webview no sale y la interfaz lo dice. `Range` y SSE son HTTP normal dentro del túnel TLS |
| WebSocket (Supabase Realtime, `wss`) | `CONNECT host:443` del proxy; `ws://` por `upgrade` del proxy (nuevo) | Pasa. Probado el túnel y el `upgrade` por `puerta.cjs`; el `PROXY_OVERRIDE` de Android cubre WebSocket |
| Service worker | Sus `fetch` salen por el mismo proceso/proxy | Pasa donde pasa el webview; no hay SW propio que lo evite |
| `http://` y puertos 80, 8080, 8443 públicos | Mismas reglas anti-SSRF que 443; el proxy usa un agente con keep-alive | **Cerrado en PTA1110A**. Probado |
| Otros puertos públicos | Política `otrosPuertos`: **Preguntar** (por defecto: la puerta pregunta a su dueño `host:puerto`) / Nunca / Siempre. Jamás 23, 25, 135‑139, 445, 465, 587, 3389 | Cerrado. Probado |
| `/api/*` del servidor Node local | `agenteMalla` (keep-alive) | Pasa (PTA1108B) |
| IA pública (OpenAI, OpenRouter, NIM…) | HTTPS normal por la puerta; se clasifica como «IA» | Pasa. Probado |
| IA que corre en OTRA neurona | Capa `ia-neurona` (abajo) | Nuevo |
| Actualizador y descargas de Rust | Proxy (`UpdaterBuilder::proxy`, `reqwest`, `curl -x`) | Pasa (PTA1108B), Rust sin cambios |
| Espejos del enjambre y sincronía de capas de conciencia | Cada neurona ya habla por `enviarMensaje` (enlace directo/malla); si el espejo es una URL pública sale por la puerta | Pasa por el camino que ya tenían; sin cambios |
| UDP/DNS, HTTP/3, QUIC | No viajan | No pasa. Límite real |
| Bucle local | NUNCA por el proxy | Regla fija |

**Proxy del webview, automático.** `servicio.ts` lo enciende solo cuando no hay salida propia y existe una puerta y lo apaga cuando vuelve la propia. La prueba de «salida propia» ya no la hace el webview (saldría por el propio proxy y vería «internet»): la hace Node con un TCP directo (`/__starseed/puerta/sonda`, solo hosts públicos y puertos web) con histéresis (2 fallos para bajar, 1 acierto para subir). Ciclo de 4 s sin salida, 8 s con salida.

**Rendimiento en un carril simulado de 300 kb/s** (`rendimiento-carril.test.ts`, reloj virtual, 25 ms de ida; control con prioridad como el motor). Antes = el gestor de HEAD congelado en `__tests__/fixtures/tunel-antes.ts`.

| Medida | Antes (ventana 8, JSON+base64) | Nuevo JSON (par antiguo) | Nuevo binario negociado |
|---|---|---|---|
| Primera respuesta (Supabase) | 229 ms | 229 ms | 199 ms |
| Página de 200 KB | 10,05 s | 7,65 s | 5,66 s |
| Descarga de 2 MB | 102 s (20 KB/s) | 77 s (27 KB/s) | 57 s (36 KB/s) |
| Sobrecarga sobre el carril | ×1,40 | ×1,40 | ×1,02 |
| Consulta pequeña durante una descarga | 367 ms | 392 ms | 513 ms (< 900 ms exigido) |

La consulta pequeña del «antes» responde algo antes porque el gestor viejo deja sin usar casi la mitad del carril (20 de 37,5 KB/s). Qué cambia: ventana en bytes por RTT medido (estilo Vegas, máx. 192 KiB), trozo ≈ 0,4 s del carril, hasta 32 trozos en vuelo por túnel, reparto por menor servicio recibido con suelo anti-inanición de 800 ms, acuses agrupados, DNS con caché de 60 s en la puerta, plazo de conexión de 8 s y keep-alive. **La trama binaria está negociada (`f:["bin"]` en `abrir`/`ok`) y probada en el simulador, pero el transporte de producción de Bluetooth es solo texto: hace falta una orden nativa binaria para activarla (`TransportePuerta.enviarBin`). Hoy viaja JSON.**

**Llamadas.** Hallazgo: los `tu.msg` del canal «puerta» se clasificaban como control y adelantaban a la voz. Ahora son datos (`esTextoDatosPuerta`) y, con una llamada activa (ventana de 3 s), los datos tienen garantizado el 18 % de lo enviado (`FRACCION_DATOS_LLAMADA_BLE`), con grupos de 1 trozo; el orden control > voz > vídeo > datos se mantiene.

**IA de esta neurona** (capa `ia-neurona`). Existía: el router de Astraura (`elegir-nodo.ts`) con candidatos locales/vecinos/nube. Faltaba la IA en el bucle local de la puerta. Ahora: la puerta detecta puertos de IA vivos (8000, 11434, 1234; sonda Node cada 15 s), los anuncia como capa solo a neuronas de la MISMA cuenta y con `compartirIaNeurona` (por defecto encendido si hay servidor). Quien pide usa `http://ia.neurona.local:<puerto>`; la puerta lo traduce a `127.0.0.1` con una concesión de ESE puerto solamente. Un `127.0.0.1` directo sigue siendo `destino-interno`. `nodosIaPorMalla()` produce candidatos tipo «vecino» para Astraura. **Enganchado**: `resolverEndpointBitnet` (`src/lib/astraura/destino-bitnet.ts`) usa `urlIaPorMalla()` solo cuando no hay ningún candidato mejor (local, vecino o nube con URL) y respeta «Nunca» y el uso «IA» de los ajustes.

**Avisos y actividad.** Indicador global discreto «Internet por: MaggaBook · Bluetooth directo · 240 kb/s» (montado en `malla-neuronas-mount.tsx`); un aviso por cambio de ruta real (máquina `AvisosRuta`: 2 confirmaciones y 45 s de enfriamiento por tipo; el primer estado no avisa) y otro cuando vuelve la salida propia. Panel «Actividad de la malla» (desde el indicador y Ajustes): procesos (tipo, host, bytes, velocidad, carril), pausar y cancelar los grandes, uso de hoy frente a límites; en la puerta, «Compartiendo con…» solo con hosts y volumen. Antes de una descarga grande (≥ 1 MiB en un túnel de descargas/actualizaciones/capas) por un carril < 800 kb/s se pregunta una vez: continuar / esperar un carril rápido (≥ 1000 kb/s; se cancela a los 15 min) / solo Wi‑Fi; se recuerda. El tamaño total es desconocido (TLS), así que el disparador es heurístico.

**Ajustes** (Ajustes › Neuronas › Medios › Internet compartido, clave `starseed.malla.puerta.v1`): «Usar el internet de mis neuronas» Automático / Preguntar / Nunca; qué puede usarlo (navegación, datos de StarSeed, descargas, actualizaciones, IA, capas); carriles (Bluetooth, Wi‑Fi P2P, red local); política de puertos; límites. Migración en `interpretarAjustes`: `usarPuertas:false` pasa a «Nunca», los puertos web por defecto siempre se unen a lo guardado.

**Qué ve y qué no ve la puerta.** Ve: host, puerto, volumen y a qué neurona sirve. No ve: rutas, cabeceras, cuerpos ni cookies (TLS de punta a punta). Para `http://` plano SÍ viaja en claro entre el sitio y la puerta (y la puerta lo ve): es igual que ir por una red ajena.

**Prueba en aparatos (pendiente; tableta Maggaboard + MaggaBook).**
1. Tableta con Wi‑Fi y datos apagados, Bluetooth encendido y emparejada con el Mac (el Mac con internet). Abrir StarSeed OS.
2. En 8–12 s aparece el indicador «Internet por: MaggaBook · Bluetooth directo · N kb/s» y UN aviso «Sin Wi‑Fi: ahora por MaggaBook vía Bluetooth directo».
3. Cargar una página externa (`https://` y una `http://`): carga más despacio; Actividad de la malla muestra el host, los bytes y el carril.
4. Abrir datos de StarSeed (Supabase) y comprobar que responden; con una llamada en curso, los datos siguen avanzando.
5. En el Mac: «Compartiendo con: Maggaboard» con hosts y volumen, sin rutas.
6. `enlaces.log` del Mac: líneas «puerta» (túnel abierto, carril, velocidad, cierre). Debe leerse sin adivinar.
7. Volver a encender el Wi‑Fi de la tableta: aviso «Volvió tu internet…», el indicador desaparece y el proxy se apaga. Comprobar que `127.0.0.1` de la app sigue cargando durante todo el proceso.

**Siguiente paso, NO hecho a propósito: la orden nativa binaria del Bluetooth** (se espera a que el enlace estabilizado pase una ronda en aparatos antes de tocar Rust/Kotlin). Lo que hace falta, y solo esto:
1. `native/src-tauri/src/ble_trama.rs`: un tipo de paquete DATOS binario (o un bit de bandera en la cabecera de DATOS) que lleve bytes crudos en vez de texto UTF‑8; el núcleo de enlace (`nucleo.encolar`) hoy recibe un `&str`.
2. `native/src-tauri/src/ble.rs`: una orden `ble_enviar_bin(enlace, bytes)` junto a `ble_enviar` (mismo ciclo de acuse y de cola; el cuerpo entra por `tauri::ipc::Request` en bruto, no como lista de números) y un campo `bin` en `MensajeBle` para lo recibido (`ble_recibidos`).
3. `ble_macos.rs` y `ble_android.rs` / `BleStarSeed.kt` solo mueven paquetes ya formados (GATT y L2CAP): no deberían cambiar.
4. TS: `bluetooth-directo.ts` expone la orden y `transporte-universal.ts` (gancho aditivo) rellena `TransportePuerta.enviarBin/alRecibirBin`; el motor `bluetooth-directo-motor.ts` clasifica la trama binaria como datos (el reparto de llamada ya cuenta bytes, no texto).
5. Ya está hecho y probado: la negociación `f:["bin"]`, la trama (`binario.ts`), el emisor y su control de flujo. Un par antiguo sigue por JSON.
**Ganancia esperada** (carril simulado de 300 kb/s, mismas condiciones): la descarga pasa de 27 a 36 KB/s (+33 %), la página de 200 KB de 7,6 a 5,7 s, la sobrecarga de ×1,40 a ×1,02 y la primera respuesta de 229 a 199 ms. Frente al punto de partida (20 KB/s), +80 %. Se verifica en aparatos con las mismas cuatro cifras en `enlaces.log`.

**Siguientes fases**: webview por el proxy (macOS/Android), `/api/*` relativo y manifiestos desde Rust por el túnel (PTA1108B), router como puerta de internet, pantalla para declarar servidores y routers propios, contabilidad y recompensa a quien presta capacidad.

**Cualquier sentido, cualquier sistema, tres capas de confianza (PTA1110B, 2026-11-10)** — `puerta/{plataformas,roles,politica,tunel,servicio}.ts`, `ServicioAntenas.kt`. Los papeles no son fijos: cualquier neurona puede ser la que tiene salida y cualquiera la que no. Lo de abajo está probado con la red en memoria (`__tests__/pta1110b-ambitos.test.ts`); **nada se ha probado en aparatos reales**.

*Matriz de plataformas* (`capacidadesPuerta`, probada por tabla). «Compartir» = ser la puerta; «Usar» = salir por la de otra.

| Sistema | Compartir (necesita) | Segundo plano | Usar: datos de la app | Usar: webview entero | Usar: descargas Rust |
|---|---|---|---|---|---|
| macOS (nativo) | Sí: Node (`puerta.cjs`), página viva | Siempre (barra de menús/Dock) | Sí | macOS 14+ (`proxyConfigurations`); 10.15–13 NO | Sí |
| Android (nativo) | Sí: libnode (nodejs-mobile), página viva, servicio de antenas | Con `ServicioAntenas` + latido del WebView (nuevo) | Sí | Sí (`PROXY_OVERRIDE`, Android 5+ con WebView reciente) | Sí |
| Windows (nativo) | Sí: Node, página viva | Mientras la app esté abierta | Sí | Sí con la pasarela `47077`; NO si hay proxy propio | Sí |
| Linux (nativo) | Sí: Node, página viva | Mientras la app esté abierta | Sí | Sí (WebKitGTK) | Sí |
| Web / PWA | NO: sin sockets TCP | — | NO hoy (el GET sellado de `puerta-internet.ts` no tiene transporte) | NO | — |
| iOS | Planeado, sin build (iOS suspende en segundo plano y no hay libnode para iOS) | — | Planeado | Planeado (iOS 17: misma API que macOS 14) | — |

Qué pasa por debajo de macOS 14: pasan los datos de StarSeed (`fetchConPuerta`, `/api/*` por `agenteMalla`) y las descargas/actualizaciones de Rust; NO pasan páginas externas, imágenes ni iframes del webview. El motivo sale en llano en el navegador de la app. Web/PWA: por diseño no puede ser puerta; si tiene internet no la necesita y, sin él, no alcanza a ninguna neurona nativa (no hay transporte directo de la web a las neuronas), así que hoy no usa la malla.

*Android como puerta.* Corre `puerta.cjs` (va en `ARCHIVOS_ENVOLTORIO` del paquete de Android) sobre libnode y abre sockets TCP como en escritorio. El gestor de túneles vive en la PÁGINA: con la pantalla apagada Android pausa los temporizadores del WebView aunque el servicio en primer plano mantenga vivo el proceso. Arreglo (PTA1110B): `PuertaSegundoPlano` (en `ServicioAntenas.kt`) reanuda el WebView (`onResume` + `resumeTimers`, cada 15 s y al pausar la actividad) mientras el servicio de antenas esté en marcha; sin WakeLock. El latido es INCONDICIONAL mientras el servicio de antenas esté en marcha, aunque no se comparta nada (no hay hoy un puente de la página al servicio para saber si se comparte): cuesta batería; pendiente hacerlo condicional. NO verificado en un aparato: servir con la pantalla apagada (sin wake lock la CPU puede dormirse y cortar los túneles). Sin compilar ni probar (Kotlin solo lo compila la CI). **Datos móviles**: antes un `permitirRedMedida` escondido y apagado; ahora «Compartir también por datos móviles»: **Nunca** (por defecto) / **Preguntar** (por neurona; «siempre»/«nunca» se recuerdan aparte de las otras cuentas) / **Sí, con tope** (200 MiB al día por defecto, contado SOLO sobre lo servido mientras la salida era red medida). Detección: `navigator.connection.type === "cellular"` o `saveData` (el WebView de Android lo da); un punto de acceso del propio teléfono no se detecta como medido (límite). Migración: quien tenía `permitirRedMedida` pasa a «Sí» con su tope. La capa pública no sale jamás por datos móviles.

*Papeles que cambian solos* (`roles.ts`, `DecisorRol`): «puerta» (salida propia), «usuaria» (sin salida y con una puerta usable) o «sola». Recuperar la salida cuenta al instante (deja la ruta ajena y anuncia); perderla espera 6 s de permanencia. Al dejar de ser puerta, `salidaPerdida()` corta YA lo que servía hacia internet (`salida-perdida`) y manda la trama `retira` (nueva): cada vecina borra la ruta SOLO si iba por quien retira (una ruta alternativa mejor se respeta), cierra sus túneles propios por esa puerta (`puerta-perdida`) y reenvía la baja una vez (sin repetir, sin bucle). Quien pidió reabre por la ruta nueva (el proxy/`fetch` reintentan). Sin bucles: una neurona sin salida propia no se anuncia como puerta de internet, y `via`/`ttl` cierran el resto; el sondeo de salida lo hace Node, nunca el webview (que saldría por el proxy de la malla).

*Cadenas.* A → B → C → internet por carriles distintos (Bluetooth, Wi‑Fi directo, red local) hasta `MAX_SALTOS` = 3. Cada salto aplica SU política al ámbito de quien pide: ajustes del ámbito, batería mínima, cuota diaria del ámbito y túneles simultáneos (antes el relé solo miraba un interruptor). La interfaz nombra la cadena de la puerta hacia mí: «Internet por: Maggaboard → MaggaBook · Bluetooth directo · 1 salto» (`textoCadena`).

*Ámbitos de confianza* (`Ambito`: mias > grupo > otras > pública), con ajuste de COMPARTIR y su espejo de USAR:

| Ámbito | Compartir (por defecto) | Usar (por defecto) | Topes por defecto |
|---|---|---|---|
| **Mis neuronas** (misma cuenta, probada) | Encendido | `modoUso`: Automático | 2 GiB/día, batería ≥ 20 %, 16 túneles |
| **Grupo o comunidad** (`grupos[id]`) | Preguntar (Nunca / Preguntar / Automático con tope) | Preguntar (ídem; «Preguntar» no usa hasta que el usuario confirma) | 500 MiB/día, batería ≥ 30 %, 6 túneles, propios del grupo |
| **Otras cuentas** (vecina DIRECTA con vínculo aceptado, sin grupo común) | Preguntar | **Preguntar** (ajuste propio «Usar el internet de neuronas de otras cuentas»: Nunca / Preguntar / Automático; la respuesta se recuerda por neurona y se retira desde la tarjeta) | 100 MiB/día, batería ≥ 40 %, 4 túneles |
| **Pública** (lo demás: cuenta desconocida a través de una cadena, o neurona que se anuncia como pública; `publica`) | **APAGADA** («Ofrecer mi internet a cualquier neurona StarSeed cercana») | **APAGADA** («Usar puertas públicas», con el aviso de lo que ve una puerta) | 20 MiB/día, batería ≥ 50 %, 2 túneles, solo web (80, 443, 8080, 8443), sin capas privadas, nunca datos móviles |

Cuotas, anillo de auditoría (`grupo`/`grupoId`) y revocación valen POR ÁMBITO. Una cadena nunca ensancha la confianza (`ambitoEfectivo`, probado): quien abre declara `am`/`g` en la trama `abrir`, y cada salto lo recorta a lo que SABE de su vecina directa: «mias» exige `mc` Y vecina de mi cuenta; «grupo» solo viene de una vecina mía (que lo garantiza, y solo si tengo ese grupo) o de una vecina del MISMO grupo, si no baja a «otras»/«pública»; lo declarado nunca sube; «pública» solo existe si esta neurona la ofrece (si no, quien la reclama es «otra cuenta» y se le pregunta). Del lado de USAR (`ambitoDePuerta`): una puerta es mía si es mi vecina de cuenta o llego por una mía Y su anuncio trae mi `uid`; una extraña que dice ser de mi cuenta cuenta como pública. Una neurona de otra cuenta que es mi vecina directa es «otras» (se usa según «Usar el internet de neuronas de otras cuentas», por defecto Preguntar: la pregunta nombra a la neurona con su identidad verificada y dice que una puerta ve a qué servidores te conectas y cuántos datos mueves, nunca el contenido); una cuenta desconocida alcanzada por cadena, o una neurona que se anuncia pública, solo se usa con «Usar puertas públicas».

*Pertenencia a grupos: lo que falta.* Hoy no hay una prueba de pertenencia que se pueda comprobar SIN internet (los certificados cuenta→neurona de IDN1108A prueban la cuenta, no el grupo). Se usa la lista `grupos[id].miembros` (ids de neurona que esta neurona guardó cuando hubo red; la rellena quien llame a `configurarGrupo()`: las páginas de grupos y comunidades), fiable solo para una vecina DIRECTA (su id lo fija el enlace) y nunca para una lejana. «Preguntar» muestra la identidad (nombre, ámbito y grupo, id corto). Falta: (1) certificados de pertenencia firmados por la gobernanza del grupo (§7.3) con caducidad, (2) que las páginas de grupo llamen a `configurarGrupo` y mantengan la lista de miembros, (3) probar la pertenencia de una neurona lejana en una cadena. Fuente de grupos en la interfaz: la tarjeta «Internet compartido» tiene «Añadir grupo o comunidad», que ofrece MIS membresías (`os_memberships`/`os_groups`, con sesión y red) y entra con Preguntar en los dos sentidos; la lista de miembros se arma con los vínculos recordados cuya cuenta es miembro del grupo (`grupos-fuente.ts`) y solo se refresca al añadir con red (no hay refresco automático ni caducidad: pendiente). No es una prueba de pertenencia.

*Prueba en aparatos, caso inverso (Mac sin Wi‑Fi, tableta con Wi‑Fi, solo Bluetooth).*
1. En la tableta «Maggaboard» (Android 16, con Wi‑Fi) y en la Mac «MaggaBook», misma cuenta, ambas con la versión que traiga este cambio. Ajustes › Neuronas › Medios › «Internet compartido»: en la tableta «Compartir mi internet con mis neuronas» encendido (por defecto).
2. Apaga el Wi‑Fi y cualquier cable de la Mac. Deja el Bluetooth de las dos encendido y comprueba que se ven (Medios).
3. Espera unos segundos (el ciclo es de 4 s sin salida propia). En la Mac: «Internet por: Maggaboard · Bluetooth directo». En la tableta: «Compartiendo internet con: MaggaBook».
4. En la Mac abre un dato de StarSeed (Mensajes o Biblioteca) y, en el navegador de la app (`/navegador`), una página externa (macOS 14+). Debe cargar, el indicador sigue nombrando a la tableta, y en la tableta suben los usos (host, bytes).
5. Quita el Wi‑Fi a la tableta: en la Mac debe desaparecer la ruta en unos segundos (no 90) y la carga en curso fallar rápido. Devuélvele el Wi‑Fi: se restablece.
6. Vuelve a poner el Wi‑Fi en la Mac: el indicador desaparece y, desde ese momento, la Mac es la que puede compartir (la tableta con su Wi‑Fi apagado la usaría).
7. Con la tableta por datos móviles (sin Wi‑Fi) y «Nunca» (por defecto), la Mac NO debe salir por ella; con «Sí, con tope», sí.
8. Mirar `enlaces.log`: líneas `puerta - - rol: …` en cada cambio y `ruta: …`.

## 6 · Capa 3 · Datos: el registro vivo de cada entidad
Cada página, comunidad, grupo, canal, publicación, hilo, votación o estación es un **registro de operaciones firmadas**. Cada operación lleva autor, reloj lógico híbrido y referencia a las anteriores. Las neuronas que tienen derecho se pasan las operaciones que les faltan, y con las mismas operaciones todas llegan al mismo estado.

| Tipo | Regla de fusión |
|---|---|
| Publicaciones, comentarios, mensajes | Solo se añaden; se ordenan por reloj; editar o borrar es otra operación firmada |
| Perfil de página, comunidad o canal | Por campo, gana el último reloj; solo pueden escribir los roles con permiso |
| Membresías y roles | Conjunto con altas y bajas firmadas por quien tiene el rol para hacerlo |
| Reacciones | Contador sin conflictos por autor |
| Documentos y tablas vivas | El motor de celdas que ya existe (`vivo/tabla/fusion.ts`) |
| Votos | Ver §7.3 |

- **Réplicas por ámbito.** Cada entidad dice quién la guarda: neuronas de los miembros, cerebros, servidores propios, nube StarSeed. También dice cuántas copias mínimas quiere.
- **Almacenamiento local:**
  - App nativa: SQLite en el servidor local.
  - Web y PWA: IndexedDB y OPFS.
- **La nube como réplica.** Al volver internet, Supabase recibe las operaciones y se reconcilia de forma idempotente por id, como ya hace el correo por la malla. La URL del servidor pasa a configurarse en tiempo de ejecución: nube StarSeed, servidor propio, neurona base o solo malla.

## 7 · Capa 4 · Servicios

### 7.1 · Mensajes, llamadas y archivos
- Los mensajes que llegan por la malla entran en el almacén local y se fusionan con el historial de la cuenta.
- Adjuntos, formato y citas también viajan por la malla.
- Archivos, grupos, actualizaciones y capas como **enjambres** (seeders, imanes, espejos, canales): análisis, diseño y motor en `enjambre-datos.md` (ENJ1110A; sin enchufar aún).
- Las llamadas eligen medio con el planificador. Por Bluetooth solo va la voz; con Wi‑Fi directo o LAN, vídeo y pantalla.

#### 7.1.1 · F1 hecha en código (MSJ1108C · 2026-11-08)
- **Almacén local** por mensaje en IndexedDB, con reloj híbrido, vía, recibos y metadatos de adjuntos; migración sin pérdidas
  desde `starseed.mensajeria.malla.v1` (respaldo literal en `.respaldo`, la clave vieja no se borra, lápidas).
- **Fusión:** el hilo muestra un historial único (servidor + malla, sin duplicados, con la vía real); al volver internet lo
  que solo viajó por la malla sube **con su mismo id** (idempotente, sin cambios de esquema; propuesta de columna `meta` en el detalle).
- **Contenido rico por la malla:** markdown, formato enriquecido, citas, y ediciones/borrados como operaciones firmadas por
  el autor, en cuentas y en neuronas. Los adjuntos siguen por el motor de archivos con miniatura primero.
- **Huérfanos:** `chat-directo` se queda fuera (duplicaría el buzón); `localsend` y `nas` necesitan lado nativo (plan escrito).
- Detalle, límites (TOFU de claves hasta F0) y pendientes en aparatos reales: `architecture/datos-por-la-malla.md` §10.
- Sigue pendiente de F1: la prueba de los 18 formatos por cada medio (necesita los medios de MED1108B) y cablear `localsend`/`nas`.

### 7.2 · Publicaciones, páginas, comunidades y canales
- Publicar escribe primero en local y se difunde a las réplicas del ámbito. El feed lee del almacén local.
- Cada página o comunidad tiene un **perfil de red** (§8).
- Los canales públicos se anuncian por la malla. Quien los sigue recibe las publicaciones por el medio que haya; por LoRa, solo el titular y el aviso.

### 7.3 · Grupos y gobierno sin servidor
- Cada voto es una papeleta firmada por el miembro.
- El quórum y el plazo los dicta la configuración del grupo.
- El cierre lo sellan **notarios**: neuronas del grupo elegidas por sorteo determinista. Cuando k de n firman el mismo recuento, el resultado vale.
- Sin quórum alcanzable queda «provisional» y se cierra al reconectar.
- Delegaciones, pruebas de que nadie vota dos veces y opción de voto secreto (paso posterior).

### 7.4 · Transmisiones y estaciones
- El origen emite a sus vecinos, y los espectadores retransmiten en árbol o en malla.
- La calidad baja por escalones según el medio de cada tramo: vídeo → audio → paramétrico.
- Las estaciones paramétricas (`t0` + parámetros) llegan incluso por LoRa.
- El directorio de estaciones se anuncia por la malla.

### 7.5 · Capas de conciencia
- **Motores empaquetados:** WebLLM y transformers.js vienen en la app o los sirve el servidor local, no los CDNs.
- **Capas por la malla:** se cablea `capas/repartir`, siempre con SHA del manifiesto.
- **IA por cualquier enlace:** la neurona sin recursos le pide a una vecina o al cerebro de la LAN.
- **Por ámbito:** cada página, comunidad o grupo elige capas, servidor y nivel de privacidad. CAMR pasa de recomendar a decidir con esa configuración.

### 7.6 · Cuenta y acceso
- **Primer acceso sin internet:** una neurona ya dentro de la cuenta enrola a la nueva por QR o Bluetooth, firmando su certificado (protocolo y código de 6 cifras en §5.1).
- **Sesión local** con la clave de la neurona.
- Supabase Auth queda como una forma más de entrar.

**(OFF1108A · 2026-11-08) La app instalada arranca y funciona sin internet tras reabrirla.** Causas medidas (tableta, build 0.5.1-prueba.26):
1. `uidActual()` leía `auth.getSession()`; con el token caducado y sin red Supabase no puede renovarlo y devuelve `session: null`. Todo lo que depende de «quién soy» (perfil, `listNeurons`, saludo de enlace con `cuenta`, `miUid` del buzón) quedaba sin cuenta, y esa ausencia se cacheaba. Ahora `src/lib/sin-internet/uid-recordado.ts` recuerda SOLO el id (uuid) y `uidActual()` lo devuelve si el fallo es de red, no si se cerró sesión.
2. `AccountProvider` solo hidrataba el perfil guardado si había sesión → cabecera, nombre y avatar vacíos. Ahora abre con la ficha mínima de la cuenta recordada + perfil guardado + avatar como blob local (`sinConexion: true`) y al volver la red pide la sesión y refresca.
3. `listNeurons()` solo tenía caché en memoria: arranque en frío sin red = solo «este dispositivo». Ahora se escribe la instantánea en línea y se hidrata sin red.
4. Cada `depsReales` de Bluetooth/red local arrancaba con `neuronasCuenta` vacío (carrera con la lectura de `antenas.json`) y sin las huellas ya probadas. Ahora esperan (máx. 3 s) al espejo y a la config de faro.
5. Nada reintentaba el buzón al ligarse una neurona: solo el intervalo. Ahora `arranque-sin-red.ts` lo dispara al aparecer una ligadura nueva.
6. Endurecido: `leerAjuste` de la clave de faro lanza ante un error de lectura (antes un fallo parecía «no hay clave» y podía fabricar una nueva).

**Instantánea de la cuenta** (`instantanea-cuenta.ts`, IndexedDB `starseed-identidad`, claves `cuenta-snap:v1:<sección>`): `perfil`, `avatar` (bytes), `neuronas` (filas de `neuron_devices`), `huellas` (neurona → huella `id:…` probada por cuenta) y `cerebros` (pertenencia). Filtro `sinSecretos` por nombre y forma: ni tokens ni la clave de faro (esta sigue en `antenas.json` 0600 y en los ajustes privados de la cuenta). Otra cuenta no la lee; el cierre de sesión manual la borra.

**Reconocer una neurona sin servidor:** al ligarse un enlace por prueba de cuenta (HMAC de faro o certificado IDN1108A) se anota su huella; sin internet un saludo firmado con esa huella desde esa neurona entra como vínculo (`aceptarHola`). Con certificado IDN1108A funciona igual que antes. `decidirModoAcceso` se monta en `etiqueta-sin-internet.tsx` (pastilla discreta, sin bloquear).

### 7.7 · Avisos y actualizaciones
- Todos los sistemas avisan por la malla; ntfy queda opcional y se puede alojar en la LAN.
- Las actualizaciones firmadas (APK, paquete de escritorio, capas) se las pasan las neuronas entre sí y con un espejo en la LAN. La firma del actualizador se verifica igual.
- (ACT1108B) Hoy la actualización ya reintenta y cambia de ruta (directa → API de GitHub) cuando `releases/download` falla; el siguiente escalón es F7: `Ruta::Espejo` (Rust) / `espejos` (`rutas-github.ts`) es el hueco donde una neurona que ya tiene el paquete lo sirve a las demás, antes de salir a GitHub. Contrato: centro-versiones-1105.md §9.9.

### 7.8 · Navegadores en la LAN
Una app nativa puede hacer de **estación base**: sirve la web y su API local a la red, con aviso y permiso. Así un móvil o un PC sin app entra en StarSeed desde el navegador sin internet.

## 8 · Configuración e inteligencia
- **Perfil de red por ámbito** (página, comunidad, grupo, canal, transmisión). Sus campos:
  - alcance: neurona, LAN, malla vecinal, todo;
  - réplicas y número mínimo;
  - medios permitidos y preferidos;
  - cifrado;
  - formatos y escalones;
  - retención;
  - capas de conciencia;
  - quién puede hacer de relevo.

  Se hereda de la cuenta y cada ámbito lo puede ajustar.
- **Copiloto de red.** Detecta el entorno: internet, router, vecinos, radios, batería, hardware conectado. Propone el plan con una frase y un toque, con tres modos por acción: Automático, Preguntar o Nunca. Explica por qué eligió cada medio.
- **Perfiles de situación.** Casa, Viaje, Asamblea o evento, Apagón o emergencia, Comunidad rural, Privado total. Cambian varios ajustes a la vez y se activan solos por señales; por ejemplo, sin internet durante 5 min propone «Apagón».
- **Mapa de vías.** Por cada sistema: si funciona ahora, por qué medio y qué falta para que funcione.
- **Autoprueba.** Comprueba de verdad cada medio entre dos neuronas y guarda el resultado.

## 9 · Formatos por medio (escalones automáticos)

| Formato | BLE | Wi‑Fi directo / LAN / mesh | LoRa |
|---|---|---|---|
| Texto, votos, recibos, avisos | Sí | Sí | Sí (≤ 200 B) |
| Imagen | Miniatura (≤ 200 KB) y el resto cuando haya otro medio | Original | Solo aviso |
| Audio, voz | Opus de 16–24 kbps | Original | Paramétrico |
| Vídeo, pantalla, transmisión | No (pasa a voz) | Original y escalones | Solo aviso |
| Archivos grandes y modelos | Espera a otro medio (lo propone) | Sí, multitrayecto | No |

## 10 · Fases (olas). Cada una se da por hecha solo cuando funciona en dos aparatos reales.

| Fase | Contenido |
|---|---|
| **F0 · Cimientos** | Cifrar TCP 47071 (hecho en código por CIF1108A, también Bluetooth; falta prueba en dos aparatos reales); contrato `ConectorMedio` envolviendo los enlaces que ya hay; planificador único; certificado cuenta → neurona y clave maestra con interfaz (hecho en código por IDN1108A, §5.1; falta prueba en dos aparatos reales); URL del servidor en tiempo de ejecución; Mapa de vías (solo lectura) |
| **F1 · Mensajería completa sin internet** | Almacén local de mensajes y fusión con el historial; adjuntos, formato y citas por la malla; cablear `chat-directo`, `localsend` y `nas`; prueba de los 18 formatos por cada medio |
| **F2 · Entidades local‑first** | Registro vivo firmado; almacén local; réplicas por ámbito; publicaciones, páginas, comunidades y canales; reconciliación con Supabase |
| **F3 · Gobierno sin servidor** | Papeletas firmadas, quórum, notarios, provisional y cierre al reconectar |
| **F4 · Transmisiones y estaciones** | Relevo entre espectadores, escalones por medio, paramétricas por LoRa, directorio por la malla; cablear `estaciones/malla-directa` |
| **F5 · Conciencia sin internet** | Motores empaquetados, capas P2P, IA por cualquier enlace, configuración por ámbito |
| **F6 · Antenas y hardware** | Puente Meshtastic nativo, serie en Windows, aplicar y probar UCI en un router OpenWrt real, nodo base (Raspberry Pi o ESP32), conector Reticulum (según §11), estación base para navegadores |
| **F7 · Avisos y actualizaciones por la malla** | Avisos de todas las entidades; espejo de actualizaciones en la LAN y entre pares |
| **F8 · Copiloto** | Perfil de red por ámbito, perfiles de situación, sugerencias, autoprueba |

**Orden recomendado:** F0 → F1, después F2 y F3 juntas (comparten el registro vivo), luego F5, F4, F7, F6 y F8.

## 11 · Decisiones de Alex
1. **Motor de fusión de datos (F2):**
   - **Propio**, sobre lo que ya hay: celdas CRDT, teselas y reloj de Lamport. Sin dependencia nueva.
   - **Biblioteca MIT** (Automerge o Loro): más probada, pero añade peso.
2. **Reticulum.** El protocolo es de dominio público desde 2016. La implementación de referencia lleva la «Reticulum License»: MIT con dos prohibiciones, sistemas pensados para dañar a personas y usarla, directa o indirectamente, para crear datos de entrenamiento de IA. Como StarSeed aprende de sus propias experiencias, las opciones son:
   - **(a)** no integrar la de referencia y escribir un conector propio del protocolo público;
   - **(b)** hablar con un `rnsd` que instale la persona, con aviso;
   - **(c)** dejarlo para después.
3. **La nube como réplica.** Pasar de «Supabase manda» a «la neurona manda y la nube se reconcilia» cambia la seguridad (RLS → firmas). Se hace por sistema, empezando por los mensajes.
4. **Relevo para otras cuentas:** activado por defecto, con topes, o desactivado.

## 12 · Límites reales
- **Navegadores.** Un navegador solo, sin app, no descubre a nadie sin internet: necesita QR o una estación base.
- **iOS.** Limita el Bluetooth y el Wi‑Fi en segundo plano.
- **Mac.** Tiene una sola radio Wi‑Fi: con el Wi‑Fi directo deja su red de casa mientras dura.
- **LoRa.** Es lento por naturaleza y la ley limita su tiempo de aire.
- **Islas.** Dos zonas sin ningún medio entre ellas no se ven hasta que alguien lleve los datos (guardar y reenviar) o haya una puerta.
- **Cuentas nuevas.** Crear una cuenta nueva sin ninguna neurona de confianza cerca necesita, al menos una vez, un ancla de identidad: QR de otra persona o internet.

## 13 · Todas las vías arriba a la vez y paso al instante (MLL1111C · 2026-11-11)

Prueba 35 (10-11): el Bluetooth Mac ↔ tableta estuvo caído casi nueve horas con los dos en el mismo Wi-Fi; al apagar el
Wi-Fi de la tableta la llamada no salía («inicio paso=timbre fallo») y nadie la repetía. Reglas desde ahora:

1. **El Bluetooth siempre ligado con la neurona cerca, haya o no otra vía.** Causa de las nueve horas (leída en el código y
   reproducida con un modelo de la pila de Android en `ble_autocura.rs::pruebas_mll1111c`): el periférico Android
   cancelaba la conexión en CADA `STATE_DISCONNECTED`, también de un aparato ya desconectado; la pila contestaba con otro
   `STATE_DISCONNECTED` → bucle de ~300/s (las «18 000 desconexiones en 60 s») y cada vuelta reprogramaba el anuncio, que no
   llegaba a arrancar nunca: el Mac no veía a la tableta y no intentaba conectar. Arreglo y estructura:
   - una desconexión de un aparato que no constaba como conectado es **repetida**: no se cancela otra vez, no cuenta como
     caída y no toca la radio (`clasificar_desconexion`, gemelo en `BleStarSeed.kt`);
   - **un solo dueño de la reconexión**: el central en Rust (`Vecindario`, 0 · 2 · 5 · 15 s con tope); el periférico solo
     se anuncia; las peticiones de anuncio se juntan (`Anuncio`: un arranque en curso no se reinicia; sin confirmar en 3 s se
     puede repetir) y las reanudaciones de radio también (una pendiente);
   - la **cura** solo con evidencia de atasco real (desconexiones REALES o sin enlace con una neurona cerca) y con plazo
     creciente entre curas: 5, 5, 10, 20 y 30 min de tope;
   - **contador real** por minuto en `enlaces.log`: `contador-enlaces · en 60 s: N conexiones, N desconexiones reales,
     N avisos repetidos ignorados` (un minuto sin hechos no escribe).
2. **Vías en reserva caliente.** Ninguna vía se cierra porque otra funcione. Coste de mantenerlas, por par: Bluetooth,
   latido de 3 B cada 8 s en un enlace callado (`ble_trama::LATIDO_MS`): 22,5 B/min de carga útil (≈ 160 B/min con
   cabeceras ATT/L2CAP/LL) y 7,5 despertares/min por lado; durante una llamada, la comprobación de vida de WebRTC lee
   `getStats` 4 veces por segundo (10 tras un aviso de red), sin tráfico extra por la red. La red local no mantiene socket:
   cada mensaje abre su conexión TCP (2 s de plazo), así que su reserva no cuesta nada.
3. **Paso al instante.** Señales del sistema (`src/lib/malla/senales-red.ts`): `online`/`offline` en todas las vistas web
   (WKWebView, WebView de Android, WebView2, WebKitGTK) y `navigator.connection` `change` donde existe (Android, Windows).
   Donde no hay señal (o el corte es del router con la interfaz arriba), comprobación de vida: con la voz por WebRTC, si no
   entra ningún byte en 1 s (400 ms tras un aviso de red), WebRTC cuenta como caído aunque ICE diga «conectado». La voz y
   la señal dejan un carril caído en el primer tic; vídeo y datos tras 1 s. Medido en el banco: 433 ms (con señal) y
   1 261 ms (corte silencioso; antes no se detectaba en 20 s).
4. **El timbre nunca se rinde en silencio** (`src/lib/malla/cola-timbre.ts`): cola de 30 s, se repite en cuanto liga
   cualquier vía (Bluetooth con esa neurona, enlace local, internet) y si no a 1, 2, 3, 3… s; quien llama ve «Buscando una vía
   hasta <nombre>…». Líneas: `inicio paso=timbre en-cola …`, `reintento-fallido …`, `ok intento=N tras=Xms motivo=via-nueva:…`,
   `agotada …`.
5. **El Wi-Fi directo gana al router si mide más** (petición 8): `carriles.ts::ordenPorCapacidad` reordena los carriles
   Wi-Fi (directo, Aware, AWDL, red local) por kb/s penalizados por el retardo, con un 25 % de histéresis a favor del
   actual; el cambio dice `…-mas-capacidad` y la línea de carriles enseña «Datos: Wi-Fi directo». Probado en el banco con
   vías simuladas (ningún aparato de Alex forma Wi-Fi directo entre sí).
