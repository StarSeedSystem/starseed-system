//! permisos_linux_logica — qué le falta a este Linux para ser nodo StarSeed, interpretando solo la salida
//! de `id -Gn`, `ls -l /dev/uinput` y `systemctl is-active bluetooth` (LNX1118WD). MÓDULO PURO: sin
//! proceso, sin disco ni red; quien lanza las órdenes y pide permiso a pkexec vive en `permisos_sistema.rs`.
//! Las pruebas usan salidas de ejemplo de Debian 13 (Maggabox, 2026-11-18).

/// Grupos del nodo, los mismos que prepara `recursos/preparar-linux.sh` (el guion del nodo).
pub const GRUPOS_NODO: [&str; 8] = ["netdev", "bluetooth", "audio", "video", "render", "input", "plugdev", "dialout"];

/// Grupos que aparecen en `id -Gn`, en minúsculas, sin repetir y ordenados. Pura.
pub fn grupos_de_id(salida: &str) -> Vec<String> {
    let mut grupos: Vec<String> = salida.split_whitespace().map(|g| g.trim().to_ascii_lowercase()).filter(|g| !g.is_empty()).collect();
    grupos.sort();
    grupos.dedup();
    grupos
}

/// Los grupos del nodo que faltan según `id -Gn`, en el orden de [`GRUPOS_NODO`]. Pura.
pub fn grupos_que_faltan(salida_id: &str) -> Vec<&'static str> {
    let tiene = grupos_de_id(salida_id);
    GRUPOS_NODO.iter().copied().filter(|g| !tiene.iter().any(|t| t == g)).collect()
}

/// ¿La línea de `ls -l /dev/uinput` deja al grupo `input` leer y escribir? Pura.
/// Sin el dispositivo (salida vacía o error de `ls`) o con otro grupo, no.
pub fn uinput_del_grupo_input(salida_ls: &str) -> bool {
    let Some(linea) = salida_ls.lines().find(|l| l.contains("/dev/uinput")) else { return false };
    let campos: Vec<&str> = linea.split_whitespace().collect();
    // «crw-rw---- 1 root input 10, 223 nov 18 23:10 /dev/uinput»: modo, dueño y grupo fijos.
    let (Some(modo), Some(dueno), Some(grupo)) = (campos.first(), campos.get(2), campos.get(3)) else { return false };
    let permiso: Vec<char> = modo.chars().collect();
    let es_caracter = permiso.first() == Some(&'c');
    let grupo_rw = permiso.get(4) == Some(&'r') && permiso.get(5) == Some(&'w');
    es_caracter && grupo_rw && !dueno.is_empty() && *grupo == "input"
}

/// ¿`systemctl is-active bluetooth` dice que el servicio está en marcha? Pura.
/// Solo «active»; «activating», «inactive», «failed» y «unknown» todavía no sirven.
pub fn bluetooth_activo(salida_systemctl: &str) -> bool {
    salida_systemctl.split_whitespace().next() == Some("active")
}

/// Lo que falta de un nodo, ya interpretado (sin serializar: eso es de la capa Tauri).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MedidaNodo {
    pub grupos_faltan: Vec<String>,
    pub uinput: bool,
    pub bluetooth: bool,
}

/// Junta las tres lecturas en una sola medida. Pura.
pub fn medir(salida_id: &str, salida_ls: &str, salida_systemctl: &str) -> MedidaNodo {
    MedidaNodo {
        grupos_faltan: grupos_que_faltan(salida_id).into_iter().map(str::to_string).collect(),
        uinput: uinput_del_grupo_input(salida_ls),
        bluetooth: bluetooth_activo(salida_systemctl),
    }
}

/// ¿Este Linux ya puede ser nodo sin preparar nada? Pura.
pub fn completo(m: &MedidaNodo) -> bool {
    m.grupos_faltan.is_empty() && m.uinput && m.bluetooth
}

#[cfg(test)]
mod pruebas {
    use super::*;

    // Salidas reales de Debian 13 Xfce (Maggabox, 18-11 23:10 UTC): el usuario aún no estaba en los grupos.
    const ID_MAGGABOX: &str = "maggabox users audio video render plugdev";
    const ID_NODO: &str = "maggabox users netdev bluetooth audio video render input plugdev dialout";

    #[test]
    fn id_se_lee_con_espacios_y_saltos_de_linea() {
        assert_eq!(grupos_de_id("a  b\nc\ta"), vec!["a".to_string(), "b".to_string(), "c".to_string()]);
        assert_eq!(grupos_de_id("ALEX Users alex"), vec!["alex".to_string(), "users".to_string()]);
        assert!(grupos_de_id("   ").is_empty());
    }

    #[test]
    fn faltan_los_grupos_del_nodo_en_su_orden() {
        assert_eq!(grupos_que_faltan(ID_NODO), Vec::<&str>::new());
        assert_eq!(grupos_que_faltan(ID_MAGGABOX), vec!["netdev", "bluetooth", "input", "dialout"]);
        assert_eq!(grupos_que_faltan(""), GRUPOS_NODO.to_vec());
    }

    #[test]
    fn uinput_solo_cuenta_si_es_del_grupo_input_con_lectura_y_escritura() {
        assert!(uinput_del_grupo_input("crw-rw---- 1 root input 10, 223 nov 18 23:10 /dev/uinput"));
        assert!(!uinput_del_grupo_input("crw-rw---- 1 root root 10, 223 nov 18 23:10 /dev/uinput"));
        assert!(!uinput_del_grupo_input("crw------- 1 root input 10, 223 nov 18 23:10 /dev/uinput"));
        assert!(!uinput_del_grupo_input("crw-r----- 1 root input 10, 223 nov 18 23:10 /dev/uinput"));
        assert!(!uinput_del_grupo_input("ls: no se puede acceder a '/dev/uinput': No existe el archivo"));
        assert!(!uinput_del_grupo_input(""));
    }

    #[test]
    fn bluetooth_solo_cuenta_si_esta_activo() {
        assert!(bluetooth_activo("active\n"));
        assert!(!bluetooth_activo("inactive\n"));
        assert!(!bluetooth_activo("failed\n"));
        assert!(!bluetooth_activo("activating\n"));
        assert!(!bluetooth_activo("unknown\n"));
        assert!(!bluetooth_activo(""));
    }

    #[test]
    fn la_medida_junta_las_tres_lecturas() {
        let m = medir(ID_MAGGABOX, "crw------- 1 root root 10, 223 nov 18 23:10 /dev/uinput", "inactive");
        assert_eq!(m.grupos_faltan, vec!["netdev".to_string(), "bluetooth".to_string(), "input".to_string(), "dialout".to_string()]);
        assert!(!m.uinput);
        assert!(!m.bluetooth);
        assert!(!completo(&m));

        let listo = medir(ID_NODO, "crw-rw---- 1 root input 10, 223 nov 18 23:10 /dev/uinput", "active");
        assert_eq!(listo, MedidaNodo { grupos_faltan: vec![], uinput: true, bluetooth: true });
        assert!(completo(&listo));
    }
}
