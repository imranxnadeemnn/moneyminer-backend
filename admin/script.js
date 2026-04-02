const BASE = window.location.origin

let token = null
let editingOfferId = null

const els = {
  loginCard: document.getElementById("loginCard"),
  workspace: document.getElementById("workspace"),
  loginButton: document.getElementById("loginButton"),
  logoutButton: document.getElementById("logoutButton"),
  syncPayoutsButton: document.getElementById("syncPayoutsButton"),
  refreshAllButton: document.getElementById("refreshAllButton"),
  loginStatus: document.getElementById("loginStatus"),
  formStatus: document.getElementById("formStatus"),
  formTitle: document.getElementById("formTitle"),
  metrics: document.getElementById("metrics"),
  offersTable: document.getElementById("offersTable"),
  withdrawalsTable: document.getElementById("withdrawalsTable"),
  trackierEventsTable: document.getElementById("trackierEventsTable"),
  offerReportsTable: document.getElementById("offerReportsTable"),
  fraudSignalsTable: document.getElementById("fraudSignalsTable"),
  cohortReportsTable: document.getElementById("cohortReportsTable"),
  referralReportsTable: document.getElementById("referralReportsTable"),
  eventReportsTable: document.getElementById("eventReportsTable"),
  resetFormButton: document.getElementById("resetFormButton"),
  saveOfferButton: document.getElementById("saveOfferButton"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  title: document.getElementById("title"),
  payout: document.getElementById("payout"),
  category: document.getElementById("category"),
  rewardType: document.getElementById("rewardType"),
  status: document.getElementById("status"),
  ctaText: document.getElementById("ctaText"),
  iconUrl: document.getElementById("iconUrl"),
  bannerUrl: document.getElementById("bannerUrl"),
  shortDescription: document.getElementById("shortDescription"),
  longDescription: document.getElementById("longDescription"),
  trackierUrl: document.getElementById("trackierUrl"),
  terms: document.getElementById("terms")
}

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-admin-token": token
  }
}

function setStatus(node, message, isError = false) {
  node.textContent = message || ""
  node.classList.toggle("danger", Boolean(isError))
}

function formatMoney(value) {
  return `₹${Number(value || 0).toFixed(2)}`
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function resetForm() {
  editingOfferId = null
  els.formTitle.textContent = "Create Offer"
  els.title.value = ""
  els.payout.value = ""
  els.category.value = "Featured"
  els.rewardType.value = "install"
  els.status.value = "active"
  els.ctaText.value = "Install & Earn"
  els.iconUrl.value = ""
  els.bannerUrl.value = ""
  els.shortDescription.value = ""
  els.longDescription.value = ""
  els.trackierUrl.value = ""
  els.terms.value = ""
  setStatus(els.formStatus, "")
}

async function login() {
  setStatus(els.loginStatus, "Signing in...")

  const response = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: els.username.value.trim(),
      password: els.password.value.trim()
    })
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || "Login failed")
  }

  token = data.token
  els.loginCard.style.display = "none"
  els.workspace.style.display = "block"
  setStatus(els.loginStatus, "")
  await refreshAll()
}

async function loadOverview() {
  const response = await fetch(`${BASE}/admin/overview`, {
    headers: adminHeaders()
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || "Failed to load overview")
  }

  const metrics = [
    ["Users", data.metrics.users],
    ["Active Offers", data.metrics.active_offers],
    ["Paused Offers", data.metrics.paused_offers],
    ["Rewards Paid", formatMoney(data.metrics.reward_amount)],
    ["Pending Withdrawals", data.metrics.pending_withdrawals],
    ["Withdrawal Volume", formatMoney(data.metrics.withdrawal_amount)]
  ]

  els.metrics.innerHTML = metrics.map(([label, value]) => `
    <div class="metric">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
    </div>
  `).join("")
}

async function loadOffers() {
  const response = await fetch(`${BASE}/admin/offers`, {
    headers: adminHeaders()
  })
  const offers = await response.json()
  if (!response.ok) {
    throw new Error(offers.error || "Failed to load offers")
  }

  els.offersTable.innerHTML = offers.map((offer) => `
    <tr>
      <td>
        <strong>${escapeHtml(offer.title)}</strong><br />
        <span class="small">${escapeHtml(offer.category || "Featured")}</span>
      </td>
      <td><span class="badge">${escapeHtml(offer.status || "active")}</span></td>
      <td>${formatMoney(offer.payout)}</td>
      <td>${escapeHtml(offer.reward_type || "install")}</td>
      <td><button class="secondary" data-edit-offer="${offer.offer_id}">Edit</button></td>
    </tr>
  `).join("")

  els.offersTable.querySelectorAll("[data-edit-offer]").forEach((button) => {
    button.addEventListener("click", () => {
      const offer = offers.find((item) => String(item.offer_id) === button.dataset.editOffer)
      if (!offer) return

      editingOfferId = offer.offer_id
      els.formTitle.textContent = `Edit Offer #${offer.offer_id}`
      els.title.value = offer.title || ""
      els.payout.value = offer.payout || ""
      els.category.value = offer.category || ""
      els.rewardType.value = offer.reward_type || "install"
      els.status.value = offer.status || "active"
      els.ctaText.value = offer.cta_text || "Install & Earn"
      els.iconUrl.value = offer.icon_url || ""
      els.bannerUrl.value = offer.banner_url || ""
      els.shortDescription.value = offer.short_description || ""
      els.longDescription.value = offer.long_description || ""
      els.trackierUrl.value = offer.trackier_url || ""
      els.terms.value = offer.terms || ""
      setStatus(els.formStatus, `Editing ${offer.title}`)
      window.scrollTo({ top: 0, behavior: "smooth" })
    })
  })
}

