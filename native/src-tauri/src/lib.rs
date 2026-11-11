// ═══════════════════════════════════════════════════════════════════════════
// StarSeed Native — Librería de la app Tauri 2 (cuerpo nativo de OS / Nexus / Café)
// ---------------------------------------------------------------------------
// TODA la lógica vive aquí (patrón oficial Tauri 2 para escritorio + móvil):
//   · Escritorio: src/main.rs llama a `starseed_native_lib::run()`.
//   · Android/iOS: el proyecto generado por `cargo tauri android|ios init`
//     carga este crate como librería (staticlib/cdylib) y entra por
//     `tauri::mobile_entry_point` — por eso el target [lib] es OBLIGATORIO.
//
// Esta app NO trae la web embebida: carga la web desplegada (ver la propiedad
// `url` de la ventana en tauri.conf.json) y le añade el "cuerpo" nativo:
//   · Actualización incremental DENTRO de la app (updater de Tauri, sin reinstalar).
//   · Control por terminal / procesos del dispositivo (el "compañero profundo"
//     que Aurora usa, con el usuario concediendo permisos en las capabilities).
//
// La web (Aurora) invoca estos comandos vía `window.__TAURI__.core.invoke(...)`.
// Para que una web REMOTA pueda invocarlos, su origen debe estar declarado en
// `capabilities/default.json → remote.urls` (Tauri lo exige por seguridad).
//
// HONESTIDAD RADICAL: `run_terminal` ejecuta comandos de shell con los permisos
// del usuario que corre la app. Es POTENTE y PELIGROSO: es literalmente dar a la
// IA una terminal. Por eso el scope está declarado en la capability y el usuario
// concede el acceso al instalar la app nativa. Nunca se ejecuta nada sin que la
// cadena de permisos (capability → scope de shell) lo permita.
// ═══════════════════════════════════════════════════════════════════════════

use serde::Serialize;
use tauri_plugin_shell::ShellExt;

