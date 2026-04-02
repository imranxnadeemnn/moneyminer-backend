package com.mmp.rakivo.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.mmp.rakivo.R
import com.mmp.rakivo.model.RewardHistoryItem

class RewardAdapter(
    private val list: List<RewardHistoryItem>
) : RecyclerView.Adapter<RewardAdapter.VH>() {

    class VH(v: View) : RecyclerView.ViewHolder(v) {

        val amount: TextView =
            v.findViewById(R.id.txtAmount)

        val campaign: TextView =
            v.findViewById(R.id.txtCampaign)

        val date: TextView =
            v.findViewById(R.id.txtDate)

    }

    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): VH {

        val v = LayoutInflater.from(parent.context)
            .inflate(
                R.layout.item_reward,
                parent,
                false
            )

        return VH(v)
    }

    override fun getItemCount() = list.size

    override fun onBindViewHolder(
        holder: VH,
        position: Int
    ) {

        val item = list[position]

        holder.amount.text =
            "₹ ${item.amount}"

        holder.campaign.text =
            "Campaign: " +
            item.campaignId

        holder.date.text =
            item.createdAt

    }

}
