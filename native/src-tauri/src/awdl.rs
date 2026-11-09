// ═══════════════════════════════════════════════════════════════════════════
// awdl — comandos del Wi-Fi P2P por AWDL entre Mac, sin router ni hotspot (WFA1109A, 2026-11-09).
// Contrato: architecture/wifi-directo.md §4.3. La parte de verdad es `awdl_macos.rs` (solo macOS);
// en el resto de sistemas estos comandos existen pero dicen «no disponible» con su porqué (iOS: documentado, no hecho).
// Comandos: `awdl_iniciar { neurona }`, `awdl_detener`, `awdl_estado`.
// ═══════════════════════════════════════════════════════════════════════════

use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize, Clone, Debug)]
pub struct EstadoAwdl {
    /// El API peer-to-peer de Network.framework está en este sistema.
    pub disponible: bool,
    /// Anunciando y buscando ahora.
    pub activo: bool,
    pub motivo: String,
    /// Vecinos AWDL vistos: (`awdl:<huella>`, hace cuántos segundos).
    pub vecinos: Vec<(String, u64)>,
}

#[cfg(target_os = "macos")]
fn estado_actual() -> EstadoAwdl {
    EstadoAwdl {
        disponible: crate::awdl_macos::disponible(),
        activo: crate::awdl_macos::activo(),
        motivo: crate::awdl_macos::texto_estado(),
        vecinos: crate::awdl_macos::vecinos(),
    }
}

#[cfg(not(target_os = "macos"))]
fn estado_actual() -> EstadoAwdl {
    EstadoAwdl {
        disponible: false,
        activo: false,
        motivo: "AWDL es de Apple: solo Mac (macOS 10.15+) por ahora; iOS queda para otra ola. Android usa Wi-Fi Aware o Wi-Fi Direct.".into(),
        vecinos: Vec::new(),
    }
}

/// Empieza a anunciar esta neurona y a buscar Mac cercanos por AWDL (la web lo llama con su id de neurona).
#[tauri::command]
pub fn awdl_iniciar(app: AppHandle, neurona: String) -> Result<EstadoAwdl, String> {
    #[cfg(target_os = "macos")]
    {
        crate::awdl_macos::iniciar(&app, &neurona)?;
        Ok(estado_actual())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, neurona);
        Err(estado_actual().motivo)
    }
}

/// Deja de anunciar y de buscar.
#[tauri::command]
pub fn awdl_detener() -> EstadoAwdl {
    #[cfg(target_os = "macos")]
    crate::awdl_macos::detener();
    estado_actual()
}

#[tauri::command]
pub fn awdl_estado() -> EstadoAwdl {
    estado_actual()
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn fuera_de_macos_dice_no_con_su_porque() {
        #[cfg(not(target_os = "macos"))]
        {
            let e = estado_actual();
            assert!(!e.disponible && !e.activo && e.vecinos.is_empty());
            assert!(e.motivo.contains("Mac") && e.motivo.contains("Aware"));
        }
    }
}