// ─── Cuerpo nativo de StarSeed OS (2026-10-10, architecture/apps-nativas-segundo-plano.md) ───
// Núcleo puro (solo std + serde, probado sin Tauri): sha256, faro, disco, carpetas,
// antenas, serie, android, malla_local_trama. Pegamento con Tauri: nativa (comandos),
// malla_local (canal de datos entre neuronas por la red local, MSH1107A) y segundo_plano
// (bandeja y cierre que oculta, solo escritorio). android_parche lo usa build.rs.
mod android;
mod antenas;
// (BLE1108A) Bluetooth directo entre neuronas, sin Wi-Fi ni internet: núcleo y trama (puros), radio de
// Android (Kotlin por JNI) y de macOS (CoreBluetooth). Contrato: architecture/bluetooth-directo.md.
mod ble;
mod ble_android;
// BLE1110A: decisión pura de la autocuración del periférico, MTU recordado y colapso de líneas repetidas del registro.
mod ble_autocura;
// BLE1109A: carril rápido del Bluetooth directo (canal L2CAP): PSM, marco del flujo y máquina del carril (puro).
mod ble_l2cap;
#[cfg(target_os = "macos")]
mod ble_macos;
// LNX1109B: Bluetooth directo en Linux (BlueZ por D-Bus): lo puro en todos los sistemas, la radio solo en Linux.
mod ble_linux_logica;
#[cfg(target_os = "linux")]
mod ble_linux;
mod ble_trama;
// (PTA1108B) El webview, las descargas de Rust y el proxy de la puerta de internet de la malla (contrato §5.3 c).
mod puerta_proxy;
mod puerta_proxy_logica;
// (PER1108A) Permisos del primer arranque (Android) y pantalla completa de la ventana (escritorio).
mod permisos_inicio;
// (PER1111S) Estado real de los permisos del sistema, avisos del propio sistema y su pantalla de Ajustes.
mod permisos_sistema;
// (ACT1108A) Canal de actualización (oficial / pruebas) y actualizador interno del APK. §9 del contrato.
mod canal_actualizacion;
mod canal_actualizacion_logica;
mod canal_actualizacion_red;
// (NOT1108A) Avisos del sistema de los mensajes nuevos (escritorio y Android) y su respaldo nativo.
mod avisos_mensajes;
mod carpetas;
mod disco;
// (WFD1108A) Enlace Wi-Fi directo entre neuronas, sin router (architecture/wifi-directo.md).
mod enlace_wifi;
mod enlace_wifi_logica;
// (WFA1109A) Wi-Fi P2P sin router ni hotspot: lo puro (Aware, AWDL), los comandos de AWDL y su parte de macOS.
mod awdl; // WFA1109A
#[cfg(target_os = "macos")]
mod awdl_macos; // WFA1109A
mod wifi_p2p_logica; // WFA1109A
// <WIN1109B> P2P directo de Windows: lo puro (Linux también lo prueba) y la radio WinRT (solo Windows).
mod win_p2p_logica; // WIN1109B
#[cfg(target_os = "windows")]
mod ble_windows; // WIN1109B
#[cfg(target_os = "windows")]
mod enlace_wifi_windows; // WIN1109B
mod puerta_proxy_windows; // WIN1109B (la pasarela solo usa std: se prueba en todos los sistemas; instalar() solo se llama en Windows)
// LNX1109B: Wi-Fi Direct en Linux (wpa_supplicant P2P para el grupo propio, NetworkManager para unirse).
mod enlace_wifi_linux_logica;
#[cfg(target_os = "linux")]
mod enlace_wifi_linux;
#[cfg(target_os = "macos")]
mod enlace_wifi_macos;
mod faro;
// (LLA1108D) Las llamadas como llamadas del teléfono: Telecom, aviso CallStyle, audio y proximidad (Android).
mod llamada_entrante;
mod llamada_entrante_logica;
mod llamada_nativa;
mod llamada_nativa_logica;
mod malla_local;
mod malla_local_trama;
mod nativa;
// (VER1107B) «Esta neurona»: versión instalada, sistema, aparato y búsqueda de actualización sin instalar.
mod neurona_info;
// (NOT1108A) Origen estable del servidor local (puerto principal en disco) y rescate entre puertos.
mod origen_local;
mod origen_local_logica;
// (NEU1108A) Pista del id de neurona del origen publicado para la APK con servidor local (127.0.0.1).
mod pista_neurona;
// (MIC1108A) Micrófono, cámara y pantalla: solo los orígenes propios, y el sistema pregunta.
mod permisos_medios;
mod recursos_ia;
// (MOD1110B) Instalación guiada de Ollama: descarga del instalador OFICIAL a Descargas y apertura (escritorio).
#[cfg(desktop)]
mod ollama_instalador;
#[cfg(desktop)]
mod segundo_plano;
mod serie;
// Servidor local dentro de la app (APP1107A, architecture/apps-autonomas-sin-internet.md):
// la app de escritorio de StarSeed OS abre su propio servidor en 127.0.0.1 y funciona sin internet.
#[cfg(desktop)]
mod servidor_local;
#[cfg(any(desktop, all(target_os = "android", starseed_servidor_android)))]
#[cfg_attr(not(desktop), allow(dead_code))]
mod servidor_local_logica;
// (AND1107A) El mismo servidor DENTRO de la APK (nodejs-mobile), solo con el interruptor de build
// STARSEED_SERVIDOR_LOCAL_ANDROID=1 (build.rs pone `--cfg starseed_servidor_android`). §9.1 del contrato.
#[cfg(all(target_os = "android", starseed_servidor_android))]
mod servidor_local_android;
#[cfg(any(test, all(target_os = "android", starseed_servidor_android)))]
mod servidor_local_android_logica;
// (APP1107B · T4) Trae al servidor local lo que la app tenía en el origen de la web publicada.
#[cfg(desktop)]
mod migracion_origen;
#[cfg(desktop)]
mod migracion_origen_logica;
// (CAP1107A · T1) Capas del servidor local: lo nuevo de la web llega sin reinstalar la app.
#[cfg(desktop)]
mod servidor_capas;
#[cfg(desktop)]
mod servidor_capas_logica;
mod sha256;
// `ventana_remota` (APM1017P, rehecho en APR1019A) está de vuelta con las API
// reales: xcap 0.9 (`Window::all()`, `app_name()`, `capture_image()`), image
// 0.25 y base64 0.22. Solo escritorio: xcap y el resto de sus dependencias van
// en el target cfg de escritorio de Cargo.toml (móvil ni compilan).
#[cfg(desktop)]
mod ventana_remota;
// (SEG1111T) Sesión nativa de «prestar ventana»: diálogo nativo, indicador y vencimientos.
#[cfg(desktop)]
mod prestamo_ventana; // SEG1111T
#[cfg(any(desktop, test))]
mod prestamo_ventana_logica; // SEG1111T
#[cfg(test)]
mod android_parche;
#[cfg(test)]
mod android_actualizador;
// (BLE1108A) Lo usa build.rs (permisos y BleStarSeed.kt en el proyecto Android); aquí solo sus pruebas.
#[cfg(test)]
mod android_ble;
#[cfg(test)]
mod enlace_wifi_parche;
// (LLA1108D) Lo usa build.rs (permisos, componentes y LlamadaNativaStarSeed.kt en el proyecto Android); aquí solo sus pruebas.
#[cfg(test)]
mod llamada_nativa_parche;
// (PTA1108B) Lo usa build.rs (proveedor, ProxyPuertaStarSeed.kt y androidx.webkit en el proyecto Android); aquí solo sus pruebas.
#[cfg(test)]
mod puerta_proxy_parche;

