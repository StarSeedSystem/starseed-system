# Permisos y control del dispositivo (PER1111S · 2026-11-11)

**Qué es:** el contrato de todo lo que StarSeed OS necesita pedir a cada sistema (macOS, Android, Windows, Linux X11 y
Wayland), cómo se pide, qué se puede leer de vuelta y qué función del OS abre cada permiso; el modelo de seguridad para
controlar un aparato; y las fases para construirlo. **La fase 1 está hecha** (§5): la lista de permisos de cada neurona,
completa, verdadera y adaptable.

**Por qué:** el 2026-11-11 Alex tuvo que buscar y activar a mano, en Ajustes del Sistema del Mac, Accesibilidad y
Grabación de pantalla y audio del sistema para StarSeed OS. La app nunca los pidió, aunque `entrada_ventana` y
`capturar_ventana` (prestar una ventana, APR1019) ya los necesitaban.

**Código:** registro único `src/lib/nativa/permisos-registro.ts` · máquina de la lista `src/lib/nativa/permisos-inicio.ts` ·
quien pide `src/lib/nativa/permisos-inicio-ejecutor.ts` · ventana `src/components/nativa/lista-permisos.tsx` (la monta
`asistente-permisos.tsx`) · nativo `native/src-tauri/src/permisos_sistema.rs` (+ `android.rs`, `ArranqueStarSeed.kt`,
`PuenteNativo.kt`) · entrada desde los ajustes: Señales › «Permisos de antenas» › **Permisos de esta neurona**
(`src/components/malla/permisos-antenas.tsx`).

---

## §1 La regla que no se negocia: «automático» no es «autoconcedido»

Los sistemas reservan algunas concesiones a la persona que está delante del aparato. En macOS, Accesibilidad,
Grabación de pantalla, Monitorización de entrada, Acceso total al disco y Automatización **no los puede conceder una app
ni una terminal**; en Android, un servicio de accesibilidad, la captura de pantalla, la superposición, el acceso a todos
los archivos y la exención de batería piden siempre la confirmación de la persona en una pantalla del sistema.

**«Automático» en StarSeed OS significa:** se pide en el momento justo con su porqué en palabras claras → se abre la
pantalla EXACTA del sistema → se nota la concesión en cuanto ocurre (al volver a la ventana y sondeando mientras
espera) → el flujo sigue solo → nunca se pide dos veces lo ya concedido.

**Nunca significa** (y una prueba lo vigila, `permisos-registro.test.ts` › «nada de la app se autoconcede»):
escribir en la base de datos de permisos (TCC.db, `tccutil`), usar interfaces privadas o no documentadas, pulsar por
guion los diálogos del sistema (AppleScript/System Events, `osascript`, servicios de accesibilidad que se pulsan a sí
mismos), `pm grant` / `appops set` por adb, perfiles MDM/PPPC (solo valen en Macs gestionados por una organización, y
entonces los firma esa organización, no la app), ni pedir a la persona que desactive SIP.

**Dónde la petición de Alex no se puede cumplir tal cual:** «que se autoconcedan, usando la terminal o cualquier otra
app» — no existe un camino legítimo; cualquier camino que exista es justo lo que el sistema prohíbe, y además
dejaría a la neurona expuesta a cualquier otro programa que haga lo mismo. Lo construido es la versión honesta: un clic
por permiso, la pantalla exacta abierta, la concesión detectada y la lista siguiendo sola. **Revisado en este código:**
no hay ningún sitio que escriba en TCC.db, use `tccutil`, `pm grant` o pulse diálogos (la prueba lo comprueba sobre
`permisos_sistema.rs`, el ejecutor y `ArranqueStarSeed.kt`). Sí hay un riesgo relacionado: ver §4.6.

---

## §2 La matriz

Columnas: **Cómo** = cómo se pide (`aviso`: la app hace que el sistema pregunte · `aviso→panel`: aviso la primera vez,
después solo en Ajustes · `panel`: solo en una pantalla de Ajustes que la app abre · `por uso`: el sistema pregunta al
usarlo, no antes · `declaración`: basta con el manifiesto · `nada`). **Leer** = si la app puede leer su estado
(sí / parcial / no). **Actualizaciones** = si la concesión sobrevive a una actualización. **Revisión** = lo que diría una
tienda o la notarización. Fechas: hechos de la documentación de Apple, Google y Microsoft conocidos a noviembre de 2026;
lo marcado **(¿?)** no se ha podido comprobar en un aparato.

### §2.0 Firma y supervivencia en macOS (vale para toda la tabla de macOS)

macOS ata cada concesión de privacidad al **requisito designado** de la firma. Con el certificado autofirmado propio
(`native/scripts/firma-macos-preparar.sh`, secretos `MACOS_CERT_P12_BASE64`), el requisito es *identificador +
certificado*: **las concesiones sobreviven a las actualizaciones** mientras se firme con el MISMO certificado. Con firma
ad-hoc (sin los secretos) el requisito es el hash del binario y **cada actualización pierde todas las concesiones**
(Bluetooth, micro, cámara, Accesibilidad, Pantalla…). Cambiar de certificado (p. ej. a Developer ID) hará que se
pidan todas otra vez una sola vez: la lista lo detecta porque lee el estado real. `hardenedRuntime` está en `false`;
para notarizar habrá que activarlo y entonces Automatización exigirá el entitlement
`com.apple.security.automation.apple-events` y `NSAppleEventsUsageDescription` (hoy no hace falta: Automatización es
de la fase 4).

### §2.1 macOS (13 Ventura – 15 Sequoia; mínimo de la app 10.15)

| Permiso | Nombre en el sistema | Cómo | Pantalla (enlace) | Leer | Revisión |
|---|---|---|---|---|---|
| Bluetooth | Bluetooth | aviso (al arrancar CoreBluetooth; texto `NSBluetoothAlwaysUsageDescription`) | `…security?Privacy_Bluetooth` | sí: `+[CBManager authorization]` | normal |
| Red local | Red local (macOS 15+) | aviso (al primer envío multicast/local; `NSLocalNetworkUsageDescription`) | `…security?Privacy_LocalNetwork` **(¿?** ancla nueva de macOS 15) | **no** hay API: se deduce de si la malla local responde | normal |
| Ubicación (nombres de Wi-Fi) | Localización | aviso (`requestWhenInUseAuthorization`) | `…security?Privacy_LocationServices` | sí: `+[CLLocationManager authorizationStatus]` | normal; decir que no se usa la ubicación |
| Notificaciones | Notificaciones | aviso (plugin de notificaciones) | `x-apple.systempreferences:com.apple.preference.notifications` | parcial: `isPermissionGranted` del plugin (no distingue «negado» de «sin preguntar») | normal |
| Micrófono / Cámara | Micrófono / Cámara | aviso (WebKit con los textos de Info.plist) | `…security?Privacy_Microphone` / `Privacy_Camera` | sí: `+[AVCaptureDevice authorizationStatusForMediaType:]` | normal |
| **Grabación de pantalla y audio del sistema** | Grabación de pantalla y audio del sistema | **aviso→panel**: `CGRequestScreenCaptureAccess()` enseña el aviso UNA vez y añade la app a la lista; después solo en Ajustes | `…security?Privacy_ScreenCapture` | sí: `CGPreflightScreenCaptureAccess()` | Notarización: sin problema. macOS 15 vuelve a pedir confirmación periódica a las apps que capturan sin el selector del sistema (semanal en 15.0, mensual desde 15.1 **(¿?)**); tras conceder puede pedir «Salir y volver a abrir» |
| **Accesibilidad** | Accesibilidad | **aviso→panel**: `AXIsProcessTrustedWithOptions({kAXTrustedCheckOptionPrompt: true})` enseña el aviso con «Abrir Ajustes del Sistema» | `…security?Privacy_Accessibility` | sí: `AXIsProcessTrusted()` (vivo, sin reiniciar). No distingue negado de nunca preguntado | Mac App Store: prohibido para apps con sandbox salvo funciones de accesibilidad reales; fuera de la tienda, notarizable |
| Monitorización de entrada | Monitorización de entrada | aviso→panel: `IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)` | `…security?Privacy_ListenEvent` | sí: `IOHIDCheckAccess` (concedido / negado / desconocido) | igual que Accesibilidad |
| Automatización | Automatización (app por app) | por uso: el primer Apple Event a cada app pregunta | `…security?Privacy_Automation` | **no** sin una app destino (`AEDeterminePermissionToAutomateTarget` por destino) | con runtime endurecido necesita entitlement |
| Carpetas protegidas | Archivos y carpetas (Escritorio, Documentos, Descargas, volúmenes) | por uso: el selector de carpetas concede la elegida | `…security?Privacy_FilesAndFolders` | no | normal |
| Acceso total al disco | Acceso total al disco | panel (no hay aviso) | `…security?Privacy_AllFiles` | **no** hay API pública (leer TCC.db para saberlo está prohibido por §1) | permitido fuera de la tienda; hay que justificarlo |
| Abrir al iniciar sesión | Ítems de inicio | la app lo activa (plugin autostart: LaunchAgent; macOS avisa «Ítem de fondo añadido») | `x-apple.systempreferences:com.apple.LoginItems-Settings.extension` | sí (`fondo_estado.arranque_con_sistema`) | normal |
| Contactos / Calendarios | Contactos / Calendarios | aviso | `Privacy_Contacts` / `Privacy_Calendars` | sí | **No se piden: ninguna función los necesita hoy.** |
| Capacidades (CPU, GPU, memoria, disco, batería, temperatura) | — | nada | — | sí (`recursos_ia_detectar`, `info_neurona`; temperatura: `NSProcessInfo.thermalState`) | — |

