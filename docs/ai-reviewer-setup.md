# Setting up Scribbles, the AI reviewer

About 20 minutes, once. Everything here is free, and nothing asks for a credit card.

**What the reviewer does in this step:** every 10 minutes it reads the sentences waiting for the teacher and saves a suggestion for each (approve, or redo with a tip). **Students see nothing different, and the teacher still decides everything.** Step 3 shows the suggestions on the Teacher page.

## What we use, and why it's free

| Service | What for | Free allowance | What happens at the limit |
|---|---|---|---|
| **Cloudflare Workers AI** (main) | The safety check (Llama Guard), the welfare check and the AI review (Llama 3.3 70B) | 10,000 "Neurons" a day ≈ **100 sentences a day** (an estimate: the welfare check is a second call to the 70B model) | Requests stop until midnight UTC. The teacher reviews as usual. **Nothing is charged.** |
| **Google Cloud Scheduler** | Runs the reviewer every 10 minutes | 3 schedules free per billing account (we use 2: staging and production) | Not reached |
| **Groq** (optional, off) | A second AI reviewer | About 1,000 requests a day | Only for classes where **every student is 13 or older**: Groq's terms don't allow data about children under 13 |

**Privacy:** only the Tell sentence and the student's sentence are sent: never names, emails or accounts. Sentences with personal details, bad language or worrying words are held by our own checks and never sent at all. Cloudflare does not keep what it's sent or train models on it.

> ⚠️ **One rule that keeps it free:** never upgrade the Cloudflare account to "Workers Paid" and never add a payment method there. On the free plan Cloudflare simply stops at the daily limit; on the paid plan it would bill for more.

---

## Part 1: Cloudflare (about 10 minutes)

### 1.1 Create the account
1. Go to **https://dash.cloudflare.com/sign-up**.
2. Enter an email address and a password, then click **Sign up**. (A school or project email is best, so it isn't tied to one person.)
3. Open the email Cloudflare sends and click the link to verify it.
4. If Cloudflare asks what you want to do or offers to add a website, skip it (look for **Skip** or go straight to the dashboard). We don't need a website.

### 1.2 Copy your Account ID
1. In the dashboard's left menu, click **AI**, then **Workers AI**. (If you don't see it, type "Workers AI" in the search box at the top.)
2. Click **Use REST API**.
3. Find **Account ID** and click the copy button next to it. It is 32 letters and numbers.
4. Paste it somewhere safe for a minute (a note on your computer). This one isn't secret, but keep it with the token.

### 1.3 Create the token (the key)
1. On the same **Use REST API** page, click **Create a Workers AI API Token**.
2. Cloudflare fills in the right permissions for you (**Workers AI**, Read and Edit). Don't add any others.
3. Click **Create API Token**.
4. Click **Copy** next to the token. **Cloudflare shows it only once.** Paste it next to the Account ID.

*If you don't see that button:* click your profile icon (top right) → **My Profile** → **API Tokens** → **Create Token** → find **Workers AI** in the template list → **Use template** → **Continue to summary** → **Create Token** → **Copy**.

> 🔒 Never paste the token into a chat, an email, an issue or a pull request. It only goes into GitHub, in Part 2.

---

## Part 2: Put the keys into GitHub (about 3 minutes)

1. Open **https://github.com/sporky-jc/showme**.
2. Click **Settings** (top of the page) → in the left menu, **Secrets and variables** → **Actions**.
3. On the **Secrets** tab, click **New repository secret** and add these two, one at a time:

   | Name (type exactly) | Secret |
   |---|---|
   | `CLOUDFLARE_ACCOUNT_ID` | the Account ID from 1.2 |
   | `CLOUDFLARE_AI_TOKEN` | the token from 1.3 |

   Click **Add secret** after each one.
4. Now delete the note where you pasted them.
5. Click the **Variables** tab → **New repository variable** and add:

   | Name | Value |
   |---|---|
   | `STAGING_REVIEWER_MODE` | `suggest` |

   Click **Add variable**. (Don't add `PRODUCTION_REVIEWER_MODE` yet: production stays off until we've measured the reviewer on staging.)

---

## Part 3: Turn on Google's scheduler (about 5 minutes)

