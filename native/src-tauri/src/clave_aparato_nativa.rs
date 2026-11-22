// ═══════════════════════════════════════════════════════════════════════════
// clave_aparato_nativa — clave del aparato nativa (ECDSA P-256) para Linux (WebKitGTK) y Windows (WebView2)
// cuando WebCrypto/IndexedDB no están disponibles o el contexto no es seguro.
// La clave privada NUNCA sale del aparato: se guarda en el llavero del sistema (Secret Service / Credential Manager)
// o, si no hay, en un archivo 0600 dentro de los datos de la app.
// Contrato: GEN1114 §3.2, §3.3, §3.4 — misma interfaz que firma-aparato.ts pero en Rust.
// ═══════════════════════════════════════════════════════════════════════════

use crate::nativa::es_starseed_os;
use base64::Engine;
use p256::NistP256;
use p256::ecdsa::{Signature, SigningKey, VerifyingKey, signature::Signer};
use p256::elliptic_curve::{PublicKey, SecretKey, rand_core::OsRng};
use p256::pkcs8::{DecodePrivateKey, EncodePrivateKey, EncodePublicKey};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

const ARCHIVO_CLAVE: &str = "clave-aparato-nativa.bin";
const ARCHIVO_METADATOS: &str = "clave-aparato-nativa-meta.json";
const ALGORITMO: &str = "ECDSA-P256";

/// Estado de la clave nativa del aparato.
#[derive(Serialize, Clone, Debug)]
pub struct ClaveAparatoEstado {
    pub existe: bool,
    pub huella: Option<String>,
    pub spki_b64url: Option<String>,
    pub nombre: Option<String>,
    pub cuenta: Option<String>,
    pub creado: Option<String>,
    pub algoritmo: String,
    pub almacen: String, // "secret-service" | "credential-manager" | "archivo-0600"
}

/// Metadatos guardados junto a la clave (no secretos).
#[derive(Serialize, Deserialize, Clone, Debug)]
struct MetadatosClave {
    nombre: String,
    cuenta: String,
    creado: String,
    algoritmo: String,
    almacen: String,
}

/// La clave privada en memoria (solo para firmar, nunca se exporta).
struct ClavePrivadaMemoria {
    signing_key: SigningKey,
    metadatos: MetadatosClave,
}

static CLAVE_MEMORIA: OnceLock<Mutex<Option<ClavePrivadaMemoria>>> = OnceLock::new();

fn clave_memoria() -> &'static Mutex<Option<ClavePrivadaMemoria>> {
    CLAVE_MEMORIA.get_or_init(|| Mutex::new(None))
}

/// Ruta del archivo de clave (fallback cuando no hay llavero del sistema).
fn ruta_archivo_clave(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(ARCHIVO_CLAVE))
}

fn ruta_archivo_metadatos(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(ARCHIVO_METADATOS))
}

/// Intenta guardar la clave privada en el llavero del sistema.
/// Devuelve `Ok(almacen_usado)` si tuvo éxito, `Err(motivo)` si falló.
#[cfg(target_os = "linux")]
fn guardar_en_llavero(app: &AppHandle, clave_der: &[u8], metadatos: &MetadatosClave) -> Result<String, String> {
    use secret_service::blocking::{EncryptionType, SecretService};
    use std::collections::HashMap;

    let ss = SecretService::connect(EncryptionType::Dh)
        .map_err(|e| format!("Secret Service no disponible: {e}"))?;
    let collection = ss
        .get_default_collection()
        .map_err(|e| format!("Colección por defecto: {e}"))?;
    collection
        .unlock()
        .map_err(|e| format!("Desbloquear colección: {e}"))?;

    let attrs = HashMap::from([
        ("app", "starseed-os"),
        ("kind", "clave-aparato"),
        ("nombre", metadatos.nombre.as_str()),
        ("cuenta", metadatos.cuenta.as_str()),
    ]);

    let _ = collection
        .create_item(
            &format!("StarSeed OS · Clave de aparato ({})", metadatos.nombre),
            attrs,
            clave_der,
            true,
            "application/octet-stream",
        )
        .map_err(|e| format!("Crear item en Secret Service: {e}"))?;

    // Guardar metadatos en archivo (no secretos)
    if let Some(ruta_meta) = ruta_archivo_metadatos(app) {
        if let Some(parent) = ruta_meta.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&ruta_meta, serde_json::to_vec(metadatos).unwrap_or_default()).ok();
    }

    Ok("secret-service".into())
}

