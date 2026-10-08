package com.tulinea.radio.background

import android.content.Intent
import android.os.Build
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

      context.stopService(Intent(context, ColectivosBackgroundService::class.java))
      true
    }
  }
}
