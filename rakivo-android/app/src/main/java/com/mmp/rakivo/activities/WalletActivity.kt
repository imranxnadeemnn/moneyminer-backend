package com.mmp.rakivo.activities

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mmp.rakivo.MainActivity
import com.mmp.rakivo.R
import com.mmp.rakivo.api.ApiClient
import com.mmp.rakivo.api.backendErrorMessage
import com.mmp.rakivo.databinding.ActivityWalletBinding
import com.mmp.rakivo.model.ApiResponse
import com.mmp.rakivo.model.WalletResponse
import com.mmp.rakivo.model.WithdrawRequest
import com.mmp.rakivo.utils.Pref
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class WalletActivity : AppCompatActivity() {
    private lateinit var binding: ActivityWalletBinding
    private val handler = Handler(Looper.getMainLooper())

    private val refreshRunnable = object : Runnable {
        override fun run() {
            fetchWallet(showProgress = false)
            handler.postDelayed(this, 2000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Pref.userId == 0) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding = ActivityWalletBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Wallet"

        fetchWallet()
        handler.post(refreshRunnable)

        binding.btnWithdraw.setOnClickListener {
            withdraw()
        }

        binding.btnViewHistory.setOnClickListener {
            startActivity(Intent(this, HistoryActivity::class.java))
        }

        binding.btnKyc.setOnClickListener {
            startActivity(Intent(this, KycActivity::class.java))
        }

        binding.btnLogout.setOnClickListener {
            Pref.clearSession()
            val intent = Intent(this, LoginActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            finish()
        }

        binding.bottomNav.selectedItemId = R.id.nav_wallet
        binding.bottomNav.setOnItemSelectedListener {
            when (it.itemId) {
                R.id.nav_home -> {
                    startActivity(Intent(this, MainActivity::class.java))
                    true
                }
                R.id.nav_wallet -> true
                R.id.nav_history -> {
                    startActivity(Intent(this, HistoryActivity::class.java))
                    true
                }
                else -> false
            }
        }
    }

    private fun fetchWallet(showProgress: Boolean = true) {
        if (showProgress) binding.progress.visibility = View.VISIBLE
        ApiClient.api.wallet(Pref.userId).enqueue(object : Callback<WalletResponse?> {
            override fun onResponse(
                call: Call<WalletResponse?>,
                response: Response<WalletResponse?>
            ) {
                if (showProgress) binding.progress.visibility = View.GONE
                if (response.isSuccessful) {
                    val wallet = response.body()
                    val balance = wallet?.balance ?: 0.0
                    binding.tvBalance.text = String.format("₹%.2f", balance)
                }
            }

            override fun onFailure(call: Call<WalletResponse?>, t: Throwable) {
                if (showProgress) binding.progress.visibility = View.GONE
                if (showProgress) Toast.makeText(this@WalletActivity, "Failed to fetch balance", Toast.LENGTH_SHORT).show()
            }
        })
    }

    private fun withdraw() {
        binding.progress.visibility = View.VISIBLE
        val body = WithdrawRequest(
            userId = Pref.userId,
            amount = 10
        )

        ApiClient.api.withdraw(body).enqueue(object : Callback<ApiResponse> {
            override fun onResponse(call: Call<ApiResponse>, response: Response<ApiResponse>) {
                binding.progress.visibility = View.GONE
                if (response.isSuccessful) {
                    Toast.makeText(this@WalletActivity, "Withdrawal successful!", Toast.LENGTH_SHORT).show()
                    fetchWallet()
                } else {
                    Toast.makeText(
                        this@WalletActivity,
                        response.backendErrorMessage("Withdrawal failed"),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            override fun onFailure(call: Call<ApiResponse>, t: Throwable) {
                binding.progress.visibility = View.GONE
                Toast.makeText(this@WalletActivity, "Error: ${t.message}", Toast.LENGTH_SHORT).show()
            }
        })
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(refreshRunnable)
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}
