; (TRM1125G) Hook NSIS para instalar el servicio de Windows del ayudante privilegiado.
; Se ejecuta durante la instalación (installMode perMachine) con UAC.
; El binario del ayudante está en $INSTDIR/ayudante.exe (copiado por el empaquetado de Tauri).

!include "x64.nsh"
!include "LogicLib.nsh"
!include "nsUAC.nsh"

; Nombre del servicio
!define SERVICIO_NOMBRE "StarSeedAyudante"
!define SERVICIO_DISPLAY "StarSeed OS Ayudante Privilegiado"
!define SERVICIO_DESC "Servicio con privilegios para órdenes tipadas de StarSeed OS (almacenes, servicios, logs, terminal admin)."
!define AYUDANTE_EJECUTABLE "$INSTDIR\ayudante.exe"

; ─── Instalación del servicio ───

Function .onInit
    ; Solicitar privilegios de administrador para toda la instalación (perMachine)
    ; nsUAC ya lo hace por installMode perMachine, pero nos aseguramos
    ${RunAsAdmin}
FunctionEnd

Function onInstallService
    ; Verificar que el ejecutable del ayudante existe
    IfFileExists "${AYUDANTE_EJECUTABLE}" 0 ServicioNoExiste
    
    ; Crear el servicio (tipo own process, inicio automático, cuenta LocalSystem)
    ; El binario del ayudante debe aceptar argumentos de servicio de Windows (ServiceBase)
    ExecWait 'sc.exe create "${SERVICIO_NOMBRE}" binPath= "${AYUDANTE_EJECUTABLE}" start= auto obj= "LocalSystem" DisplayName= "${SERVICIO_DISPLAY}"'
    ${If} $0 != 0
        MessageBox MB_ICONWARNING "No se pudo crear el servicio ${SERVICIO_NOMBRE} (código $0).${$\n}El ayudante privilegiado no estará disponible."
    ${Else}
        ; Configurar descripción del servicio
        ExecWait 'sc.exe description "${SERVICIO_NOMBRE}" "${SERVICIO_DESC}"'
        
        ; Configurar recuperación ante fallos (reiniciar servicio a los 1 min)
        ExecWait 'sc.exe failure "${SERVICIO_NOMBRE}" reset= 60 actions= restart/60000/restart/60000/restart/60000'
        
        ; Iniciar el servicio
        ExecWait 'sc.exe start "${SERVICIO_NOMBRE}"'
        ${If} $0 != 0
            ; Si falla el inicio, puede ser que ya esté corriendo o falten dependencias
            ; No es error fatal: la app puede registrarlo después con ayudante_registrar
            DetailPrint "Servicio creado pero no iniciado (código $0). Se intentará al arrancar la app."
        ${Else}
            DetailPrint "Servicio ${SERVICIO_NOMBRE} instalado e iniciado correctamente."
        ${EndIf}
    ${EndIf}
    Goto ServicioHecho

    ServicioNoExiste:
    DetailPrint "ADVERTENCIA: No se encontró ${AYUDANTE_EJECUTABLE}. El servicio no se instalará."
    
    ServicioHecho:
FunctionEnd

; ─── Desinstalación del servicio ───

Function un.onUninstInit
    ${RunAsAdmin}
FunctionEnd

Function un.onInit
    ; Detener y borrar el servicio antes de borrar archivos
    Call un.InstallServiceCleanup
FunctionEnd

Function un.InstallServiceCleanup
    ; Detener el servicio si está corriendo
    ExecWait 'sc.exe stop "${SERVICIO_NOMBRE}"'
    ; Borrar el servicio
    ExecWait 'sc.exe delete "${SERVICIO_NOMBRE}"'
    DetailPrint "Servicio ${SERVICIO_NOMBRE} detenido y eliminado."
FunctionEnd

; ─── Hook para actualizaciones (tauri-plugin-updater) ───
; Cuando la app se actualiza, el binario del ayudante puede cambiar.
; El hook de actualización debería reiniciar el servicio.

Function .onUpdateInstalled
    ; Se llama después de que el updater reemplaza los binarios
    ; Reiniciar el servicio para usar el nuevo binario
    ExecWait 'sc.exe stop "${SERVICIO_NOMBRE}"'
    Sleep 1000
    ExecWait 'sc.exe start "${SERVICIO_NOMBRE}"'
FunctionEnd

; ─── Verificación de requisitos ───

Function CheckWindowsVersion
    ; Windows 10 build 17763 (1809) o posterior
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
    ${If} $0 < 17763
        MessageBox MB_ICONERROR "StarSeed OS requiere Windows 10 versión 1809 (build 17763) o posterior.${$\n}Versión actual: $0"
        Abort
    ${EndIf}
FunctionEnd

; Llamar a la verificación al inicio
!define MUI_CUSTOMFUNCTION_INIT CheckWindowsVersion