#[cfg(target_os = "windows")]
fn guardar_en_llavero(app: &AppHandle, clave_der: &[u8], metadatos: &MetadatosClave) -> Result<String, String> {
    use windows::Security::Credentials::{PasswordCredential, PasswordVault};
    use windows::core::HSTRING;

    let vault = PasswordVault::new().map_err(|e| format!("Credential Manager no disponible: {e}"))?;
    let recurso = HSTRING::from("starseed-os/clave-aparato");
    let usuario = HSTRING::from(&metadatos.nombre);

    // Credential Manager espera contraseña como string; guardamos la clave DER en base64
    let clave_b64 = base64::engine::general_purpose::STANDARD.encode(clave_der);
    let cred = PasswordCredential::new().map_err(|e| format!("Crear credencial: {e}"))?;
    cred.SetResource(&recurso).map_err(|e| format!("Recurso: {e}"))?;
    cred.SetUserName(&usuario).map_err(|e| format!("Usuario: {e}"))?;
    cred.SetPassword(&HSTRING::from(clave_b64)).map_err(|e| format!("Contraseña: {e}"))?;

    vault.Add(&cred).map_err(|e| format!("Añadir a Credential Manager: {e}"))?;

    // Guardar metadatos en archivo
    if let Some(ruta_meta) = ruta_archivo_metadatos(app) {
        if let Some(parent) = ruta_meta.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&ruta_meta, serde_json::to_vec(metadatos).unwrap_or_default()).ok();
    }

    Ok("credential-manager".into())
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn guardar_en_llavero(_app: &AppHandle, _clave_der: &[u8], _metadatos: &MetadatosClave) -> Result<String, String> {
    Err("llavero-no-disponible".into())
}

/// Guarda la clave privada en un archivo 0600 (fallback).
fn guardar_en_archivo(app: &AppHandle, clave_der: &[u8], metadatos: &MetadatosClave) -> Result<String, String> {
    let Some(ruta_clave) = ruta_archivo_clave(app) else { return Err("sin-ruta-datos".into()); };
    let Some(ruta_meta) = ruta_archivo_metadatos(app) else { return Err("sin-ruta-datos".into()); };

    if let Some(parent) = ruta_clave.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Crear directorio: {e}"))?;
    }

    // Escribir clave con permisos 0600
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::write(&ruta_clave, clave_der).map_err(|e| format!("Escribir clave: {e}"))?;
        let mut perms = std::fs::metadata(&ruta_clave).map_err(|e| format!("Metadata: {e}"))?.permissions();
        perms.set_mode(0o600);
        std::fs::set_permissions(&ruta_clave, perms).map_err(|e| format!("Permisos 0600: {e}"))?;
    }
    #[cfg(not(unix))]
    {
        std::fs::write(&ruta_clave, clave_der).map_err(|e| format!("Escribir clave: {e}"))?;
    }

    // Metadatos
    std::fs::write(&ruta_meta, serde_json::to_vec(metadatos).unwrap_or_default()).map_err(|e| format!("Escribir metadatos: {e}"))?;

    Ok("archivo-0600".into())
}

