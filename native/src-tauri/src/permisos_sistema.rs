// ═══════════════════════════════════════════════════════════════════════════
// permisos_sistema — estado REAL de los permisos del sistema y la pantalla EXACTA de Ajustes donde se dan
// (PER1111S, 2026-11-11). Contrato: architecture/permisos-y-control-del-dispositivo.md §2 y §5.
// ---------------------------------------------------------------------------
// La lista de permisos de cada neurona (src/lib/nativa/permisos-registro.ts) pregunta aquí tres cosas:
//   · `permisos_sistema_estado`: cómo está cada permiso que este sistema deja LEER (solo leer: nada de
//     esto abre avisos). Lo que el sistema no deja leer no sale («desconocido» en la web, y se dice).
//   · `permisos_sistema_pedir`: los avisos que el PROPIO sistema enseña a la persona (macOS: Accesibilidad
//     con `AXIsProcessTrustedWithOptions`, Grabación de pantalla con `CGRequestScreenCaptureAccess`,
//     Monitorización de entrada con `IOHIDRequestAccess`). Son las API públicas de Apple para eso.
//   · `permisos_sistema_abrir`: la pantalla de Ajustes de ese permiso (direcciones fijas; nada de la web
//     llega a un proceso).
// REGLA (no negociable, contrato §1): la app NUNCA se concede nada a sí misma. Ni escribe en la base de
// datos de permisos del sistema (TCC.db en macOS), ni usa interfaces privadas, ni pulsa por guion los
// diálogos del sistema, ni cambia ajustes de Android por `adb`/`pm grant`. Pide, abre la pantalla y mira.
// Lo de decidir es puro (se prueba sin Tauri); lo que toca el sistema va en módulos por plataforma.
// ═══════════════════════════════════════════════════════════════════════════

// Las piezas puras se usan según la plataforma (Android, macOS) y en las pruebas.
#![allow(dead_code)]

use serde::Serialize;
use std::collections::BTreeMap;

/// Sube si cambia lo que esta lectura sabe decir (la web lo guarda con la lista).
/// v2 (LNX1118WD): en Linux se mide además lo que el nodo necesita (grupos, /dev/uinput, Bluetooth, polkit, GStreamer).
pub const VERSION_PERMISOS_SISTEMA: u32 = 2;

/// Estados que se devuelven. «no-concedido»: el sistema no distingue «negado» de «nunca preguntado»
/// (Accesibilidad de macOS). «no-aplica»: en este sistema no hace falta pedirlo.
pub const ESTADOS: [&str; 5] = ["concedido", "denegado", "sin-preguntar", "no-concedido", "no-aplica"];

/// Los permisos con pantalla de Ajustes que la app sabe abrir, por sistema. Pura.
/// macOS: Ajustes del Sistema › Privacidad y seguridad (las anclas `Privacy_*` funcionan de macOS 13 a 15;
/// en 13+ también las acepta el panel nuevo). Windows: `ms-settings:` de la Configuración.
/// Android: el identificador lo traduce Kotlin a la pantalla exacta (`panel:<id>`).
pub fn panel(plataforma: &str, id: &str) -> Option<&'static str> {
    Some(match (plataforma, id) {
        ("macos", "accesibilidad") => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        ("macos", "pantalla") => "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        ("macos", "monitor-entrada") => "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
        ("macos", "automatizacion") => "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
        ("macos", "disco-completo") => "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
        ("macos", "bluetooth") => "x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth",
        ("macos", "microfono") => "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
        ("macos", "camara") => "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
        ("macos", "ubicacion-wifi") => "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices",
        ("macos", "ubicacion") => "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices", // UBI1114K
        ("macos", "red-local") => "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork",
        ("macos", "carpetas") => "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders", // FAC1116
        ("macos", "notificaciones") => "x-apple.systempreferences:com.apple.preference.notifications",
        ("macos", "arranque") => "x-apple.systempreferences:com.apple.LoginItems-Settings.extension",
        ("windows", "microfono") => "ms-settings:privacy-microphone",
        ("windows", "camara") => "ms-settings:privacy-webcam",
        ("windows", "ubicacion-wifi") => "ms-settings:privacy-location",
        ("windows", "ubicacion") => "ms-settings:privacy-location", // UBI1114K
        ("windows", "notificaciones") => "ms-settings:notifications",
        ("windows", "arranque") => "ms-settings:startupapps",
        ("windows", "bluetooth") => "ms-settings:bluetooth",
        ("android", x) if PANELES_ANDROID.contains(&x) => "android",
        _ => return None,
    })
}

/// Pantallas de Android que Kotlin sabe abrir con `panel:<id>` (ArranqueStarSeed.kt › abrirPanel).
pub const PANELES_ANDROID: [&str; 11] = [
    "accesibilidad", "superposicion", "no-molestar", "escribir-ajustes", "todos-archivos", "notificaciones", "bateria", "app",
    // FAC1116: «instalar» y «llamadas» tienen su pantalla propia; «ajustes-restringidos» es la ficha de la app (el ajuste vive en su menú ⋮).
    "instalar", "llamadas", "ajustes-restringidos",
];

