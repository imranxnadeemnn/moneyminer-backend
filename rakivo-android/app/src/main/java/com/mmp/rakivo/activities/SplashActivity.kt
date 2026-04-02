package com.mmp.rakivo.activities

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.mmp.rakivo.R
import com.mmp.rakivo.utils.Pref

@SuppressLint("CustomSplashScreen")
class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContentView(R.layout.activity_splash)

        val nextScreen = if (Pref.userId == 0) {
            LoginActivity::class.java
        } else {
            ProfileActivity::class.java
        }

        startActivity(Intent(this, nextScreen))

        finish()
    }
}
