package com.mmp.rakivo.model

import com.google.gson.annotations.SerializedName

data class RequestOtpRequest(
    val channel: String,
    val target: String
)

data class RequestOtpResponse(
    val success: Boolean,
    @SerializedName("challenge_id")
    val challengeId: Int?,
    @SerializedName("expires_at")
    val expiresAt: String?,
    @SerializedName("demo_otp")
    val demoOtp: String?
)

data class VerifyOtpRequest(
    val channel: String,
    val target: String,
    val otp: String
)

data class VerifyOtpResponse(
    val success: Boolean,
    @SerializedName("user_id")
    val userId: Int,
    @SerializedName("profile_completed")
    val profileCompleted: Boolean = false,
    @SerializedName("kyc_completed")
    val kycCompleted: Boolean = false,
    @SerializedName("payout_completed")
    val payoutCompleted: Boolean = false
)

data class OfferClickRequest(
    @SerializedName("user_id")
    val userId: Int
)

data class OfferClickResponse(
    val success: Boolean,
    @SerializedName("click_ref")
    val clickRef: String?,
    @SerializedName("redirect_url")
    val redirectUrl: String?
)

data class WalletResponse(
    val id: Int,
    @SerializedName("user_id")
    val userId: Int,
    val balance: Double
)

data class RewardHistoryItem(
    val id: Int,
    @SerializedName("user_id")
    val userId: Int,
    @SerializedName("campaign_id")
    val campaignId: Int,
    val amount: Double,
    @SerializedName("created_at")
    val createdAt: String
)

data class WithdrawRequest(
    @SerializedName("user_id")
    val userId: Int,
    val amount: Int
)

data class KycRequest(
    @SerializedName("user_id")
    val userId: Int,
    val name: String,
    val pan: String,
    val upi: String
)

data class ApiResponse(
    val success: Boolean,
    val error: String? = null
)
