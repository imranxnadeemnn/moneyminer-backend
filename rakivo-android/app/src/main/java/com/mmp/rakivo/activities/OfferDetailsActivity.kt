package com.mmp.rakivo.activities

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.bumptech.glide.Glide
import com.mmp.rakivo.databinding.ActivityOfferDetailsBinding

class OfferDetailsActivity : AppCompatActivity() {
    private lateinit var binding: ActivityOfferDetailsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityOfferDetailsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        
        val title = intent.getStringExtra("title") ?: "Offer"
        val description = intent.getStringExtra("description") ?: ""
        val icon = intent.getStringExtra("icon") ?: ""
        val payout = intent.getDoubleExtra("payout", 0.0)
        val playstoreUrl = intent.getStringExtra("playstore_url") ?: "https://play.google.com"

        supportActionBar?.title = title

        binding.tvOfferTitle.text = title
        binding.tvOfferDescription.text = description
        binding.tvOfferPayout.text = "Earn ₹$payout"
        
        Glide.with(this)
            .load(icon)
            .into(binding.ivOfferIcon)

        binding.btnInstallNow.setOnClickListener {
            // Tracking URL with mock user_id
            val trackingUrl = "$playstoreUrl&utm_source=rakivo&af_sub1=test_user_id"
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(trackingUrl))
            startActivity(intent)
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}