// ═══════════════════════════════════════════════════════════════════════════
// almacenes — comando Tauri para listar almacenes de almacenamiento (2026-11-25).
// ---------------------------------------------------------------------------
// Contrato: architecture/almacenes-cerebros.md §1 (el almacén).
// Pegamento fino entre Tauri y la lógica pura (almacenes_logica).
// ═══════════════════════════════════════════════════════════════════════════

use crate::almacenes_logica::{Almacen, ListarAlmacenes, listar_almacenes};
use serde::Serialize;
use tauri::command;

/// Respuesta serializable para el comando `almacenes_listar`.
#[derive(Serialize, Clone, Debug)]
pub struct AlmacenesListarResultado {
    pub almacenes: Vec<Almacen>,
    pub plataforma: String,
    pub motivo: Option<String>,
}

/// Lista todos los volúmenes/medios de almacenamiento detectados en el sistema.
///
/// Devuelve para cada almacén:
/// - etiqueta: nombre legible del volumen
/// - uuid: UUID del volumen (identidad estable)
/// - serie: número de serie del dispositivo físico
/// - sistema_archivos: tipo de FS (ext4, btrfs, exfat, ntfs, apfs, etc.)
/// - extraíble: true si es USB, SD, disco externo
/// - total_bytes: capacidad total
/// - libre_bytes: espacio libre
/// - punto_montaje: dónde está montado (informativo, puede cambiar)
/// - es_disco_sistema: true si es el disco donde está el SO
/// - tipo: interno | extraíble | red | nube | neurona | desconocido
/// - plataforma: linux | macos | windows | android | ...
/// - motivo: null si todo ok, o explicación si faltan datos
#[command]
pub async fn almacenes_listar() -> Result<AlmacenesListarResultado, String> {
    // La detección es bloqueante (llamadas a sistema, comandos externos),
    // así que la corremos en spawn_blocking.
    let resultado = tauri::async_runtime::spawn_blocking(listar_almacenes)
        .await
        .map_err(|e| format!("Error en la tarea de detección: {e}"))?;

    Ok(AlmacenesListarResultado {
        almacenes: resultado.almacenes,
        plataforma: resultado.plataforma,
        motivo: resultado.motivo,
    })
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn resultado_serializable() {
        let r = AlmacenesListarResultado {
            almacenes: vec![],
            plataforma: "test".into(),
            motivo: None,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("almacenes"));
        assert!(json.contains("plataforma"));
    }
}