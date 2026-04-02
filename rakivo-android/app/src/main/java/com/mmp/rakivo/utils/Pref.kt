package com.mmp.rakivo.utils

import android.content.Context
import android.content.SharedPreferences

object Pref {
    private lateinit var preferences: SharedPreferences

    fun init(context: Context) {
        preferences = context.getSharedPreferences("rakivo", Context.MODE_PRIVATE)
    }

    var userId: Int
        get() = preferences.getInt("user_id", 0)
        set(value) = preferences.edit().putInt("user_id", value).apply()

    var token: String?
        get() = preferences.getString("token", null)
        set(value) = preferences.edit().putString("token", value).apply()

    fun clearSession() {
        preferences.edit()
            .remove("user_id")
            .remove("token")
            .apply()
    }
}
