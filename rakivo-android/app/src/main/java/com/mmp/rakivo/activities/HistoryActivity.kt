package com.mmp.rakivo.activities

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.mmp.rakivo.MainActivity
import com.mmp.rakivo.R
import com.mmp.rakivo.adapter.RewardAdapter
import com.mmp.rakivo.api.ApiClient
import com.mmp.rakivo.databinding.ActivityHistoryBinding
import com.mmp.rakivo.model.RewardHistoryItem
import com.mmp.rakivo.utils.Pref
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class HistoryActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHistoryBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Pref.userId == 0) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding = ActivityHistoryBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Reward History"

        binding.recyclerHistory.layoutManager =
            LinearLayoutManager(this)

        loadHistory()

        binding.bottomNav.selectedItemId = R.id.nav_history
        binding.bottomNav.setOnItemSelectedListener {
            when (it.itemId) {
                R.id.nav_home -> {
                    startActivity(Intent(this, MainActivity::class.java))
                    true
                }
                R.id.nav_wallet -> {
                    startActivity(Intent(this, WalletActivity::class.java))
                    true
                }
                R.id.nav_history -> true
                else -> false
            }
        }
    }


    private fun loadHistory() {
        binding.progress.visibility = View.VISIBLE
        ApiClient.api.rewards(
            Pref.userId
        ).enqueue(
            object :
                Callback<List<RewardHistoryItem>> {

                override fun onResponse(
                    call: Call<List<RewardHistoryItem>>,
                    response: Response<List<RewardHistoryItem>>
                ) {
                    binding.progress.visibility = View.GONE
                    val list =
                        response.body()
                            ?: emptyList()

                    binding.recyclerHistory.adapter =
                        RewardAdapter(list)

                }

                override fun onFailure(
                    call: Call<List<RewardHistoryItem>>,
                    t: Throwable) {
                    binding.progress.visibility = View.GONE
                }

            }
        )

    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}