### §2.2 Android (12 – 16; probado en SM-X900 con Android 16)

| Permiso | Nombre en el sistema | Cómo | Pantalla (intent) | Leer | Tienda (Play) |
|---|---|---|---|---|---|
| Dispositivos cercanos | `BLUETOOTH_SCAN/CONNECT/ADVERTISE` (12+), `NEARBY_WIFI_DEVICES` (13+); ubicación hasta 12 | aviso | ficha de la app | sí | normal con `neverForLocation` |
| NFC | `NFC` | declaración (normal, sin pregunta) | — | sí (`NfcAdapter.isEnabled`) | normal |
| UWB | `UWB_RANGING` (12+) | aviso | — | sí | normal. No hay función que lo use aún |
| Notificaciones | `POST_NOTIFICATIONS` (13+) | aviso | `ACTION_APP_NOTIFICATION_SETTINGS` | sí | normal |
| Micrófono / Cámara | `RECORD_AUDIO` / `CAMERA` | aviso (dos negativas = ya no pregunta: ficha de la app) | ficha de la app | sí | normal |
| Llamadas en pantalla completa | `USE_FULL_SCREEN_INTENT` (14+) | panel | `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` | sí | Play lo limita a apps de llamadas y alarmas |
| **Captura de pantalla** | MediaProjection | **por uso**: `createScreenCaptureIntent()` pide confirmación en CADA sesión (14+: el token vale una vez; 14 QPR2+: se puede elegir una sola app); servicio en primer plano `mediaProjection` obligatorio | — | **no** antes de pedirla | normal |
| **Servicio de accesibilidad** | Accesibilidad › StarSeed | panel: `ACTION_ACCESSIBILITY_SETTINGS`; **instalada fuera de la tienda, Android 13+ exige antes «Permitir ajustes restringidos»** en la ficha de la app (Android 15 lo extiende) | `ACTION_ACCESSIBILITY_SETTINGS` | sí (`Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES` o `AccessibilityManager`) | **Play revisa a mano** y rechaza usos que no son de accesibilidad o exige declaración y vídeo; fuera de Play, sin revisión |
| Mostrar sobre otras apps | `SYSTEM_ALERT_WINDOW` | panel | `ACTION_MANAGE_OVERLAY_PERMISSION` + `package:` | sí: `Settings.canDrawOverlays` | revisión de uso |
| Sin límite de batería | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | aviso del sistema (diálogo) | `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | sí | Play lo limita a casos aceptados (mensajería/mesh entra) |
| Segundo plano / al encender | servicio en primer plano `connectedDevice`/`dataSync`, `RECEIVE_BOOT_COMPLETED` | declaración | — | sí | 14+: cada tipo de servicio en primer plano se justifica |
| Acceso a todos los archivos | `MANAGE_EXTERNAL_STORAGE` (11+) | panel | `ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` + `package:` | sí: `Environment.isExternalStorageManager` | Play solo para gestores de archivos/copias |
| Fotos y vídeos | `READ_MEDIA_*` (13+; selección parcial 14+) | aviso | — | sí | normal |
| Instalar apps desconocidas | `REQUEST_INSTALL_PACKAGES` | panel | `ACTION_MANAGE_UNKNOWN_APP_SOURCES` | sí | Play lo prohíbe salvo tiendas; fuera de Play, sí |
| Acceso a No molestar | `ACCESS_NOTIFICATION_POLICY` | panel | `ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS` | sí: `isNotificationPolicyAccessGranted` | normal |
| Modificar ajustes del sistema | `WRITE_SETTINGS` | panel | `ACTION_MANAGE_WRITE_SETTINGS` + `package:` | sí: `Settings.System.canWrite` | revisión de uso |
| Red local | — (Android 16 anuncia una protección opcional de red local para apps que la activen; obligatoria en una versión posterior **(¿?)**) | nada hoy | — | — | vigilar |
| Contactos / Calendario | `READ_CONTACTS` / `READ_CALENDAR` | aviso | — | sí | **No se piden: ninguna función los necesita.** |
| Capacidades | — | nada (`ActivityManager`, `BatteryManager`, `PowerManager.getThermalHeadroom`) | — | sí | — |

**Nota de pantallas:** una pantalla de acceso especial solo lista la app si el manifiesto DECLARA ese permiso. Por eso
superposición, No molestar, modificar ajustes y todos los archivos están **solo leídos y con su pantalla preparada**
(`panel:<id>` en Kotlin) pero **sin declarar ni pedir** hasta la fase que los usa (§6): declararlos antes sería pedir
más de lo que se usa.

### §2.3 Windows 10/11 (apps de escritorio sin empaquetar)

| Permiso | Cómo | Pantalla | Leer | Nota |
|---|---|---|---|---|
| Bluetooth, NFC, Wi-Fi Direct | nada (las apps de escritorio no piden consentimiento; las API WinRT sí miran «Radios») | `ms-settings:bluetooth` | sí | — |
| Red local | por uso: **el Firewall de Windows pregunta** la primera vez que la neurona escucha fuera de 127.0.0.1 | — | no | elegir «Redes privadas» |
| Ubicación (nombres de Wi-Fi) | por uso: desde **Windows 11 24H2** las API WLAN piden «Ubicación» también a apps de escritorio | `ms-settings:privacy-location` | no | — |
| Micrófono / Cámara | por uso: permitidos salvo que la persona apague «Permitir que las apps de escritorio…» | `ms-settings:privacy-microphone` / `privacy-webcam` | no (solo intentándolo) | — |
| Notificaciones | nada (activadas por defecto) | `ms-settings:notifications` | no | — |
| Pantalla | nada: cualquier app de escritorio captura (Graphics Capture enseña un borde amarillo) | — | — | — |
| Control (teclado/ratón) | nada: `SendInput` funciona, **excepto** sobre ventanas elevadas (UIPI) y el escritorio seguro (UAC, inicio de sesión). Saltarlo exige `uiAccess=true` firmado e instalado en `Program Files`: posible con firma de confianza, fuera de alcance hoy | — | — | — |
| Abrir al iniciar sesión | la app lo activa (autostart) | `ms-settings:startupapps` | sí | — |
| Ajustes reales | volumen (Core Audio `IAudioEndpointVolume`), brillo (WMI `WmiMonitorBrightnessMethods`, solo pantallas internas), Wi-Fi/BT (`Windows.Devices.Radios`), modo oscuro (registro de usuario `AppsUseLightTheme`), energía (`powercfg`/API de esquemas) | — | — | No molestar / Asistente de concentración: **no hay API pública** |

### §2.4 Linux

| Permiso | X11 | Wayland |
|---|---|---|
| Pantalla | nada: cualquier cliente lee la pantalla (sin aislamiento) | **por uso**: portal `org.freedesktop.portal.ScreenCast` con selector en cada sesión (se puede recordar con *restore token*) |
| Control (teclado/ratón) | nada: XTest (lo que usa enigo) | **por uso**: portal `RemoteDesktop` (pregunta en cada sesión); enigo en Wayland **no funciona** hoy salvo libei experimental |
| Bluetooth | nada (BlueZ por D-Bus; polkit si se empareja) | igual |
| Micrófono / Cámara | WebKitGTK pregunta a la app, que decide por origen (`permisos_medios.rs`) | igual; con PipeWire, portal Camera en Flatpak |
| Notificaciones | nada | nada |
| Abrir al iniciar | `.desktop` en `~/.config/autostart` | igual (portal Background en Flatpak) |
| Ajustes reales | volumen (PipeWire/Pulse), brillo (`/sys/class/backlight` vía logind `SetBrightness`), Wi-Fi/BT (NetworkManager/BlueZ por D-Bus), oscuro (`org.freedesktop.appearance` / gsettings), No molestar (GNOME `show-banners`) | igual |
| Flatpak/Snap | cada acceso pasa por su portal o por la conexión declarada (`--talk-name`, `bluez` plug…) | igual |

La sesión se lee de `XDG_SESSION_TYPE` / `WAYLAND_DISPLAY` (`permisos_sistema::sesion_linux`).

### §2.5 Resumen: lo que la app puede disparar, lo que la persona debe activar, lo que no se lee

| Sistema | La app lo dispara (aviso) | La persona lo activa en Ajustes | No se puede leer |
|---|---|---|---|
| macOS | Bluetooth, red local, ubicación, notificaciones, micro, cámara; el **primer** aviso de Pantalla, Accesibilidad y Monitorización de entrada | Pantalla, Accesibilidad, Monitorización de entrada (siempre el interruptor), Acceso total al disco, Automatización (al usarla) | red local, acceso total al disco, automatización; notificaciones solo parcial |
| Android | cercanos, notificaciones, micro, cámara, batería, captura de pantalla (cada vez) | accesibilidad (+ ajustes restringidos), superposición, todos los archivos, No molestar, modificar ajustes, instalar apps, llamadas en pantalla completa | captura de pantalla antes de pedirla |
| Windows | Firewall (red local), ubicación al usar Wi-Fi | micro/cámara/ubicación si la persona los apagó | micro, cámara, ubicación, notificaciones |
| Linux | portales de Wayland (cada sesión) | — | portales antes de usarlos |

---

## §3 Qué abre cada permiso (funciones del OS)

Estado medido en el código el 2026-11-11: **existe**, **a medias**, **falta**. La tabla viva es `FUNCIONES` en el registro.

| Función | macOS | Android | Windows | Linux | Estado |
|---|---|---|---|---|---|
| Antenas de la malla | Bluetooth, red local, ubicación (Wi-Fi) | cercanos (+NFC, UWB más adelante) | Firewall, ubicación 24H2 | — | existe |
| Llamadas | micro, cámara, notificaciones | + llamadas en pantalla completa | — | — | existe |
| Prestar una ventana (verla y tocarla) — `ventana_remota.rs` + `apps-remotas/anfitrion.ts` | **Pantalla + Accesibilidad** | no hay (xcap/enigo son de escritorio) | nada | X11 nada; Wayland no funciona | **a medias**: funciona en escritorio, sin cierre de seguridad en Rust (§4.6) |
| Compartir pantalla en llamadas y salas — `llamadas/medios.ts › obtenerPantalla` (getDisplayMedia) | Pantalla | MediaProjection (por uso) + servicio `mediaProjection` | nada | Wayland: portal | **a medias**: en la web sí; en WKWebView depende de macOS 13+ **(¿?)**; en Android WebView **no existe** getDisplayMedia |
| Astraura ve la pantalla — `aurora/senses/vision.ts` | Pantalla | MediaProjection | nada | portal | a medias (solo web, por captura puntual) |
| Astraura actúa en el aparato | Accesibilidad (+ Automatización, Monitorización de entrada) | servicio de accesibilidad + superposición | nada | X11 / portal RemoteDesktop | **falta** |
| Controlar una neurona desde otra de la cuenta (también en segundo plano) | Pantalla + Accesibilidad + Monitorización de entrada + abrir al iniciar | MediaProjection + accesibilidad + superposición + batería | nada (salvo ventanas elevadas) | X11 / portales | **falta** (lo más cercano: prestar ventana) |
| Centro de control con los ajustes reales | volumen (CoreAudio), brillo (no hay API pública para pantallas externas; interna por `DisplayServices` = privada → **no**), Wi-Fi (CoreWLAN `setPower`), Bluetooth (**no hay API pública** para encender/apagar), No molestar/Focus (**no hay API**: solo Atajos que la persona instale), oscuro (Automatización de System Events = §1 lo prohíbe por guion; queda «abrir Ajustes»), energía (`IOPMAssertion`, no cambiar el plan) | volumen (`AudioManager`), brillo (`WRITE_SETTINGS`), No molestar (`ACCESS_NOTIFICATION_POLICY`), Wi-Fi/BT (**desde Android 10/13 una app no los enciende**: panel de ajustes rápidos `Settings.Panel`), oscuro (`UiModeManager` solo de la app) | §2.3 | §2.4 | **falta**: hoy «Brillo» del centro de control cambia el fondo del OS, no la pantalla (`quick-settings-tab.tsx`) |
| Carpetas y almacenamiento compartidos — `carpetas.rs` | carpetas por selector; acceso total al disco | todos los archivos | nada | nada | a medias (selector) |
| Prestar procesador y memoria a la malla — `recursos-ia/deteccion.ts`, `recursos/sesion-prestamo.ts` | nada | batería + servicio en primer plano | nada | nada | a medias |
| Siempre disponible (segundo plano, al encender) — `segundo_plano.rs`, `ServicioAntenas.kt` | abrir al iniciar | batería, arranque | abrir al iniciar | autostart | existe |

---

## §4 Modelo de seguridad para controlar un aparato

Controlar un aparato es lo más peligroso que hará esta app. Reglas y **cómo se hace cumplir cada una**:

1. **Apagado de fábrica, por aparato, encendido por la persona EN ese aparato.** El interruptor «Dejar que mis otras
   neuronas controlen esta» vive en un archivo de la app nativa (`~/.starseed/control.json` en escritorio,
   `filesDir/control.json` en Android), escrito **solo** por un comando que exige un gesto local: en escritorio, Rust
   abre un diálogo nativo de confirmación (`tauri-plugin-dialog`, no HTML) y solo el «Sí» de ese diálogo escribe; en
   Android, una Activity propia. Ni la web publicada ni otra neurona pueden encenderlo: el comando no acepta el valor
   por argumento y **ningún mensaje de la malla lo toca**.
2. **Solo neuronas de la misma cuenta** (fase 3). Cada orden de control lleva una firma con la clave de la neurona
   que manda (Ed25519 por neurona, publicada en `neuron_devices` y comprobada contra la cuenta en la sesión); Rust
   verifica firma, cuenta, sello de tiempo (±30 s) y número de secuencia (sin repeticiones) **antes** de llamar a
   enigo/xcap. Otras cuentas: solo con una concesión explícita, revocable y con caducidad, guardada igual que el
   interruptor (fase posterior).
3. **Indicador visible e imposible de pasar por alto + parar con un toque que siempre funciona.** Mientras hay control:
   macOS/Windows/Linux, una ventana nativa de Tauri **siempre encima** y sin decoración, con borde de color en toda la
   pantalla y botón «Parar», más el icono de la barra de menús/bandeja en rojo; Android, notificación en curso **no
   descartable** del servicio en primer plano con acción «Parar» + superposición. «Parar» llama a un comando que
   **cierra el canal en Rust** (no en la web): aunque la página esté colgada o comprometida, el control termina. Atajo
   global fijo (⌃⌥⌘. en Mac, Ctrl+Alt+Fin en el resto) registrado por Rust. Con Monitorización de entrada, **cualquier
   movimiento o tecla local pausa el control** al instante hasta que la persona lo reanude.
4. **Qué puede hacer Astraura sola, qué necesita confirmación cada vez, y qué nunca.**
   - Sola: leer la pantalla que se le enseña, mover el puntero, pulsar y escribir dentro de la app/ventana que la
     persona le asignó para esa tarea.
   - Confirmación cada vez (diálogo nativo en el aparato, con el resumen de la acción): pagos, introducir o leer
     credenciales, cambiar ajustes del sistema, borrar datos, enviar mensajes o publicar en nombre de la persona,
     instalar software, aceptar términos.
   - Nunca: escribir en campos de contraseña (macOS `AXSecureTextField`, Android `isPassword`, Windows `ES_PASSWORD`:
     se detectan y la orden se rechaza en Rust/Kotlin), tocar diálogos de permisos del sistema (§1), desactivar el
     indicador o el registro, actuar con el aparato bloqueado.
   - Se hace cumplir con una **lista de capacidades por sesión** que emite el aparato controlado (no quien controla) y
     que el ejecutor nativo comprueba antes de cada evento; los tipos «confirmar» paran la cola hasta el «Sí» local.
5. **Registro que el dueño puede leer.** Cada sesión y cada orden (quién, desde qué neurona, qué, a qué ventana,
   aceptada o rechazada y por qué) se apunta en un registro de solo-añadir en el aparato controlado
   (`~/.starseed/control.log`, encadenado por hash) y se resume en Genesis y en la ficha de la neurona. Las capturas de
   pantalla **no** se guardan en el registro.
6. **Aparato bloqueado.** Con la pantalla bloqueada o el salvapantallas activo (macOS
   `CGSessionCopyCurrentDictionary` › `CGSSessionScreenIsLocked`, Windows `WTSRegisterSessionNotification`,
   Android `KeyguardManager.isKeyguardLocked`, Linux logind `LockedHint`) **no se acepta ninguna orden** y la sesión se
   pausa; nunca se desbloquea a distancia (y los sistemas no lo permiten).

### §4.6 Riesgo encontrado HOY (para la fase 2, antes de nada más)

`entrada_ventana`, `capturar_ventana` y `ventanas_prestables` se registran en `capabilities/desktop.json` con `remote`,
es decir, **cualquier página de los orígenes remotos permitidos (la web publicada `starseed-os.vercel.app` y el
servidor local)** puede llamarlos, y Rust **no comprueba ninguna sesión de préstamo**: la única condición es que el
punto caiga dentro de una ventana existente. La sesión de `recursos/sesion-prestamo.ts` se comprueba solo en la web. En
cuanto Accesibilidad y Pantalla están concedidos —como ya lo están en el Mac de Alex, y como esta lista ahora
ofrece—, un fallo de la web publicada (XSS, dependencia comprometida, despliegue ajeno) podría ver y teclear en
cualquier ventana listada. **No se ha cambiado** en esta tarea (el encargo prohíbe construir el control), pero la
**fase 2 empieza por cerrarlo**: sesión creada y guardada en Rust, comandos solo desde el servidor local o con token de
sesión, y la regla 3 (indicador + parar) también para «prestar ventana». Por esa razón Accesibilidad y Pantalla figuran
como *opcionales* en la lista de macOS: se ofrecen, no se imponen.

### §4.7 Cierre de §4.6: prestar una ventana solo con sesión nativa (SEG1111T · 2026-11-11)

**Lo que había, verificado en el código** (main `340c797990`): `capabilities/desktop.json` concedía
`allow-ventanas-prestables`, `allow-capturar-ventana` y `allow-entrada-ventana` a los **trece** orígenes remotos (la web
publicada, **Nexus y Café** y los diez puertos del servidor local), y `ventana_remota.rs` no comprobaba ni sesión, ni
origen, ni que la persona hubiera prestado nada: `ventanas_prestables` devolvía id, app y **título** de toda ventana de
las apps que la página nombrara, `capturar_ventana` capturaba **cualquier** id y `entrada_ventana` escribía texto con
`enigo.text` **sin mirar el foco** (las teclas iban a la app que lo tuviera, también un diálogo del sistema). La
sesión de `recursos/sesion-prestamo.ts` solo vivía en la web, y ninguna pantalla del OS abría un préstamo.

**Cómo es ahora** (`src/prestamo_ventana.rs`, lógica pura y pruebas en `src/prestamo_ventana_logica.rs`):

- **Empieza solo en el aparato.** La página llama a `prestamo_ventana_iniciar(apps, ventanas?, destino)`. Rust lista
  las ventanas él mismo y enseña un **diálogo nativo** (`tauri-plugin-dialog`, «Prestar» / «No prestar») con cada
  ventana (app y título), el nombre del destino (marcado como «nombre que da la página»: hasta la fase 3 Rust no puede
  comprobar la neurona) y cómo termina. Antes del «sí» la página no recibe ni un título. Un diálogo a la vez; tras un
  «no», 30 s sin volver a preguntar. Si la página cambia de origen mientras el diálogo está abierto, no se abre.
- **Lo que permite.** Un token opaco de 128 bits, el origen que lo pidió y como mucho 8 ventanas, todo en memoria de
  Rust. `ventanas_prestables`, `capturar_ventana` y `entrada_ventana` exigen token, **el mismo origen**, la ventana
  `main` y una ventana de la sesión; si no, error `prestamo:<código>` (`sin-sesion`, `token`, `origen`,
  `ventana-ajena`, `caducada`, `parada`…) que `src/lib/apps-remotas/nativo.ts` entiende para parar sin reintentar.
  Solo pueden pedir préstamo `https://starseed-os.vercel.app` y `http://127.0.0.1:47610…47619` (también en Rust), y solo
  en StarSeed OS (no en las apps Nexus y Café).
