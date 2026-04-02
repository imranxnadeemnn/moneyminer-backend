package com.mmp.rakivo.adapter

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.mmp.rakivo.R
import com.mmp.rakivo.analytics.RakivoAnalytics
import com.mmp.rakivo.api.ApiClient
import com.mmp.rakivo.api.backendErrorMessage
import com.mmp.rakivo.model.Campaign
import com.mmp.rakivo.model.OfferClickRequest
import com.mmp.rakivo.model.OfferClickResponse
import com.mmp.rakivo.utils.Pref
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class CampaignAdapter(
    private val context: Context,
    private val list: List<Campaign>
) : RecyclerView.Adapter<CampaignAdapter.VH>() {

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val meta: TextView = v.findViewById(R.id.txtMeta)
        val rewardType: TextView = v.findViewById(R.id.txtRewardType)
        val title: TextView = v.findViewById(R.id.txtTitle)
        val desc: TextView = v.findViewById(R.id.txtDesc)
        val payout: TextView = v.findViewById(R.id.txtPayout)
        val terms: TextView = v.findViewById(R.id.txtTerms)
        val icon: ImageView = v.findViewById(R.id.imgIcon)
        val btnInstall: Button = v.findViewById(R.id.btnInstall)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_campaign, parent, false)
        return VH(v)
    }

    override fun getItemCount() = list.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = list[position]

        holder.meta.text = when {
            item.isFeatured == true -> "Featured"
            !item.category.isNullOrBlank() -> item.category
            else -> "Offer"
        }
        holder.rewardType.text = item.rewardType?.replaceFirstChar { it.uppercase() } ?: "Install"
        holder.title.text = item.title
        holder.desc.text = item.shortDescription ?: item.longDescription ?: ""
        holder.payout.text = "₹${item.payout}"
        holder.terms.text = item.terms ?: "Reward is credited after the install or qualifying event is validated."
        holder.btnInstall.text = item.ctaText ?: "Install & Earn"

        Glide.with(context)
            .load(item.iconUrl)
            .placeholder(android.R.drawable.ic_menu_report_image)
            .into(holder.icon)

        val clickListener = View.OnClickListener {
            if (Pref.userId == 0) {
                Toast.makeText(context, "Please login first", Toast.LENGTH_SHORT).show()
                return@OnClickListener
            }

            if (item.trackierUrl.isNullOrEmpty()) {
                Toast.makeText(context, "Offer not available", Toast.LENGTH_SHORT).show()
                return@OnClickListener
            }

            holder.btnInstall.isEnabled = false
            RakivoAnalytics.logOfferClick(
                offerId = item.campaignId,
                title = item.title,
                rewardType = item.rewardType,
                payout = item.payout
            )
            ApiClient.api.offerClick(
                item.campaignId,
                OfferClickRequest(userId = Pref.userId)
            ).enqueue(object : Callback<OfferClickResponse> {
                override fun onResponse(
                    call: Call<OfferClickResponse>,
                    response: Response<OfferClickResponse>
                ) {
                    holder.btnInstall.isEnabled = true

                    if (!response.isSuccessful) {
                        Toast.makeText(
                            context,
                            response.backendErrorMessage("Unable to open offer"),
                            Toast.LENGTH_SHORT
                        ).show()
                        return
                    }

                    val url = response.body()?.redirectUrl
                    if (url.isNullOrBlank()) {
                        Toast.makeText(context, "Offer link unavailable", Toast.LENGTH_SHORT).show()
                        return
                    }

                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(intent)
                    } catch (e: Exception) {
                        Toast.makeText(context, "Cannot open URL", Toast.LENGTH_SHORT).show()
                    }
                }

                override fun onFailure(call: Call<OfferClickResponse>, t: Throwable) {
                    holder.btnInstall.isEnabled = true
                    Toast.makeText(context, "Error: ${t.message}", Toast.LENGTH_SHORT).show()
                }
            })
        }

        holder.itemView.setOnClickListener(clickListener)
        holder.btnInstall.setOnClickListener(clickListener)
    }
}
