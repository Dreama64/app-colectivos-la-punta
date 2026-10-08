package com.tulinea.radio.background

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class ColectivosBackgroundService : Service() {

  companion object {
    const val CHANNEL_ID = "colectivos_radio_background"
    const val NOTIFICATION_ID = 1001
  }

  override fun onCreate() {
    super.onCreate()
    crearCanalNotificacion()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Colectivos La Punta")
      .setContentText("Radio activa en segundo plano")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

    startForeground(NOTIFICATION_ID, notification)

    return START_STICKY
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
