package com.mmp.rakivo.activities

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.mmp.rakivo.databinding.ActivityProfileBinding

class ProfileActivity : AppCompatActivity() {
    private lateinit var binding: ActivityProfileBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityProfileBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Profile"

        binding.btnLogout.setOnClickListener {
            // TODO: Implementation for logout
            finishAffinity()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}