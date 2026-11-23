// ═══════════════════════════════════════════════════════════════════════════
// entorno_hijos — limpieza del entorno para procesos hijos en AppImage (LNX1118WA).
// ---------------------------------------------------------------------------
// Dentro de una AppImage, LD_LIBRARY_PATH y compañía apuntan a /tmp/.mount_*/usr/lib
// y los programas del sistema que lanza la app cargan bibliotecas ajenas y fallan.
// Este módulo provee una función pura que, si existe APPIMAGE o APPDIR, quita
// las variables problemáticas y limpia PATH y XDG_DATA_DIRS de entradas dentro
// de APPDIR. Fuera de una AppImage no toca nada.
// Solo std: se prueba sin Tauri.
// ═══════════════════════════════════════════════════════════════════════════

use std::path::Path;

/// Variables que se eliminan completamente cuando se detecta APPIMAGE o APPDIR.
const VARIABLES_QUITAR: &[&str] = &[
    "LD_LIBRARY_PATH",
    "LD_PRELOAD",
    "GST_PLUGIN_PATH",
    "GST_PLUGIN_PATH_1_0",
    "GST_PLUGIN_SYSTEM_PATH",
    "GST_PLUGIN_SYSTEM_PATH_1_0",
    "GST_PLUGIN_SCANNER",
    "GST_PLUGIN_SCANNER_1_0",
    "GIO_MODULE_DIR",
    "GDK_PIXBUF_MODULE_FILE",
    "GTK_PATH",
    "GTK_EXE_PREFIX",
    "PYTHONHOME",
    "PYTHONPATH",
];

/// Variables de tipo «lista de rutas» que se filtran para quitar entradas dentro de APPDIR.
const VARIABLES_FILTRAR: &[&str] = &["PATH", "XDG_DATA_DIRS"];

/// Detecta si estamos dentro de una AppImage (`APPDIR` primero por ser la raíz montada;
/// `APPIMAGE` como respaldo).
pub fn appdir_actual() -> Option<String> {
    std::env::var("APPDIR")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| std::env::var("APPIMAGE").ok().filter(|s| !s.trim().is_empty()))
}

/// Limpia una variable de tipo lista de rutas (PATH, XDG_DATA_DIRS) quitando
/// las entradas que empiezan por `appdir`.
fn filtrar_lista(valor: &str, appdir: &Path) -> String {
    let prefijo = appdir.to_string_lossy();
    valor
        .split(':')
        .filter(|p| !p.starts_with(&*prefijo))
        .collect::<Vec<_>>()
        .join(":")
}

/// Función pura: dada una lista de (clave, valor_opcional) del entorno y el APPDIR,
/// devuelve el entorno limpio para pasar a un proceso hijo.
///
/// - Si no hay APPIMAGE ni APPDIR, devuelve `vars` sin cambios.
/// - Si hay APPIMAGE/APPDIR:
///   * Devuelve `(clave, None)` para las variables en `VARIABLES_QUITAR` para que el
///     llamador ejecute `cmd.env_remove(clave)`.
///   * Filtra `PATH` y `XDG_DATA_DIRS` quitando entradas dentro de `appdir`.
///   * El resto de variables pasa sin cambios.
pub fn limpiar_entorno(
    vars: Vec<(String, Option<String>)>,
    appdir: &Path,
) -> Vec<(String, Option<String>)> {
    let Some(appdir_str) = appdir_actual() else {
        return vars;
    };
    let appdir_path = Path::new(&appdir_str);
    // Si el APPDIR pasado no coincide con el detectado, no hacemos nada (seguridad).
    if appdir_path != appdir {
        return vars;
    }

    vars.into_iter()
        .filter_map(|(k, v)| {
            if VARIABLES_QUITAR.contains(&k.as_str()) {
                Some((k, None)) // se marca explícitamente para env_remove
            } else if VARIABLES_FILTRAR.contains(&k.as_str()) {
                v.map(|val| (k, Some(filtrar_lista(&val, appdir))))
            } else {
                Some((k, v))
            }
        })
        .collect()
}

