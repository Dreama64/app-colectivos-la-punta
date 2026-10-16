package com.tulinea.radio.background

import android.content.Intent
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ColectivosBackgroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ColectivosBackground")

    Function("isAvailable") {
      true
    }

    Function("start") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context no disponible")

      val intent = Intent(context, ColectivosBackgroundService::class.java)
        .setAction(ColectivosBackgroundService.ACTION_START)
      // microphone FGS must start from a visible activity with permission granted.
      check(appContext.currentActivity?.hasWindowFocus() == true) { "Radio start requires a focused activity" }
      check(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
        "Radio start requires RECORD_AUDIO permission"
      }
      Log.i(ColectivosBackgroundService.TAG, "[PTT-BG] start_requested epochMs=${System.currentTimeMillis()}")

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }

      true
    }

    Function("stop") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context no disponible")

      val stopped = context.stopService(Intent(context, ColectivosBackgroundService::class.java))
      Log.i(ColectivosBackgroundService.TAG, "[PTT-BG] stop_requested stopped=$stopped epochMs=${System.currentTimeMillis()}")
      true
    }
  }
}
