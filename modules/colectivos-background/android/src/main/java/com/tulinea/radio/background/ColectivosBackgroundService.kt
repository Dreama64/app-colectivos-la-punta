package com.tulinea.radio.background

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat

class ColectivosBackgroundService : Service() {

  companion object {
    const val CHANNEL_ID = "colectivos_radio_background"
    const val NOTIFICATION_ID = 1001
    const val ACTION_START = "com.tulinea.radio.background.START_SESSION"
    const val TAG = "PTT-BG"
  }

  private var wakeLock: PowerManager.WakeLock? = null

  private fun diagnostic(event: String) {
    val power = getSystemService(POWER_SERVICE) as PowerManager
    Log.i(TAG, "[PTT-BG] $event epochMs=${System.currentTimeMillis()} elapsedMs=${SystemClock.elapsedRealtime()} held=${wakeLock?.isHeld == true} interactive=${power.isInteractive} idle=${power.isDeviceIdleMode}")
  }

  private fun releaseWakeLock(reason: String) {
    if (wakeLock?.isHeld == true) wakeLock?.release()
    wakeLock = null
    diagnostic("wake_release reason=$reason")
  }

  override fun onCreate() {
    super.onCreate()
    crearCanalNotificacion()
    diagnostic("service_create")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    diagnostic("service_start startId=$startId flags=$flags action=${intent?.action}")
    // JS owns the channel/connection. Never resurrect an orphan radio session.
    if (intent?.action != ACTION_START) {
      releaseWakeLock("restart_without_session")
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Colectivos La Punta")
      .setContentText("Radio activa en segundo plano")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(NOTIFICATION_ID, notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      if (wakeLock?.isHeld != true) {
        val power = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Colectivos:RadioSession").apply {
          setReferenceCounted(false)
          // Session-scoped: explicit stop, task removal and destruction release it.
          acquire()
        }
        diagnostic("wake_acquired")
      } else {
        diagnostic("wake_already_held")
      }
    } catch (error: RuntimeException) {
      Log.e(TAG, "[PTT-BG] start_failed", error)
      releaseWakeLock("start_failed")
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    diagnostic("task_removed")
    releaseWakeLock("task_removed")
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    releaseWakeLock("service_destroy")
    stopForeground(STOP_FOREGROUND_REMOVE)
    diagnostic("service_destroy")
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun crearCanalNotificacion() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Radio en segundo plano",
        NotificationManager.IMPORTANCE_LOW
      )
      channel.description = "Mantiene activa la comunicación de Colectivos La Punta"

      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(channel)
    }
  }
}
