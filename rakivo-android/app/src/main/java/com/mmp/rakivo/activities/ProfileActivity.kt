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
import com.mmp.rakivo.databinding.ActivityProfileBinding
import com.mmp.rakivo.model.ApiResponse
import com.mmp.rakivo.model.OnboardingResponse
import com.mmp.rakivo.model.PaymentMethodRequest
import com.mmp.rakivo.model.PaymentMethodResponse
import com.mmp.rakivo.model.ProfileUpdateRequest
import com.mmp.rakivo.utils.Pref
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class ProfileActivity : AppCompatActivity() {
    private lateinit var binding: ActivityProfileBinding
    private var currentPayoutMode = "upi"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Pref.userId == 0) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding = ActivityProfileBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Profile Setup"
        RakivoAnalytics.logScreen("profile_setup")
        RakivoAnalytics.setUserState("onboarding")

        binding.radioPayoutMode.setOnCheckedChangeListener { _, checkedId ->
            currentPayoutMode = if (checkedId == binding.radioBank.id) "bank_account" else "upi"
            renderPayoutMode()
        }

        binding.btnSaveProfile.setOnClickListener { saveProfile() }
        binding.btnSavePayment.setOnClickListener { savePaymentMethod() }
        binding.btnOpenKyc.setOnClickListener {
            startActivity(Intent(this, KycActivity::class.java))
        }
        binding.btnContinue.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
        binding.btnLogout.setOnClickListener {
            Pref.clearSession()
            val intent = Intent(this, LoginActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            finish()
        }

        renderPayoutMode()
    }

    override fun onResume() {
        super.onResume()
        loadOnboarding()
    }

    private fun loadOnboarding() {
        binding.progress.visibility = View.VISIBLE
        ApiClient.api.onboarding(Pref.userId).enqueue(object : Callback<OnboardingResponse> {
            override fun onResponse(
                call: Call<OnboardingResponse>,
                response: Response<OnboardingResponse>
            ) {
                binding.progress.visibility = View.GONE
                if (!response.isSuccessful) {
                    Toast.makeText(
                        this@ProfileActivity,
                        response.backendErrorMessage("Unable to load profile"),
                        Toast.LENGTH_SHORT
                    ).show()
                    return
                }

                val data = response.body() ?: return
                val onboarding = data.onboarding
                val paymentMethod = data.paymentMethod
                val kyc = data.kyc

                binding.etFullName.setText(onboarding.fullName.orEmpty())
                binding.etEmail.setText(onboarding.email.orEmpty())
                binding.etPhone.setText(onboarding.phone.orEmpty())
                binding.etAccountName.setText(paymentMethod?.accountName.orEmpty())
                binding.etUpiId.setText(paymentMethod?.upiId.orEmpty())
                binding.etAccountNumber.setText(paymentMethod?.accountNumber.orEmpty())
                binding.etIfsc.setText(paymentMethod?.ifsc.orEmpty())
                binding.etPayoutEmail.setText(paymentMethod?.contactEmail.orEmpty())
                binding.etPayoutPhone.setText(paymentMethod?.contactPhone.orEmpty())

                currentPayoutMode = paymentMethod?.payoutMode ?: paymentMethod?.methodType ?: "upi"
                if (currentPayoutMode == "bank_account") {
                    binding.radioBank.isChecked = true
                } else {
                    binding.radioUpi.isChecked = true
                }
                renderPayoutMode()

                binding.tvHeaderTitle.text = if (onboarding.profileCompleted && onboarding.kycCompleted && onboarding.payoutCompleted) {
                    "Your Rakivo account is ready"
                } else {
                    "Complete your Rakivo profile"
                }

                binding.tvHeaderSubtitle.text = buildString {
                    append(if (onboarding.profileCompleted) "Profile saved" else "Profile pending")
                    append(" • ")
                    append(if (onboarding.kycCompleted) "KYC submitted" else "KYC pending")
                    append(" • ")
                    append(if (onboarding.payoutCompleted) "Payout active" else "Payout pending")
                }

                binding.tvKycStatus.text = when (kyc?.status?.lowercase()) {
                    "approved" -> "KYC approved"
                    "submitted" -> "KYC submitted and pending review"
                    else -> "KYC not submitted."
                }

                binding.tvPayoutStatus.text = when {
                    paymentMethod == null -> "No Razorpay payout method saved yet."
                    paymentMethod.razorpayFundAccountId.isNullOrBlank() ->
                        "Payout details saved. Razorpay beneficiary sync is still pending."
                    paymentMethod.payoutMode == "bank_account" -> {
                        val accountTail = paymentMethod.accountNumber?.takeLast(4).orEmpty()
                        "Active Razorpay bank payout • ****$accountTail"
                    }
                    !paymentMethod.upiId.isNullOrBlank() -> "Active Razorpay UPI payout via ${paymentMethod.upiId}"
                    else -> "Razorpay payout method saved"
                }

                binding.btnContinue.isEnabled = onboarding.profileCompleted
                binding.btnOpenKyc.text = if (onboarding.kycCompleted) "Review KYC" else "Complete KYC"
            }

            override fun onFailure(call: Call<OnboardingResponse>, t: Throwable) {
                binding.progress.visibility = View.GONE
                Toast.makeText(this@ProfileActivity, "Error: ${t.message}", Toast.LENGTH_SHORT).show()
            }
        })
    }

    private fun saveProfile() {
        val fullName = binding.etFullName.text.toString().trim()
        val email = binding.etEmail.text.toString().trim()
        val phone = binding.etPhone.text.toString().trim()

        if (fullName.isEmpty() || (email.isEmpty() && phone.isEmpty())) {
            Toast.makeText(this, "Add full name and phone or email", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progress.visibility = View.VISIBLE
        ApiClient.api.updateProfile(
            ProfileUpdateRequest(
                userId = Pref.userId,
                fullName = fullName,
                email = email.ifBlank { null },
                phone = phone.ifBlank { null }
            )
        ).enqueue(object : Callback<ApiResponse> {
            override fun onResponse(call: Call<ApiResponse>, response: Response<ApiResponse>) {
                binding.progress.visibility = View.GONE
                if (response.isSuccessful) {
                    Toast.makeText(this@ProfileActivity, "Profile saved", Toast.LENGTH_SHORT).show()
                    RakivoAnalytics.logProfileSaved(
                        hasEmail = email.isNotBlank(),
                        hasPhone = phone.isNotBlank()
                    )
                    loadOnboarding()
                } else {
                    Toast.makeText(
                        this@ProfileActivity,
                        response.backendErrorMessage("Unable to save profile"),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            override fun onFailure(call: Call<ApiResponse>, t: Throwable) {
                binding.progress.visibility = View.GONE
                Toast.makeText(this@ProfileActivity, "Error: ${t.message}", Toast.LENGTH_SHORT).show()
            }
        })
    }

    private fun savePaymentMethod() {
        val accountName = binding.etAccountName.text.toString().trim()
        val upiId = binding.etUpiId.text.toString().trim()
        val accountNumber = binding.etAccountNumber.text.toString().trim()
        val ifsc = binding.etIfsc.text.toString().trim()
        val payoutEmail = binding.etPayoutEmail.text.toString().trim()
        val payoutPhone = binding.etPayoutPhone.text.toString().trim()

        if (accountName.isEmpty()) {
            Toast.makeText(this, "Enter the account holder name", Toast.LENGTH_SHORT).show()
            return
        }

        if (currentPayoutMode == "upi" && upiId.isEmpty()) {
            Toast.makeText(this, "Enter a valid UPI ID", Toast.LENGTH_SHORT).show()
            return
        }

        if (currentPayoutMode == "bank_account" && (accountNumber.isEmpty() || ifsc.isEmpty())) {
            Toast.makeText(this, "Enter bank account number and IFSC", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progress.visibility = View.VISIBLE
        ApiClient.api.savePaymentMethod(
            PaymentMethodRequest(
                userId = Pref.userId,
                provider = "razorpay",
                payoutMode = currentPayoutMode,
                upiId = upiId.ifBlank { null },
                accountName = accountName.ifBlank { null },
                accountNumber = accountNumber.ifBlank { null },
                ifsc = ifsc.ifBlank { null },
                contactEmail = payoutEmail.ifBlank { null },
                contactPhone = payoutPhone.ifBlank { null }
            )
        ).enqueue(object : Callback<PaymentMethodResponse> {
            override fun onResponse(
                call: Call<PaymentMethodResponse>,
                response: Response<PaymentMethodResponse>
            ) {
                binding.progress.visibility = View.GONE
                if (response.isSuccessful) {
                    val syncStatus = response.body()?.razorpaySyncStatus
                    val message = when (syncStatus) {
                        "synced" -> "Razorpay payout method synced"
                        "missing_credentials" -> "Payout saved. Razorpay sync is pending backend credentials."
                        else -> "Payout method saved"
                    }
                    RakivoAnalytics.logPayoutMethodSaved(currentPayoutMode, syncStatus)
                    Toast.makeText(this@ProfileActivity, message, Toast.LENGTH_SHORT).show()
                    loadOnboarding()
                } else {
                    Toast.makeText(
                        this@ProfileActivity,
                        response.backendErrorMessage("Unable to save payout method"),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            override fun onFailure(call: Call<PaymentMethodResponse>, t: Throwable) {
                binding.progress.visibility = View.GONE
                Toast.makeText(this@ProfileActivity, "Error: ${t.message}", Toast.LENGTH_SHORT).show()
            }
        })
    }

    private fun renderPayoutMode() {
        val bankVisible = currentPayoutMode == "bank_account"
        binding.etUpiId.visibility = if (bankVisible) View.GONE else View.VISIBLE
        binding.etAccountNumber.visibility = if (bankVisible) View.VISIBLE else View.GONE
        binding.etIfsc.visibility = if (bankVisible) View.VISIBLE else View.GONE
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}
