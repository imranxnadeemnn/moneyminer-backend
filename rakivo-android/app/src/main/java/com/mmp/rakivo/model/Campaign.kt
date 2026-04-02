package com.mmp.rakivo.model

import com.google.gson.annotations.SerializedName

data class Campaign(
    @SerializedName("offer_id")
    val campaignId: Int,
    val title: String,
    val payout: Double,
    @SerializedName("icon_url")
    val iconUrl: String?,
    @SerializedName("short_description")
    val shortDescription: String?,
    @SerializedName("long_description")
    val longDescription: String?,
    @SerializedName("banner_url")
    val bannerUrl: String?,
    @SerializedName("trackier_url")
    val trackierUrl: String?,
    val status: String?,
    val category: String?,
    @SerializedName("reward_type")
    val rewardType: String?,
    @SerializedName("cta_text")
    val ctaText: String?,
    val terms: String?,
    @SerializedName("event_name")
    val eventName: String?,
    @SerializedName("is_featured")
    val isFeatured: Boolean?
)
