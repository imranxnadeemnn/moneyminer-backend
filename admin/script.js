//const BASE =
//"https://simulatively-monopetalous-terri.ngrok-free.dev"


const BASE =
"https://simulatively-monopetalous-terri.ngrok-free.dev"

let token = null


// ================= LOGIN =================

async function login() {

    const r =
        await fetch(BASE + "/admin/login", {

            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: "admin",
                password: "1234"
            })

        })

    const j = await r.json()

    token = j.token

}


// ================= CREATE CAMPAIGN =================

async function createCampaign() {

    await login()

    const trackier =
        document.getElementById("trackier").value


    // ✅ VALIDATION (VERY IMPORTANT)

    if (!trackier.includes("sub1=")) {

        alert("Trackier URL must contain sub1={user_id}")
        return

    }


    const body = {

        title:
            document.getElementById("title").value,

        payout:
            document.getElementById("payout").value,

        icon_url:
            document.getElementById("icon").value,

        description:
            document.getElementById("desc").value,

        trackier_url:
            trackier

    }


    const r =
        await fetch(BASE + "/admin/campaign", {

            method: "POST",
            headers: {

                "Content-Type": "application/json",
                "x-admin-token": token

            },
            body: JSON.stringify(body)

        })

    const data = await r.json()

    alert("Campaign created: " + data.id)

}


// ================= LOAD CAMPAIGNS =================

async function loadCampaigns() {

    const r =
        await fetch(BASE + "/campaigns")

    const list = await r.json()

    const ul =
        document.getElementById("campaigns")

    ul.innerHTML = ""

    list.forEach(c => {

        const li =
            document.createElement("li")

        li.innerHTML =
            "<b>" + c.title + "</b> ₹" +
            c.payout +
            "<br>" +
            c.trackier_url

        ul.appendChild(li)

    })

}


// ================= LOAD WITHDRAWS =================

async function loadWithdraws() {

    await login()

    const r =
        await fetch(BASE + "/history/withdraws/1")

    const list = await r.json()

    const ul =
        document.getElementById("withdraws")

    ul.innerHTML = ""

    list.forEach(w => {

        const li =
            document.createElement("li")

        li.innerHTML =
            w.amount + " - " + w.status

        ul.appendChild(li)

    })

}