// ═══════════════════════════════════════════════════════════════════════════
// Actualización automática INTELIGENTE del shell nativo (SOLO escritorio).
// Desde la 0.3.0 la usan los tres sistemas, cada uno con su canal: OS →
// `latest.json`, Nexus → `latest-nexus.json`, Café → `latest-cafe.json` (misma
// `pubkey`, heredada de tauri.conf.json; distintos `endpoints`, en cada
// tauri.<sistema>.conf.json).
//
// Todo bajo `#[cfg(desktop)]`: en Android/iOS ni compila (tauri-plugin-updater
// es dependencia solo-escritorio, ver Cargo.toml) ni se registra ningún
// comando/hilo de aquí — así el binario móvil sigue compilando igual.
// ═══════════════════════════════════════════════════════════════════════════
#[cfg(desktop)]
mod actualizacion {
    use serde::Serialize;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Arc, Mutex};
    use tauri::{AppHandle, Emitter, Manager};

    /// Nombre del evento que recibe la web (Aurora) vía
    /// `window.__TAURI__.event.listen('starseed://actualizacion', cb)`.
    pub const EVENTO_ACTUALIZACION: &str = "starseed://actualizacion";

    /// Payload que viaja en CADA evento y que `estado_actualizacion` también
    /// devuelve tal cual (el último emitido) para que la web pueda leer el
    /// estado sin haberse suscrito a tiempo al evento.
    #[derive(Serialize, Clone, Default)]
    pub struct EstadoActualizacion {
        /// "buscando" | "descargando" | "instalando" | "lista" | "error" | "al-dia"
        pub fase: String,
        pub version: Option<String>,
        pub descargado: Option<u64>,
        pub total: Option<u64>,
        pub mensaje: Option<String>,
    }

    /// Estado compartido gestionado por Tauri (`app.manage(...)`): el último
    /// payload emitido (para `estado_actualizacion`) y si hay una instalación
    /// YA lista esperando que el usuario pulse «Reiniciar ahora».
    #[derive(Default)]
    pub struct EstadoCompartido {
        pub ultimo: Mutex<EstadoActualizacion>,
        pub pendiente_reinicio: Mutex<bool>,
    }

    fn emitir(app: &AppHandle, payload: EstadoActualizacion) {
        if let Some(estado) = app.try_state::<EstadoCompartido>() {
            if let Ok(mut u) = estado.ultimo.lock() {
                *u = payload.clone();
            }
        }
        // Best-effort: si no hay ninguna ventana escuchando aún, emit() no falla,
        // simplemente no llega a nadie (la web puede leer estado_actualizacion()).
        let _ = app.emit(EVENTO_ACTUALIZACION, payload);
    }

    fn marcar_pendiente_reinicio(app: &AppHandle, valor: bool) {
        if let Some(estado) = app.try_state::<EstadoCompartido>() {
            if let Ok(mut p) = estado.pendiente_reinicio.lock() {
                *p = valor;
            }
        }
    }

    /// ¿La ventana principal está VISIBLE y ENFOCADA ahora mismo? Ante la duda
    /// (ventana inexistente = None, o una llamada que devuelve Err) asumimos que
    /// SÍ (honestidad/seguridad: mejor no reiniciar de sorpresa al usuario que
    /// sí está mirando, que sorprenderlo con un reinicio no pedido).
    fn usuario_esta_mirando(app: &AppHandle) -> bool {
        match app.get_webview_window("main") {
            Some(win) => {
                let visible = win.is_visible().unwrap_or(true);
                let enfocada = win.is_focused().unwrap_or(true);
                visible && enfocada
            }
            // Sin ventana principal (p.ej. solo bandeja del sistema): nadie
            // puede sorprenderse por un reinicio silencioso.
            None => false,
        }
    }

    /// Núcleo ÚNICO de la comprobación + descarga + instalación: lo usan tanto
    /// el hilo de fondo (comprobación periódica) como el comando `check_update`
    /// invocable desde la web (misma ruta de código, ver la petición del dueño).
    /// Nunca hace panic: cualquier fallo se reporta como fase "error" y se
    /// devuelve como Err(String) para quien haya invocado el comando.
    pub async fn comprobar_e_instalar(app: AppHandle) -> Result<Option<String>, String> {
        emitir(&app, EstadoActualizacion { fase: "buscando".into(), ..Default::default() });

        // (ACT1108A/B) El `check()` del canal de ESTA app: oficial (tauri.conf.json) o pruebas, con
        // reintentos y ruta alternativa por la API de GitHub. Cada cambio de ruta se cuenta a la web.
        let app_aviso = app.clone();
        let avisar = move |texto: String| {
            emitir(&app_aviso, EstadoActualizacion { fase: "buscando".into(), mensaje: Some(texto), ..Default::default() });
        };
        let encontrado = crate::canal_actualizacion::buscar(&app, &avisar).await.map_err(|msg| {
            emitir(&app, EstadoActualizacion { fase: "error".into(), mensaje: Some(msg.clone()), ..Default::default() });
            msg
        })?;

        let Some(update) = encontrado else {
            emitir(&app, EstadoActualizacion { fase: "al-dia".into(), ..Default::default() });
            return Ok(None);
        };

        let version = update.version.clone();
        emitir(
            &app,
            EstadoActualizacion {
                fase: "descargando".into(),
                version: Some(version.clone()),
                descargado: Some(0),
                total: None,
                mensaje: None,
            },
        );

        // Acumuladores compartidos con los callbacks de progreso (solo AppHandle clonado + Arc<Atomic*>).
        let total_bytes = Arc::new(AtomicU64::new(0));
        let descargado_bytes = Arc::new(AtomicU64::new(0));

        let app_chunk = app.clone();
        let version_chunk = version.clone();
        let total_bytes_chunk = total_bytes.clone();
        let descargado_bytes_chunk = descargado_bytes.clone();
        let on_chunk = move |chunk: usize, total: Option<u64>| {
            if let Some(t) = total {
                total_bytes_chunk.store(t, Ordering::Relaxed);
            }
            let acumulado = descargado_bytes_chunk.fetch_add(chunk as u64, Ordering::Relaxed) + chunk as u64;
            let total_actual = total_bytes_chunk.load(Ordering::Relaxed);
            emitir(
                &app_chunk,
                EstadoActualizacion {
                    fase: "descargando".into(),
                    version: Some(version_chunk.clone()),
                    descargado: Some(acumulado),
                    total: if total_actual > 0 { Some(total_actual) } else { None },
                    mensaje: None,
                },
            );
        };
        // Cada intento (otra ruta) empieza el progreso de cero.
        let descargado_reinicio = descargado_bytes.clone();
        let al_empezar = move || descargado_reinicio.store(0, Ordering::Relaxed);
        let app_aviso_d = app.clone();
        let version_aviso_d = version.clone();
        let avisar_descarga = move |texto: String| {
            emitir(
                &app_aviso_d,
                EstadoActualizacion { fase: "descargando".into(), version: Some(version_aviso_d.clone()), mensaje: Some(texto), ..Default::default() },
            );
        };

        let paquete = crate::canal_actualizacion::descargar(&update, on_chunk, &al_empezar, &avisar_descarga).await.map_err(|e| {
            let msg = format!("Falló la descarga de la actualización: {e}");
            emitir(&app, EstadoActualizacion { fase: "error".into(), version: Some(version.clone()), mensaje: Some(msg.clone()), ..Default::default() });
            msg
        })?;

        emitir(&app, EstadoActualizacion { fase: "instalando".into(), version: Some(version.clone()), ..Default::default() });
        // `install` NO baja nada: aquí la firma ya se verificó en `download` (minisign con la clave de tauri.conf.json).
        update.install(paquete).map_err(|e| {
            let msg = format!("Falló la instalación de la actualización: {e}");
            emitir(&app, EstadoActualizacion { fase: "error".into(), version: Some(version.clone()), mensaje: Some(msg.clone()), ..Default::default() });
            msg
        })?;

        // Instalada: reinicio inteligente. Si el usuario NO está mirando la
        // ventana principal (minimizada, en 2º plano o sin foco), reiniciamos
        // solos — es el mejor momento, no interrumpe nada. Si SÍ está mirando,
        // dejamos la instalación lista y avisamos para que decida cuándo.
        if usuario_esta_mirando(&app) {
            marcar_pendiente_reinicio(&app, true);
            emitir(
                &app,
                EstadoActualizacion {
                    fase: "lista".into(),
                    version: Some(version.clone()),
                    mensaje: Some("Actualización lista: reinicia cuando quieras para aplicarla.".into()),
                    ..Default::default()
                },
            );
        } else {
            marcar_pendiente_reinicio(&app, false);
            app.restart(); // no retorna (reinicia el proceso).
        }

        Ok(Some(version))
    }

    /// (VER1107B) Solo BUSCA en el canal de esta app (`latest*.json`, el mismo `check()` que la
    /// vigilancia): no descarga, no instala y no emite eventos ni toca el estado compartido. La web lo
    /// usa para no abrir «Hay una versión nueva» cuando la versión publicada aún no está lista para
    /// este sistema (el canal todavía no la ofrece).
    pub async fn buscar(app: AppHandle) -> Result<crate::neurona_info::BusquedaActualizacion, String> {
        let actual = app.package_info().version.to_string();
        // (ACT1108A) El mismo canal que la vigilancia (oficial o pruebas).
        let encontrado = crate::canal_actualizacion::buscar(&app, &|_| {}).await?;
        Ok(crate::neurona_info::busqueda(
            &actual,
            encontrado.map(|u| (u.version.clone(), u.body.clone(), crate::neurona_info::fecha_de_json(&u.raw_json))),
        ))
    }

    /// Hilo de fondo que espera ~25 s tras el arranque (para no competir con la
    /// primera carga de la web) y luego comprueba actualizaciones cada 6 h.
    ///
    /// Deliberadamente NO usa `tauri::async_runtime::spawn` + un sleep async: el
    /// crate `tokio` no es dependencia DIRECTA de este crate (solo transitiva vía
    /// `tauri`), así que `tokio::time::sleep` no es nombrable aquí sin añadir esa
    /// dependencia (el dueño pidió «no new crates»). Un hilo del SO dedicado con
    /// `std::thread::sleep` + `tauri::async_runtime::block_on(...)` para la parte
    /// async logra lo mismo con API 100% estable y ya usada en el resto del
    /// crate, sin ocupar un worker del pool de tokio durante horas.
    pub fn iniciar_vigilancia_en_segundo_plano(app: AppHandle) {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(25));
            loop {
                // Cualquier error ya quedó reportado (evento "error" + estado
                // compartido) dentro de comprobar_e_instalar; aquí no hay nada
                // más que hacer que seguir esperando al siguiente ciclo.
                let instalada = tauri::async_runtime::block_on(comprobar_e_instalar(app.clone()));
                // (ACT1108A) Instalada sin preguntar y la persona mirando: «Lista: reinicia».
                if let Ok(Some(version)) = instalada {
                    crate::canal_actualizacion::avisar_lista(&app, &version);
                }
                std::thread::sleep(std::time::Duration::from_secs(6 * 60 * 60));
            }
        });
    }
}

