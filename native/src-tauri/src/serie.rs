// ═══════════════════════════════════════════════════════════════════════════
// serie — puente de puerto serie para radios LoRa (Meshtastic/RNode), solo std
// (2026-10-10). Contrato: architecture/apps-nativas-segundo-plano.md §3.2.
// ---------------------------------------------------------------------------
// Por qué existe: dentro de la app nativa la web corre en WKWebView (macOS),
// WebKitGTK (Linux) o WebView2 (Windows), y NINGUNO trae Web Serial. Sin esto, la
// app nativa sabía MENOS que Chrome con la radio enchufada.
//
// Cómo (macOS y Linux): se abre el dispositivo como archivo, y CON ÉL ABIERTO se
// configura con `stty` (115200, 8N1, crudo, lecturas que vuelven cada 0,5 s para
// poder cerrar). La web recibe los bytes tal cual y les aplica el mismo
// `fromDeviceStream` de @meshtastic/core que usa Web Serial
// (src/lib/nativa/transporte-serie-nativo.ts). Solo se abren rutas que
// `antenas::puertos_serie()` reconoce como radio: nunca un archivo cualquiera.
// Windows y Android: todavía no (se dice; Windows necesita el crate serialport y
// Android el USB host del plugin Kotlin).
// ═══════════════════════════════════════════════════════════════════════════

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub type AlRecibir = Box<dyn Fn(Vec<u8>) + Send + 'static>;
/// Se llama una vez cuando la lectura termina (radio desenchufada o `cerrar()`).
pub type AlCerrar = Box<dyn FnOnce() + Send + 'static>;

pub struct PuenteSerie {
    pub ruta: String,
    escritor: Mutex<std::fs::File>,
    parar: Arc<AtomicBool>,
}

/// Argumentos de `stty` para dejar la línea en 8N1 crudo con lecturas de 0,5 s.
pub fn args_stty(ruta: &str, baudios: u32) -> Vec<String> {
    let bandera = if cfg!(target_os = "macos") { "-f" } else { "-F" };
    let mut v = vec![bandera.to_string(), ruta.to_string(), baudios.to_string()];
    for a in ["raw", "-echo", "cs8", "-parenb", "-cstopb", "clocal", "min", "0", "time", "5"] {
        v.push(a.to_string());
    }
    v
}

/// ¿Se puede abrir esta ruta? Solo las que el guardián reconoce como radio.
pub fn ruta_permitida(ruta: &str, candidatos: &[String]) -> bool {
    candidatos.iter().any(|c| c == ruta)
}

impl PuenteSerie {
    #[cfg(all(unix, not(target_os = "android")))]
    pub fn abrir(ruta: &str, baudios: u32, candidatos: &[String], al_recibir: AlRecibir, al_cerrar: AlCerrar) -> Result<PuenteSerie, String> {
        if !ruta_permitida(ruta, candidatos) {
            return Err(format!("«{ruta}» no es una radio reconocida (USB serie)."));
        }
        let archivo = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(ruta)
            .map_err(|e| match e.kind() {
                std::io::ErrorKind::PermissionDenied => format!(
                    "Sin permiso para {ruta}. En Linux: añade tu usuario al grupo «dialout» (sudo usermod -aG dialout $USER) y vuelve a entrar."
                ),
                _ => format!("No se pudo abrir {ruta}: {e} (¿la usa otra app, como Meshtastic o Chrome?)"),
            })?;
        let estado = crate::disco::orden("stty")
            .args(args_stty(ruta, baudios))
            .status()
            .map_err(|e| format!("No se pudo configurar la línea con stty: {e}"))?;
        if !estado.success() {
            return Err(format!("stty no pudo configurar {ruta} ({estado})."));
        }
        let mut lector = archivo.try_clone().map_err(|e| e.to_string())?;
        let parar = Arc::new(AtomicBool::new(false));
        let parar_hilo = parar.clone();
        std::thread::Builder::new()
            .name("starseed-serie".into())
            .spawn(move || {
                let mut buf = [0u8; 1024];
                while !parar_hilo.load(Ordering::Relaxed) {
                    match lector.read(&mut buf) {
                        Ok(0) => continue, // 0,5 s sin datos (time 5)
                        Ok(n) => al_recibir(buf[..n].to_vec()),
                        Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                        Err(_) => break, // radio desenchufada
                    }
                }
                al_cerrar();
            })
            .map_err(|e| e.to_string())?;
        Ok(PuenteSerie { ruta: ruta.to_string(), escritor: Mutex::new(archivo), parar })
    }

    #[cfg(not(all(unix, not(target_os = "android"))))]
    pub fn abrir(_ruta: &str, _baudios: u32, _candidatos: &[String], _al_recibir: AlRecibir, _al_cerrar: AlCerrar) -> Result<PuenteSerie, String> {
        Err(if cfg!(windows) {
            "En Windows el puente serie nativo aún no está (necesita el crate serialport: decisión de Alex). Usa Chrome/Edge con Web Serial.".into()
        } else {
            "En el móvil la radio irá por Bluetooth o USB desde el plugin Kotlin (próxima versión).".into()
        })
    }

    pub fn escribir(&self, datos: &[u8]) -> Result<(), String> {
        let mut f = self.escritor.lock().map_err(|_| "puerto bloqueado".to_string())?;
        f.write_all(datos).map_err(|e| format!("No se pudo escribir en {}: {e}", self.ruta))?;
        f.flush().map_err(|e| e.to_string())
    }

    pub fn cerrar(&self) {
        self.parar.store(true, Ordering::Relaxed);
    }
}

impl Drop for PuenteSerie {
    fn drop(&mut self) {
        self.cerrar();
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn stty_8n1_crudo_con_lecturas_que_vuelven() {
        let a = args_stty("/dev/ttyACM0", 115200);
        assert_eq!(&a[1], "/dev/ttyACM0");
        assert_eq!(&a[2], "115200");
        for x in ["raw", "cs8", "-parenb", "clocal", "min", "time"] {
            assert!(a.iter().any(|y| y == x), "falta {x}");
        }
    }

    #[test]
    fn solo_rutas_de_radio() {
        let c = vec!["/dev/ttyACM0".to_string()];
        assert!(ruta_permitida("/dev/ttyACM0", &c));
        assert!(!ruta_permitida("/etc/passwd", &c));
        assert!(!ruta_permitida("/dev/ttyACM0/../../etc/passwd", &c));
    }

    #[cfg(all(unix, not(target_os = "android")))]
    #[test]
    fn rechaza_abrir_lo_que_no_es_radio() {
        let r = PuenteSerie::abrir("/etc/hosts", 115200, &[], Box::new(|_| {}), Box::new(|| {}));
        assert!(r.is_err());
    }
}
