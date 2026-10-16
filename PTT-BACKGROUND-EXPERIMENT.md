# Experimento background / wake lock

Base: beff23268eaf05baeabcce40617b800082e72cec. Sin cambios de servidor, protocolo, UI ni transporte/reproduccion JS. main debe permanecer en 0b2e810.

## Ciclo de vida

- Entrar a un canal solicita el servicio desde la actividad enfocada, con RECORD_AUDIO ya concedido. No arranca al registrar/recuperar operador en el hub.
- Tras startForeground, adquiere PARTIAL_WAKE_LOCK no referenciado, etiqueta Colectivos:RadioSession. Arranques repetidos no acumulan adquisiciones. Se mantiene durante toda la permanencia en el canal, incluso pantalla apagada, reconexion o navegacion interna. No tiene timeout arbitrario: terminarlo durante una sesion invalidaria la prueba.
- SALIR y desmontaje de App llaman stopService; onDestroy libera y retira la notificacion. Quitar la tarea de recientes libera y detiene. Error de inicio tambien libera y detiene.
- START_NOT_STICKY evita recreacion sin JS. Un intent nulo o sin accion de sesion se rechaza. Si Android mata el proceso sin callbacks, el sistema elimina su wake lock; no se restaura la sesion automaticamente. Reabrir y entrar nuevamente al canal.
- Logs nativos PTT-BG con prefijo [PTT-BG], epochMs, elapsedMs, held, interactive e idle; los logs [PTT] originales se conservan. No se asegura conectividad con un wake lock: esta prueba mantiene CPU, no elimina por si sola politicas de red de HyperOS/Doze.

## Tipos y permisos

El manifiesto de biblioteca declara microphone|mediaPlayback; el servicio pasa ambos tipos explicitamente desde API 30, mediaPlayback en API 29 y la variante de dos argumentos antes de API 29. microphone conserva captura de la radio; mediaPlayback corresponde al audio entrante en background. Se agrega FOREGROUND_SERVICE_MEDIA_PLAYBACK al modulo y app.json. WAKE_LOCK, FOREGROUND_SERVICE y FOREGROUND_SERVICE_MICROPHONE ya estaban en app.json; se declaran tambien en el modulo para fusionarlos sin regenerar android/. No se agregan Wi-Fi locks, excepciones de bateria, dataSync, remoteMessaging ni permisos de llamadas.

Referencias: https://developer.android.com/develop/background-work/services/fgs/service-types y https://developer.android.com/develop/background-work/background-tasks/awake/wakelock . Se consulto tambien https://docs.expo.dev/versions/v57.0.0/ como requiere AGENTS.md; la app instalada sigue en Expo 54, sin migracion. La API currentActivity se verifico en expo-modules-core instalado en C:\dev\colectivos.

## Validacion y compilacion local (PowerShell)

Este worktree no tiene android/ ni Java/Kotlin disponibles en PATH. No se hizo prebuild ni build nativo. JS: 19 tests pasan (FIFO, theme, websocket y dos casos de lifecycle), usando NODE_PATH=C:\dev\colectivos\node_modules, porque este worktree no tiene dependencias instaladas. git diff --check pasa. Esto no equivale a validar Kotlin, manifest merger o APK.

Los dos worktrees ya comparten C:\dev\colectivos\.git: no hace falta push, fetch ni copiar archivos. Obtener el hash con git rev-parse HEAD desde el worktree experimental y usarlo como COMMIT_EXPERIMENTAL abajo.

```powershell
Set-Location C:\dev\colectivos
git status --short
# Revisar los cambios locales antes de continuar. No borrarlos, limpiarlos ni agregarlos al commit.
git switch -c prueba-ptt-background-wakelock COMMIT_EXPERIMENTAL
# Si switch detecta conflicto local, detenerse y preservar esos cambios; no forzar.
node --test tests/*.test.cjs
Set-Location android
.\gradlew.bat :app:assembleRelease
```

El manifiesto del modulo se fusiona al compilar; app.json no necesita prebuild. Revisar el manifiesto fusionado bajo android/app/build/intermediates/merged_manifests (ruta depende de Gradle): servicio com.tulinea.radio.background.ColectivosBackgroundService con ambos tipos y permiso FOREGROUND_SERVICE_MEDIA_PLAYBACK. Si falla build/merge, detenerse y conservar el error; no regenerar android/. APK esperado: C:\dev\colectivos\android\app\build\outputs\apk\release\app-release.apk.

## Comparacion Xiaomi

Instalar el APK con el mismo metodo/firma de las pruebas anteriores. Abrir app, conceder microfono, entrar al mismo canal y confirmar notificacion y wake_acquired held=true antes de bloquear. Capturar:

```powershell
adb logcat -v epoch PTT-BG:I ReactNativeJS:V '*:S'
```

Conservar misma Wi-Fi y ajustes. Enviar dos PTT separados con pantalla bloqueada, repetir tras varios minutos; comparar recepcion [PTT] con hora de envio y con pantalla encendida. Durante el retraso consultar en otra terminal:

```powershell
adb shell dumpsys power | Select-String 'Colectivos:RadioSession'
adb shell dumpsys activity services com.tulinea.radio
```

Probar tambien SALIR, volver a entrar, quitar recientes y abrir otra vez. Debe aparecer wake_release al salir/destruir y desaparecer la etiqueta en dumpsys power; entrar de nuevo adquiere una unica vez. Nunca arrancar desde un receiver de boot o intentar restaurar microphone FGS en background.

Si disminuye drasticamente el retraso, continuidad de CPU/servicio influye. Si persiste con servicio y lock confirmados activos, evaluar mover conexion/recepcion PTT al servicio nativo como siguiente experimento, sin acumular parches aleatorios. No afirmar exito hasta probar en el dispositivo.