/// Carga la clave privada desde el llavero del sistema.
#[cfg(target_os = "linux")]
fn cargar_desde_llavero(app: &AppHandle) -> Result<(SigningKey, MetadatosClave), String> {
    use secret_service::blocking::{EncryptionType, SecretService};
    use std::collections::HashMap;

    let ss = SecretService::connect(EncryptionType::Dh)
        .map_err(|e| format!("Secret Service no disponible: {e}"))?;
    let collection = ss
        .get_default_collection()
        .map_err(|e| format!("Colección por defecto: {e}"))?;
    collection
        .unlock()
        .map_err(|e| format!("Desbloquear colección: {e}"))?;

    let items = collection
        .search_items(HashMap::from([("app", "starseed-os"), ("kind", "clave-aparato")]))
        .map_err(|e| format!("Buscar items: {e}"))?;
    let item = items.into_iter().next().ok_or("Clave no encontrada en Secret Service")?;
    let _ = item.unlock();

    let clave_der = item.get_secret().map_err(|e| format!("Leer secreto: {e}"))?;
    let secret_key = SecretKey::<NistP256>::from_pkcs8_der(&clave_der).map_err(|e| format!("PKCS8 inválido: {e}"))?;
    let signing_key = SigningKey::from(secret_key);

    // Cargar metadatos
    let Some(ruta_meta) = ruta_archivo_metadatos(app) else { return Err("sin-metadatos".into()); };
    let meta_bytes = std::fs::read(&ruta_meta).map_err(|e| format!("Leer metadatos: {e}"))?;
    let metadatos: MetadatosClave = serde_json::from_slice(&meta_bytes).map_err(|e| format!("Metadatos inválidos: {e}"))?;

    Ok((signing_key, metadatos))
}