The reviewer runs on a schedule, which Google needs switched on once in **each** of the two Firebase projects. Do this before the pull request is merged, or the deploy will fail.

### 3.1 Switch on Cloud Scheduler
1. Open **https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com?project=showme-staging**.
2. Check the project name at the top says **showme-staging**, then click **Enable**.
3. Open **https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com?project=showme-backend-789**.
4. Check it says the production project, then click **Enable**.

### 3.2 Let the deploy create the schedule
The deploys log in to Google as a "service account". It needs one more permission, in each project.

1. Open **https://console.cloud.google.com/iam-admin/iam?project=showme-staging**.
2. In the list, find the account the deploy uses. Its email ends in **`.iam.gserviceaccount.com`**, and it's usually named **`firebase-adminsdk-…`** or has "github" or "deploy" in its name. It is *not* the "Compute Engine default service account", and not one starting with `service-`. (Not sure which? Open **IAM & Admin → Service Accounts** in the left menu: it's the one with a key listed under **Keys**, made when the GitHub deploys were set up.)
3. Click the **pencil** (Edit) at the end of its row.
4. Click **Add another role**, type **Cloud Scheduler Admin**, and pick it.
5. Click **Save**.
6. Repeat 1–5 at **https://console.cloud.google.com/iam-admin/iam?project=showme-backend-789**, for the production project's deploy account (found the same way).

Then tell Claude it's done, and the pull request can be merged.

---

## Part 4: Check it works (after merging)

1. On GitHub, click **Actions** → **Measure the AI reviewer** (left list) → **Run workflow** → **Run workflow**.
2. After a minute or two, open the run and read its **Summary**. It shows how often the AI agreed with a teacher on 25 made-up sentences, and whether it held the unsafe ones. **The line to watch: "Approved something a teacher wouldn't" must be 0.**
3. Staging then saves suggestions every 10 minutes. You can see them in the `reviewsuggestions` collection of the practice database (ShowME-dev).

---

## Turning it off

GitHub → **Settings** → **Secrets and variables** → **Actions** → **Variables** → `STAGING_REVIEWER_MODE` → change it to `off` (or delete it). It takes effect at the next staging deploy. Without the keys or with the mode off, the reviewer does nothing at all.

---

## Optional: Groq (only if every student is 13 or older)

Groq's Terms of Sale don't allow sending data about children under 13, so **skip this for elementary classes.**

1. Go to **https://console.groq.com** and sign in (with Google or an email link). No card needed.
2. Turn on Zero Data Retention: top-right menu → **Settings** → **Data Controls** → switch **Zero Data Retention** on → **Save**.
3. Left menu → **API Keys** → **Create API Key** → name it `showme` → **Submit** → **Copy** (shown only once; it starts with `gsk_`).
4. In GitHub (as in Part 2): add the secret `GROQ_API_KEY`, and the variable `REVIEWER_USE_GROQ` with the value `yes`.

---

## For developers

- Writing checks (strict, because approved sentences go into the gallery): capitals, end marks, punctuation spacing, repeated words and "a"/"an" in `backend/reviewer/mechanics.ts`; grammar and staying on topic are judged by the AI (`prompt.ts`).
- Spelling: `backend/reviewer/spelling.ts` (nspell with the en-US dictionary, on our server) lists words not in the dictionary. An approval with any of them becomes "redo" with the spelling tip, so mistakes never reach the gallery. Names written with a capital, and sound words like "Brrr", aren't counted.
- Code: `backend/reviewer/` (`settings.ts` reads the settings, `providers/` talks to Cloudflare and Groq, `queue.ts` is the scheduled job). Suggestions are saved in `backend/models/reviewSuggestions.ts`, which nothing a student or the gallery reads.
- Settings the deploys write into `backend/.env` (`.github/scripts/reviewer-env.sh`): `REVIEWER_MODE` (`off`/`suggest`), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, optionally `CLOUDFLARE_REVIEW_MODEL` (variable; default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`), `REVIEWER_USE_GROQ`, `GROQ_API_KEY`.
- Measure locally: put the Cloudflare settings in `backend/.env.local`, then `npm run measure:reviewer` (sends only the made-up samples).
