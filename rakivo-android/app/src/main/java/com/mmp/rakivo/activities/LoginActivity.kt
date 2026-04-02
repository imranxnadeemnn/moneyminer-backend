package com.mmp.rakivo.activities

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mmp.rakivo.MainActivity
import com.mmp.rakivo.analytics.RakivoAnalytics
import com.mmp.rakivo.api.ApiClient
import com.mmp.rakivo.api.backendErrorMessage
import com.mmp.rakivo.databinding.ActivityLoginBinding
import com.mmp.rakivo.model.RequestOtpRequest
import com.mmp.rakivo.model.RequestOtpResponse
import com.mmp.rakivo.model.VerifyOtpRequest
import com.mmp.rakivo.model.VerifyOtpResponse
import com.mmp.rakivo.utils.Pref
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding
    private var otpRequested = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        Pref.clearSession()
        RakivoAnalytics.clearUser()
        RakivoAnalytics.setUserState("anonymous")
        RakivoAnalytics.logScreen("login")
        renderOtpState()

        binding.btnLogin.setOnClickListener {
            val identifier = binding.etIdentifier.text.toString().trim()
            val channel = if (identifier.contains("@")) "email" else "phone"
            val otp = binding.etOtp.text.toString().trim()

            if (identifier.isEmpty()) {
                Toast.makeText(this, "Please enter phone number or email", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (!otpRequested) {
                requestOtp(channel, identifier)
                return@setOnClickListener
            }

            if (otp.isEmpty()) {
                Toast.makeText(this, "Please enter OTP", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            binding.progress.visibility = View.VISIBLE
            binding.btnLogin.isEnabled = false

            ApiClient.api.verifyOtp(
                VerifyOtpRequest(channel = channel, target = identifier, otp = otp)
            ).enqueue(object : Callback<VerifyOtpResponse> {
                override fun onResponse(
                    call: Call<VerifyOtpResponse>,
                    response: Response<VerifyOtpResponse>
                ) {
                    binding.progress.visibility = View.GONE
                    binding.btnLogin.isEnabled = true

                    if (response.isSuccessful) {
                        val auth = response.body()
                        val userId = auth?.userId ?: 0
                        Pref.userId = userId
                        Pref.token = null

                        val nextScreen = if (
                            auth?.profileCompleted == true &&
                            auth.kycCompleted &&
                            auth.payoutCompleted
                        ) {
                            MainActivity::class.java
                        } else {
                            ProfileActivity::class.java
                        }

                        RakivoAnalytics.logLoginSuccess(
                            channel = channel,
                            userId = userId,
                            nextScreen = nextScreen.simpleName
                        )
                        RakivoAnalytics.setUserState(
                            if (nextScreen == MainActivity::class.java) "wallet_ready" else "onboarding"
                        )
                        startActivity(Intent(this@LoginActivity, nextScreen))
                        finishAffinity()
                    } else {
                        Toast.makeText(
                            this@LoginActivity,
                            response.backendErrorMessage("Login failed"),
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }

                override fun onFailure(call: Call<VerifyOtpResponse>, t: Throwable) {
                    binding.progress.visibility = View.GONE
                    binding.btnLogin.isEnabled = true
                    Toast.makeText(this@LoginActivity, "Error: ${t.message}", Toast.LENGTH_SHORT).show()
                }
            })
        }
    }

    private fun requestOtp(channel: String, identifier: String) {
        binding.progress.visibility = View.VISIBLE
        binding.btnLogin.isEnabled = false
        RakivoAnalytics.logOtpRequested(channel)

        ApiClient.api.requestOtp(
            RequestOtpRequest(channel = channel, target = identifier)
        ).enqueue(object : Callback<RequestOtpResponse> {
            override fun onResponse(
                call: Call<RequestOtpResponse>,
                response: Response<RequestOtpResponse>
            ) {
                binding.progress.visibility = View.GONE
                binding.btnLogin.isEnabled = true

                if (response.isSuccessful) {
                    otpRequested = true
                    renderOtpState()
                    val demoOtp = response.body()?.demoOtp ?: "1234"
                    Toast.makeText(
                        this@LoginActivity,
                        "OTP sent. Use $demoOtp for demo login.",
                        Toast.LENGTH_SHORT
                    ).show()
                } else {
                    Toast.makeText(
                        this@LoginActivity,
                        response.backendErrorMessage("Failed to send OTP"),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            override fun onFailure(call: Call<RequestOtpResponse>, t: Throwable) {
                binding.progress.visibility = View.GONE
                binding.btnLogin.isEnabled = true
                Toast.makeText(this@LoginActivity, "Error: ${t.message}", Toast.LENGTH_SHORT).show()
            }
        })
    }

    private fun renderOtpState() {
        binding.otpContainer.visibility = if (otpRequested) View.VISIBLE else View.GONE
        binding.btnLogin.text = if (otpRequested) "Verify OTP" else "Send OTP"
        binding.txtHint.text = if (otpRequested) {
            "Enter the OTP sent to your phone number or email. Demo OTP: 1234"
        } else {
            "Sign in with your phone number or email to discover featured app offers."
        }
    }
}
