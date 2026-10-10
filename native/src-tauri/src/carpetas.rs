// ═══════════════════════════════════════════════════════════════════════════
// carpetas — las carpetas que la persona CONCEDE a la app (2026-10-10).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-nativas-segundo-plano.md §4 (archivos).
//
// La persona elige una carpeta en el selector NATIVO del sistema (ese gesto es el
// permiso). La app la apunta aquí, la añade al alcance de `tauri-plugin-fs` en
// caliente y la vuelve a añadir en cada arranque. Cada carpeta lleva:
//   · modo: "lectura" o "lectura-escritura";
//   · nas: si se comparte con las OTRAS neuronas de la MISMA cuenta (servidor de
//     archivos de la cuenta; siempre apagado al conceder).
// Revocar la quita de la lista y prohíbe la ruta desde ya.
//
// Solo std + serde: se prueba sin Tauri (pruebas al final).
// ═══════════════════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

pub const ARCHIVO: &str = "carpetas-concedidas.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct CarpetaConcedida {
    pub ruta: String,
    /// "lectura" | "lectura-escritura"
    pub modo: String,
    /// Compartida con las neuronas de la misma cuenta (NAS).
    pub nas: bool,
    /// Milisegundos Unix de cuando se concedió.
    pub desde_ms: u64,
    /// true si es la raíz de un disco o la carpeta personal entera: la interfaz
    /// lo avisa en ámbar (es mucho acceso, aunque se haya pedido).
    pub amplia: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct RegistroCarpetas {
    pub esquema: u32,
    pub carpetas: Vec<CarpetaConcedida>,
}

/// Normaliza una ruta sin tocar el disco: quita `.`, resuelve `..` de forma
/// léxica y rechaza rutas relativas (una concesión siempre es absoluta).
pub fn normalizar(ruta: &str) -> Result<PathBuf, String> {
    let p = Path::new(ruta.trim());
    if ruta.trim().is_empty() {
        return Err("La ruta está vacía.".into());
    }
    if !p.is_absolute() {
        return Err(format!("«{ruta}» no es una ruta absoluta."));
    }
    let mut salida = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                if !salida.pop() {
                    return Err("La ruta sube por encima de la raíz.".into());
                }
            }
            otro => salida.push(otro.as_os_str()),
        }
    }
    Ok(salida)
}

/// ¿`hija` está dentro de `madre` (por componentes, no por texto)?
/// `/home/ana` NO contiene a `/home/anabel`.
pub fn contiene(madre: &Path, hija: &Path) -> bool {
    hija.starts_with(madre)
}

/// Raíz de disco o carpeta personal entera → concesión amplia.
pub fn es_amplia(ruta: &Path, carpeta_personal: Option<&Path>) -> bool {
    let componentes = ruta.components().filter(|c| !matches!(c, Component::Prefix(_))).count();
    if componentes <= 1 {
        return true; // "/" o "C:\"
    }
    match carpeta_personal {
        Some(h) => ruta == h,
        None => false,
    }
}

impl RegistroCarpetas {
    pub fn nuevo() -> Self {
        RegistroCarpetas { esquema: 1, carpetas: vec![] }
    }

    /// Lee el registro; si no existe o está roto, empieza vacío (nunca falla).
    pub fn cargar(dir: &Path) -> Self {
        let ruta = dir.join(ARCHIVO);
        match std::fs::read_to_string(&ruta) {
            Ok(t) => serde_json::from_str::<RegistroCarpetas>(&t).unwrap_or_else(|_| Self::nuevo()),
            Err(_) => Self::nuevo(),
        }
    }

