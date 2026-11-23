//! (CTL1118L · CTL1119C) Captura de la pantalla principal con la cabecera de 12 bytes del seam, compartida por
//! macOS (`control_pantalla_escritorio`) y Linux/X11. En Linux intenta primero MIT-SHM (memoria compartida) y solo
//! si no está usa `xcap`; en macOS `xcap`. La reducción se hace antes de codificar el JPEG.

use crate::control_calidad_logica as q;
use crate::control_entrada_logica as l;
use std::sync::atomic::{AtomicU8, Ordering};

/// Un cuadro listo para el seam: cabecera de 12 bytes + JPEG. `igual` evita reenviar lo que no cambió.
pub struct Cuadro {
    pub jpeg: Vec<u8>,
    pub ancho: u32,
    pub alto: u32,
    pub huella: Option<u64>,
    pub igual: bool,
}

static ULTIMA_VIA: AtomicU8 = AtomicU8::new(0);

/// Tamaño en píxeles de la pantalla principal (para `control_estado_aparato`).
pub fn tamano_principal() -> Option<(u32, u32)> {
    let ms = xcap::Monitor::all().ok()?;
    let p = ms.iter().find(|m| m.is_primary().unwrap_or(false)).or(ms.first())?;
    Some((p.width().ok()?, p.height().ok()?))
}

/// Vía realmente usada por la última captura: `xshm` o `xcap`.
pub fn via_actual() -> &'static str {
    if ULTIMA_VIA.load(Ordering::Relaxed) == 1 { "xshm" } else { "xcap" }
}

/// Segunda vía fluida preparada (GStreamer + VP8 por WebRTC), si la AppImage la trae.
pub fn via_fluida() -> Option<&'static str> {
    #[cfg(target_os = "linux")]
    {
        q::via_fluida(capacidades_linux())
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

/// Se llama al abrir una pantalla nueva: si MIT-SHM falló antes, se vuelve a probar.
pub fn reiniciar_via() {
    #[cfg(target_os = "linux")]
    {
        xshm::reiniciar();
        ULTIMA_VIA.store(0, Ordering::Relaxed);
    }
}

pub fn capturar_jpeg(lado: u32, calidad: u8, numero: u32) -> Option<(Vec<u8>, u32, u32)> {
    let c = capturar_cuadro(lado, calidad, numero, None)?;
    Some((c.jpeg, c.ancho, c.alto))
}

/// Captura, detecta si es igual a la anterior por la huella de bloques y, solo si cambió, reduce y codifica.
pub fn capturar_cuadro(lado: u32, calidad: u8, numero: u32, huella_previa: Option<u64>) -> Option<Cuadro> {
    #[cfg(target_os = "linux")]
    {
        if q::via_linux(capacidades_linux()) == q::Via::Xshm {
            if let Some(c) = xshm::capturar(lado, calidad, numero, huella_previa) {
                ULTIMA_VIA.store(1, Ordering::Relaxed);
                return Some(c);
            }
        }
        ULTIMA_VIA.store(0, Ordering::Relaxed);
    }
    capturar_xcap(lado, calidad, numero, huella_previa)
}

fn capturar_xcap(lado: u32, calidad: u8, numero: u32, huella_previa: Option<u64>) -> Option<Cuadro> {
    let ms = xcap::Monitor::all().ok()?;
    let mon = ms.iter().find(|m| m.is_primary().unwrap_or(false)).or(ms.first())?;
    let img = mon.capture_image().ok()?;
    let huella = q::huella_bloques(img.as_raw(), 4, img.width(), img.height());
    let (w, h) = l::escalar(img.width(), img.height(), lado);
    if huella.is_some() && huella == huella_previa {
        return Some(Cuadro { jpeg: Vec::new(), ancho: w, alto: h, huella, igual: true });
    }
    let img = if (w, h) == (img.width(), img.height()) {
        img
    } else {
        image::imageops::resize(&img, w, h, image::imageops::FilterType::Triangle)
    };
    let rgb = image::DynamicImage::ImageRgba8(img).to_rgb8();
    let jpeg = codificar(&rgb, calidad, numero)?;
    Some(Cuadro { jpeg, ancho: w, alto: h, huella, igual: false })
}

fn codificar(rgb: &image::RgbImage, calidad: u8, numero: u32) -> Option<Vec<u8>> {
    let (w, h) = rgb.dimensions();
    let mut salida = Vec::with_capacity(64 * 1024);
    salida.extend_from_slice(&l::cabecera_cuadro(numero, w.min(65535) as u16, h.min(65535) as u16, 0));
    let mut cod = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut salida, calidad);
    cod.encode_image(rgb).ok()?;
    Some(salida)
}