#[cfg(target_os = "windows")]
fn cargar_desde_llavero(app: &AppHandle) -> Result<(SigningKey, MetadatosClave), String> {
    use windows::Security::Credentials::PasswordVault;

    let vault = PasswordVault::new().map_err(|e| format!("Credential Manager no disponible: {e}"))?;
    let recurso = windows::core::HSTRING::from("starseed-os/clave-aparato");

    let creds = vault.RetrieveAll().map_err(|e| format!("Listar credenciales: {e}"))?;
    let mut encontrado = None;
    for cred in creds {
        if cred.Resource().ok().as_ref() == Some(&recurso) {
            encontrado = Some(cred);
            break;
        }
    }
    let cred = encontrado.ok_or("Clave no encontrada en Credential Manager")?;
    cred.RetrievePassword().map_err(|e| format!("Recuperar contraseña: {e}"))?;
    let clave_b64 = cred.Password().map_err(|e| format!("Leer contraseña: {e}"))?.to_string();
    let clave_der = base64::engine::general_purpose::STANDARD.decode(clave_b64).map_err(|e| format!("Base64 inválido: {e}"))?;

    let secret_key = SecretKey::<NistP256>::from_pkcs8_der(&clave_der).map_err(|e| format!("PKCS8 inválido: {e}"))?;
    let signing_key = SigningKey::from(secret_key);

    let Some(ruta_meta) = ruta_archivo_metadatos(app) else { return Err("sin-metadatos".into()); };
    let meta_bytes = std::fs::read(&ruta_meta).map_err(|e| format!("Leer metadatos: {e}"))?;
    let metadatos: MetadatosClave = serde_json::from_slice(&meta_bytes).map_err(|e| format!("Metadatos inválidos: {e}"))?;

    Ok((signing_key, metadatos))
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn cargar_desde_llavero(_app: &AppHandle) -> Result<(SigningKey, MetadatosClave), String> {
    Err("llavero-no-disponible".into())
}

/// Carga la clave privada desde archivo (fallback).
fn cargar_desde_archivo(app: &AppHandle) -> Result<(SigningKey, MetadatosClave), String> {
    let Some(ruta_clave) = ruta_archivo_clave(app) else { return Err("sin-ruta-clave".into()); };
    let Some(ruta_meta) = ruta_archivo_metadatos(app) else { return Err("sin-ruta-meta".into()); };

    let clave_der = std::fs::read(&ruta_clave).map_err(|e| format!("Leer clave: {e}"))?;
    let secret_key = SecretKey::<NistP256>::from_pkcs8_der(&clave_der).map_err(|e| format!("PKCS8 inválido: {e}"))?;
    let signing_key = SigningKey::from(secret_key);

    let meta_bytes = std::fs::read(&ruta_meta).map_err(|e| format!("Leer metadatos: {e}"))?;
    let metadatos: MetadatosClave = serde_json::from_slice(&meta_bytes).map_err(|e| format!("Metadatos inválidos: {e}"))?;

    Ok((signing_key, metadatos))
}

/// Borra la clave del llavero y/o archivo.
fn borrar_clave(app: &AppHandle) -> Result<(), String> {
    // Intentar borrar del llavero
    #[cfg(target_os = "linux")]
    {
        use secret_service::blocking::{EncryptionType, SecretService};
        use std::collections::HashMap;
        if let Ok(ss) = SecretService::connect(EncryptionType::Dh) {
            if let Ok(collection) = ss.get_default_collection() {
                let _ = collection.unlock();
                if let Ok(items) = collection.search_items(HashMap::from([("app", "starseed-os"), ("kind", "clave-aparato")])) {
                    for item in items {
                        let _ = item.unlock();
                        let _ = item.delete();
                    }
                }
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        use windows::Security::Credentials::PasswordVault;
        if let Ok(vault) = PasswordVault::new() {
            let recurso = windows::core::HSTRING::from("starseed-os/clave-aparato");
            if let Ok(creds) = vault.RetrieveAll() {
                for cred in creds {
                    if cred.Resource().ok().as_ref() == Some(&recurso) {
                        let _ = vault.Remove(&cred);
                    }
                }
            }
        }
    }

    // Borrar archivos
    if let Some(ruta_clave) = ruta_archivo_clave(app) { let _ = std::fs::remove_file(ruta_clave); }
    if let Some(ruta_meta) = ruta_archivo_metadatos(app) { let _ = std::fs::remove_file(ruta_meta); }

    // Limpiar memoria
    *clave_memoria().lock().unwrap() = None;

    Ok(())
}

/// Genera SPKI DER de la clave pública y lo codifica en base64url.
fn spki_b64url(signing_key: &SigningKey) -> String {
    let verifying_key = VerifyingKey::from(signing_key);
    let spki_der = PublicKey::<NistP256>::from(&verifying_key).to_public_key_der().expect("SPKI DER");
    base64_url_encode(spki_der.as_bytes())
}

/// Calcula la huella SHA-256 del SPKI (hex lowercase, 64 chars).
fn huella_de_spki(spki_der: &[u8]) -> String {
    crate::sha256::hex(&crate::sha256::sha256(spki_der))
}

/// Base64 URL-safe sin padding.
fn base64_url_encode(bytes: &[u8]) -> String {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Base64 URL-safe decode.
fn base64_url_decode(s: &str) -> Result<Vec<u8>, String> {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    URL_SAFE_NO_PAD.decode(s).map_err(|e| format!("Base64URL inválido: {e}"))
}

/// Crea la clave del aparato nativa (ECDSA P-256).
/// Si ya existe una, devuelve error (igual que firma-aparato.ts).
pub async fn crear_clave_aparato_nativa(app: AppHandle, nombre: String, cuenta: String) -> Result<ClaveAparatoEstado, String> {
    if !es_starseed_os(&app) {
        return Err("Solo en StarSeed OS".into());
    }
    let nombre = nombre.trim();
    if nombre.is_empty() || nombre.len() > 60 {
        return Err("Nombre inválido (1-60 caracteres)".into());
    }
    let cuenta = cuenta.trim().to_lowercase();
    if cuenta.is_empty() || cuenta.len() > 100 {
        return Err("Cuenta inválida".into());
    }

    // Verificar si ya existe
    if clave_existe(&app) {
        return Err("Ya existe una clave nativa: ólvidalala antes de crear otra".into());
    }

    // Generar par de claves ECDSA P-256
    let signing_key = SigningKey::random(&mut OsRng);
    let verifying_key = VerifyingKey::from(&signing_key);
    let spki_der = PublicKey::<NistP256>::from(&verifying_key).to_public_key_der().expect("SPKI DER");
    let spki_b64url = base64_url_encode(spki_der.as_bytes());
    let huella = huella_de_spki(spki_der.as_bytes());

    // Clave privada en PKCS#8 DER para guardar
    let pkcs8_der = SecretKey::<NistP256>::from(signing_key.clone()).to_pkcs8_der().expect("PKCS8 DER").as_bytes().to_vec();

    let ahora = chrono::Utc::now().to_rfc3339();
    let metadatos = MetadatosClave {
        nombre: nombre.to_string(),
        cuenta: cuenta.clone(),
        creado: ahora.clone(),
        algoritmo: ALGORITMO.into(),
        almacen: String::new(), // se rellena tras guardar
    };

    // Intentar guardar en llavero del sistema, si falla usar archivo 0600
    let almacen = match guardar_en_llavero(&app, &pkcs8_der, &metadatos) {
        Ok(a) => a,
        Err(_) => guardar_en_archivo(&app, &pkcs8_der, &metadatos)?,
    };

    // Actualizar metadatos con el almacen real
    let mut metadatos_final = metadatos;
    metadatos_final.almacen = almacen.clone();

    // Guardar metadatos actualizados
    if let Some(ruta_meta) = ruta_archivo_metadatos(&app) {
        let _ = std::fs::write(&ruta_meta, serde_json::to_vec(&metadatos_final).unwrap_or_default());
    }

    // Cargar en memoria para firmar
    *clave_memoria().lock().unwrap() = Some(ClavePrivadaMemoria {
        signing_key,
        metadatos: metadatos_final.clone(),
    });

    Ok(ClaveAparatoEstado {
        existe: true,
        huella: Some(huella),
        spki_b64url: Some(spki_b64url),
        nombre: Some(metadatos_final.nombre),
        cuenta: Some(metadatos_final.cuenta),
        creado: Some(metadatos_final.creado),
        algoritmo: ALGORITMO.into(),
        almacen,
    })
}

/// Firma datos con la clave nativa del aparato.
pub async fn firmar_con_clave_nativa(app: AppHandle, datos_b64url: String) -> Result<String, String> {
    if !es_starseed_os(&app) {
        return Err("Solo en StarSeed OS".into());
    }

    // Cargar clave en memoria si no está
    if clave_memoria().lock().unwrap().is_none() {
        cargar_clave_en_memoria(&app)?;
    }

    let clave_guardada = clave_memoria().lock().unwrap().as_ref().ok_or("Clave no cargada")?.signing_key.clone();
    let datos = base64_url_decode(&datos_b64url)?;

    let firma: Signature = clave_guardada.sign(&datos);
    Ok(base64_url_encode(firma.to_bytes().as_ref()))
}

/// Devuelve el SPKI base64url de la clave nativa.
pub async fn spki_clave_nativa(app: AppHandle) -> Result<String, String> {
    if !es_starseed_os(&app) {
        return Err("Solo en StarSeed OS".into());
    }

    if clave_memoria().lock().unwrap().is_none() {
        cargar_clave_en_memoria(&app)?;
    }

    let clave_guardada = clave_memoria().lock().unwrap().as_ref().ok_or("Clave no cargada")?.signing_key.clone();
    Ok(spki_b64url(&clave_guardada))
}

/// Estado actual de la clave nativa.
pub async fn estado_clave_nativa(app: AppHandle) -> Result<ClaveAparatoEstado, String> {
    if !es_starseed_os(&app) {
        return Err("Solo en StarSeed OS".into());
    }

    if !clave_existe(&app) {
        return Ok(ClaveAparatoEstado {
            existe: false,
            huella: None,
            spki_b64url: None,
            nombre: None,
            cuenta: None,
            creado: None,
            algoritmo: ALGORITMO.into(),
            almacen: String::new(),
        });
    }

    cargar_clave_en_memoria(&app)?;
    let guard = clave_memoria().lock().unwrap();
    let mem = guard.as_ref().ok_or("Clave no cargada")?;

    let verifying_key = VerifyingKey::from(&mem.signing_key);
    let spki_der = PublicKey::<NistP256>::from(&verifying_key).to_public_key_der().expect("SPKI DER");
    let spki_b64url = base64_url_encode(spki_der.as_bytes());
    let huella = huella_de_spki(spki_der.as_bytes());

    Ok(ClaveAparatoEstado {
        existe: true,
        huella: Some(huella),
        spki_b64url: Some(spki_b64url),
        nombre: Some(mem.metadatos.nombre.clone()),
        cuenta: Some(mem.metadatos.cuenta.clone()),
        creado: Some(mem.metadatos.creado.clone()),
        algoritmo: ALGORITMO.into(),
        almacen: mem.metadatos.almacen.clone(),
    })
}

/// Olvida (borra) la clave nativa del aparato.
pub async fn olvidar_clave_nativa(app: AppHandle) -> Result<(), String> {
    if !es_starseed_os(&app) {
        return Err("Solo en StarSeed OS".into());
    }
    borrar_clave(&app)
}

/// ¿Existe una clave nativa guardada?
fn clave_existe(app: &AppHandle) -> bool {
    // Primero comprobar llavero
    #[cfg(target_os = "linux")]
    {
        use secret_service::blocking::{EncryptionType, SecretService};
        use std::collections::HashMap;
        if let Ok(ss) = SecretService::connect(EncryptionType::Dh) {
            if let Ok(collection) = ss.get_default_collection() {
                let _ = collection.unlock();
                if let Ok(items) = collection.search_items(HashMap::from([("app", "starseed-os"), ("kind", "clave-aparato")])) {
                    if !items.is_empty() {
                        return true;
                    }
                }
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        use windows::Security::Credentials::PasswordVault;
        if let Ok(vault) = PasswordVault::new() {
            let recurso = windows::core::HSTRING::from("starseed-os/clave-aparato");
            if let Ok(creds) = vault.RetrieveAll() {
                for cred in creds {
                    if cred.Resource().ok().as_ref() == Some(&recurso) {
                        return true;
                    }
                }
            }
        }
    }

    // Fallback: archivo
    if let Some(ruta) = ruta_archivo_clave(app) {
        if ruta.exists() {
            return true;
        }
    }
    false
}

/// Carga la clave en memoria desde llavero o archivo.
fn cargar_clave_en_memoria(app: &AppHandle) -> Result<(), String> {
    let (signing_key, metadatos) = match cargar_desde_llavero(app) {
        Ok(k) => k,
        Err(_) => cargar_desde_archivo(app)?,
    };
    *clave_memoria().lock().unwrap() = Some(ClavePrivadaMemoria { signing_key, metadatos });
    Ok(())
}

// ───────────────────────── Comandos Tauri ─────────────────────────

/// Crea la clave nativa del aparato.
#[tauri::command]
pub async fn clave_aparato_crear(app: AppHandle, nombre: String, cuenta: String) -> Result<ClaveAparatoEstado, String> {
    crear_clave_aparato_nativa(app, nombre, cuenta).await
}

/// Firma datos con la clave nativa (entrada: base64url, salida: base64url).
#[tauri::command]
pub async fn clave_aparato_firmar(app: AppHandle, datos_b64url: String) -> Result<String, String> {
    firmar_con_clave_nativa(app, datos_b64url).await
}

/// Devuelve el SPKI base64url de la clave nativa.
#[tauri::command]
pub async fn clave_aparato_spki(app: AppHandle) -> Result<String, String> {
    spki_clave_nativa(app).await
}

/// Estado de la clave nativa.
#[tauri::command]
pub async fn clave_aparato_estado(app: AppHandle) -> Result<ClaveAparatoEstado, String> {
    estado_clave_nativa(app).await
}

/// Olvida la clave nativa.
#[tauri::command]
pub async fn clave_aparato_olvidar(app: AppHandle) -> Result<(), String> {
    olvidar_clave_nativa(app).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::signature::Verifier;

    #[test]
    fn par_p256_pkcs8_spki_y_firma_ecdsa() {
        let sk = SigningKey::random(&mut OsRng);
        let pkcs8_der = SecretKey::<NistP256>::from(sk.clone()).to_pkcs8_der().expect("PKCS8 DER");
        let recuperada = SigningKey::from(
            SecretKey::<NistP256>::from_pkcs8_der(pkcs8_der.as_bytes()).expect("recargar PKCS8 DER"),
        );

        let spki_a = spki_b64url(&sk);
        let spki_b = spki_b64url(&recuperada);
        assert!(!spki_a.is_empty());
        assert_eq!(spki_a, spki_b);

        let spki_bytes = base64_url_decode(&spki_a).expect("decodificar SPKI base64url");
        let huella = huella_de_spki(&spki_bytes);
        assert_eq!(huella.len(), 64);
        assert!(huella.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')));

        let mensaje = b"orden-de-control-starseed";
        let firma: Signature = recuperada.sign(mensaje);
        let vk = VerifyingKey::from(&sk);
        assert!(vk.verify(mensaje, &firma).is_ok());
        assert!(vk.verify(b"otro-mensaje", &firma).is_err());
    }
}