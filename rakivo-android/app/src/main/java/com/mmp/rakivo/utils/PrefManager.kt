package com.mmp.rakivo.utils

import android.content.Context

class PrefManager(context: Context) {

    private val pref =
        context.getSharedPreferences(
            "rakivo",
            Context.MODE_PRIVATE
        )

    fun saveUser(userId: Int, token: String) {
        pref.edit()
            .putInt("user_id", userId)
            .putString("token", token)
            .apply()
    }

    fun getUserId(): Int {
        return pref.getInt("user_id", 0)
    }

    fun setKycCompleted(completed: Boolean) {
        pref.edit()
            .putBoolean("kyc_completed", completed)
            .apply()
    }

    fun isKycCompleted(): Boolean {
        return pref.getBoolean("kyc_completed", false)
    }

    fun saveUserData(name: String, email: String) {
        pref.edit()
            .putString("user_name", name)
            .putString("user_email", email)
            .apply()
    }
}