- **Cómo termina.** La persona: menú del icono propio de la barra de menús/bandeja («● Prestando», «Dejar de prestar
  ahora»), atendido en Rust aunque la página esté colgada. La página: `prestamo_ventana_parar` (sin token: parar
  siempre se puede). Solo: **2 min sin ninguna captura ni entrada** (mientras la otra neurona mira llegan varias
  capturas por segundo; dos minutos sin ninguna es que nadie mira), **1 h como máximo** aunque se use (un préstamo
  olvidado no queda abierto la tarde entera; para seguir, se vuelve a confirmar), **reposo** (el reloj de pared salta
  más de 15 s por encima del monótono), **pantalla bloqueada** (macOS `CGSSessionScreenIsLocked` o fuera de consola;
  Windows `OpenInputDesktop`/`SwitchDesktop`), **ventana cerrada** (la última que quedaba), **indicador desaparecido**,
  otra sesión nueva o salir de la app (la sesión no se guarda en disco). El vigilante mira cada segundo.
- **Lo que ve la persona.** El diálogo cada vez; mientras dura, el icono con el texto «● Prestando» y el destino en su
  menú. Sin bandeja posible (Linux sin libappindicator) **no se presta**; si el icono no se puede crear, la sesión se
  cierra al momento. La web ya no tiene `core:tray:default` ni `core:menu:default` (no los usaba y le habrían dejado
  quitar o cambiar el aviso). **Corrección (SEG1111U):** sí los tenía, dentro de `core:default`; se quitaron en §4.8.