// ───────────────────────── Tipos de retorno a la web ─────────────────────────

/// Resultado de ejecutar un comando de terminal (lo consume Aurora).
#[derive(Serialize)]
struct TerminalResult {
    /// Salida estándar (stdout) decodificada como texto.
    stdout: String,
    /// Salida de error (stderr) decodificada como texto.
    stderr: String,
    /// Código de salida del proceso (None si terminó por señal).
    code: Option<i32>,
    /// true si el proceso terminó con éxito (código 0).
    success: bool,
}

/// Información básica del dispositivo (para que Aurora sepa "dónde vive").
#[derive(Serialize)]
struct DeviceInfo {
    /// SO: "macos", "windows", "linux", "android", "ios"…
    os: String,
    /// Arquitectura: "x86_64", "aarch64"…
    arch: String,
    /// Familia: "unix" | "windows".
    family: String,
    /// Versión de la app nativa (de tauri.conf.json / Cargo).
    app_version: String,
    /// Hostname si se puede resolver (mejor esfuerzo).
    hostname: Option<String>,
}

// ─────────────────────────── Comando: run_terminal ───────────────────────────

/// Ejecuta un comando de shell en el dispositivo y devuelve su salida.
///
/// Es el PUENTE de "control por terminal" para Aurora. En Unix ejecuta
/// `sh -c "<cmd>"`; en Windows `cmd /C "<cmd>"`. El scope está declarado en la
/// capability (`shell:allow-execute`), por eso esto solo funciona en la app
/// nativa instalada y con el permiso concedido — un navegador NO puede hacerlo.
///
/// ⚠️ Potente y peligroso: da a la IA acceso de terminal con los permisos del
/// usuario. Úsese con criterio; el usuario es soberano de lo que autoriza.
#[tauri::command]
async fn run_terminal(app: tauri::AppHandle, cmd: String) -> Result<TerminalResult, String> {
    if cmd.trim().is_empty() {
        return Err("El comando está vacío.".into());
    }

    // Elegimos intérprete según el sistema.
    #[cfg(windows)]
    let (program, args) = ("cmd", vec!["/C".to_string(), cmd.clone()]);
    #[cfg(not(windows))]
    let (program, args) = ("sh", vec!["-c".to_string(), cmd.clone()]);

    // Ejecuta el proceso hijo vía tauri-plugin-shell y espera su salida.
    let output = app
        .shell()
        .command(program)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("No se pudo ejecutar «{cmd}»: {e}"))?;

    Ok(TerminalResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        code: output.status.code(),
        success: output.status.success(),
    })
}

