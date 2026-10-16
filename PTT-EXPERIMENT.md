# Experimento PTT FIFO

Base: `0b2e810`. Rama: `experiment/ptt-fifo-diagnostics-20261016`.

La cola serializa descarga, reproducción completa y liberación del reproductor.
Cada elemento tiene una ruta temporal propia; se elimina al terminar, incluso
si falla. Los errores rechazados por descarga, configuración o reproducción
se registran y permiten continuar. Un watchdog de reproducción usa la duración
nativa + 30 segundos (5 minutos si no hay duración) ante callbacks ausentes.
Una descarga que nunca resuelva sigue dependiendo del timeout de red nativo.

La llegada de otro PTT no cancela el actual. Se conserva la cancelación explícita
al pulsar transmitir o desmontar la app; se registra como `playback_cancelled`.
No se cambiaron UI, subida, protocolo, servidor ni servicio/permisos Android.

## Validación automatizada

Con las dependencias instaladas: `node --test tests/*.test.cjs`.
En este checkout se usaron las dependencias existentes, solo para lectura:

```powershell
$env:NODE_PATH='C:\dev\colectivos\node_modules'
node --test tests/*.test.cjs
```

Se prueban ráfaga de 20 elementos, orden, ausencia de solapamiento, espera de
fin nativo después de playAsync, errores, watchdog, cancelación, descarte al
desmontar, integración del manejador WebSocket y regresiones de tema/conexión.
Los dispositivos y la reproducción nativa real requieren la prueba siguiente.

## Prueba comparativa Lenovo / Honor / Xiaomi

1. Usar el mismo APK experimental en los tres receptores y un cuarto equipo
   emisor. Misma sala y nombres diferentes; sincronizar fecha/hora automáticas.
   Mantener los ajustes de batería indicados para cada teléfono y anotarlos.
2. Registrar por equipo modelo, red (Wi-Fi o 4G), hora de bloqueo, hora de
   desbloqueo y cada envío. Repetir primero con pantalla encendida y luego
   minimizada/bloqueada tras esperar 1, 5 y 15 minutos. Repetir en Wi-Fi y 4G.
3. Enviar cinco mensajes numerados, de 4–6 segundos, con el menor intervalo
   que permita la subida. Repetir tres veces por condición. No pulsar PTT en
   los receptores. Comprobar cinco mensajes completos, en orden y sin cortes.
4. Capturar logs completos por dispositivo, idealmente con ADB inalámbrico
   para evitar que la alimentación USB cambie el modo de suspensión:

   ```powershell
   adb -s SERIAL logcat -v epoch > xiaomi-ptt.log
   ```

   Cambiar SERIAL y el nombre para cada equipo. Empezar antes del bloqueo,
   terminar después del desbloqueo; buscar `[PTT]` en la captura. Verificar
   antes que el APK conserve console.log y las líneas aparezcan en logcat.
5. Correlacionar el mismo mensaje entre teléfonos por `url`/`serverId`, no por
   `diagnosticId` (es local). Conservar captura original y una tabla con hora
   de envío, `ws_receive`, `download_start/end`, `playback_start/end`, errores
   y hora de desbloqueo.

Lectura del resultado:

- `ws_receive` inmediato y reproducción tardía: el evento ya llegó al código
  JavaScript; examinar tiempo en cola, descarga, configuración y reproducción.
- `ws_receive` recién al despertar, mientras los otros recibieron antes:
  demora de entrega al manejador JavaScript, anterior a la cola. Estos logs
  no distinguen red/socket nativo de suspensión del hilo JavaScript.
- `at`/`epochMs` son la hora del registro, aunque logcat lo muestre después.
  `receivedAt` se toma al entrar al callback; `sinceReceiveMs` mide la espera
  acumulada. `appState=background` no certifica pantalla bloqueada: usar la
  hora de bloqueo/desbloqueo anotada.
- Por PTT correcto: `ws_receive → enqueue → queue_start → download_start →
  download_end → playback_start → playback_end → queue_next`. El siguiente
  `queue_start` debe seguir al `queue_next` anterior. Errores terminan con
  `item_error → queue_next`; filtros registran `ignored_echo/ignored_channel`.

## APK

No generado. `/android` está ignorado y no existe en el checkout de la base.
La carpeta local de main contiene configuración y artefactos no versionados.
Generar un proyecto Android o incorporar esa copia requiere un paso adicional
fuera de este experimento acotado; no se hizo prebuild ni se modificó main.