- **Entrada acotada dentro de la sesión.** Clic: dentro de la ventana prestada y **sin otra ventana encima en ese punto**
  (orden z de xcap: un diálogo del sistema o de otra app que la tape recibiría el clic). Texto: ≤ 512 caracteres por
  orden y la ventana prestada **con el foco**. Las dos: ventana no minimizada, aparato no bloqueado y **sin entrada
  segura** (macOS `IsSecureEventInputEnabled`: hay un campo de contraseña con el foco o una app la activó; Windows: el
  control con el foco es un `Edit` con `ES_PASSWORD`). Cada sesión y cada rechazo se apuntan con `[prestamo]` en
  `enlaces.log` (nunca títulos ni tokens).
- **Lo que NO se puede hacer cumplir todavía.** En macOS el «foco» de xcap es el de la **app** (no de la ventana): el
  texto podría ir a otra ventana de la misma app prestada. Los campos de contraseña de navegadores, WPF o UWP en Windows
  no tienen `ES_PASSWORD`. Linux: ni bloqueo (logind `LockedHint`) ni contraseñas (AT-SPI), y en Wayland xcap/enigo
  apenas funcionan. Un script en la web de StarSeed OS con una sesión ya abierta puede usarla dentro de lo prestado
  (por eso es corta, visible y parable). El nombre del destino lo da la página. Sin atajo global para parar ni pausa
  por actividad local (§4 regla 3: fase 3). En macOS el botón por defecto del diálogo es «Prestar» (rfd no deja
  cambiarlo).
- **Otros comandos expuestos de más** (no cambiados aquí; ver la lista de la tarea SEG1111T): `run_terminal` y
  `shell:allow-execute` (`sh -c` con cualquier argumento), `fs` de lectura en `**` y escritura en `$HOME/**`, `serie_*`,
  `ollama_instalador_*` y `rescate_origen_*` siguen concedidos a los trece orígenes, también Nexus y Café.
  **Cerrado en §4.8 (SEG1111U).**


### §4.8 Nada ejecuta programas ni toca archivos sin una concesión dada EN el aparato (SEG1111U · 2026-11-11)

**Lo que había, verificado en el código** (main `2d6808cdc`, `native/src-tauri/`):

- `capabilities/default.json` (todas las plataformas, ventana `main`) daba a **trece** orígenes remotos —la web
  publicada, **Nexus y Café** y los diez puertos del servidor local— `allow-run-terminal` (`lib.rs`: `sh -c` /
  `cmd /C` con la cadena que pasa la página, sin ninguna comprobación en Rust), `shell:allow-execute` con
  `sh`/`bash` `-c` y `cmd /C`/`powershell -Command` y validador `\S+` (cualquier orden), `shell:allow-spawn`,
  `-kill`, `-stdin-write`, `fs:allow-read-text-file` y `fs:allow-read-dir` en `**` (todo el disco que el usuario
  puede leer), `fs:allow-write-text-file` y `fs:allow-mkdir` en `$HOME/**`, y un `fs:scope` global con `$HOME`,
  Documentos, Descargas y Escritorio. También `serie_*`, `rescate_origen_*` y (en `desktop.json`)
  `ollama_instalador_*`. En Android igual: la APK carga la web publicada y `run_terminal` estaba registrado.