// ─────────────────── Comandos: check_update / reiniciar_para_actualizar / estado_actualizacion ───────────────────

/// Busca e instala la actualización incremental DENTRO de la app (sin
/// reinstalar), reutilizando el MISMO camino de código que la vigilancia
/// periódica en segundo plano (`actualizacion::comprobar_e_instalar`) — así el
/// botón manual «Buscar actualizaciones» y el ciclo automático de 6h nunca
/// pueden divergir en comportamiento. Devuelve un mensaje legible para Aurora.
///
/// Solo escritorio: el updater no aplica igual en móvil (allí actualiza la
/// tienda o el sideload manual del APK).
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(desktop)]
    {
        match actualizacion::comprobar_e_instalar(app).await {
            Ok(Some(version)) => Ok(format!(
                "Actualización a la versión {version} descargada. Revisa el aviso de la app para reiniciar."
            )),
            Ok(None) => Ok("Ya estás en la última versión.".to_string()),
            Err(e) => Err(e),
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok("En móvil las actualizaciones llegan por la tienda o instalando el APK nuevo.".to_string())
    }
}

/// Reinicia la app para aplicar una actualización YA descargada e instalada
/// (la web la invoca cuando el usuario pulsa «Reiniciar ahora» tras el evento
/// `starseed://actualizacion` con fase "lista"). Solo escritorio: en móvil no
/// hay reinicio in-app que aplicar (el sideload del APK lo hace el usuario).
#[tauri::command]
fn reiniciar_para_actualizar(app: tauri::AppHandle) {
    #[cfg(desktop)]
    {
        app.restart();
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
    }
}

/// Devuelve el ÚLTIMO estado de actualización conocido (lo que emitió el
/// evento `starseed://actualizacion` por última vez), para que la web pueda
/// pintar el estado correcto aunque se haya suscrito tarde (p. ej. tras
/// recargar la página). En móvil, o si aún no se ha comprobado nada, devuelve
/// el estado por defecto ("" en fase: ninguna comprobación todavía).
#[tauri::command]
fn estado_actualizacion(app: tauri::AppHandle) -> actualizacion_estado::EstadoActualizacionPublico {
    #[cfg(desktop)]
    {
        use tauri::Manager;
        if let Some(estado) = app.try_state::<actualizacion::EstadoCompartido>() {
            let ultimo = estado.ultimo.lock().map(|g| g.clone()).unwrap_or_default();
            let pendiente = estado.pendiente_reinicio.lock().map(|g| *g).unwrap_or(false);
            return actualizacion_estado::EstadoActualizacionPublico {
                fase: ultimo.fase,
                version: ultimo.version,
                descargado: ultimo.descargado,
                total: ultimo.total,
                mensaje: ultimo.mensaje,
                pendiente_reinicio: pendiente,
            };
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
    }
    actualizacion_estado::EstadoActualizacionPublico::default()
}

/// Tipo de retorno serializable de `estado_actualizacion`, separado del
/// interno de `actualizacion` para no filtrar `EstadoCompartido` (con sus
/// `Mutex`, no `Serialize`) al `invoke_handler`. Vive fuera de `#[cfg(desktop)]`
/// para que el comando siga existiendo (con estado vacío) también en móvil.
mod actualizacion_estado {
    use serde::Serialize;

    #[derive(Serialize, Default)]
    pub struct EstadoActualizacionPublico {
        pub fase: String,
        pub version: Option<String>,
        pub descargado: Option<u64>,
        pub total: Option<u64>,
        pub mensaje: Option<String>,
        pub pendiente_reinicio: bool,
    }
}

// ─────────────────────────── Comando: device_info ────────────────────────────

/// Devuelve información básica del dispositivo donde corre la app.
#[tauri::command]
fn device_info(app: tauri::AppHandle) -> DeviceInfo {
    let hostname = hostname_best_effort();
    DeviceInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
        app_version: app.package_info().version.to_string(),
        hostname,
    }
}