async function loadWithdrawals() {
  const response = await fetch(`${BASE}/admin/withdrawals`, {
    headers: adminHeaders()
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || "Failed to load withdrawals")
  }

  els.withdrawalsTable.innerHTML = data.withdrawals.map((withdrawal) => `
    <tr>
      <td>
        <strong>${escapeHtml(withdrawal.full_name || `User ${withdrawal.user_id}`)}</strong><br />
        <span class="small">${escapeHtml(withdrawal.email || withdrawal.phone || "")}</span>
      </td>
      <td>${formatMoney(withdrawal.amount)}</td>
      <td>
        <strong>${escapeHtml(withdrawal.status || "-")}</strong><br />
        <span class="small">${escapeHtml(withdrawal.provider_status || "")}</span>
        ${withdrawal.provider_error ? `<div class="small danger">${escapeHtml(withdrawal.provider_error)}</div>` : ""}
      </td>
      <td><span class="small">${escapeHtml(withdrawal.provider_ref || "-")}</span></td>
      <td><span class="small">${escapeHtml(withdrawal.updated_at || withdrawal.created_at || "-")}</span></td>
    </tr>
  `).join("")
}

async function loadTrackierEvents() {
  const response = await fetch(`${BASE}/admin/trackier/events`, {
    headers: adminHeaders()
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || "Failed to load Trackier events")
  }

  els.trackierEventsTable.innerHTML = data.events.map((event) => `
    <tr>
      <td>
        <strong>${escapeHtml(event.title || `Campaign ${event.campaign_id}`)}</strong><br />
        <span class="small">User ${escapeHtml(event.user_id)}</span>
      </td>
      <td>${escapeHtml(event.event_name || "install")}</td>
      <td>${escapeHtml(event.status || "-")}</td>
      <td>${formatMoney(event.payout)}</td>
      <td>
        <span class="small">click_ref: ${escapeHtml(event.click_ref || "-")}</span><br />
        <span class="small">click_id: ${escapeHtml(event.trackier_click_id || "-")}</span>
      </td>
      <td><span class="small">${escapeHtml(event.created_at || "-")}</span></td>
    </tr>
  `).join("")
}

async function loadOfferReports() {
  const response = await fetch(`${BASE}/admin/reports/offers`, {
    headers: adminHeaders()
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || "Failed to load offer reports")
  }

  els.offerReportsTable.innerHTML = data.reports.map((report) => `
    <tr>
      <td>
        <strong>${escapeHtml(report.title)}</strong><br />
        <span class="small">${escapeHtml(report.category || "")}</span>
      </td>
      <td>${escapeHtml(report.clicks)}</td>
      <td>${escapeHtml(report.approved_events)}</td>
      <td>${escapeHtml(report.click_to_approval_cvr)}%</td>
      <td>${formatMoney(report.tracked_payout)}</td>
      <td>${formatMoney(report.tracked_revenue)}</td>
    </tr>
  `).join("")
}

async function loadFraudSignals() {
  const response = await fetch(`${BASE}/admin/fraud/signals`, {
    headers: adminHeaders()
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || "Failed to load fraud signals")
  }

  els.fraudSignalsTable.innerHTML = data.signals.length === 0
    ? `<tr><td colspan="6" class="small">No active fraud signals right now.</td></tr>`
    : data.signals.map((signal) => `
      <tr>
        <td>
          <strong>${escapeHtml(signal.full_name || `User ${signal.user_id}`)}</strong><br />
          <span class="small">${escapeHtml(signal.email || signal.phone || "")}</span>
        </td>
        <td>${escapeHtml(signal.clicks_24h)}</td>
        <td>${escapeHtml(signal.unique_offers_24h)}</td>
        <td>${escapeHtml(signal.events_24h)}</td>
        <td>${escapeHtml(signal.conversion_rate)}%</td>
        <td><span class="badge">${escapeHtml(signal.signal)}</span></td>
      </tr>
    `).join("")
}

async function loadCohortReports() {
  const response = await fetch(`${BASE}/admin/reports/cohorts`, {
    headers: adminHeaders()
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || "Failed to load cohort reports")
  }

  els.cohortReportsTable.innerHTML = data.cohorts.map((cohort) => `
    <tr>
      <td>${escapeHtml(cohort.cohort_day)}</td>
      <td>${escapeHtml(cohort.signups)}</td>
      <td>${escapeHtml(cohort.converted_users)}</td>
      <td>${escapeHtml(cohort.activation_rate)}%</td>
      <td>${formatMoney(cohort.payout_total)}</td>
    </tr>
  `).join("")
}