- **Correcciones a la descripción de la revisión:** (1) `fs` de lectura no era solo `**`: también listar
  carpetas en `**`, y la escritura venía con `mkdir`. (2) Había más vías de ejecutar que `run_terminal`: el
  plugin `shell` daba ejecutar/lanzar procesos directamente, y `ollama_instalador_abrir` **lanza** el instalador
  en Windows (`explorer OllamaSetup.exe`). (3) **Nadie llamaba** a `run_terminal`, al plugin `shell` ni al plugin
  `fs` (buscado en `src/`, `public/`, `native/servidor-local/` y en el código publicado de Nexus y Café): la
  «terminal» del OS es la del backend 1.58 (`terminal-tab.tsx`, que dice que el proxy no ejecuta nada), y las
  carpetas compartidas van por `nas_*`, que comprueban en Rust. (4) **`core:default` incluía `core:tray:default` y
  `core:menu:default`**: la página podía ocultar (`set_visible`) o cambiar el aviso «● Prestando» de §4.7 sin
  que la sesión terminara (el vigilante solo detecta que el icono desaparezca). §4.7 decía que la web ya no los
  tenía; no era así. (5) `rescate_origen_*` ya comprobaban en Rust ventana, rescate en curso y página exacta.
- **Nexus y Café** (`starseed-nexus.vercel.app`, `starseed-cafe.vercel.app/cafe/`): descargados y revisados sus 36
  y 28 guiones publicados el 2026-11-11: **ninguno llama a nada nativo** (ni `__TAURI__`, ni `invoke`, ni
  `ipc`). Su app nativa sigue funcionando: la actualización la hace Rust, y micrófono/cámara los decide
  `permisos_medios.rs` por origen (no es una capability; se mantiene).

**Cómo es ahora.**

1. **Las webs hermanas ya no son orígenes remotos de esta app** (ninguna capability las nombra; una prueba lo
   vigila). En sus apps nativas, sus páginas no llegan a ningún comando.
2. **Fuera lo que nadie usaba y era peligroso:** `shell:allow-execute/spawn/kill/stdin-write`, toda la escritura
   de `fs`, la lectura con alcance, `fs:scope`, `fs:default` (dejaba leer las carpetas de datos de la app, donde
   están las credenciales del Wi-Fi directo y la configuración de antenas) y `core:default` → sustituido por sus
   partes sin bandeja ni menús (`core:path/event/window/webview/app/image/resources:default`).
3. **Archivos con alcance:** la web solo puede **leer** (`fs:allow-read-dir/read-file/read-text-file/stat/exists`
   **sin alcance estático**), y por tanto solo lo que entra en el alcance en tiempo de ejecución: las carpetas
   que la persona eligió en el selector nativo (`carpetas_conceder` → `permitir_en_alcance`; `carpetas_revocar`
   las prohíbe), el archivo elegido en un diálogo `dialog:open/save` y lo arrastrado a la ventana. Todo lo
   demás, rechazado. Los datos propios de la app los sirve Rust con sus comandos (capas, carpetas, NAS).
   **Ninguna función dependía del alcance amplio** (nadie llamaba al plugin `fs`): no hubo que mover nada.
