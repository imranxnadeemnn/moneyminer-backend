package com.mmp.rakivo.api

import com.mmp.rakivo.model.ApiResponse
import com.mmp.rakivo.model.Campaign
import com.mmp.rakivo.model.KycRequest
import com.mmp.rakivo.model.KycStatusResponse
import com.mmp.rakivo.model.OfferClickRequest
import com.mmp.rakivo.model.OfferClickResponse
import com.mmp.rakivo.model.OnboardingResponse
import com.mmp.rakivo.model.PaymentMethodRequest
import com.mmp.rakivo.model.PaymentMethodResponse
import com.mmp.rakivo.model.ProfileUpdateRequest
import com.mmp.rakivo.model.RequestOtpRequest
import com.mmp.rakivo.model.RequestOtpResponse
import com.mmp.rakivo.model.RewardHistoryItem
import com.mmp.rakivo.model.UserProfileResponse
import com.mmp.rakivo.model.VerifyOtpRequest
import com.mmp.rakivo.model.VerifyOtpResponse
import com.mmp.rakivo.model.WalletResponse
import com.mmp.rakivo.model.WithdrawRequest
import retrofit2.Call
import retrofit2.http.*

interface ApiService {

    @POST("auth/request-otp")
    fun requestOtp(
        @Body body: RequestOtpRequest
    ): Call<RequestOtpResponse>

    @POST("auth/verify-otp")
    fun verifyOtp(
        @Body body: VerifyOtpRequest
    ): Call<VerifyOtpResponse>


    @GET("offers")
    fun getCampaigns(): Call<List<Campaign>>

    @GET("me")
    fun me(
        @Query("user_id") userId: Int
    ): Call<UserProfileResponse>

    @GET("me/onboarding")
    fun onboarding(
        @Query("user_id") userId: Int
    ): Call<OnboardingResponse>

    @PUT("me/profile")
    fun updateProfile(
        @Body body: ProfileUpdateRequest
    ): Call<ApiResponse>

    @POST("me/payment-method")
    fun savePaymentMethod(
        @Body body: PaymentMethodRequest
    ): Call<PaymentMethodResponse>

    @GET("me/payment-method")
    fun paymentMethod(
        @Query("user_id") userId: Int
    ): Call<PaymentMethodResponse>

    @GET("kyc/{id}")
    fun kycStatus(
        @Path("id") id: Int
    ): Call<KycStatusResponse>

    @POST("offers/{id}/click")
    fun offerClick(
        @Path("id") id: Int,
        @Body body: OfferClickRequest
    ): Call<OfferClickResponse>


    @GET("wallet/{id}")
    fun wallet(
        @Path("id") id: Int
    ): Call<WalletResponse?>


    @GET("history/rewards/{id}")
    fun rewards(
        @Path("id") id: Int
    ): Call<List<RewardHistoryItem>>


    @POST("withdraw")
    fun withdraw(
        @Body body: WithdrawRequest
    ): Call<ApiResponse>

    @POST("kyc")
    fun kyc(
        @Body body: KycRequest
    ): Call<ApiResponse>

}
