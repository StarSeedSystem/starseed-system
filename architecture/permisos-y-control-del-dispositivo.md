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
| **2. Pantalla compartida segura** | Cierre de §4.6 (sesión y token en Rust para `ventana_remota`, indicador + parar nativos); compartir pantalla en llamadas y salas en las 4 plataformas: macOS/Windows/Linux por getDisplayMedia o xcap → pista WebRTC; Android con MediaProjection + servicio `mediaProjection` + pista nativa al WebView | fase 1 (Pantalla concedida, `necesitaPara("compartir-pantalla")`) | M–L (Rust + Kotlin + llamadas) |
| **3. Control entre neuronas de la misma cuenta** | §4 reglas 1–6 completas: interruptor local, órdenes firmadas, indicador, parar, pausa por actividad local, registro, bloqueo; Android: servicio de accesibilidad (`dispatchGesture`) + superposición + aviso de ajustes restringidos; Wayland por portal RemoteDesktop | fase 2 (canal y cierre) ; declara en el manifiesto accesibilidad y superposición | L |
| **4. Astraura actúa** | Lista de capacidades por sesión, confirmaciones nativas, nunca contraseñas; Automatización de apps con su aviso por app; árbol de accesibilidad para leer en vez de capturar | fase 3 | L |
| **5. Centro de control con ajustes reales** | Lo de §3 que cada sistema permite, por API pública, y «abrir Ajustes» para lo que no (BT en macOS, Wi-Fi/BT en Android 13+, Focus) | fase 1; Android declara `ACCESS_NOTIFICATION_POLICY` y `WRITE_SETTINGS` | M |
| **6. Carpetas, almacenamiento y préstamo de cómputo** | Acceso total al disco / todos los archivos con su porqué, volúmenes externos, NFC/UWB para enlazar, préstamo con límites térmicos y de batería | fases 1 y 3 (registro y consentimiento) | M |

Al construir cada fase: subir `fase` de sus permisos en el registro a ≤ `FASE_ACTUAL`, subir `FASE_ACTUAL` y, si se
pide algo nuevo, `VERSION_REGISTRO` (la lista se abrirá sola con lo nuevo). Las funciones llaman a `necesitaPara` antes
de empezar y, si falta algo, abren la lista (`EVENTO_ABRIR_ASISTENTE`).
