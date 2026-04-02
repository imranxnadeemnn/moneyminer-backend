# Rakivo Firebase Analytics Taxonomy

This is the current Firebase Analytics event model for Rakivo.

## User Properties

- `user_state`
  - `anonymous`
  - `onboarding`
  - `logged_in`
  - `wallet_ready`

## Events

### Acquisition and Auth

- `auth_otp_requested`
  - params:
    - `auth_channel`

- `login`
  - params:
    - `auth_channel`
    - `next_screen`

### Navigation

- `rakivo_screen_view`
  - params:
    - `screen_name`
    - `screen_class`

### Offer Discovery and Engagement

- `offer_list_viewed`
  - params:
    - `offer_count`

- `select_content`
  - used for offer click-outs
  - params:
    - `content_type=offer`
    - `item_id`
    - `offer_id`
    - `offer_title`
    - `offer_reward_type`
    - `payout_value`

### Onboarding and Trust

- `profile_completed`
  - params:
    - `has_email`
    - `has_phone`

- `kyc_submitted`

- `add_payment_info`
  - used for payout method save
  - params:
    - `payout_mode`
    - `sync_status`

### Wallet and Monetization

- `wallet_viewed`
  - params:
    - `can_withdraw`

- `withdrawal_requested`
  - params:
    - `amount`

## Notes

- Recommended Firebase event names are reused where they fit:
  - `login`
  - `select_content`
  - `add_payment_info`
- Rakivo-specific lifecycle events stay custom where they are domain-specific:
  - `auth_otp_requested`
  - `offer_list_viewed`
  - `profile_completed`
  - `kyc_submitted`
  - `wallet_viewed`
  - `withdrawal_requested`
- This taxonomy is meant to support:
  - auth funnel reporting
  - onboarding completion tracking
  - offer engagement analysis
  - payout readiness and withdrawal intent reporting
