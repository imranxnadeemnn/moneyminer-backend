package com.mmp.rakivo.activities

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mmp.rakivo.MainActivity
import com.mmp.rakivo.api.ApiClient
import com.mmp.rakivo.api.backendErrorMessage
import com.mmp.rakivo.databinding.ActivityOtpBinding
import com.mmp.rakivo.model.VerifyOtpRequest
import com.mmp.rakivo.model.VerifyOtpResponse
import com.mmp.rakivo.utils.Pref
import com.mmp.rakivo.utils.PrefManager
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class OtpActivity : AppCompatActivity() {
    private lateinit var binding: ActivityOtpBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityOtpBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val phone = intent.getStringExtra("phone") ?: ""
        val channel = if (phone.contains("@")) "email" else "phone"
        val prefManager = PrefManager(this)

        binding.btnVerify.setOnClickListener {
            val otp = binding.etOtp.text.toString()
            if (otp.isEmpty()) {
                Toast.makeText(this, "Please enter OTP", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (phone.isBlank()) {
                Toast.makeText(this, "Phone number missing. Please login again.", Toast.LENGTH_SHORT).show()
                finish()
                return@setOnClickListener
            }

            binding.btnVerify.isEnabled = false
            binding.btnVerify.text = "Verifying..."
            binding.etOtp.isEnabled = false

            ApiClient.api.verifyOtp(
                VerifyOtpRequest(channel = channel, target = phone, otp = otp)
            ).enqueue(object : Callback<VerifyOtpResponse> {
                override fun onResponse(
                    call: Call<VerifyOtpResponse>,
                    response: Response<VerifyOtpResponse>
                ) {
                    if (response.isSuccessful) {
                        val data = response.body()
                        if (data != null) {
                            val userId = data.userId

                            prefManager.saveUser(userId, "")
                            Pref.userId = userId
                            Pref.token = null

                            startActivity(Intent(this@OtpActivity, MainActivity::class.java))
                            finishAffinity()
                        }
                    } else {
                        resetUi()
                        Toast.makeText(
                            this@OtpActivity,
                            response.backendErrorMessage("Login failed"),
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }

                override fun onFailure(call: Call<VerifyOtpResponse>, t: Throwable) {
                    resetUi()
                    Toast.makeText(this@OtpActivity, "Error: ${t.message}", Toast.LENGTH_SHORT).show()
                }
            })
        }
    }

    private fun resetUi() {
        binding.btnVerify.isEnabled = true
        binding.btnVerify.text = "Verify OTP"
        binding.etOtp.isEnabled = true
    }
}
