; (TRM1125G) Hooks NSIS para instalar/desinstalar el servicio StarSeedAyudante en Windows.
; Se incluye desde tauri.conf.json → bundle.windows.nsis.include
; installMode perMachine ya está configurado en tauri.conf.json (requiere UAC).

!include LogicLib.nsh
!include x64.nsh

; Nombre del servicio
!define STARSEED_SERVICE_NAME "StarSeedAyudante"
; Ruta relativa al ejecutable del ayudante dentro del directorio de instalación
!define STARSEED_AYUDANTE_EXE "$INSTDIR\ayudante.exe"

; ─── Variables ───
Var STARSEED_SERVICE_EXISTS
Var STARSEED_SERVICE_RUNNING

; ─── Función: Verificar si el servicio existe ───
Function StarSeed_CheckServiceExists
    Push $R0
    Push $R1
    ClearErrors
    ; sc.exe query devuelve 0 si existe, 1060 si no existe
    nsExec::ExecToLog 'sc.exe query "${STARSEED_SERVICE_NAME}"'
    Pop $R0
    ; $R0 = 0 (existe), 1060 (no existe), otros = error
    StrCmp $R0 "0" 0 +2
    StrCpy $STARSEED_SERVICE_EXISTS "1"
    Goto +1
    StrCpy $STARSEED_SERVICE_EXISTS "0"
    Pop $R1
    Pop $R0
FunctionEnd

; ─── Función: Verificar si el servicio está corriendo ───
Function StarSeed_CheckServiceRunning
    Push $R0
    Push $R1
    Push $R2
    ClearErrors
    nsExec::ExecToLog 'sc.exe query "${STARSEED_SERVICE_NAME}"'
    Pop $R0
    ; Parsear salida para buscar STATE RUNNING
    StrCpy $R1 $R0
    ; La salida de nsExec::ExecToLog va al log, no a variable.
    ; Usar approach alternativo: sc query | find "RUNNING"
    nsExec::ExecToStack 'sc.exe query "${STARSEED_SERVICE_NAME}"'
    Pop $R0
    Pop $R1
    Pop $R2
    ${If} $R2 == "RUNNING"
        StrCpy $STARSEED_SERVICE_RUNNING "1"
    ${Else}
        StrCpy $STARSEED_SERVICE_RUNNING "0"
    ${EndIf}
    Pop $R2
    Pop $R1
    Pop $R0
FunctionEnd

; ─── Función: Instalar el servicio ───
Function StarSeed_InstallService
    Push $R0
    Push $R1
    Push $R2

    ; Verificar que el ejecutable del ayudante existe
    IfFileExists "${STARSEED_AYUDANTE_EXE}" 0 +3
    MessageBox MB_ICONSTOP "No se encuentra ${STARSEED_AYUDANTE_EXE}$\nEl servicio no se puede instalar."
    Goto StarSeed_InstallService_Done

    ; Verificar si ya existe
    Call StarSeed_CheckServiceExists
    ${If} $STARSEED_SERVICE_EXISTS == "1"
        ; Detener y eliminar servicio existente
        Call StarSeed_StopService
        nsExec::ExecToLog 'sc.exe delete "${STARSEED_SERVICE_NAME}"'
        Pop $R0
        Sleep 2000
    ${EndIf}

    ; Crear el servicio
    ; sc.exe create nombre binPath= "ruta" DisplayName= "nombre" start= auto
    nsExec::ExecToLog 'sc.exe create "${STARSEED_SERVICE_NAME}" binPath= "${STARSEED_AYUDANTE_EXE}" DisplayName= "StarSeed Ayudante" start= auto'
    Pop $R0
    ${If} $R0 != "0"
        MessageBox MB_ICONSTOP "Error creando el servicio (código $R0).$\n¿Ejecutando como Administrador?"
        Goto StarSeed_InstallService_Done
    ${EndIf}

    ; Configurar recuperación: reiniciar en fallo (cada 60s, reset a 24h)
    nsExec::ExecToLog 'sc.exe failure "${STARSEED_SERVICE_NAME}" reset= 86400 actions= restart/60000/restart/60000/restart/60000'
    Pop $R0

    ; Iniciar el servicio
    Call StarSeed_StartService

    StarSeed_InstallService_Done:
    Pop $R2
    Pop $R1
    Pop $R0
FunctionEnd

; ─── Función: Iniciar el servicio ───
Function StarSeed_StartService
    Push $R0
    nsExec::ExecToLog 'sc.exe start "${STARSEED_SERVICE_NAME}"'
    Pop $R0
    ; sc start devuelve 0 si éxito, 1056 si ya está corriendo
    ${If} $R0 != "0" ${AndIf} $R0 != "1056"
        DetailPrint "Advertencia: sc start devolvió código $R0"
    ${EndIf}
    Pop $R0
FunctionEnd