// ───────────────────── Comandos: info_neurona / buscar_actualizacion (VER1107B) ─────────────────────

/// «Esta neurona»: lo que la app nativa sabe de sí misma (versión instalada, qué sistema es, sistema
/// operativo, arquitectura, equipo o modelo, Tauri). Lo lee la web para Ajustes › Esta neurona, para
/// la presencia de la neurona y para comparar versiones (nunca con el build de la web). Nada se inventa:
/// lo que el sistema no dice va como `None`.
#[tauri::command]
fn info_neurona(app: tauri::AppHandle) -> neurona_info::InfoNeurona {
    let identificador = app.config().identifier.clone();
    let escritorio = cfg!(desktop);
    #[cfg(target_os = "android")]
    let (equipo, modelo) = (
        None,
        neurona_info::componer_modelo(
            neurona_info::propiedad_android("ro.product.manufacturer").as_deref(),
            neurona_info::propiedad_android("ro.product.model").as_deref(),
        ),
    );
    #[cfg(not(target_os = "android"))]
    let (equipo, modelo) = (
        neurona_info::limpiar(&tauri_plugin_os::hostname()).or_else(|| hostname_best_effort().as_deref().and_then(neurona_info::limpiar)),
        None,
    );
    neurona_info::InfoNeurona {
        app_version: app.package_info().version.to_string(),
        app_nombre: app.package_info().name.clone(),
        sistema: neurona_info::sistema_de_identificador(&identificador).to_string(),
        identificador,
        plataforma: tauri_plugin_os::platform().to_string(),
        so_version: neurona_info::limpiar(&tauri_plugin_os::version().to_string()),
        arquitectura: tauri_plugin_os::arch().to_string(),
        equipo,
        modelo,
        tauri_version: tauri::VERSION.to_string(),
        escritorio,
        actualizador: escritorio,
    }
}

/// Busca la versión nueva en el canal de esta app SIN descargarla ni instalarla (escritorio). En
/// móvil no hay updater: la versión nueva es el .apk de la misma firma (lo decide la web).
#[tauri::command]
async fn buscar_actualizacion(app: tauri::AppHandle) -> Result<neurona_info::BusquedaActualizacion, String> {
    #[cfg(desktop)]
    {
        actualizacion::buscar(app).await
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Err("En móvil la versión nueva llega instalando el APK de la misma firma.".to_string())
    }
}

/// Resuelve el hostname sin dependencias extra: variable de entorno primero,
/// y en Unix el comando `hostname` como respaldo. Nunca falla (Option).
fn hostname_best_effort() -> Option<String> {
    if let Ok(h) = std::env::var("HOSTNAME") {
        if !h.trim().is_empty() {
            return Some(h);
        }
    }
    if let Ok(h) = std::env::var("COMPUTERNAME") {
        if !h.trim().is_empty() {
            return Some(h);
        }
    }
    #[cfg(unix)]
    {
        if let Ok(out) = std::process::Command::new("hostname").output() {
            let h = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !h.is_empty() {
                return Some(h);
            }
        }
    }
    None
}

// ──────────────────────────────── Arranque ───────────────────────────────────

