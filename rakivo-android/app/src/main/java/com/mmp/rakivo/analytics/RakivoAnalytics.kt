package com.mmp.rakivo.analytics

import android.content.Context
import android.os.Bundle
import androidx.core.os.bundleOf
import com.google.firebase.analytics.FirebaseAnalytics

object RakivoAnalytics {
    private var analytics: FirebaseAnalytics? = null

    object Events {
        const val SCREEN_VIEW = "rakivo_screen_view"
        const val AUTH_OTP_REQUESTED = "auth_otp_requested"
        const val LOGIN = "login"
        const val OFFER_LIST_VIEWED = "offer_list_viewed"
        const val SELECT_CONTENT = "select_content"
        const val PROFILE_COMPLETED = "profile_completed"
        const val KYC_SUBMITTED = "kyc_submitted"
        const val ADD_PAYMENT_INFO = "add_payment_info"
        const val WALLET_VIEWED = "wallet_viewed"
        const val WITHDRAWAL_REQUESTED = "withdrawal_requested"
    }

    object Params {
        const val SCREEN_NAME = "screen_name"
        const val SCREEN_CLASS = "screen_class"
        const val AUTH_CHANNEL = "auth_channel"
        const val NEXT_SCREEN = "next_screen"
        const val OFFER_COUNT = "offer_count"
        const val OFFER_ID = "offer_id"
        const val OFFER_TITLE = "offer_title"
        const val OFFER_REWARD_TYPE = "offer_reward_type"
        const val PAYOUT_VALUE = "payout_value"
        const val PAYOUT_MODE = "payout_mode"
        const val SYNC_STATUS = "sync_status"
        const val HAS_EMAIL = "has_email"
        const val HAS_PHONE = "has_phone"
        const val CAN_WITHDRAW = "can_withdraw"
        const val AMOUNT = "amount"
    }

    object UserProperties {
        const val USER_STATE = "user_state"
    }

    fun init(context: Context) {
        if (!isConfigured(context)) {
            analytics = null
            return
        }

        analytics = FirebaseAnalytics.getInstance(context.applicationContext)
    }

    private fun isConfigured(context: Context): Boolean {
        val appId = context.resources.getIdentifier("google_app_id", "string", context.packageName)
        return appId != 0
    }

    fun setUserId(userId: Int) {
        analytics?.setUserId(userId.toString())
    }

    fun clearUser() {
        analytics?.setUserId(null)
    }

    fun setUserState(state: String) {
        analytics?.setUserProperty(UserProperties.USER_STATE, state)
    }

    fun logScreen(screenName: String, screenClass: String = screenName) {
        logEvent(
            Events.SCREEN_VIEW,
            bundleOf(
                Params.SCREEN_NAME to screenName,
                Params.SCREEN_CLASS to screenClass
            )
        )
    }

    fun logOtpRequested(channel: String) {
        logEvent(Events.AUTH_OTP_REQUESTED, bundleOf(Params.AUTH_CHANNEL to channel))
    }

    fun logLoginSuccess(channel: String, userId: Int, nextScreen: String) {
        setUserId(userId)
        logEvent(
            Events.LOGIN,
            bundleOf(
                Params.AUTH_CHANNEL to channel,
                Params.NEXT_SCREEN to nextScreen
            )
        )
    }

    fun logOffersLoaded(count: Int) {
        logEvent(
            Events.OFFER_LIST_VIEWED,
            bundleOf(Params.OFFER_COUNT to count.toLong())
        )
    }

    fun logOfferClick(offerId: Int, title: String, rewardType: String?, payout: Double) {
        logEvent(
            Events.SELECT_CONTENT,
            bundleOf(
                FirebaseAnalytics.Param.CONTENT_TYPE to "offer",
                FirebaseAnalytics.Param.ITEM_ID to offerId.toString(),
                Params.OFFER_ID to offerId.toLong(),
                Params.OFFER_TITLE to title,
                Params.OFFER_REWARD_TYPE to (rewardType ?: "install"),
                Params.PAYOUT_VALUE to payout
            )
        )
    }

    fun logProfileSaved(hasEmail: Boolean, hasPhone: Boolean) {
        logEvent(
            Events.PROFILE_COMPLETED,
            bundleOf(
                Params.HAS_EMAIL to hasEmail.toString(),
                Params.HAS_PHONE to hasPhone.toString()
            )
        )
    }

    fun logKycSubmitted() {
        logEvent(Events.KYC_SUBMITTED)
    }

    fun logPayoutMethodSaved(mode: String, syncStatus: String?) {
        logEvent(
            Events.ADD_PAYMENT_INFO,
            bundleOf(
                Params.PAYOUT_MODE to mode,
                Params.SYNC_STATUS to (syncStatus ?: "unknown")
            )
        )
    }

    fun logWalletViewed(canWithdraw: Boolean) {
        logEvent(
            Events.WALLET_VIEWED,
            bundleOf(Params.CAN_WITHDRAW to canWithdraw.toString())
        )
    }

    fun logWithdrawalRequested(amount: Int) {
        logEvent(
            Events.WITHDRAWAL_REQUESTED,
            bundleOf(Params.AMOUNT to amount.toLong())
        )
    }

    private fun logEvent(name: String, params: Bundle = Bundle()) {
        analytics?.logEvent(name, params)
    }
}