/// La acción que se escribe en `peticion.json` para abrir una pantalla de Android. Pura.
pub fn accion_panel_android(id: &str) -> Option<String> {
    if !PANELES_ANDROID.contains(&id) {
        return None;
    }
    Some(if id == "bateria" { "bateria".to_string() } else { format!("panel:{id}") })
}

/// Permisos que el propio sistema pregunta con su aviso cuando la app lo pide (`permisos_sistema_pedir`).
pub const AVISOS_MACOS: [&str; 3] = ["accesibilidad", "pantalla", "monitor-entrada"];

/// Sesión gráfica de Linux, de las variables de entorno. Pura.
pub fn sesion_linux(xdg_session_type: Option<&str>, wayland_display: Option<&str>) -> &'static str {
    match xdg_session_type.map(|s| s.trim().to_ascii_lowercase()) {
        Some(s) if s == "wayland" => "wayland",
        Some(s) if s == "x11" => "x11",
        _ => {
            if wayland_display.map(|w| !w.trim().is_empty()).unwrap_or(false) {
                "wayland"
            } else {
                "x11"
            }
        }
    }
}

/// `AVAuthorizationStatus` / `CBManagerAuthorization` / `CLAuthorizationStatus` (los tres usan 0 = sin
/// preguntar, 1 = restringido, 2 = negado; 3 y 4 = concedido). Pura.
pub fn estado_de_autorizacion(n: i64) -> &'static str {
    match n {
        0 => "sin-preguntar",
        1 | 2 => "denegado",
        3 | 4 => "concedido",
        _ => "no-concedido",
    }
}

/// `IOHIDAccessType`: 0 concedido, 1 negado, 2 desconocido (sin preguntar). Pura.
pub fn estado_de_iohid(n: u32) -> &'static str {
    match n {
        0 => "concedido",
        1 => "denegado",
        _ => "sin-preguntar",
    }
}

/// Lo que la web lee: un estado por permiso que se pudo leer. Lo que no se pudo leer, no está.
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct EstadoPermisosSistema {
    pub version: u32,
    /// `std::env::consts::OS`.
    pub plataforma: String,
    /// Linux: «x11» | «wayland». Vacío en el resto.
    pub sesion: String,
    pub estados: BTreeMap<String, String>,
    /// Ids cuyo panel de Ajustes sabe abrir esta app aquí.
    pub paneles: Vec<String>,
    /// Linux: lo que mide la lista del nodo. En el resto de sistemas no viene.
    pub linux: Option<EstadoLinux>,
}

/// Estados de Android a partir de lo que escribió Kotlin (los campos nuevos de PER1111S son opcionales:
/// un APK anterior no los escribe y entonces no se dice nada de ellos). Pura.
pub fn estados_android(s: Option<&crate::android::ServicioAndroid>) -> BTreeMap<String, String> {
    let mut m = BTreeMap::new();
    let Some(s) = s else { return m };
    let b = |v: bool| if v { "concedido" } else { "no-concedido" }.to_string();
    m.insert("microfono".into(), b(s.microfono));
    m.insert("camara".into(), b(s.camara));
    m.insert("notificaciones".into(), b(s.notificaciones));
    m.insert("instalar".into(), b(s.instalar_apps));
    m.insert("bateria".into(), b(s.bateria_exenta));
    for (id, v) in [
        ("superposicion", s.superposicion),
        ("no-molestar", s.no_molestar),
        ("escribir-ajustes", s.escribir_ajustes),
        ("todos-archivos", s.todos_archivos),
        ("ubicacion", s.ubicacion),
    ] {
        if let Some(v) = v {
            m.insert(id.into(), b(v));
        }
    }
    m
}

/// Lo que es igual en todos los sistemas: leer las capacidades del aparato no pide nada.
fn comunes(m: &mut BTreeMap<String, String>) {
    m.insert("capacidades".into(), "no-aplica".into());
}

fn paneles_de(plataforma: &str) -> Vec<String> {
    const IDS: [&str; 23] = [
        "accesibilidad", "pantalla", "monitor-entrada", "automatizacion", "disco-completo", "bluetooth", "microfono",
        "camara", "ubicacion-wifi", "red-local", "notificaciones", "arranque", "superposicion", "no-molestar",
        "escribir-ajustes", "todos-archivos", "bateria", "app", "instalar", "ubicacion",
        "carpetas", "llamadas", "ajustes-restringidos",
    ];
    IDS.iter().filter(|id| panel(plataforma, id).is_some()).map(|s| s.to_string()).collect()
}

/* ══════════ LNX1118WD · el nodo Linux: qué falta y cómo dejarlo listo ══════════ */

/// Grupos que el nodo necesita: red, Bluetooth, audio y vídeo, botón y teclado virtuales y serie.
pub const GRUPOS_NODO: [&str; 8] = ["netdev", "bluetooth", "audio", "video", "render", "input", "plugdev", "dialout"];