; ─── Función: Detener el servicio ───
Function StarSeed_StopService
    Push $R0
    nsExec::ExecToLog 'sc.exe stop "${STARSEED_SERVICE_NAME}"'
    Pop $R0
    ; Esperar a que se detenga (máx 10s)
    StrCpy $R1 0
    StarSeed_StopService_Wait:
    Sleep 500
    Call StarSeed_CheckServiceRunning
    ${If} $STARSEED_SERVICE_RUNNING == "0"
        Goto StarSeed_StopService_Done
    ${EndIf}
    IntOp $R1 $R1 + 1
    ${If} $R1 < 20
        Goto StarSeed_StopService_Wait
    ${EndIf}
    StarSeed_StopService_Done:
    Pop $R0
FunctionEnd

; ─── Función: Desinstalar el servicio ───
Function StarSeed_UninstallService
    Push $R0
    Push $R1

    Call StarSeed_CheckServiceExists
    ${If} $STARSEED_SERVICE_EXISTS == "1"
        Call StarSeed_StopService
        nsExec::ExecToLog 'sc.exe delete "${STARSEED_SERVICE_NAME}"'
        Pop $R0
        ${If} $R0 != "0"
            DetailPrint "Advertencia: sc delete devolvió código $R0"
        ${EndIf}
    ${Else}
        DetailPrint "Servicio ${STARSEED_SERVICE_NAME} no existe, nada que desinstalar."
    ${EndIf}

    Pop $R1
    Pop $R0
FunctionEnd

; ─── Hook: .onInstSuccess (después de instalar archivos) ───
Function .onInstSuccess
    ; Instalar el servicio solo en instalación perMachine (requiere UAC)
    ; El instalador ya corre elevado porque installMode=perMachine
    Call StarSeed_InstallService
FunctionEnd

; ─── Hook: un.onUninstSuccess (después de desinstalar archivos) ───
Function un.onUninstSuccess
    ; Desinstalar el servicio en desinstalación
    Call StarSeed_UninstallService
FunctionEnd

; ─── Hook: .onInit (al inicio del instalador) ───
Function .onInit
    ; Verificar privilegios de administrador para perMachine
    ; NSIS con installMode=perMachine ya pide UAC via RequestExecutionLevel admin
    ; Pero podemos hacer verificación extra
    UserInfo::GetAccountType
    Pop $R0
    StrCmp $R0 "Admin" 0 +2
    ; Ya somos admin, continuar
    Goto +1
    ; No somos admin - pero installMode=perMachine ya fuerza UAC
    ; Esto es solo por si acaso
    MessageBox MB_ICONEXCLAMATION "Este instalador requiere privilegios de administrador.$\nSe solicitará elevación UAC."
FunctionEnd

; ─── Hook: un.onInit (al inicio del desinstalador) ───
Function un.onInit
    ; Verificar privilegios de administrador
    UserInfo::GetAccountType
    Pop $R0
    StrCmp $R0 "Admin" 0 +2
    Goto +1
    MessageBox MB_ICONEXCLAMATION "Este desinstalador requiere privilegios de administrador.$\nSe solicitará elevación UAC."
FunctionEnd

; ─── Página personalizada: Confirmar instalación del servicio ───
; (Opcional: se puede habilitar añadiendo a la sección de páginas del .nsi principal)
!macro STARSEED_SERVICE_PAGE
    ; Página para confirmar si instalar el servicio (opcional)
    ; Page Custom StarSeed_ServicePage_Create StarSeed_ServicePage_Leave
!macroend

Function StarSeed_ServicePage_Create
    ; Crear checkbox "Instalar servicio StarSeed Ayudante (requiere administrador)"
    ; Por defecto marcado
    !insertmacro MUI_HEADER_TEXT "Servicio StarSeed Ayudante" "Instalar el servicio privilegiado para gestión de discos, servicios y actualizaciones."
    nsDialogs::Create 1018
    Pop $R0
    ${NSD_CreateCheckbox} 20 20 100% 20 "Instalar servicio StarSeed Ayudante (gestión de almacenes, servicios, actualizaciones)"
    Pop $R1
    ${NSD_Check} $R1
    nsDialogs::Show
FunctionEnd

Function StarSeed_ServicePage_Leave
    ${NSD_GetState} $R1 $R0
    StrCmp $R0 ${BST_CHECKED} 0 +2
    StrCpy $R2 "1"  ; Instalar servicio
    Goto +1
    StrCpy $R2 "0"  ; No instalar
FunctionEnd

; ─── Sección personalizada para el instalador (se incluye desde el .nsi principal) ───
!macro STARSEED_SERVICE_SECTION
    Section "StarSeed Ayudante (servicio Windows)" SecStarSeedService
        SectionIn RO
        Call StarSeed_InstallService
    SectionEnd
!macroend

!macro STARSEED_SERVICE_UNSECTION
    Section "Uninstall StarSeed Ayudante" SecStarSeedServiceUn
        Call StarSeed_UninstallService
    SectionEnd
!macroend