/// Punto de entrada compartido escritorio + móvil.
///
/// `tauri::mobile_entry_point` genera el enganche que Android (JNI) e iOS
/// llaman al arrancar; en escritorio lo llama `main()` directamente.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WIN1109B: la pasarela del navegador de Windows se instala ANTES de crear el primer webview
    // (WebView2 solo lee `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` al nacer). Si no se puede, no pasa nada.
    #[cfg(target_os = "windows")]
    puerta_proxy_windows::instalar();
    let mut builder = tauri::Builder::default();

    // Autostart + Updater: SOLO escritorio (en móvil ni compilan; ver Cargo.toml
    // → [target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]).
    #[cfg(desktop)]
    {
        // Al arrancar con el sistema, la app entra con `--segundo-plano`: ventana oculta y
        // solo el guardián de antenas trabajando (segundo_plano.rs). Las entradas de
        // arranque ya creadas por la 0.3.0 (sin argumento) se renuevan al apagar y encender.
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![segundo_plano::ARG_SEGUNDO_PLANO]),
        ));
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
        // Cerrar la ventana principal la OCULTA si el segundo plano está encendido y hay
        // por dónde volver (bandeja o Dock); si no, se cierra como siempre.
        builder = builder.on_window_event(|ventana, evento| segundo_plano::al_evento_de_ventana(ventana, evento));
    }

    builder = builder
        // Terminal / procesos → control profundo para Aurora.
        .plugin(tauri_plugin_shell::init())
        // Notificaciones nativas.
        .plugin(tauri_plugin_notification::init())
        // Diálogos nativos (consentimiento del usuario).
        .plugin(tauri_plugin_dialog::init())
        // Sistema de archivos con scope.
        .plugin(tauri_plugin_fs::init())
        // Info del SO.
        .plugin(tauri_plugin_os::init())
        // Control del proceso (necesario para reiniciar tras un update).
        .plugin(tauri_plugin_process::init())
        // Enlaces profundos starseed://
        .plugin(tauri_plugin_deep_link::init())
        // (MIC1108A) Micrófono, cámara y pantalla: la web de la app (servidor local o web publicada)
        // los recibe del motor web y el sistema pregunta a la persona; otra página, no. Se decide con
        // la última página cargada en cada ventana (permisos_medios.rs; contrato §13).
        .on_page_load(|webview, carga| permisos_medios::recordar_pagina(webview.label(), carga.url().as_str()))
        .on_permission_request(|webview, kind| permisos_medios::al_pedir_permiso(webview.label(), kind))
        .setup(|app| {
            // Estado compartido + vigilancia de actualizaciones: SOLO escritorio,
            // y desde la 0.3.0 para los TRES sistemas. Cada uno lee su propio
            // canal (2026-10-09): el OS `latest.json` (el de siempre, para que
            // las 0.2.x instaladas sigan encontrándolo), Nexus `latest-nexus.json`
            // y Café `latest-cafe.json` — declarados en su tauri.<sistema>.conf.json
            // y generados por el job `canales` de native-build.yml. Antes solo
            // vigilaba el OS: Nexus y Café heredaban el endpoint del OS por la
            // fusión de configuración y, si se hubieran actualizado, se habrían
            // convertido en StarSeed OS; por eso se les dejó sin actualizar.
            #[cfg(desktop)]
            {
                use tauri::Manager;
                app.manage(actualizacion::EstadoCompartido::default());
                actualizacion::iniciar_vigilancia_en_segundo_plano(app.handle().clone());
            }
            // Guardián de antenas, carpetas concedidas, capas y NAS (todas las plataformas;
            // el guardián solo en StarSeed OS). Después, en escritorio, la bandeja y el
            // cierre que oculta (también solo StarSeed OS: Nexus y Café se cierran del todo).
            nativa::iniciar(app.handle());
            // (MSH1107A) Canal local de datos entre neuronas (TCP 47071), solo StarSeed OS.
            malla_local::iniciar(app.handle());
            // (BLE1108A) Bluetooth directo entre neuronas, solo StarSeed OS (en Android ya lo arrancó Kotlin).
            ble::iniciar(app.handle());
            // (ACT1108A) Android: busca el APK nuevo cada 6 h (escritorio: la vigilancia de arriba).
            canal_actualizacion::iniciar(app.handle());
            // (NOT1108A) Pulsar una notificación de mensaje abre su chat.
            avisos_mensajes::iniciar(app.handle());
            // (PTA1108B) Estado del proxy de la puerta de internet (la página lo fija con `puerta_proxy_local`).
            puerta_proxy::iniciar(app.handle());
            // (MIC1108A) Linux: WebKitGTK trae MediaStream y WebRTC apagados; sin ellos no hay llamadas.
            #[cfg(target_os = "linux")]
            permisos_medios::encender_medios_linux(app.handle());
            // (LNX1109B) Si falta algún elemento de GStreamer de WebRTC, se dice en el registro (las llamadas caen al canal de datos).
            #[cfg(target_os = "linux")]
            let _ = std::thread::Builder::new().name("starseed-gst".into()).spawn(|| {
                if let Some(f) = permisos_medios::elementos_webrtc_que_faltan() {
                    if !f.is_empty() {
                        eprintln!("[llamadas] {}", permisos_medios::texto_paquetes_gstreamer(&f));
                    }
                }
            });
            // Servidor local de StarSeed OS (solo escritorio; Nexus y Café siguen con su web).
            #[cfg(desktop)]
            servidor_local::iniciar(app.handle());
            #[cfg(all(target_os = "android", starseed_servidor_android))]
            servidor_local_android::iniciar(app.handle());
            #[cfg(desktop)]
            {
                if nativa::es_starseed_os(app.handle()) {
                    segundo_plano::iniciar(app.handle());
                }
            }
            Ok(())
        });

    // ─── Comandos que la web (Aurora) invoca vía window.__TAURI__ ───
    // `generate_handler!` NO admite atributos `#[cfg]` dentro de su invocación
    // (los atributos no se procesan dentro de una macro), así que la lista común
    // la repite esta macro local en las dos plataformas y la lista de escritorio
    // (`ventana_remota` de APR1019A: xcap no se compila para móvil, ver
    // Cargo.toml) queda en su propio bloque `#[cfg(desktop)]`.
    macro_rules! registrar_comandos {
        ($builder:ident [$($solo_desktop:path),* $(,)?]) => {
            $builder = $builder.invoke_handler(tauri::generate_handler![
                run_terminal,
                check_update,
                reiniciar_para_actualizar,
                estado_actualizacion,
                device_info,
                info_neurona,
                buscar_actualizacion,
                pista_neurona::pista_neurona,
                pista_neurona::pista_neurona_leer,
                permisos_medios::medios_estado,
                permisos_medios::medios_abrir_ajustes,
                permisos_inicio::permisos_inicio_estado,
                permisos_inicio::permisos_inicio_pedir,
                permisos_inicio::ventana_pantalla_completa,
                permisos_sistema::permisos_sistema_estado,
                permisos_sistema::permisos_sistema_pedir,
                permisos_sistema::permisos_sistema_abrir,
                recursos_ia::recursos_ia_detectar,
                nativa::antenas_estado,
                nativa::antenas_medir,
                nativa::antenas_config,
                nativa::antenas_configurar,
                nativa::fondo_estado,
                nativa::fondo_fijar,
                nativa::fondo_arranque,
                nativa::fondo_pedir_bateria,
                nativa::carpetas_listar,
                nativa::carpetas_conceder,
                nativa::carpetas_revocar,
                nativa::carpetas_nas,
                nativa::serie_puertos,
                nativa::serie_abrir,
                nativa::serie_escribir,
                nativa::serie_cerrar,
                nativa::capas_estado,
                nativa::capas_descargar,
                nativa::capas_verificar,
                nativa::capas_borrar,
                nativa::nas_listar,
                nativa::nas_leer,
                malla_local::malla_local_enviar,
                malla_local::malla_local_estado,
                malla_local::malla_local_recibidos,
                // (BLE1108A) Bluetooth directo.
                ble::ble_estado,
                ble::ble_abrir,
                ble::ble_cerrar,
                ble::ble_enviar,
                ble::ble_recibidos,
                ble::ble_activar,
                ble::ble_pedir_permiso,
                ble::ble_registro,
                ble::ble_registro_anexar,
                ble::ble_canal_rapido,      // BLE1109B
                ble::ble_enlace_ligado,     // BLE1109B
                ble::ble_registro_compartir, // BLE1109B
                canal_actualizacion::apk_actualizar,
                canal_actualizacion::apk_estado,
                canal_actualizacion::apk_instalar,
                avisos_mensajes::aviso_mensaje,
                avisos_mensajes::avisos_config,
                avisos_mensajes::avisos_estado,
                avisos_mensajes::avisos_pedir_permiso,
                avisos_mensajes::avisos_pendiente,
                origen_local::origen_local_estado,
                origen_local::rescate_origen_exportar,
                origen_local::rescate_origen_estado,
                origen_local::rescate_origen_datos,
                origen_local::rescate_origen_confirmar,
                enlace_wifi::enlace_wifi_capacidades,
                enlace_wifi::enlace_wifi_permiso,
                enlace_wifi::enlace_wifi_abrir_ap,
                enlace_wifi::enlace_wifi_credenciales,
                enlace_wifi::enlace_wifi_unirse,
                enlace_wifi::enlace_wifi_estado,
                enlace_wifi::enlace_wifi_cerrar,
                enlace_wifi::enlace_wifi_comprobar,
                // (WFA1109A) AWDL entre dos Mac (sin router ni hotspot).
                awdl::awdl_iniciar, // WFA1109A
                awdl::awdl_detener, // WFA1109A
                awdl::awdl_estado, // WFA1109A
                // (LLA1108D) Las llamadas como llamadas del teléfono.
                llamada_nativa::llamada_nativa_iniciar,
                llamada_nativa::llamada_nativa_estado,
                llamada_nativa::llamada_nativa_ruta_audio,
                llamada_nativa::llamada_nativa_proximidad,
                llamada_nativa::llamada_nativa_capacidades,
                llamada_nativa::llamada_nativa_permiso,
                llamada_nativa::llamada_nativa_ignorar,
                llamada_nativa::llamada_nativa_recientes,
                llamada_entrante::llamada_silencios_sincronizar,
                llamada_entrante::llamada_timbre_firmar,
                // (PTA1108B) Proxy de la puerta de internet: webview (macOS 14+, Android) y descargas de Rust.
                puerta_proxy::puerta_proxy_local,
                puerta_proxy::puerta_proxy_estado,
                $($solo_desktop,)*
            ]);
        };
    }
    #[cfg(desktop)]
    registrar_comandos!(builder [
        ventana_remota::ventanas_prestables,
        ventana_remota::capturar_ventana,
        ventana_remota::entrada_ventana,
        prestamo_ventana::prestamo_ventana_iniciar, // SEG1111T
        prestamo_ventana::prestamo_ventana_parar, // SEG1111T
        prestamo_ventana::prestamo_ventana_estado, // SEG1111T
        servidor_local::servidor_local_estado,
        servidor_local::servidor_local_actualizar,
        migracion_origen::migracion_origen_exportar,
        migracion_origen::migracion_origen_estado,
        migracion_origen::migracion_origen_datos,
        migracion_origen::migracion_origen_confirmar,
        ollama_instalador::ollama_instalador_descargar, // MOD1110B
        ollama_instalador::ollama_instalador_cancelar, // MOD1110B
        ollama_instalador::ollama_instalador_abrir, // MOD1110B
    ]);
    #[cfg(not(desktop))]
    registrar_comandos!(builder []);

    builder
        .build(tauri::generate_context!())
        .expect("error irrecuperable arrancando la app nativa StarSeed")
        .run(|_app, _evento| {
            // Al salir, se apaga el servidor local (si la app muere de golpe, sale solo).
            #[cfg(desktop)]
            {
                if matches!(_evento, tauri::RunEvent::Exit) {
                    prestamo_ventana::al_salir(_app); // SEG1111T
                    servidor_local::apagar();
                }
            }
            // macOS: con la ventana oculta, un clic en el icono del Dock la devuelve.
            #[cfg(target_os = "macos")]
            {
                if let tauri::RunEvent::Reopen { has_visible_windows: false, .. } = _evento {
                    segundo_plano::mostrar(_app);
                }
            }
        });
}