/// Lo que la lista de Linux mide de verdad. Todo lo decide `evaluar_linux` (puro, probado sin sistema).
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct EstadoLinux {
    /// Grupos de la cuenta que corre la app, sin repetir.
    pub grupos: Vec<String>,
    /// Grupos del nodo que faltan.
    pub faltan_grupos: Vec<String>,
    /// «listo» | «sin-grupo» | «sin-regla» | «sin-dispositivo» (de `ls -l /dev/uinput`).
    pub uinput: String,
    /// «activo» | «apagado» | «sin-servicio» (de `systemctl is-active bluetooth`).
    pub bluetooth: String,
    /// Existe la regla de polkit que deja al grupo netdev gestionar NetworkManager.
    pub polkit: bool,
    /// Elementos de GStreamer que faltan (vacío = todo).
    pub faltan_gstreamer: Vec<String>,
    /// false: no hay `gst-inspect-1.0` y no se acusa a nadie.
    pub gstreamer_sabido: bool,
    /// No queda nada que preparar.
    pub preparado: bool,
    /// El interruptor «Neurona nodo: no apagar pantalla ni bloquear» está puesto (autostart del guion).
    pub sin_reposo: bool,
    /// Qué arregla «Preparar este Linux», en el orden en que lo hace el guion.
    pub pendiente: Vec<String>,
}

fn sumar_grupo(v: &mut Vec<String>, nombre: &str) {
    let n = nombre.trim();
    if n.is_empty() || !n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return;
    }
    if !v.iter().any(|x| x.eq_ignore_ascii_case(n)) {
        v.push(n.to_string());
    }
}

/// Grupos de la salida de `id` (`uid=1000(yo) gid=1000(yo) grupos=1000(yo),27(sudo)`) o de `id -nG` (`yo sudo`). Pura.
pub fn grupos_de(salida: &str) -> Vec<String> {
    let mut nombres: Vec<String> = Vec::new();
    for trozo in salida.split('(').skip(1) {
        if let Some((nombre, _)) = trozo.split_once(')') {
            sumar_grupo(&mut nombres, nombre);
        }
    }
    if nombres.is_empty() {
        for trozo in salida.split(|c: char| c.is_whitespace() || c == ',') {
            sumar_grupo(&mut nombres, trozo);
        }
    }
    nombres
}

/// Estado de `/dev/uinput` desde `ls -l /dev/uinput` y los grupos del usuario. Pura.
pub fn uinput_de(salida: &str, grupos: &[String]) -> String {
    let linea = salida.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let minus = linea.to_ascii_lowercase();
    if linea.is_empty() || minus.contains("no such file") || minus.contains("no existe") || minus.starts_with("ls:") {
        return "sin-dispositivo".into();
    }
    let campos: Vec<&str> = linea.split_whitespace().collect();
    let permisos: Vec<char> = campos.first().copied().unwrap_or("").chars().collect();
    let grupo = campos.get(3).copied().unwrap_or("");
    if !grupos.iter().any(|g| g.eq_ignore_ascii_case("input")) {
        return "sin-grupo".into();
    }
    let lectura = permisos.get(4) == Some(&'r');
    let escritura = permisos.get(5) == Some(&'w');
    if !grupo.eq_ignore_ascii_case("input") || !lectura || !escritura {
        return "sin-regla".into();
    }
    "listo".into()
}

/// Estado del servicio Bluetooth desde `systemctl is-active bluetooth`. Pura.
pub fn bluetooth_de(salida: &str) -> String {
    match salida.trim().to_ascii_lowercase().as_str() {
        "active" | "activo" => "activo".into(),
        "inactive" | "failed" | "activating" | "deactivating" => "apagado".into(),
        _ => "sin-servicio".into(),
    }
}

/// Qué falta para que este Linux sea nodo, con las salidas reales del sistema. Pura: se prueba con ejemplos.
/// `faltan_gstreamer`: `None` = no se pudo averiguar (no se acusa a nadie); `Some(&[])` = está todo.
pub fn evaluar_linux(
    salida_id: &str,
    salida_uinput: &str,
    salida_bluetooth: &str,
    polkit: bool,
    faltan_gstreamer: Option<&[String]>,
) -> EstadoLinux {
    let grupos = grupos_de(salida_id);
    let faltan_grupos: Vec<String> = GRUPOS_NODO
        .iter()
        .filter(|g| !grupos.iter().any(|x| x.eq_ignore_ascii_case(g)))
        .map(|g| g.to_string())
        .collect();
    let uinput = uinput_de(salida_uinput, &grupos);
    let bluetooth = bluetooth_de(salida_bluetooth);
    let gst: Vec<String> = faltan_gstreamer.unwrap_or(&[]).to_vec();
    let mut pendiente: Vec<String> = Vec::new();
    if !faltan_grupos.is_empty() {
        pendiente.push(format!("Añadir tu cuenta a los grupos del nodo: {}.", faltan_grupos.join(", ")));
    }
    match uinput.as_str() {
        "sin-grupo" => pendiente.push("Entrar en el grupo input (botón y teclado virtuales).".into()),
        "sin-regla" => pendiente.push("Poner /dev/uinput para el grupo input (regla udev y módulo).".into()),
        "sin-dispositivo" => pendiente.push("Cargar el módulo uinput del núcleo (no hay /dev/uinput).".into()),
        _ => {}
    }
    if !polkit {
        pendiente.push("Dejar que el grupo netdev gestione NetworkManager (regla de polkit).".into());
    }
    match bluetooth.as_str() {
        "apagado" => pendiente.push("Encender el servicio Bluetooth.".into()),
        "sin-servicio" => pendiente.push("Instalar o habilitar el servicio Bluetooth.".into()),
        _ => {}
    }
    if faltan_gstreamer.is_some() && !gst.is_empty() {
        pendiente.push("Instalar gstreamer1.0-nice y gstreamer1.0-plugins-bad para las llamadas WebRTC.".into());
    }
    EstadoLinux {
        grupos,
        faltan_grupos,
        uinput,
        bluetooth,
        polkit,
        faltan_gstreamer: gst,
        gstreamer_sabido: faltan_gstreamer.is_some(),
        preparado: pendiente.is_empty(),
        sin_reposo: false,
        pendiente,
    }
}