4. **«Acceso al equipo»: una concesión por aparato para ejecutar programas** (`src/acceso_equipo.rs`, lógica y
   pruebas en `src/acceso_equipo_logica.rs`, capability `acceso-equipo.json`).
   - **Qué abre:** `run_terminal` y abrir el instalador de Ollama (`ollama_instalador_abrir`; enseñarlo en el
     Finder no). Nada más ejecuta programas desde la web.
   - **Alcance:** **un solo interruptor** por aparato y para la app StarSeed OS (no por función: hoy solo dos
     funciones lo usan y una lista de interruptores sería ruido; las órdenes delicadas se confirman igual una a
     una). Solo escritorio: en Android/iOS `run_terminal` ni se registra. Solo la ventana `main` y solo la web
     publicada de StarSeed OS y su servidor local (misma lista que prestar ventana, también comprobada en Rust).
   - **Cuánto dura:** hasta que la persona lo quita; **sobrevive a reiniciar y a actualizar** la app. Se guarda en
     `<carpeta de configuración de la app>/acceso-equipo.json`, escrito solo por Rust y nunca en el
     almacenamiento web; ilegible, a medias o de otra versión = apagado. Por qué no caduca: la persona pidió
     que las funciones sigan funcionando tras darlo una vez; lo que lo hace seguro es que **se ve siempre**
     y se quita con un clic.
   - **Cómo se da:** la página llama a `acceso_equipo_pedir(motivo)`; Rust enseña un **diálogo nativo**
     (`tauri-plugin-dialog`, «Dar acceso» / «No») con lo que permite, lo que se seguirá confirmando, dónde se
     verá y cómo se quita; el motivo va marcado «lo dice la página». **Solo el «sí» de ese diálogo escribe el
     archivo** (`acceso_equipo_logica::pedir` es el único camino; `Concesion::concedida` es privada y una prueba
     comprueba que el pegamento no tiene otro). Ningún comando acepta el valor por argumento. Un diálogo a la
     vez; tras un «no», 30 s sin volver a preguntar; si la página navega mientras el diálogo está abierto, no
     se concede. Sin bandeja posible (Linux sin libappindicator) no se concede.
   - **Cómo se ve y se quita:** mientras está dado hay un icono propio en la barra de menús/bandeja, como el de
     prestar ventana (§4.7), con el texto **«● Acceso al equipo»** y un menú «Acceso al equipo dado (fecha)» ·
     «Las órdenes delicadas se confirman una a una» · **«Quitar el acceso al equipo ahora»**, atendido en Rust
     aunque la página esté colgada. Al arrancar, si está dado, el icono vuelve. **Sin icono visible no se usa**
     (cada uso comprueba que existe; la web ya no tiene `core:tray`/`core:menu` para tocarlo). La página
     también puede quitarlo (`acceso_equipo_revocar`, sin diálogo: quitar siempre se puede).
   - **Qué se confirma una a una aunque esté dado** (`clasificar`, por palabras de la orden): **borrar o
     sobrescribir** (`rm`, `del`, `shred`, `dd`, `mkfs`, `diskutil erase`, `find -delete`, `git clean`, `> archivo`…),
     **ajustes del sistema, permisos, procesos o privilegios** (`sudo`, `defaults`, `launchctl`, `chmod`, `reg`,
     `netsh`, `systemctl`, `kill`…), **credenciales** (`security`, `ssh-keygen`, `gpg`, y rutas como `.ssh`,
     `.env`, `keychain`, `token`, `password`…), **enviar datos o mensajes fuera** (`mail`, `ssh`/`scp`/`rsync`,
     `nc`, `curl -d/-F/-T/-X POST`, `git push`…), **instalar software** (`brew`, `apt`, `pip install`,
     `npm i -g`, `msiexec`, `winget`, `curl … | sh`…) y **órdenes opacas** que construyen o descifran otra al
     ejecutarse (`eval`, `` ` ``, `$(…)`, `| sh`, `base64 -d`, `python -c`, `node -e`, `osascript`,
     `powershell -enc`…): esas no se pueden leer de antemano, así que también se confirman. **Lo que no se
     puede detectar y no se finge:** los **pagos** (no hay palabra que los delate en una línea de órdenes), y
     una orden disfrazada que no use ninguna de esas formas (p. ej. un programa propio que borre). La
     clasificación es una red, no una garantía: la garantía es la concesión, el aviso y el registro. Abrir
     el instalador de Ollama se confirma **siempre** (instalar software), y solo si es el archivo que **este
     proceso** descargó de los anfitriones oficiales (mismo tamaño). El diálogo enseña la orden (600
     caracteres como mucho) y sus clases; si la página navega mientras tanto, no se ejecuta. Una confirmación
     a la vez. En macOS el botón por defecto es el afirmativo (rfd no deja cambiarlo), como en §4.7.
   - **Registro de solo-añadir en el aparato:** macOS `~/Library/Logs/app.starseed.os/acceso-equipo.log`, resto
     `<datos de la app>/acceso-equipo.log`. Una línea JSON por suceso (pedida, concedida, no concedida,
     rechazada con su código, a confirmar, no ejecutada, **ejecutada con la orden** —hasta 2.000 caracteres—,
     terminada con el código de salida, abierto/no abierto el instalador, quitada y por quién), encadenada por
     SHA-256 con la anterior (`ant`, `h`): cambiar o quitar una línea rompe la cadena desde ahí y
     `acceso_equipo_estado` lo dice (`registro_integro`). Nunca la salida de las órdenes. En `enlaces.log` solo
     una línea `[acceso] <suceso>` sin la orden (ese registro se comparte en las rondas de prueba).
5. **Los «altos»:** `rescate_origen_*` → **estrechados** a los diez orígenes del servidor local
   (`rescate-origen.json`, escritorio y Android): Rust ya exigía rescate en curso, ventana `main` y la URL exacta
   de exportar/importar servida por el propio Rust; con eso basta. `ollama_instalador_*` → solo OS y servidor
   local; **descargar** sigue sin concesión (anfitriones oficiales, nombre fijo, Descargas, tamaño acotado) y
   **abrir** pasa por la concesión, el archivo propio y el «sí» de cada vez. `serie_*` → **estrechados** a OS y
   servidor local y **explicados**: son la radio LoRa de la malla (la malla no pide concesión, regla del
   encargo); Rust solo abre puertos de la lista de radios detectadas (macOS/Linux: `cu.usbserial*`,
   `cu.usbmodem*`, `ttyUSB*`, `ttyACM*`…), uno a la vez, y solo escribe en él. **Queda:** en Windows la lista
   es cualquier `COM` (ver §4.8.2).
6. **Lo que funcionaba y cómo sigue:** instalar Ollama (`instalar-ollama.ts`): si falta la concesión, la página
   lo dice en palabras claras («Para abrir el instalador de Ollama, StarSeed OS necesita «acceso al equipo»…»),
   pide el diálogo nativo **una vez** y reintenta; si la persona no lo da, el estado es `necesita-acceso` con el
   botón «Dar acceso al equipo y abrir» y el instalador sigue en Descargas. `run_terminal` no tiene llamadas en la
   web hoy; cualquiera que llegue usa `conAccesoEquipo` de `src/lib/nativa/acceso-equipo.ts`, que hace lo mismo.
   Actualizar la app, la malla (antenas, Bluetooth, Wi-Fi directo, AWDL, red local, serie LoRa, proxy), las
   llamadas y los avisos **no piden concesión** (sus permisos no cambian salvo el origen).

#### §4.8.1 Inventario de lo que llega a un origen remoto

Todo permiso que una capability con `remote` concede, con lo que puede hacer en el aparato, quién puede
llamarlo, quién lo llama en `src/` (o en las páginas del servidor local) y su clase: **inofensivo** · **solo-app**
(basta con que lo pida la web de la app; un fallo de esa web lo podría usar, con el daño acotado que dice la
fila) · **concesión** (además hace falta algo que la persona dio EN el aparato con un diálogo o selector nativo).
**Orígenes:** `OS+local` = `https://starseed-os.vercel.app` + `http://127.0.0.1:47610…47619`; `local` = solo esos
diez puertos; `OS·migración` = solo la web publicada en la ventana oculta `migracion-origen`. **Plataformas:**
`todas` (escritorio, Android, iOS), `escritorio`, `escritorio+Android`. La prueba
`src/lib/nativa/__tests__/inventario-nativo.test.ts` se pone roja si una capability concede algo que no está
aquí, si una fila no está concedida o si los orígenes o plataformas de una fila no son los de verdad.

<!-- inventario:inicio -->
| Permiso | Qué puede hacer en el aparato | Orígenes · plataformas | Quién lo llama | Clase |
|---|---|---|---|---|
| `core:path:default` `core:event:default` `core:app:default` `core:image:default` `core:resources:default` | Rutas estándar, eventos entre página y Rust, versión y nombre de la app, imágenes y recursos propios | OS+local · todas | `nativa/puente.ts` (eventos), `nativa/info-neurona.ts` (`plugin:app\|version`) | inofensivo |
| `core:window:default` `core:webview:default` `core:window:allow-set-title` `core:window:allow-minimize` `core:window:allow-maximize` `core:window:allow-unmaximize` `core:window:allow-close` `core:window:allow-start-dragging` | Consultar, mover, minimizar o cerrar su propia ventana | OS+local · todas | ninguno por nombre en `src/` | inofensivo |
| `shell:allow-open` | Abrir un enlace `https:`/`mailto:`/`tel:` con el programa por defecto (alcance por defecto del plugin; no ejecuta archivos) | OS+local · todas | ninguno por nombre | inofensivo |
| `fs:allow-read-dir` `fs:allow-read-file` `fs:allow-read-text-file` `fs:allow-stat` `fs:allow-exists` | LEER, sin alcance estático: solo carpetas concedidas en el selector nativo, el archivo elegido en un diálogo y lo arrastrado a la ventana | OS+local · todas | ninguno por plugin hoy (las carpetas compartidas van por `nas_*`) | concesión |
| `os:allow-platform` `os:allow-version` `os:allow-os-type` `os:allow-family` `os:allow-arch` `os:allow-hostname` `os:allow-locale` `os:allow-exe-extension` | Leer sistema, versión, arquitectura, nombre del equipo e idioma | OS+local · todas | ninguno por plugin (`device_info` va por Rust) | inofensivo |
| `process:allow-exit` `process:allow-restart` | Cerrar o reiniciar la propia app | OS+local · todas | ninguno por nombre | inofensivo |
| `notification:default` `notification:allow-notify` `notification:allow-request-permission` `notification:allow-is-permission-granted` | Avisos del sistema y pedir su permiso (lo pregunta el sistema) | OS+local · todas | `aurora/senses/request-permission.ts`, `notifications/avisos-mensajes.ts` | inofensivo |
| `dialog:default` `dialog:allow-open` `dialog:allow-save` `dialog:allow-message` `dialog:allow-ask` `dialog:allow-confirm` | Diálogos nativos; lo elegido en abrir/guardar entra en el alcance de LECTURA. Una página puede imitar el texto de un diálogo de StarSeed, pero contestarlo no concede nada | OS+local · todas | ninguno por nombre | solo-app |
| `deep-link:default` | Leer el enlace `starseed://` con el que se abrió la app | OS+local · todas | ninguno por nombre | inofensivo |
| `allow-check-update` `allow-reiniciar-para-actualizar` `allow-estado-actualizacion` `allow-buscar-actualizacion` | Buscar e instalar la actualización FIRMADA de la app y reiniciar para aplicarla | OS+local · todas | `nativa/actualizador.ts`, `actualizaciones/aplicadores.ts`, `pwa/actualizacion-nativa.tsx`, `actualizaciones/aviso-actualizacion.tsx` | solo-app |
| `allow-device-info` `allow-info-neurona` `allow-recursos-ia-detectar` | Leer sistema, versión, procesador, memoria y disco | OS+local · todas | `neurons/maquina.ts`, `settings/neurons/esta-neurona.tsx`, `neurons/aparato-este-medio.ts`, `recursos-ia/deteccion.ts` | inofensivo |
| `allow-pista-neurona` `allow-pista-neurona-leer` | Escribir y leer la pista del id de neurona (Rust exige la web publicada) | OS+local · todas | `neurons/aparato-este-medio.ts`, `neurons/adopcion-arranque.ts` | solo-app |
| `allow-medios-estado` `allow-medios-abrir-ajustes` `allow-permisos-inicio-estado` `allow-permisos-inicio-pedir` `allow-permisos-sistema-estado` `allow-permisos-sistema-pedir` `allow-permisos-sistema-abrir` | Leer el estado de los permisos del sistema, hacer que el SISTEMA pregunte y abrir una pantalla FIJA de Ajustes | OS+local · todas | `nativa/medios-nativos.ts`, `llamadas/permiso-medios.ts`, `nativa/permisos-inicio-ejecutor.ts`, `nativa/asistente-permisos.tsx` | inofensivo |
| `allow-ventana-pantalla-completa` | Pantalla completa de la propia ventana | OS+local · todas | `system/system-chrome.tsx`, `nativa/pantalla-completa.ts` | inofensivo |
| `allow-antenas-estado` `allow-antenas-medir` `allow-antenas-config` `allow-antenas-configurar` `allow-fondo-estado` `allow-fondo-fijar` `allow-fondo-arranque` `allow-fondo-pedir-bateria` | Medir y configurar las antenas de la malla; segundo plano, abrir al iniciar sesión, pedir la exención de batería (Android pregunta) | OS+local · todas | `nativa/puente.ts`, `nativa/permisos-inicio-ejecutor.ts`, `nativa/defectos-antenas-aplicar.ts`, `nativa/asistente-permisos.tsx` | solo-app |
| `allow-carpetas-conceder` | Abrir el selector NATIVO de carpetas: la página no pasa rutas; lo elegido entra en el alcance de lectura | OS+local · todas | `nativa/puente.ts` | concesión |
| `allow-carpetas-listar` `allow-carpetas-revocar` `allow-carpetas-nas` | Listar y quitar carpetas concedidas; compartir con la malla una YA concedida | OS+local · todas | `nativa/puente.ts` | solo-app |
| `allow-nas-listar` `allow-nas-leer` | Listar y leer (≤ 256 KiB por llamada) dentro de una carpeta concedida Y compartida; Rust lo comprueba sobre el disco real | OS+local · todas | `nativa/nas.ts` | concesión |
| `allow-serie-puertos` `allow-serie-abrir` `allow-serie-escribir` `allow-serie-cerrar` | Abrir, escribir y cerrar UN puerto serie de la lista de radios detectadas (radio LoRa de la malla) | OS+local · todas | `nativa/serie-nativa.ts`, `nativa/vista-antenas.ts` | solo-app |
| `allow-capas-estado` `allow-capas-descargar` `allow-capas-verificar` `allow-capas-borrar` | Capas de IA en la carpeta de la app: descarga verificada por SHA-256 con tope de disco, comprobar y borrar (nombres saneados) | OS+local · todas | `nativa/capas-nativas.ts`, `nativa/puente.ts` | solo-app |
| `allow-malla-local-enviar` `allow-malla-local-estado` `allow-malla-local-recibidos` | Canal de datos de la malla por la red local (TCP 47071) | OS+local · todas | `malla/sincronizacion-neuronas-motor.ts`, `malla/red-local-nativa-motor.ts` | solo-app |
| `allow-ble-estado` `allow-ble-abrir` `allow-ble-cerrar` `allow-ble-enviar` `allow-ble-recibidos` `allow-ble-activar` `allow-ble-pedir-permiso` `allow-ble-registro` `allow-ble-registro-anexar` `allow-ble-canal-rapido` `allow-ble-enlace-ligado` `allow-ble-registro-compartir` | Bluetooth directo de la malla, su registro y compartirlo | OS+local · todas | `malla/bluetooth-directo.ts`, `malla/bluetooth-directo-motor.ts`, `malla/registro-enlace-ble.ts`, `malla/canal-rapido-ajuste.ts` | solo-app |
| `allow-enlace-wifi-capacidades` `allow-enlace-wifi-permiso` `allow-enlace-wifi-abrir-ap` `allow-enlace-wifi-credenciales` `allow-enlace-wifi-unirse` `allow-enlace-wifi-estado` `allow-enlace-wifi-cerrar` `allow-enlace-wifi-comprobar` `allow-awdl-iniciar` `allow-awdl-detener` `allow-awdl-estado` | Wi-Fi directo entre neuronas: levantar la red, unirse a la del par con sus credenciales, AWDL | OS+local · todas | `malla/enlace-wifi-motor.ts`, `malla/matriz-enlaces.ts`, `malla/lanas-propias.ts` (`awdl_detener`: ninguno) | solo-app |
| `allow-puerta-proxy-local` `allow-puerta-proxy-estado` | Poner el proxy local de la puerta de internet de la malla al webview y a las descargas de Rust | OS+local · todas | `malla/puerta/proxy-nativo.ts` | solo-app |
| `allow-apk-actualizar` `allow-apk-estado` `allow-apk-instalar` | Android: descargar y verificar la actualización del APK y abrir el instalador del sistema (que pregunta) | OS+local · todas | `nativa/actualizador-apk.ts` | solo-app |
| `allow-aviso-mensaje` `allow-avisos-config` `allow-avisos-estado` `allow-avisos-pedir-permiso` `allow-avisos-pendiente` `allow-origen-local-estado` | Avisos de mensajes; estado del origen del servidor local | OS+local · todas | `notifications/avisos-mensajes.ts`, `nativa/avisos-nativos.ts` | inofensivo |
| `allow-llamada-nativa-iniciar` `allow-llamada-nativa-estado` `allow-llamada-nativa-ruta-audio` `allow-llamada-nativa-proximidad` `allow-llamada-nativa-capacidades` `allow-llamada-nativa-permiso` `allow-llamada-nativa-ignorar` `allow-llamada-nativa-recientes` `allow-llamada-silencios-sincronizar` `allow-llamada-timbre-firmar` | Llamadas como las del teléfono; firmar el timbre con la clave de faro de la cuenta | OS+local · todas | `llamadas/nativa/puente-llamada-nativa.ts`, `llamadas/nativa/espejo-silencios.ts`, `malla/llamada-directa-respaldo.ts` | solo-app |
| `autostart:default` `autostart:allow-enable` `autostart:allow-disable` `autostart:allow-is-enabled` | Abrir la app al iniciar sesión | OS+local · escritorio | ninguno por plugin (`fondo_arranque` va por Rust) | solo-app |
| `updater:default` `updater:allow-check` `updater:allow-download-and-install` | Buscar e instalar una actualización FIRMADA con la clave de la app | OS+local · escritorio | ninguno por plugin (`check_update` va por Rust) | solo-app |
| `allow-servidor-local-estado` | Estado del servidor local | OS+local · escritorio | `nativa/estado-servidor-local.ts` | inofensivo |
| `allow-ollama-instalador-descargar` `allow-ollama-instalador-cancelar` | Descargar el instalador OFICIAL de Ollama a Descargas (anfitriones y nombre fijos) | OS+local · escritorio | `astraura/modelos/instalar-ollama.ts` | solo-app |
| `allow-ollama-instalador-abrir` | ABRIR (ejecutar) el instalador que esta app descargó; o enseñarlo en el Finder/Explorador | OS+local · escritorio | `astraura/modelos/instalar-ollama.ts` | concesión |
| `allow-run-terminal` | Ejecutar cualquier orden de shell con los permisos del usuario | OS+local · escritorio | ninguno en `src/` | concesión |
| `allow-acceso-equipo-estado` `allow-acceso-equipo-pedir` `allow-acceso-equipo-revocar` | Leer la concesión; pedir que Rust enseñe su diálogo nativo (solo el «sí» la da); quitarla | OS+local · escritorio | `nativa/acceso-equipo.ts`, `astraura/modelos/instalar-ollama.ts` | inofensivo |
| `allow-prestamo-ventana-iniciar` `allow-prestamo-ventana-parar` `allow-prestamo-ventana-estado` `allow-ventanas-prestables` `allow-capturar-ventana` `allow-entrada-ventana` | Ver y teclear en ventanas prestadas, con sesión nativa (§4.7) | OS+local · escritorio | `apps-remotas/nativo.ts`, `apps-remotas/anfitrion.ts` | concesión |
| `allow-servidor-local-actualizar` | Reiniciar el servidor local con una capa ya verificada | local · escritorio | `nativa/estado-servidor-local.ts` | solo-app |
| `allow-migracion-origen-estado` `allow-migracion-origen-datos` `allow-migracion-origen-confirmar` | Importar lo que la app guardaba en el origen publicado (página de migración del servidor local) | local · escritorio | `native/servidor-local/migracion-origen.js` | solo-app |
| `allow-migracion-origen-exportar` | Exportar lo guardado en el origen publicado (ventana oculta de la migración) | OS·migración · escritorio | `native/servidor-local/migracion-origen.js` | solo-app |
| `allow-rescate-origen-exportar` `allow-rescate-origen-estado` `allow-rescate-origen-datos` `allow-rescate-origen-confirmar` | Rescate de datos entre puertos del servidor local (páginas servidas por Rust durante el rescate) | local · escritorio+Android | `native/servidor-local/rescate-origen.js` | solo-app |
<!-- inventario:fin -->

**En números:** **156 permisos** llegan hoy a un origen remoto (109 de comandos propios, 47 de plugins): **50 inofensivos**, **90 solo-app** y **16 con concesión** de la persona en el aparato. Antes de este cambio eran 13 orígenes (con Nexus y Café) y, además, `shell:allow-execute/spawn/kill/stdin-write`, la lectura en `**`, la escritura en `$HOME/**`, `core:tray`/`core:menu` y `fs:default`.

#### §4.8.2 Lo que queda expuesto después de este cambio

- **Alta:** un script en la web de StarSeed OS (o su servidor local) con «acceso al equipo» ya dado puede
  ejecutar órdenes que la clasificación no reconozca sin preguntar (un binario propio que borre, una orden
  escrita para esquivar las palabras). Lo acotan el aviso siempre visible, quitarlo con un clic y el registro;
  no lo impiden. Lo que lo cerraría del todo: no ejecutar texto libre (órdenes con nombre y argumentos tipados).
- **Media:** `serie_*` en **Windows** abre cualquier puerto `COM` (no solo radios): una página comprometida podría
  mandar bytes a otro aparato serie conectado. Arreglo: filtrar por VID/PID USB de radios (SetupAPI).
- **Media:** `allow-llamada-timbre-firmar` firma timbres con la clave de faro de la cuenta: una página
  comprometida podría hacer sonar las otras neuronas de la cuenta. `allow-enlace-wifi-unirse` une el aparato a
  la red Wi-Fi que diga la página. `allow-puerta-proxy-local` pone el proxy del webview (a 127.0.0.1).
- **Media:** `allow-carpetas-nas` comparte con la malla una carpeta ya concedida sin otra pregunta.
- **Baja:** `dialog:allow-message/ask/confirm` permiten a la página imitar el aspecto de los diálogos de
  StarSeed (contestarlos no concede nada). En macOS el botón por defecto de los diálogos nativos es el
  afirmativo. El nombre del motivo que se enseña lo da la página.
- **Baja:** la página local de arranque (`tauri://localhost`, `native/arranque/index.html`) sigue recibiendo
  `default.json` (sin `"local": false`); es nuestra, sin red y con CSP `default-src 'none'`.
- **Sin cambio:** en `carpetas_revocar` el alcance PROHIBIDO dura hasta reiniciar (volver a conceder la misma
  carpeta en la misma sesión no la vuelve a abrir al plugin `fs`; sí a `nas_*`).

**Solo un aparato puede confirmar:** que el diálogo nativo y el icono «● Acceso al equipo» salen y se ven en
macOS (título en la barra de menús), Windows y Linux; que «Quitar el acceso al equipo ahora» funciona con la
página colgada; que el icono vuelve al reiniciar; que tras el «sí» el instalador de Ollama se abre; que la web
publicada sigue funcionando sin `core:default` (ninguna llamada a `plugin:tray|`/`plugin:menu|` en `src/`); y
que la app de Nexus y la de Café siguen igual sin IPC.


---

## §5 Fase 1 (HECHA): la lista de permisos de cada neurona

**Registro único** (`permisos-registro.ts`): por sistema (`macos`, `android`, `windows`, `linux-x11`, `linux-wayland`),
cada permiso con grupo, título, porqué, `como`, `lectura`, `fase`, `desde`, opcional, funciones y nota. Las funciones
preguntan `necesitaPara(funcion, sistema, estados)` → `{ listo, faltan: [{id, accion}], porUso }`.

**Qué enseña** (agrupado: antenas y malla · llamadas y avisos · pantalla y control · siempre disponible · archivos ·
ajustes y capacidades): TODO el registro del sistema, cada uno con su estado real y su acción:
`Permitir` (aviso), `Abrir Ajustes` (pantalla exacta), «el sistema lo pregunta al usarlo», «nada que hacer»,
«llega con la fase N: aún no se pide», o «Concedido».

| Sistema | Se pide hoy | Se enseña sin pedir |
|---|---|---|
| macOS | Bluetooth, red local, ubicación (opc.), notificaciones, micro, cámara, **Grabación de pantalla (opc.), Accesibilidad (opc.)**, abrir al iniciar (opc.) | Monitorización de entrada (f3), Automatización (f4, por uso), carpetas (por uso), acceso total al disco (f6), capacidades |
| Android | cercanos, notificaciones, micro, cámara, llamadas (opc.), batería (opc.), instalar (opc.) | captura de pantalla (f2, por uso), accesibilidad y superposición (f3), No molestar y modificar ajustes (f5), todos los archivos y NFC (f6), capacidades |
| Windows | abrir al iniciar (opc.) | Bluetooth, red local (Firewall), ubicación 24H2, notificaciones, micro, cámara, pantalla, control, capacidades |
| Linux X11 / Wayland | abrir al iniciar (opc.) | lo demás (Wayland: pantalla por uso, control por portal f3) |

**Cuándo aparece:** la primera vez; tras una actualización que **añade** permisos, solo con los nuevos (`desde` y
`vistos`; p. ej. de la versión 2 a la 3 en macOS: Pantalla, Accesibilidad y abrir al iniciar); y siempre desde
Señales › Permisos de antenas › **Permisos de esta neurona**. **Nunca** pide lo ya concedido (lee el estado real
antes de abrirse: si Alex ya activó Accesibilidad y Pantalla a mano, no se los pide). Lo omitido o negado queda
«visto» y no se vuelve a preguntar solo. En macOS, tras el primer aviso de Pantalla/Accesibilidad, el botón pasa a
«Abrir Ajustes» (macOS no repite el aviso; se guarda en `avisos`).

**Cómo nota la concesión:** el ejecutor sondea `permisos_sistema_estado` cada 2 s hasta 120 s mientras espera, y la
ventana relee al recuperar el foco y al volver a ser visible. Sin reiniciar el flujo. Si pasan 120 s, queda «omitido»
pero el estado sigue releyéndose.

**Comandos nativos nuevos** (`permisos_sistema.rs`, registrados en `lib.rs`, `build.rs` y `capabilities/default.json`):
- `permisos_sistema_estado` → `{version, plataforma, sesion, estados, paneles}`; solo lee.
  macOS: AX, CGPreflight, IOHIDCheckAccess, AVCaptureDevice, CBManager, CLLocationManager (todo por `dlsym`: un
  símbolo que falte = sin dato, no un cierre). Android: lo que escribe Kotlin en `servicio.json` (nuevos:
  `superposicion`, `no_molestar`, `escribir_ajustes`, `todos_archivos`, `ubicacion`; opcionales para que un APK
  anterior no diga «no»). Windows/X11: pantalla y control «no-aplica». Linux: sesión.
- `permisos_sistema_pedir {id}` → solo macOS: `accesibilidad`, `pantalla`, `monitor-entrada` con sus API públicas.
- `permisos_sistema_abrir {id}` → `open x-apple.systempreferences:…` / `explorer ms-settings:…` / Kotlin `panel:<id>`.

**Qué no se pudo probar sin aparato (lo debe probar la build):** que `AXIsProcessTrustedWithOptions` y
`CGRequestScreenCaptureAccess` enseñen su aviso desde la app firmada; que `CGPreflightScreenCaptureAccess` cambie a
«concedido» sin reabrir la app (si macOS exige reabrir, la lista lo seguirá diciendo «sin conceder» hasta entonces);
que el ancla `Privacy_LocalNetwork` abra la pantalla en macOS 15; que Kotlin compile (`abrirPanel`, lecturas nuevas
con guardas de SDK) y que `servicio.json` traiga los campos nuevos al volver a la app.

---

## §6 Fases siguientes (en orden)

| Fase | Qué prueba | Necesita de antes | Tamaño |
|---|---|---|---|
| **2. Pantalla compartida segura** | ~~Cierre de §4.6~~ hecho en §4.7 (SEG1111T); compartir pantalla en llamadas y salas en las 4 plataformas: macOS/Windows/Linux por getDisplayMedia o xcap → pista WebRTC; Android con MediaProjection + servicio `mediaProjection` + pista nativa al WebView | fase 1 (Pantalla concedida, `necesitaPara("compartir-pantalla")`) | M–L (Rust + Kotlin + llamadas) |
| **3. Control entre neuronas de la misma cuenta** | §4 reglas 1–6 completas: interruptor local, órdenes firmadas, indicador, parar, pausa por actividad local, registro, bloqueo; Android: servicio de accesibilidad (`dispatchGesture`) + superposición + aviso de ajustes restringidos; Wayland por portal RemoteDesktop | fase 2 (canal y cierre) ; declara en el manifiesto accesibilidad y superposición | L |
| **4. Astraura actúa** | Lista de capacidades por sesión, confirmaciones nativas, nunca contraseñas; Automatización de apps con su aviso por app; árbol de accesibilidad para leer en vez de capturar | fase 3 | L |
| **5. Centro de control con ajustes reales** | Lo de §3 que cada sistema permite, por API pública, y «abrir Ajustes» para lo que no (BT en macOS, Wi-Fi/BT en Android 13+, Focus) | fase 1; Android declara `ACCESS_NOTIFICATION_POLICY` y `WRITE_SETTINGS` | M |
| **6. Carpetas, almacenamiento y préstamo de cómputo** | Acceso total al disco / todos los archivos con su porqué, volúmenes externos, NFC/UWB para enlazar, préstamo con límites térmicos y de batería | fases 1 y 3 (registro y consentimiento) | M |

Al construir cada fase: subir `fase` de sus permisos en el registro a ≤ `FASE_ACTUAL`, subir `FASE_ACTUAL` y, si se
pide algo nuevo, `VERSION_REGISTRO` (la lista se abrirá sola con lo nuevo). Las funciones llaman a `necesitaPara` antes
de empezar y, si falta algo, abren la lista (`EVENTO_ABRIR_ASISTENTE`).