/// Reduce BGRA/BGRX de X11 al tamaño pedido y lo deja en RGB, sin crear una imagen intermedia del tamaño completo.
fn reducir_bgra(raw: &[u8], ancho: u32, alto: u32, w: u32, h: u32) -> Vec<u8> {
    let mut salida = vec![0u8; w as usize * h as usize * 3];
    for y in 0..h as usize {
        let sy = (y as u64 * u64::from(alto) / u64::from(h)) as usize;
        let fila = sy * ancho as usize * 4;
        for x in 0..w as usize {
            let sx = (x as u64 * u64::from(ancho) / u64::from(w)) as usize;
            let i = fila + sx * 4;
            let o = (y * w as usize + x) * 3;
            salida[o] = raw[i + 2];
            salida[o + 1] = raw[i + 1];
            salida[o + 2] = raw[i];
        }
    }
    salida
}

#[cfg(target_os = "linux")]
fn comando_ok(programa: &str, args: &[&str]) -> bool {
    let mut cmd = std::process::Command::new(programa);
    crate::entorno_hijos::aplicar_a_comando(&mut cmd);
    cmd.args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
pub fn capacidades_linux() -> q::Capacidades {
    use std::sync::OnceLock;
    static CAPS: OnceLock<q::Capacidades> = OnceLock::new();
    *CAPS.get_or_init(|| {
        use x11rb::connection::RequestConnection;
        use x11rb::protocol::shm::{self, ConnectionExt as _};
        use x11rb::rust_connection::RustConnection;

        let mut c = q::Capacidades::default();
        if let Ok((conn, _)) = RustConnection::connect(None) {
            c.x11 = true;
            let extension = conn.extension_information(shm::X11_EXTENSION_NAME).ok().flatten().is_some();
            let version = conn.shm_query_version().ok().and_then(|k| k.reply().ok());
            c.xshm = extension && version.is_some_and(|v| v.major_version >= 1);
        }
        c.gstreamer = comando_ok("gst-inspect-1.0", &["--version"]);
        if c.gstreamer {
            c.vp8_webrtc = ["ximagesrc", "vp8enc", "rtpvp8pay", "webrtcbin", "nicesrc"]
                .iter()
                .all(|e| comando_ok("gst-inspect-1.0", &[e]));
        }
        c
    })
}

#[cfg(target_os = "linux")]
mod xshm {
    use super::*;
    use std::sync::{Mutex, OnceLock};
    use x11rb::connection::{Connection, RequestConnection};
    use x11rb::protocol::shm::{self, ConnectionExt as _, Seg};
    use x11rb::protocol::xproto::{ImageFormat, ImageOrder, VisualClass, Window};
    use x11rb::rust_connection::RustConnection;

    static SHM: OnceLock<Mutex<Option<Shm>>> = OnceLock::new();
    static ROTO: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

    pub fn reiniciar() {
        ROTO.store(false, Ordering::Relaxed);
        if let Some(m) = SHM.get() {
            if let Ok(mut g) = m.lock() {
                *g = None;
            }
        }
    }

    struct Shm {
        conn: RustConnection,
        root: Window,
        ancho: u16,
        alto: u16,
        shmid: libc::c_int,
        addr: *mut u8,
        seg: Seg,
    }

    unsafe impl Send for Shm {}

    impl Shm {
        fn crear() -> Option<Self> {
            let (conn, n) = RustConnection::connect(None).ok()?;
            conn.extension_information(shm::X11_EXTENSION_NAME).ok().flatten()?;
            let version = conn.shm_query_version().ok()?.reply().ok()?;
            if version.major_version < 1 {
                return None;
            }
            let setup = conn.setup();
            let pantalla = &setup.roots[n];
            if setup.image_byte_order != ImageOrder::LSB_FIRST {
                return None;
            }
            let visual = pantalla
                .allowed_depths
                .iter()
                .find(|d| d.depth == pantalla.root_depth)?
                .visuals
                .iter()
                .find(|v| v.visual_id == pantalla.root_visual)?;
            if visual.class != VisualClass::TRUE_COLOR
                || visual.red_mask != 0x00ff_0000
                || visual.green_mask != 0x0000_ff00
                || visual.blue_mask != 0x0000_00ff
            {
                return None;
            }
            let formato = setup.pixmap_formats.iter().find(|f| f.depth == pantalla.root_depth)?;
            if formato.bits_per_pixel != 32 || formato.scanline_pad != 32 {
                return None;
            }
            let (root, ancho, alto) = (pantalla.root, pantalla.width_in_pixels, pantalla.height_in_pixels);
            if ancho == 0 || alto == 0 {
                return None;
            }
            let tamano = ancho as usize * alto as usize * 4;
            let shmid = unsafe { libc::shmget(libc::IPC_PRIVATE, tamano, libc::IPC_CREAT | 0o600) };
            if shmid < 0 {
                return None;
            }
            let addr = unsafe { libc::shmat(shmid, std::ptr::null(), 0) };
            if addr as isize == -1 {
                unsafe {
                    libc::shmctl(shmid, libc::IPC_RMID, std::ptr::null_mut());
                }
                return None;
            }
            let limpiar = |addr: *mut libc::c_void, shmid: libc::c_int| unsafe {
                libc::shmdt(addr);
                libc::shmctl(shmid, libc::IPC_RMID, std::ptr::null_mut());
            };
            let seg = match conn.generate_id() {
                Ok(s) => s,
                Err(_) => {
                    limpiar(addr, shmid);
                    return None;
                }
            };
            let attach = match conn.shm_attach(seg, shmid as u32, false) {
                Ok(a) => a,
                Err(_) => {
                    limpiar(addr, shmid);
                    return None;
                }
            };
            if attach.check().is_err() {
                limpiar(addr, shmid);
                return None;
            }
            Some(Self { conn, root, ancho, alto, shmid, addr: addr as *mut u8, seg })
        }

        fn capturar(&mut self, lado: u32, calidad: u8, numero: u32, huella_previa: Option<u64>) -> Option<Cuadro> {
            let cookie = self
                .conn
                .shm_get_image(self.root, 0, 0, self.ancho, self.alto, !0, u8::from(ImageFormat::Z_PIXMAP), self.seg, 0)
                .ok()?;
            let reply = cookie.reply().ok()?;
            let necesarios = self.ancho as usize * self.alto as usize * 4;
            if reply.size as usize != necesarios {
                return None;
            }
            let raw = unsafe { std::slice::from_raw_parts(self.addr, necesarios) };
            let huella = q::huella_bloques(raw, 4, u32::from(self.ancho), u32::from(self.alto));
            let (w, h) = l::escalar(u32::from(self.ancho), u32::from(self.alto), lado);
            if huella.is_some() && huella == huella_previa {
                return Some(Cuadro { jpeg: Vec::new(), ancho: w, alto: h, huella, igual: true });
            }
            let rgb = super::reducir_bgra(raw, u32::from(self.ancho), u32::from(self.alto), w, h);
            let img = image::RgbImage::from_raw(w, h, rgb)?;
            let jpeg = super::codificar(&img, calidad, numero)?;
            Some(Cuadro { jpeg, ancho: w, alto: h, huella, igual: false })
        }
    }

    impl Drop for Shm {
        fn drop(&mut self) {
            let _ = self.conn.shm_detach(self.seg);
            let _ = self.conn.flush();
            unsafe {
                libc::shmdt(self.addr as *const libc::c_void);
                libc::shmctl(self.shmid, libc::IPC_RMID, std::ptr::null_mut());
            }
        }
    }

    pub fn capturar(lado: u32, calidad: u8, numero: u32, huella_previa: Option<u64>) -> Option<Cuadro> {
        if ROTO.load(Ordering::Relaxed) {
            return None;
        }
        let mutex = SHM.get_or_init(|| Mutex::new(None));
        let mut guard = mutex.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_none() {
            match Shm::crear() {
                Some(s) => *guard = Some(s),
                None => {
                    ROTO.store(true, Ordering::Relaxed);
                    return None;
                }
            }
        }
        let resultado = guard.as_mut().and_then(|s| s.capturar(lado, calidad, numero, huella_previa));
        if resultado.is_none() {
            *guard = None;
            ROTO.store(true, Ordering::Relaxed);
        }
        resultado
    }
}

#[cfg(all(test, target_os = "linux"))]
mod pruebas {
    use super::*;

    #[test]
    fn ctl1119c_reduce_bgra_antes_de_codificar() {
        let raw = vec![10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255];
        assert_eq!(reducir_bgra(&raw, 2, 2, 1, 1), vec![30, 20, 10]);
        assert_eq!(
            reducir_bgra(&raw, 2, 2, 2, 2),
            vec![30, 20, 10, 60, 50, 40, 90, 80, 70, 120, 110, 100]
        );
    }
}