/// El guion de preparación vive DENTRO de la app (se escribe en temporal al lanzarlo con pkexec).
pub const GUION_PREPARAR_LINUX: &str = include_str!("../recursos/preparar-linux.sh");

/// Lanza el guion con `pkexec`: el diálogo de autenticación del sistema ES el consentimiento de la persona.
#[cfg(target_os = "linux")]
fn lanzar_preparar(argumentos: &[&str]) -> Result<bool, String> {
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    // Carpetas del propio usuario (0700): nadie más puede plantar el guion que luego corre como root.
    let base = std::env::var_os("XDG_RUNTIME_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("starseed-nodo");
    std::fs::create_dir_all(&base).map_err(|e| format!("No se pudo preparar la carpeta del guion: {e}"))?;
    let _ = std::fs::set_permissions(&base, std::fs::Permissions::from_mode(0o700));
    let ruta = base.join(format!("preparar-linux-{}.sh", std::process::id()));
    let _ = std::fs::remove_file(&ruta);
    let mut fichero = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o700)
        .open(&ruta)
        .map_err(|e| format!("No se pudo escribir el guion: {e}"))?;
    fichero
        .write_all(GUION_PREPARAR_LINUX.as_bytes())
        .map_err(|e| format!("No se pudo escribir el guion: {e}"))?;
    drop(fichero);
    let estado = std::process::Command::new("pkexec")
        .arg(&ruta)
        .args(argumentos)
        .status()
        .map_err(|e| format!("No se pudo abrir el diálogo del sistema (pkexec): {e}"))?;
    let _ = std::fs::remove_file(&ruta);
    Ok(estado.success())
}

/// Lo que se mide en Linux al abrir la lista (sin red; gst solo si está instalado).
#[cfg(target_os = "linux")]
fn linux_estado() -> EstadoLinux {
    let salida = |programa: &str, args: &[&str]| {
        std::process::Command::new(programa)
            .args(args)
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default()
    };
    let id = salida("id", &["-nG"]);
    let uinput = salida("ls", &["-l", "/dev/uinput"]);
    let bluetooth = salida("systemctl", &["is-active", "bluetooth"]);
    let polkit = std::path::Path::new("/etc/polkit-1/rules.d/50-starseed-netdev.rules").exists();
    let webrtc = crate::permisos_medios::webrtc_linux_estado();
    let faltan: Vec<String> = webrtc
        .get("faltan")
        .and_then(|f| f.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let sabido = webrtc.get("sabido").and_then(|b| b.as_bool()).unwrap_or(false);
    let mut estado = evaluar_linux(&id, &uinput, &bluetooth, polkit, sabido.then_some(faltan.as_slice()));
    estado.sin_reposo = std::env::var_os("HOME")
        .map(|casa| std::path::Path::new(&casa).join(".config/autostart/starseed-sin-reposo.desktop").exists())
        .unwrap_or(false);
    estado
}

#[tauri::command]
pub fn permisos_sistema_estado() -> EstadoPermisosSistema {
    let plataforma = std::env::consts::OS.to_string();
    let mut estados = BTreeMap::new();
    comunes(&mut estados);
    #[allow(unused_mut)]
    let mut sesion = String::new();
    #[allow(unused_mut)]
    let mut linux: Option<EstadoLinux> = None;
    #[cfg(target_os = "macos")]
    macos::leer(&mut estados);
    #[cfg(target_os = "android")]
    {
        let servicio = crate::android::dir_datos().and_then(|d| crate::android::leer_servicio(&d));
        estados.extend(estados_android(servicio.as_ref()));
    }
    #[cfg(target_os = "linux")]
    {
        let s = sesion_linux(std::env::var("XDG_SESSION_TYPE").ok().as_deref(), std::env::var("WAYLAND_DISPLAY").ok().as_deref());
        sesion.push_str(s);
        // X11 no aísla nada: capturar la pantalla y mandar teclas no piden permiso (contrato §2.4).
        if s == "x11" {
            estados.insert("pantalla".into(), "no-aplica".into());
            estados.insert("accesibilidad".into(), "no-aplica".into());
        }
        // (LNX1118WD) Lo que este Linux necesita como nodo: grupos, /dev/uinput, Bluetooth, polkit y GStreamer.
        linux = Some(linux_estado());
    }
    #[cfg(target_os = "windows")]
    {
        // Una app de escritorio de Windows captura la pantalla y manda entrada sin pedir nada (salvo a
        // ventanas elevadas: UIPI). Contrato §2.3.
        estados.insert("pantalla".into(), "no-aplica".into());
        estados.insert("accesibilidad".into(), "no-aplica".into());
    }
    EstadoPermisosSistema { version: VERSION_PERMISOS_SISTEMA, paneles: paneles_de(&plataforma), plataforma, sesion, estados, linux }
}

/// Enseña el aviso del PROPIO sistema para `id` (solo los de `AVISOS_MACOS`). Devuelve si ya estaba concedido.
/// En Linux, `preparar-linux`, `sin-reposo` y `con-reposo` lanzan el guion con pkexec (su diálogo es el permiso).
#[tauri::command]
pub fn permisos_sistema_pedir(id: String) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        match id.as_str() {
            "preparar-linux" => return lanzar_preparar(&[]),
            "sin-reposo" => return lanzar_preparar(&["--solo-reposo", "--sin-reposo"]),
            "con-reposo" => return lanzar_preparar(&["--solo-reposo", "--con-reposo"]),
            _ => {}
        }
    }
    if !AVISOS_MACOS.contains(&id.as_str()) {
        return Err(format!("«{id}» no tiene un aviso del sistema que la app pueda enseñar: se abre su pantalla de Ajustes."));
    }
    #[cfg(target_os = "macos")]
    {
        macos::pedir(&id)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Estos avisos son de macOS.".into())
    }
}

