package com.mmp.rakivo

import android.app.Application
import com.mmp.rakivo.utils.Pref

class RakivoApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Pref.init(this)
    }
}