async function loadReferralReports() {
  const response = await fetch(`${BASE}/admin/reports/referrals`, {
    headers: adminHeaders()
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || "Failed to load referral reports")
  }

  els.referralReportsTable.innerHTML = data.referrals.length === 0
    ? `<tr><td colspan="5" class="small">No referral activity yet.</td></tr>`
    : data.referrals.map((item) => `
      <tr>
        <td>${escapeHtml(item.referrer_name || `User ${item.referrer_user_id}`)}</td>
        <td>${escapeHtml(item.referral_code)}</td>
        <td>${escapeHtml(item.referred_users)}</td>
        <td>${escapeHtml(item.referred_events)}</td>
        <td>${formatMoney(item.referred_payout)}</td>
      </tr>
    `).join("")
}

async function loadEventReports() {
  const response = await fetch(`${BASE}/admin/reports/events`, {
    headers: adminHeaders()
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || "Failed to load event reports")
  }

  els.eventReportsTable.innerHTML = data.events.map((event) => `
    <tr>
      <td>${escapeHtml(event.event_name || "install")}</td>
      <td>${escapeHtml(event.status || "-")}</td>
      <td>${escapeHtml(event.total_events)}</td>
      <td>${escapeHtml(event.users)}</td>
      <td>${formatMoney(event.payout_total)}</td>
      <td>${formatMoney(event.revenue_total)}</td>
    </tr>
  `).join("")
}

async function syncPendingPayouts() {
  setStatus(els.formStatus, "Syncing pending payouts...")
  const response = await fetch(`${BASE}/admin/withdrawals/sync-pending`, {
    method: "POST",
    headers: adminHeaders()
  })
  const data = await response.json()

  if (!response.ok) {
    setStatus(els.formStatus, data.error || "Unable to sync payouts", true)
    return
  }

  setStatus(els.formStatus, `Synced ${data.synced} pending payout(s).`)
  await refreshAll()
}

async function saveOffer() {
  const body = {
    title: els.title.value.trim(),
    payout: Number(els.payout.value || 0),
    category: els.category.value.trim() || "Featured",
    reward_type: els.rewardType.value,
    status: els.status.value,
    cta_text: els.ctaText.value.trim() || "Install & Earn",
    icon_url: els.iconUrl.value.trim(),
    banner_url: els.bannerUrl.value.trim(),
    short_description: els.shortDescription.value.trim(),
    long_description: els.longDescription.value.trim(),
    description: els.longDescription.value.trim() || els.shortDescription.value.trim(),
    trackier_url: els.trackierUrl.value.trim(),
    terms: els.terms.value.trim()
  }

  if (!body.title || !body.payout) {
    setStatus(els.formStatus, "Title and payout are required.", true)
    return
  }

  setStatus(els.formStatus, editingOfferId ? "Updating offer..." : "Creating offer...")
  const method = editingOfferId ? "PUT" : "POST"
  const url = editingOfferId
    ? `${BASE}/admin/offers/${editingOfferId}`
    : `${BASE}/admin/campaign`

  const response = await fetch(url, {
    method,
    headers: adminHeaders(),
    body: JSON.stringify(body)
  })
  const data = await response.json()

  if (!response.ok) {
    setStatus(els.formStatus, data.error || "Unable to save offer", true)
    return
  }

  setStatus(els.formStatus, editingOfferId ? "Offer updated." : "Offer created.")
  resetForm()
  await refreshAll()
}

async function refreshAll() {
  setStatus(els.formStatus, "")
  await Promise.all([
    loadOverview(),
    loadOffers(),
    loadWithdrawals(),
    loadTrackierEvents(),
    loadOfferReports(),
    loadFraudSignals(),
    loadCohortReports(),
    loadReferralReports(),
    loadEventReports()
  ])
}

els.loginButton.addEventListener("click", async () => {
  try {
    await login()
  } catch (error) {
    setStatus(els.loginStatus, error.message, true)
  }
})

els.logoutButton.addEventListener("click", () => {
  token = null
  els.workspace.style.display = "none"
  els.loginCard.style.display = "block"
  setStatus(els.loginStatus, "Logged out.")
})

els.refreshAllButton.addEventListener("click", async () => {
  try {
    await refreshAll()
  } catch (error) {
    setStatus(els.formStatus, error.message, true)
  }
})

els.syncPayoutsButton.addEventListener("click", async () => {
  try {
    await syncPendingPayouts()
  } catch (error) {
    setStatus(els.formStatus, error.message, true)
  }
})

els.resetFormButton.addEventListener("click", resetForm)
els.saveOfferButton.addEventListener("click", async () => {
  try {
    await saveOffer()
  } catch (error) {
    setStatus(els.formStatus, error.message, true)
  }
})

resetForm()
