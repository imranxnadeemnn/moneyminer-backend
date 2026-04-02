package com.mmp.rakivo.activities

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mmp.rakivo.activities.LoginActivity
import com.mmp.rakivo.api.ApiClient
import com.mmp.rakivo.api.backendErrorMessage
import com.mmp.rakivo.databinding.ActivityKycBinding
import com.mmp.rakivo.model.ApiResponse
import com.mmp.rakivo.model.KycRequest
import com.mmp.rakivo.utils.Pref
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class KycActivity : AppCompatActivity() {

    private lateinit var binding: ActivityKycBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Pref.userId == 0) {
            startActivity(android.content.Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding = ActivityKycBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Complete KYC"

        binding.btnSubmit.setOnClickListener {
            submitKyc()
        }
    }


    private fun submitKyc() {
        val name = binding.edtName.text.toString()
        val pan = binding.edtPan.text.toString()
        val upi = binding.edtUpi.text.toString()

        if (name.isEmpty() || pan.isEmpty() || upi.isEmpty()) {
            Toast.makeText(this, "Please fill all fields", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progress.visibility = View.VISIBLE

        val body = KycRequest(
            userId = Pref.userId,
            name = name,
            pan = pan,
            upi = upi
        )

        ApiClient.api.kyc(body)
            .enqueue(object : Callback<ApiResponse> {
                override fun onResponse(
                    call: Call<ApiResponse>,
                    response: Response<ApiResponse>
                ) {
                    binding.progress.visibility = View.GONE
                    if (response.isSuccessful) {
                        Toast.makeText(
                            this@KycActivity,
                            "KYC submitted",
                            Toast.LENGTH_SHORT
                        ).show()
                        finish()
                    } else {
                        Toast.makeText(
                            this@KycActivity,
                            response.backendErrorMessage("KYC submission failed"),
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }

                override fun onFailure(
                    call: Call<ApiResponse>,
                    t: Throwable
                ) {
                    binding.progress.visibility = View.GONE
                    Toast.makeText(
                        this@KycActivity,
                        "Error: ${t.message}",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            })
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}
