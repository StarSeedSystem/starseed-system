//! (CTL1118L) La captura de la pantalla principal como JPEG con la cabecera de 12 bytes del seam (`xcap`), compartida por
//! macOS (`control_pantalla_escritorio`) y Linux/X11. Antes vivía dentro del módulo de macOS, idéntica.

use crate::control_entrada_logica as l;

/// Tamaño en píxeles de la pantalla principal (para `control_estado_aparato`).
pub fn tamano_principal() -> Option<(u32, u32)> {
    let ms = xcap::Monitor::all().ok()?;
    let p = ms.iter().find(|m| m.is_primary().unwrap_or(false)).or(ms.first())?;
    Some((p.width().ok()?, p.height().ok()?))
}

pub fn capturar_jpeg(lado: u32, calidad: u8, numero: u32) -> Option<(Vec<u8>, u32, u32)> {
    let ms = xcap::Monitor::all().ok()?;
    let mon = ms.iter().find(|m| m.is_primary().unwrap_or(false)).or(ms.first())?;
    let img = mon.capture_image().ok()?;
    let (w, h) = l::escalar(img.width(), img.height(), lado);
    let img = if (w, h) == (img.width(), img.height()) { img } else { image::imageops::resize(&img, w, h, image::imageops::FilterType::Triangle) };
    let rgb = image::DynamicImage::ImageRgba8(img).to_rgb8();
    let mut salida = Vec::with_capacity(64 * 1024);
    salida.extend_from_slice(&l::cabecera_cuadro(numero, w.min(65535) as u16, h.min(65535) as u16, 0));
    let mut cod = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut salida, calidad);
    cod.encode_image(&rgb).ok()?;
    Some((salida, w, h))
}