/// Limpia las variables heredadas de la AppImage sobre un `Command` del sistema.
pub fn aplicar_a_comando(cmd: &mut std::process::Command) {
    let Some(appdir) = appdir_actual() else {
        return;
    };
    let vars: Vec<(String, Option<String>)> = std::env::vars().map(|(k, v)| (k, Some(v))).collect();
    for (k, v) in limpiar_entorno(vars, Path::new(&appdir)) {
        if let Some(val) = v {
            cmd.env(k, val);
        } else {
            cmd.env_remove(k);
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};

    fn candado_env() -> std::sync::MutexGuard<'static, ()> {
        static L: OnceLock<Mutex<()>> = OnceLock::new();
        L.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner())
    }

    #[test]
    fn fuera_de_appimage_no_toca_nada() {
        let _g = candado_env();
        let prev_dir = std::env::var_os("APPDIR");
        let prev_img = std::env::var_os("APPIMAGE");
        std::env::remove_var("APPDIR");
        std::env::remove_var("APPIMAGE");
        let vars = vec![
            ("LD_LIBRARY_PATH".into(), Some("/usr/lib".into())),
            ("PATH".into(), Some("/usr/bin:/bin".into())),
            ("OTRA".into(), Some("valor".into())),
        ];
        let resultado = limpiar_entorno(vars.clone(), Path::new("/tmp/.mount_xxx"));
        if let Some(v) = prev_dir { std::env::set_var("APPDIR", v); }
        if let Some(v) = prev_img { std::env::set_var("APPIMAGE", v); }
        assert_eq!(resultado, vars);
    }

    #[test]
    fn dentro_de_appimage_quita_variables_problematicas() {
        let _g = candado_env();
        let prev_dir = std::env::var_os("APPDIR");
        let prev_img = std::env::var_os("APPIMAGE");
        let appdir = PathBuf::from("/tmp/.mount_test");
        std::env::set_var("APPDIR", &appdir);
        // Aunque exista APPIMAGE apuntando al archivo, APPDIR debe mandar.
        std::env::set_var("APPIMAGE", "/home/alex/StarSeed.AppImage");

        let vars = vec![
            ("LD_LIBRARY_PATH".into(), Some("/tmp/.mount_test/usr/lib".into())),
            ("LD_PRELOAD".into(), Some("/tmp/.mount_test/usr/lib/foo.so".into())),
            ("GST_PLUGIN_PATH".into(), Some("/tmp/.mount_test/lib/gstreamer".into())),
            ("PATH".into(), Some("/tmp/.mount_test/usr/bin:/usr/bin:/bin".into())),
            ("XDG_DATA_DIRS".into(), Some("/tmp/.mount_test/usr/share:/usr/share".into())),
            ("OTRA".into(), Some("valor".into())),
        ];

        let resultado = limpiar_entorno(vars, Path::new(&appdir_actual().unwrap()));

        if let Some(v) = prev_dir { std::env::set_var("APPDIR", v); } else { std::env::remove_var("APPDIR"); }
        if let Some(v) = prev_img { std::env::set_var("APPIMAGE", v); } else { std::env::remove_var("APPIMAGE"); }

        // Variables marcadas con None para que los llamadores hagan env_remove(k)
        assert_eq!(resultado.iter().find(|(k, _)| k == "LD_LIBRARY_PATH").and_then(|(_, v)| v.as_ref()), None);
        assert!(resultado.iter().any(|(k, v)| k == "LD_LIBRARY_PATH" && v.is_none()));
        assert!(resultado.iter().any(|(k, v)| k == "LD_PRELOAD" && v.is_none()));
        assert!(resultado.iter().any(|(k, v)| k == "GST_PLUGIN_PATH" && v.is_none()));

        // PATH filtrado
        let path = resultado.iter().find(|(k, _)| k == "PATH").map(|(_, v)| v.clone().unwrap());
        assert_eq!(path, Some("/usr/bin:/bin".into()));

        // XDG_DATA_DIRS filtrado
        let xdg = resultado
            .iter()
            .find(|(k, _)| k == "XDG_DATA_DIRS")
            .map(|(_, v)| v.clone().unwrap());
        assert_eq!(xdg, Some("/usr/share".into()));

        // Otras variables pasan
        assert!(resultado.iter().any(|(k, v)| k == "OTRA" && v.as_deref() == Some("valor")));
    }

    #[test]
    fn filtrar_lista_quita_entradas_dentro_de_appdir() {
        let appdir = Path::new("/tmp/.mount_app");
        let valor = "/tmp/.mount_app/usr/bin:/usr/bin:/tmp/.mount_app/bin:/bin";
        assert_eq!(filtrar_lista(valor, appdir), "/usr/bin:/bin");
    }

    #[test]
    fn filtrar_lista_sin_entradas_appdir_no_cambia() {
        let appdir = Path::new("/tmp/.mount_app");
        let valor = "/usr/bin:/bin:/usr/local/bin";
        assert_eq!(filtrar_lista(valor, appdir), "/usr/bin:/bin:/usr/local/bin");
    }

    #[test]
    fn filtrar_lista_vacio() {
        let appdir = Path::new("/tmp/.mount_app");
        assert_eq!(filtrar_lista("", appdir), "");
    }
}