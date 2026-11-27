// ═══════════════════════════════════════════════════════════════════════════
// aparato_huella — huella nativa del aparato (SHA-256 + sal propia de la app)
// ---------------------------------------------------------------------------
// Obtiene el identificador nativo del aparato y lo hashea con SHA-256 más una sal
// propia de la app. Nunca devuelve el valor en claro.
// Guarda la huella junto al id de neurona.
// Al arrancar, si la huella guardada no es la de este aparato, NO se adopta nada solo:
// se marca "aparato nuevo" para la ventana de NEU1125B.
// Contrato: NEU1125A-d1 §2, architecture/neuronas-un-aparato.md.
// ═══════════════════════════════════════════════════════════════════════════

use p256::elliptic_curve::rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Manager;

const ARCHIVO_SAL: &str = "sal-aparato.bin";
const ARCHIVO_HUELLA: &str = "huella-aparato.json";

/// Estado de la huella del aparato.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HuellaEstado {
    pub huella: Option<String>,
    pub id_guardado: Option<String>,
    pub creado: Option<String>,
}

/// La sal propia de la app (se genera una vez y se guarda en un archivo 0600).
fn obtener_sal(app: &tauri::AppHandle) -> Result<String, String> {
    let Some(ruta_sal) = app.path().app_data_dir().ok().map(|d| d.join(ARCHIVO_SAL)) else {
        return Err("sin-ruta-datos".into());
    };

    if ruta_sal.exists() {
        std::fs::read_to_string(&ruta_sal)
            .map_err(|e| format!("Leer sal: {e}"))
            .map(|s| s.trim().to_string())
    } else {
        use std::fs;
        let mut sal_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut sal_bytes);
        let sal_hex: String = sal_bytes.iter().map(|b| format!("{:02x}", b)).collect();
        fs::write(&ruta_sal, &sal_hex).map_err(|e| format!("Escribir sal: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&ruta_sal).map_err(|e| format!("Metadata: {e}"))?.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&ruta_sal, perms).map_err(|e| format!("Permisos 0600: {e}"))?;
        }
        Ok(sal_hex)
    }
}

/// Obtiene el ANDROID_ID nativo (Settings.Secure.ANDROID_ID).
/// En otras plataformas, devuelve error (no hay equivalente nativo).
fn obtener_id_android(app: &tauri::AppHandle) -> Result<String, String> {
    // (DIR1127D) `tauri_plugin_android` no existe en este proyecto y rompía la compilación de la .65 en Android.
    // Hasta que haya un puente Kotlin para Settings.Secure.ANDROID_ID, Android no tiene huella nativa y lo
    // dice: la web decide con su propia huella y nunca se adopta nada solo.
    #[cfg(target_os = "android")]
    {
        let _ = app;
        Err("ANDROID_ID aún sin puente nativo en esta versión".into())
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Solo Android tiene ANDROID_ID".into())
    }
}

/// Calcula SHA-256(id + sal) y devuelve hex lowercase de 64 chars.
fn calcular_huella(id: &str, sal: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(id.as_bytes());
    hasher.update(sal.as_bytes());
    let resultado = hasher.finalize();
    format!("{:064x}", resultado)
}

/// Ruta del archivo de huella.
fn ruta_huella(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(ARCHIVO_HUELLA))
}

/// Guarda la huella en disco.
fn guardar_huella(app: &tauri::AppHandle, huella: &str, id: &str) -> Result<(), String> {
    let ruta = ruta_huella(app).ok_or("Sin ruta de datos")?;
    if let Some(parent) = ruta.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Crear directorio: {e}"))?;
    }
    let ahora = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string());
    let estado = HuellaEstado {
        huella: Some(huella.to_string()),
        id_guardado: Some(id.to_string()),
        creado: Some(ahora),
    };
    let texto = serde_json::to_string(&estado).map_err(|e| format!("Serializar: {e}"))?;
    std::fs::write(&ruta, texto).map_err(|e| format!("Escribir huella: {e}"))?;
    Ok(())
}

/// Lee la huella guardada en disco.
fn leer_huella(app: &tauri::AppHandle) -> Result<Option<HuellaEstado>, String> {
    let ruta = ruta_huella(app).ok_or_else(|| "sin-ruta-datos".to_string())?;
    if !ruta.exists() {
        return Ok(None);
    }
    let texto = std::fs::read_to_string(&ruta).map_err(|e| format!("Leer huella: {e}"))?;
    let estado: HuellaEstado = serde_json::from_str(&texto).map_err(|e| format!("Parse: {e}"))?;
    Ok(Some(estado))
}

/// Genera la huella nativa del aparato (solo Android).
pub async fn generar_huella(app: tauri::AppHandle) -> Result<HuellaEstado, String> {
    let sal = obtener_sal(&app)?;
    let id = obtener_id_android(&app)?;
    let huella = calcular_huella(&id, &sal);
    guardar_huella(&app, &huella, &id)?;
    Ok(HuellaEstado {
        huella: Some(huella),
        id_guardado: Some(id),
        creado: None,
    })
}

/// Devuelve la huella actual del aparato.
pub async fn huella_actual(app: tauri::AppHandle) -> Result<Option<HuellaEstado>, String> {
    leer_huella(&app)
}

/// Verifica si la huella actual coincide con la guardada.
pub async fn verificar_huella(app: tauri::AppHandle) -> Result<bool, String> {
    match leer_huella(&app)? {
        Some(estado) => {
            // Verificar que el id guardado coincide con el actual
            match obtener_id_android(&app) {
                Ok(id_actual) => Ok(estado.id_guardado.as_deref() == Some(&id_actual)),
                Err(_) => Ok(false),
            }
        }
        None => Ok(false),
    }
}

// ───────────────────────── Comandos Tauri ─────────────────────────

/// Genera y guarda la huella nativa del aparato (SHA-256 + sal propia).
/// Solo disponible en Android. Devuelve error en otras plataformas.
#[tauri::command]
pub async fn huella_aparato_generar(app: tauri::AppHandle) -> Result<HuellaEstado, String> {
    generar_huella(app).await
}

/// Devuelve la huella actual del aparato (hasheada con sal propia).
#[tauri::command]
pub async fn huella_aparato_actual(app: tauri::AppHandle) -> Result<Option<HuellaEstado>, String> {
    huella_actual(app).await
}

/// Verifica si la huella del aparato coincide con la guardada.
/// Retorna true si la huella es válida para este aparato, false si es nueva.
#[tauri::command]
pub async fn huella_aparato_verificar(app: tauri::AppHandle) -> Result<bool, String> {
    verificar_huella(app).await
}