    /// Guarda de forma atómica (temporal + renombrar).
    pub fn guardar(&self, dir: &Path) -> Result<(), String> {
        std::fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear {}: {e}", dir.display()))?;
        let tmp = dir.join(format!("{ARCHIVO}.tmp"));
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&tmp, json).map_err(|e| format!("No se pudo escribir {}: {e}", tmp.display()))?;
        std::fs::rename(&tmp, dir.join(ARCHIVO)).map_err(|e| format!("No se pudo guardar el registro: {e}"))
    }

    /// Concede (o actualiza el modo de) una carpeta. Devuelve la entrada final.
    pub fn conceder(
        &mut self,
        ruta: &str,
        modo: &str,
        ahora_ms: u64,
        carpeta_personal: Option<&Path>,
    ) -> Result<CarpetaConcedida, String> {
        let p = normalizar(ruta)?;
        let modo = match modo {
            "lectura" | "lectura-escritura" => modo.to_string(),
            otro => return Err(format!("Modo «{otro}» desconocido (lectura o lectura-escritura).")),
        };
        let texto = p.to_string_lossy().to_string();
        if let Some(e) = self.carpetas.iter_mut().find(|c| c.ruta == texto) {
            e.modo = modo;
            return Ok(e.clone());
        }
        let entrada = CarpetaConcedida {
            amplia: es_amplia(&p, carpeta_personal),
            ruta: texto,
            modo,
            nas: false,
            desde_ms: ahora_ms,
        };
        self.carpetas.push(entrada.clone());
        Ok(entrada)
    }

    /// Quita una carpeta. Devuelve si estaba.
    pub fn revocar(&mut self, ruta: &str) -> bool {
        let Ok(p) = normalizar(ruta) else { return false };
        let texto = p.to_string_lossy().to_string();
        let antes = self.carpetas.len();
        self.carpetas.retain(|c| c.ruta != texto);
        antes != self.carpetas.len()
    }

    /// Enciende o apaga el NAS de una carpeta concedida.
    pub fn compartir_nas(&mut self, ruta: &str, activo: bool) -> Result<CarpetaConcedida, String> {
        let p = normalizar(ruta)?;
        let texto = p.to_string_lossy().to_string();
        let e = self
            .carpetas
            .iter_mut()
            .find(|c| c.ruta == texto)
            .ok_or_else(|| format!("«{texto}» no está concedida: primero hay que concederla."))?;
        e.nas = activo;
        Ok(e.clone())
    }

    /// La carpeta NAS que cubre una ruta YA canonicalizada (enlaces simbólicos resueltos).
    /// `canonizar` resuelve también la raíz de cada carpeta, para que un enlace dentro de la
    /// carpeta no escape de ella ni una raíz con enlace deje fuera lo que sí es suyo.
    pub fn cubre_nas(&self, ruta_canonica: &Path, canonizar: &dyn Fn(&Path) -> PathBuf) -> Option<&CarpetaConcedida> {
        self.carpetas
            .iter()
            .filter(|c| c.nas)
            .filter(|c| contiene(&canonizar(Path::new(&c.ruta)), ruta_canonica))
            .max_by_key(|c| Path::new(&c.ruta).components().count())
    }

    /// La concesión que cubre una ruta (la más específica), si alguna.
    pub fn cubre(&self, ruta: &str) -> Option<&CarpetaConcedida> {
        let p = normalizar(ruta).ok()?;
        self.carpetas
            .iter()
            .filter(|c| contiene(Path::new(&c.ruta), &p))
            .max_by_key(|c| Path::new(&c.ruta).components().count())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn normaliza_y_rechaza() {
        assert_eq!(normalizar("/home/ana/./fotos/../docs").unwrap(), PathBuf::from("/home/ana/docs"));
        assert!(normalizar("fotos").is_err());
        assert!(normalizar("").is_err());
        assert!(normalizar("/..").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn contiene_por_componentes() {
        assert!(contiene(Path::new("/home/ana"), Path::new("/home/ana/x.txt")));
        assert!(!contiene(Path::new("/home/ana"), Path::new("/home/anabel/x.txt")));
    }

    #[cfg(unix)]
    #[test]
    fn conceder_revocar_nas_y_persistir() {
        let dir = std::env::temp_dir().join(format!("ss-carpetas-{}", std::process::id()));
        let mut r = RegistroCarpetas::nuevo();
        let home = PathBuf::from("/home/ana");
        let e = r.conceder("/home/ana/Fotos", "lectura", 1, Some(&home)).unwrap();
        assert!(!e.nas && !e.amplia);
        assert!(r.conceder("/", "lectura", 2, Some(&home)).unwrap().amplia);
        assert!(r.conceder("/home/ana", "lectura-escritura", 3, Some(&home)).unwrap().amplia);
        assert!(r.conceder("/x", "todo", 4, None).is_err());
        assert_eq!(r.cubre("/home/ana/Fotos/a.jpg").unwrap().ruta, "/home/ana/Fotos");
        assert!(r.compartir_nas("/home/ana/Fotos", true).unwrap().nas);
        assert!(r.compartir_nas("/no/concedida", true).is_err());
        r.guardar(&dir).unwrap();
        let leido = RegistroCarpetas::cargar(&dir);
        assert_eq!(leido, r);
        assert!(r.revocar("/home/ana/Fotos"));
        assert!(!r.revocar("/home/ana/Fotos"));
        assert_eq!(r.cubre("/home/ana/Fotos/a.jpg").unwrap().ruta, "/home/ana");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn nas_solo_lo_compartido_y_sin_escapar() {
        let mut r = RegistroCarpetas::nuevo();
        r.conceder("/datos/fotos", "lectura", 1, None).unwrap();
        r.conceder("/datos/musica", "lectura", 1, None).unwrap();
        r.compartir_nas("/datos/musica", true).unwrap();
        let id = |p: &Path| p.to_path_buf();
        assert!(r.cubre_nas(Path::new("/datos/fotos/a.jpg"), &id).is_none(), "concedida pero no compartida");
        assert_eq!(r.cubre_nas(Path::new("/datos/musica/x.flac"), &id).unwrap().ruta, "/datos/musica");
        assert!(r.cubre_nas(Path::new("/datos/musicas/x"), &id).is_none(), "por componentes, no por texto");
        // La raíz es un enlace: se compara con su destino real.
        let enlace = |p: &Path| if p == Path::new("/datos/musica") { PathBuf::from("/mnt/disco/musica") } else { p.to_path_buf() };
        assert!(r.cubre_nas(Path::new("/mnt/disco/musica/y.flac"), &enlace).is_some());
        assert!(r.cubre_nas(Path::new("/datos/musica/y.flac"), &enlace).is_none(), "solo cuenta el destino canónico");
    }

    #[test]
    fn registro_roto_empieza_vacio() {
        let dir = std::env::temp_dir().join(format!("ss-carpetas-roto-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(ARCHIVO), "{no es json").unwrap();
        assert!(RegistroCarpetas::cargar(&dir).carpetas.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
