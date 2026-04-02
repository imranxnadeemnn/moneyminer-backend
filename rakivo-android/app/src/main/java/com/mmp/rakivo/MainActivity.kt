package com.mmp.rakivo

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.mmp.rakivo.activities.LoginActivity
import com.mmp.rakivo.activities.WalletActivity
import com.mmp.rakivo.adapter.CampaignAdapter
import com.mmp.rakivo.api.ApiClient
import com.mmp.rakivo.databinding.ActivityMainBinding
import com.mmp.rakivo.model.Campaign
import com.mmp.rakivo.model.WalletResponse
import com.mmp.rakivo.utils.Pref
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Pref.userId == 0) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = ""
        binding.txtWelcome.text = "Welcome back, earner"
        binding.txtSectionHint.text = "Tap any offer to install"
        binding.txtEmpty.text = "No featured offers live right now"

        binding.recyclerView.layoutManager = LinearLayoutManager(this)

        binding.txtBalance.setOnClickListener {
            startActivity(Intent(this, WalletActivity::class.java))
        }

        binding.btnRetry.setOnClickListener {
            fetchCampaigns()
        }

        fetchCampaigns()
    }

    override fun onResume() {
        super.onResume()
        fetchWalletBalance()
    }

    private fun fetchCampaigns() {
        binding.progress.visibility = View.VISIBLE
        binding.recyclerView.visibility = View.GONE
        binding.txtEmpty.visibility = View.GONE
        binding.layoutError.visibility = View.GONE

        ApiClient.api.getCampaigns().enqueue(object : Callback<List<Campaign>> {
            override fun onResponse(call: Call<List<Campaign>>, response: Response<List<Campaign>>) {
                binding.progress.visibility = View.GONE

                if (response.isSuccessful) {
                    val list = response.body()
                    if (list.isNullOrEmpty()) {
                        binding.txtEmpty.visibility = View.VISIBLE
                        binding.txtSectionTitle.text = "Featured offers"
                    } else {
                        binding.txtSectionTitle.text = "Featured offers (${list.size})"
                        binding.recyclerView.visibility = View.VISIBLE
                        binding.recyclerView.adapter = CampaignAdapter(this@MainActivity, list)
                    }
                } else {
                    showError()
                }
            }

            override fun onFailure(call: Call<List<Campaign>>, t: Throwable) {
                binding.progress.visibility = View.GONE
                showError()
            }
        })
    }

    private fun showError() {
        binding.layoutError.visibility = View.VISIBLE
        binding.recyclerView.visibility = View.GONE
        binding.txtEmpty.visibility = View.GONE
    }

    private fun fetchWalletBalance() {
        ApiClient.api.wallet(Pref.userId).enqueue(object : Callback<WalletResponse?> {
            override fun onResponse(
                call: Call<WalletResponse?>,
                response: Response<WalletResponse?>
            ) {
                val balance = response.body()?.balance ?: 0.0
                binding.txtBalance.text = String.format("₹%.2f", balance)
                binding.txtSubheadline.text = if (balance > 0) {
                    "You already have earnings waiting in your wallet. Keep exploring live offers to grow your balance."
                } else {
                    "Discover featured offers, track your rewards, and cash out when your goals are approved."
                }
            }

            override fun onFailure(call: Call<WalletResponse?>, t: Throwable) {
                binding.txtBalance.text = "₹0.00"
                binding.txtSubheadline.text =
                    "Discover featured offers, track your rewards, and cash out when your goals are approved."
            }
        })
    }
}
