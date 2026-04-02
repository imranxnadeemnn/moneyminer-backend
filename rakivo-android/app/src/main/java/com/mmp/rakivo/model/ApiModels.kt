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

data class UserProfile(
    @SerializedName("user_id")
    val userId: Int,
    @SerializedName("full_name")
    val fullName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    @SerializedName("referral_code")
    val referralCode: String? = null,
    @SerializedName("profile_completed")
    val profileCompleted: Boolean = false,
    @SerializedName("kyc_completed")
    val kycCompleted: Boolean = false,
    @SerializedName("payout_completed")
    val payoutCompleted: Boolean = false
)

data class UserProfileResponse(
    val success: Boolean,
    val user: UserProfile
)

data class ProfileUpdateRequest(
    @SerializedName("user_id")
    val userId: Int,
    @SerializedName("full_name")
    val fullName: String,
    val email: String?,
    val phone: String?
)

data class PaymentMethodRequest(
    @SerializedName("user_id")
    val userId: Int,
    val provider: String,
    @SerializedName("payout_mode")
    val payoutMode: String,
    @SerializedName("upi_id")
    val upiId: String?,
    @SerializedName("account_name")
    val accountName: String?,
    @SerializedName("account_number")
    val accountNumber: String?,
    val ifsc: String?,
    @SerializedName("contact_email")
    val contactEmail: String?,
    @SerializedName("contact_phone")
    val contactPhone: String?
)

data class PaymentMethod(
    val id: Int,
    @SerializedName("user_id")
    val userId: Int,
    val provider: String? = null,
    @SerializedName("method_type")
    val methodType: String? = null,
    @SerializedName("payout_mode")
    val payoutMode: String? = null,
    @SerializedName("upi_id")
    val upiId: String? = null,
    @SerializedName("account_name")
    val accountName: String? = null,
    @SerializedName("account_number")
    val accountNumber: String? = null,
    val ifsc: String? = null,
    @SerializedName("contact_email")
    val contactEmail: String? = null,
    @SerializedName("contact_phone")
    val contactPhone: String? = null,
    @SerializedName("razorpay_contact_id")
    val razorpayContactId: String? = null,
    @SerializedName("razorpay_fund_account_id")
    val razorpayFundAccountId: String? = null,
    val status: String? = null,
    @SerializedName("created_at")
    val createdAt: String? = null
)

data class PaymentMethodResponse(
    val success: Boolean,
    @SerializedName("payment_method")
    val paymentMethod: PaymentMethod? = null,
    @SerializedName("razorpay_sync_status")
    val razorpaySyncStatus: String? = null
)

data class KycStatus(
    val id: Int? = null,
    @SerializedName("user_id")
    val userId: Int? = null,
    val name: String? = null,
    val pan: String? = null,
    val upi: String? = null,
    val status: String? = null,
    @SerializedName("created_at")
    val createdAt: String? = null
)

data class KycStatusResponse(
    val success: Boolean,
    val kyc: KycStatus? = null
)

data class OnboardingResponse(
    val success: Boolean,
    val onboarding: UserProfile,
    @SerializedName("payment_method")
    val paymentMethod: PaymentMethod? = null,
    val kyc: KycStatus? = null
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