/// Abre la pantalla de Ajustes del sistema donde se da (o se quita) el permiso `id`.
#[tauri::command]
pub fn permisos_sistema_abrir(id: String) -> Result<bool, String> {
    let plataforma = std::env::consts::OS;
    let destino = panel(plataforma, &id).ok_or_else(|| format!("No sé qué pantalla de Ajustes abrir para «{id}» en este sistema."))?;
    #[cfg(target_os = "android")]
    {
        let _ = destino;
        let accion = accion_panel_android(&id).ok_or("Pantalla de Android desconocida.")?;
        let dir = crate::android::dir_datos().ok_or("Este APK no trae el puente con Android para abrir sus ajustes.")?;
        let ahora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
        crate::android::pedir(&dir, &accion, ahora)?;
        Ok(true)
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .arg(destino)
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("No se pudieron abrir los Ajustes del Sistema: {e}"))
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(destino)
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("No se pudo abrir la Configuración de Windows: {e}"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "android")))]
    {
        let _ = destino;
        Err("Este sistema no tiene una pantalla de ajustes que la app sepa abrir.".into())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    //! Solo API públicas y documentadas de Apple, buscadas con `dlsym` para que un símbolo que falte en una
    //! versión vieja de macOS dé «sin dato» y no un cierre. Nada de esto concede: lee o pide el aviso.
    use std::collections::BTreeMap;
    use std::ffi::{c_char, c_void, CStr};

    use objc2::runtime::AnyClass;
    use objc2::{msg_send, sel};
    use objc2_foundation::NSString;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {}
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {}
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {}
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}
    #[link(name = "CoreLocation", kind = "framework")]
    extern "C" {}
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {}

    extern "C" {
        fn dlsym(handle: *mut c_void, simbolo: *const c_char) -> *mut c_void;
    }
    const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

    fn simbolo(nombre: &CStr) -> Option<*mut c_void> {
        let p = unsafe { dlsym(RTLD_DEFAULT, nombre.as_ptr()) };
        (!p.is_null()).then_some(p)
    }

    /// `kIOHIDRequestTypeListenEvent`.
    const ESCUCHAR_EVENTOS: u32 = 1;

    fn ax_confiable() -> Option<bool> {
        let f: extern "C" fn() -> bool = unsafe { std::mem::transmute(simbolo(c"AXIsProcessTrusted")?) };
        Some(f())
    }

    fn pantalla_concedida() -> Option<bool> {
        let f: extern "C" fn() -> bool = unsafe { std::mem::transmute(simbolo(c"CGPreflightScreenCaptureAccess")?) };
        Some(f())
    }

    fn iohid(tipo: u32) -> Option<u32> {
        let f: extern "C" fn(u32) -> u32 = unsafe { std::mem::transmute(simbolo(c"IOHIDCheckAccess")?) };
        Some(f(tipo))
    }

    fn clase_entero(clase: &CStr, selector: objc2::runtime::Sel, arg: Option<&str>) -> Option<i64> {
        let cls = AnyClass::get(clase)?;
        let responde: bool = unsafe { msg_send![cls, respondsToSelector: selector] };
        if !responde {
            return None;
        }
        Some(match arg {
            Some(a) => {
                let s = NSString::from_str(a);
                let n: isize = unsafe { msg_send![cls, authorizationStatusForMediaType: &*s] };
                n as i64
            }
            None if selector == sel!(authorization) => {
                let n: isize = unsafe { msg_send![cls, authorization] };
                n as i64
            }
            None => {
                let n: i32 = unsafe { msg_send![cls, authorizationStatus] };
                n as i64
            }
        })
    }

    pub fn leer(m: &mut BTreeMap<String, String>) {
        use super::{estado_de_autorizacion, estado_de_iohid};
        if let Some(ok) = ax_confiable() {
            // macOS no distingue «negado» de «nunca preguntado» en Accesibilidad.
            m.insert("accesibilidad".into(), if ok { "concedido" } else { "no-concedido" }.into());
        }
        if let Some(ok) = pantalla_concedida() {
            m.insert("pantalla".into(), if ok { "concedido" } else { "no-concedido" }.into());
        }
        if let Some(n) = iohid(ESCUCHAR_EVENTOS) {
            m.insert("monitor-entrada".into(), estado_de_iohid(n).into());
        }
        // AVMediaTypeAudio = «soun», AVMediaTypeVideo = «vide».
        if let Some(n) = clase_entero(c"AVCaptureDevice", sel!(authorizationStatusForMediaType:), Some("soun")) {
            m.insert("microfono".into(), estado_de_autorizacion(n).into());
        }
        if let Some(n) = clase_entero(c"AVCaptureDevice", sel!(authorizationStatusForMediaType:), Some("vide")) {
            m.insert("camara".into(), estado_de_autorizacion(n).into());
        }
        if let Some(n) = clase_entero(c"CBManager", sel!(authorization), None) {
            m.insert("bluetooth".into(), estado_de_autorizacion(n).into());
        }
        if let Some(n) = clase_entero(c"CLLocationManager", sel!(authorizationStatus), None) {
            m.insert("ubicacion-wifi".into(), estado_de_autorizacion(n).into());
            // (UBI1114K) El mismo permiso del sistema: «Localización» sirve a los nombres de Wi-Fi y al mapa.
            m.insert("ubicacion".into(), estado_de_autorizacion(n).into());
        }
        // Red local, notificaciones, automatización y acceso total al disco: macOS no da una lectura
        // pública (o la de notificaciones la da el plugin en la web). No se escribe nada: «desconocido».
    }

    /// Enseña el aviso del sistema. Devuelve si ya estaba concedido.
    pub fn pedir(id: &str) -> Result<bool, String> {
        match id {
            "accesibilidad" => {
                type CrearDic = extern "C" fn(*const c_void, *const *const c_void, *const *const c_void, isize, *const c_void, *const c_void) -> *const c_void;
                let crear: CrearDic = unsafe { std::mem::transmute(simbolo(c"CFDictionaryCreate").ok_or("Falta CoreFoundation.")?) };
                let liberar: extern "C" fn(*const c_void) = unsafe { std::mem::transmute(simbolo(c"CFRelease").ok_or("Falta CoreFoundation.")?) };
                let pedir: extern "C" fn(*const c_void) -> bool =
                    unsafe { std::mem::transmute(simbolo(c"AXIsProcessTrustedWithOptions").ok_or("Este macOS no tiene el aviso de Accesibilidad.")?) };
                // Las constantes son variables globales: dlsym da su DIRECCIÓN; se lee el puntero que guardan.
                let clave = unsafe { *(simbolo(c"kAXTrustedCheckOptionPrompt").ok_or("Falta la opción del aviso.")? as *const *const c_void) };
                let verdad = unsafe { *(simbolo(c"kCFBooleanTrue").ok_or("Falta CoreFoundation.")? as *const *const c_void) };
                let cb_claves = simbolo(c"kCFTypeDictionaryKeyCallBacks").ok_or("Falta CoreFoundation.")? as *const c_void;
                let cb_valores = simbolo(c"kCFTypeDictionaryValueCallBacks").ok_or("Falta CoreFoundation.")? as *const c_void;
                let claves = [clave];
                let valores = [verdad];
                let dic = crear(std::ptr::null(), claves.as_ptr(), valores.as_ptr(), 1, cb_claves, cb_valores);
                if dic.is_null() {
                    return Err("No se pudo preparar el aviso de Accesibilidad.".into());
                }
                let ok = pedir(dic);
                liberar(dic);
                Ok(ok)
            }
            "pantalla" => {
                let f: extern "C" fn() -> bool =
                    unsafe { std::mem::transmute(simbolo(c"CGRequestScreenCaptureAccess").ok_or("Este macOS no tiene el aviso de Grabación de pantalla.")?) };
                Ok(f())
            }
            "monitor-entrada" => {
                let f: extern "C" fn(u32) -> bool =
                    unsafe { std::mem::transmute(simbolo(c"IOHIDRequestAccess").ok_or("Este macOS no tiene el aviso de Monitorización de entrada.")?) };
                Ok(f(ESCUCHAR_EVENTOS))
            }
            _ => Err("Sin aviso del sistema para ese permiso.".into()),
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn paneles_de_macos_son_las_anclas_de_privacidad() {
        assert!(panel("macos", "accesibilidad").unwrap().ends_with("Privacy_Accessibility"));
        assert!(panel("macos", "pantalla").unwrap().ends_with("Privacy_ScreenCapture"));
        assert!(panel("macos", "monitor-entrada").unwrap().ends_with("Privacy_ListenEvent"));
        assert!(panel("macos", "disco-completo").unwrap().ends_with("Privacy_AllFiles"));
        for id in ["accesibilidad", "pantalla", "microfono", "camara", "bluetooth"] {
            assert!(panel("macos", id).unwrap().starts_with("x-apple.systempreferences:"), "{id}");
        }
        assert_eq!(panel("macos", "nada"), None);
        assert_eq!(panel("linux", "pantalla"), None, "Linux no tiene una dirección fiable");
    }

    #[test]
    fn paneles_de_windows() {
        assert_eq!(panel("windows", "microfono"), Some("ms-settings:privacy-microphone"));
        assert_eq!(panel("windows", "ubicacion-wifi"), Some("ms-settings:privacy-location"));
        assert_eq!(panel("windows", "accesibilidad"), None, "Windows no pide nada para mandar entrada");
    }

    #[test]
    fn paneles_de_android_solo_los_de_la_lista() {
        for id in PANELES_ANDROID {
            assert!(panel("android", id).is_some(), "{id}");
        }
        assert_eq!(accion_panel_android("superposicion").as_deref(), Some("panel:superposicion"));
        assert_eq!(accion_panel_android("bateria").as_deref(), Some("bateria"));
        assert_eq!(accion_panel_android("panel:x; rm"), None);
        assert_eq!(accion_panel_android("SUPERPOSICION"), None);
    }

    // FAC1116: las pantallas nuevas y lo que NO se promete.
    #[test]
    fn enlaces_directos_de_fac1116() {
        assert!(panel("macos", "carpetas").unwrap().ends_with("Privacy_FilesAndFolders"));
        for id in ["instalar", "llamadas", "ajustes-restringidos", "app", "accesibilidad"] {
            assert_eq!(accion_panel_android(id), Some(format!("panel:{id}")), "{id}");
        }
        // Nada que se abra con una dirección que acabe fuera de Ajustes: solo estos esquemas.
        for so in ["macos", "windows"] {
            for id in ["accesibilidad", "pantalla", "microfono", "camara", "bluetooth", "notificaciones", "arranque", "ubicacion", "carpetas", "red-local"] {
                if let Some(d) = panel(so, id) {
                    assert!(d.starts_with("x-apple.systempreferences:") || d.starts_with("ms-settings:"), "{so}/{id}: {d}");
                }
            }
        }
        // Windows no tiene pantalla para lo que no pide, ni Linux para nada: la web lo dice en vez de abrir otra.
        assert_eq!(panel("windows", "pantalla"), None);
        assert_eq!(panel("windows", "red-local"), None);
        for id in ["accesibilidad", "pantalla", "microfono", "notificaciones"] {
            assert_eq!(panel("linux", id), None);
        }
        // La lista que se manda a la web contiene los ids nuevos en Android y no en Linux.
        assert!(paneles_de("android").contains(&"ajustes-restringidos".to_string()));
        assert!(paneles_de("linux").is_empty());
    }

    #[test]
    fn sesion_de_linux() {
        assert_eq!(sesion_linux(Some("wayland"), None), "wayland");
        assert_eq!(sesion_linux(Some("X11"), Some("wayland-0")), "x11");
        assert_eq!(sesion_linux(None, Some("wayland-0")), "wayland");
        assert_eq!(sesion_linux(Some("tty"), None), "x11");
    }

    #[test]
    fn autorizaciones_de_apple() {
        assert_eq!(estado_de_autorizacion(0), "sin-preguntar");
        assert_eq!(estado_de_autorizacion(2), "denegado");
        assert_eq!(estado_de_autorizacion(3), "concedido");
        assert_eq!(estado_de_autorizacion(4), "concedido");
        assert_eq!(estado_de_iohid(0), "concedido");
        assert_eq!(estado_de_iohid(1), "denegado");
        assert_eq!(estado_de_iohid(2), "sin-preguntar");
        for e in [estado_de_autorizacion(9), estado_de_iohid(7)] {
            assert!(ESTADOS.contains(&e));
        }
    }

    #[test]
    fn android_viejo_no_dice_lo_que_no_mide() {
        let s: crate::android::ServicioAndroid = serde_json::from_str(r#"{"vivo":true,"microfono":true}"#).unwrap();
        let m = estados_android(Some(&s));
        assert_eq!(m.get("microfono").map(String::as_str), Some("concedido"));
        assert_eq!(m.get("camara").map(String::as_str), Some("no-concedido"));
        assert!(!m.contains_key("superposicion"), "un APK sin PER1111S no mide la superposición");
        let s2: crate::android::ServicioAndroid = serde_json::from_str(r#"{"superposicion":true,"todos_archivos":false}"#).unwrap();
        let m2 = estados_android(Some(&s2));
        assert_eq!(m2.get("superposicion").map(String::as_str), Some("concedido"));
        assert_eq!(m2.get("todos-archivos").map(String::as_str), Some("no-concedido"));
        assert!(estados_android(None).is_empty());
    }

    #[test]
    fn estado_honesto_en_este_sistema() {
        let e = permisos_sistema_estado();
        assert_eq!(e.version, VERSION_PERMISOS_SISTEMA);
        assert_eq!(e.estados.get("capacidades").map(String::as_str), Some("no-aplica"));
        for v in e.estados.values() {
            assert!(ESTADOS.contains(&v.as_str()), "{v}");
        }
        #[cfg(target_os = "linux")]
        assert!(e.sesion == "x11" || e.sesion == "wayland");
    }

    #[test]
    fn pedir_solo_avisos_del_sistema() {
        assert!(permisos_sistema_pedir("disco-completo".into()).unwrap_err().contains("Ajustes"));
        #[cfg(not(target_os = "macos"))]
        assert!(permisos_sistema_pedir("accesibilidad".into()).is_err());
    }
}

/// LNX1118WD · el nodo Linux: todo lo que se decide se prueba aquí con salidas de ejemplo del sistema.
#[cfg(test)]
mod pruebas_linux {
    use super::*;

    #[test]
    fn grupos_de_las_dos_formas() {
        let id = "uid=1000(alex) gid=1000(alex) grupos=1000(alex),24(cdrom),27(sudo),44(video),109(netdev)";
        let g = grupos_de(id);
        for n in ["alex", "cdrom", "sudo", "video", "netdev"] {
            assert!(g.contains(&n.to_string()), "falta {n}: {g:?}");
        }
        assert!(!g.contains(&"1000".to_string()), "el número de uid no es un grupo");
        assert_eq!(grupos_de("alex sudo netdev video"), vec!["alex", "sudo", "netdev", "video"]);
        assert!(grupos_de("").is_empty());
        assert_eq!(grupos_de("1000(uno),1000(uno)"), vec!["uno"], "sin repetir");
    }

    #[test]
    fn uinput_necesita_grupo_y_regla() {
        let con_input = grupos_de("alex input video");
        let sin_input = grupos_de("alex video");
        let bueno = "crw-rw---- 1 root input 10, 223 nov 18 22:00 /dev/uinput";
        assert_eq!(uinput_de(bueno, &con_input), "listo");
        assert_eq!(uinput_de(bueno, &sin_input), "sin-grupo");
        assert_eq!(uinput_de("crw-rw---- 1 root root 10, 223 nov 18 22:00 /dev/uinput", &con_input), "sin-regla");
        assert_eq!(uinput_de("crw------- 1 root root 10, 223 nov 18 22:00 /dev/uinput", &con_input), "sin-regla");
        let falta = "ls: no se puede acceder a '/dev/uinput': No such file or directory";
        assert_eq!(uinput_de(falta, &con_input), "sin-dispositivo");
        assert_eq!(uinput_de("", &con_input), "sin-dispositivo");
    }

    #[test]
    fn bluetooth_del_servicio() {
        assert_eq!(bluetooth_de("active\n"), "activo");
        assert_eq!(bluetooth_de("inactive"), "apagado");
        assert_eq!(bluetooth_de("failed"), "apagado");
        assert_eq!(bluetooth_de("unknown"), "sin-servicio");
        assert_eq!(bluetooth_de(""), "sin-servicio");
    }

    #[test]
    fn evaluar_linux_dice_lo_que_falta() {
        let id = "uid=1000(alex) gid=1000(alex) grupos=1000(alex)";
        let faltan = vec!["webrtcbin".to_string()];
        let e = evaluar_linux(id, "ls: no such file", "inactive", false, Some(&faltan));
        assert_eq!(e.faltan_grupos.len(), GRUPOS_NODO.len());
        assert_eq!(e.uinput, "sin-dispositivo");
        assert_eq!(e.bluetooth, "apagado");
        assert!(!e.preparado);
        assert!(e.pendiente.iter().any(|p| p.contains("grupos del nodo")));
        assert!(e.pendiente.iter().any(|p| p.contains("gstreamer1.0-nice")));
        assert!(e.pendiente.iter().any(|p| p.contains("polkit")));
    }

    #[test]
    fn un_linux_ya_preparado_no_tiene_pendientes() {
        let id = "uid=1000(alex) gid=1000(alex) grupos=1000(alex),109(netdev),110(bluetooth),29(audio),44(video),107(render),111(input),46(plugdev),20(dialout)";
        let uinput = "crw-rw---- 1 root input 10, 223 nov 18 22:00 /dev/uinput";
        let e = evaluar_linux(id, uinput, "active", true, Some(&[]));
        assert!(e.faltan_grupos.is_empty(), "{:?}", e.faltan_grupos);
        assert!(e.gstreamer_sabido);
        assert!(e.preparado, "{:?}", e.pendiente);
        assert!(e.pendiente.is_empty());
        // Sin `gst-inspect-1.0` no se acusa a nadie: `None` no bloquea.
        let sin_dato = evaluar_linux(id, uinput, "active", true, None);
        assert!(sin_dato.preparado);
        assert!(!sin_dato.gstreamer_sabido);
    }

    #[test]
    fn el_guion_va_dentro_de_la_app_y_es_idempotente() {
        assert!(GUION_PREPARAR_LINUX.contains("usermod -aG"));
        assert!(GUION_PREPARAR_LINUX.contains("GRUPOS=\"netdev bluetooth audio video render input plugdev dialout\""));
        assert!(GUION_PREPARAR_LINUX.contains("--sin-reposo"));
        assert!(GUION_PREPARAR_LINUX.contains("--solo-reposo"));
        assert!(GUION_PREPARAR_LINUX.contains("PKEXEC_UID"));
        assert!(GUION_PREPARAR_LINUX.contains("gstreamer1.0-nice"));
        assert!(GUION_PREPARAR_LINUX.contains("Cierra sesión"));
        assert!(GUION_PREPARAR_LINUX.contains("50-starseed-netdev.rules"));
        assert!(GUION_PREPARAR_LINUX.contains("99-starseed-uinput.rules"));
    }
}

