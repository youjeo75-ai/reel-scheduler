# Setup guide (about 60 minutes, €0)

This app talks to Instagram, YouTube and TikTok directly, so there is no
posting service to pay for and no queue limit. The price of that is a
one-time registration of a small "developer app" with each platform. This is
what makes the **Connect → Accept** screen work. You register them for
yourself only, you never submit them to the public, and every value you need to
paste is listed below.

You need free accounts at Supabase, GitHub, Vercel, Google Cloud, Meta for
Developers and TikTok for Developers. Do them in this order. **YouTube is the
easiest, TikTok the slowest**, so you can already post to the first two while
TikTok is still being looked at.

---

## 1. Supabase (database and file storage)

1. Sign up at supabase.com and create a project (pick a region in Europe). Save the database password.
2. **Storage → New bucket** → name it `media` → switch **Public bucket** on. (The platforms download your video from a public link.)
3. **Project Settings → Database → Connection string**:
   - the **Transaction pooler** string (port 6543) → `DATABASE_URL`, adding `?pgbouncer=true&connection_limit=1` at the end;
   - the **Session pooler** or **Direct** string (port 5432) → `DIRECT_URL`.
4. **Project Settings → API**: copy the Project URL, the `anon` key and the `service_role` key (keep that one secret).

## 2. Put the website online (you need its address for the next steps)

1. On your computer, in the project folder:
   ```bash
   cp .env.example .env     # fill in the Supabase values for now
   npm install
   npx prisma db push       # creates the tables
   ```
2. Put the project in a private GitHub repository.
3. At **vercel.com** choose *Add New → Project*, import the repository.
4. In **Settings → Environment Variables** add everything from `.env`, plus:
   - `APP_PASSWORD`: any long password (protects your dashboard);
   - `CRON_SECRET`: output of `openssl rand -hex 32`;
   - `TOKEN_ENCRYPTION_KEY`: output of `openssl rand -base64 32`;
   - `APP_URL`: leave a placeholder for now.
5. Deploy. Your address looks like `https://my-reels.vercel.app`. Set `APP_URL` to it (no trailing slash) and redeploy.

From here on, `APP_URL` below means that address.

### Values you will paste into the developer consoles

| What | Value |
| --- | --- |
| Website / app URL | `APP_URL` |
| Privacy policy URL | `APP_URL/privacy` |
| Terms of service URL | `APP_URL/terms` |
| Instagram redirect URL | `APP_URL/api/oauth/instagram/callback` |
| Google redirect URI | `APP_URL/api/oauth/youtube/callback` |
| TikTok redirect URI | `APP_URL/api/oauth/tiktok/callback` |

Redirect URLs must match exactly: https, no trailing slash. The privacy and terms pages are public and ready, so edit the wording if you like.

---

## 3. YouTube (about 10 minutes)

1. Go to **console.cloud.google.com**, create a project (any name).
2. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**.
3. **APIs & Services → OAuth consent screen** (may be called *Google Auth Platform*): choose **External**, fill in the app name, your email, and add `APP_URL/privacy` and `APP_URL/terms` plus `APP_URL` as the home page and an authorised domain (`vercel.app` or your own).
4. Add the scopes `…/auth/youtube.upload` and `…/auth/youtube.readonly`.
5. **Publish the app** (button *Publish app* / set it to **In production**). This matters: while it is in "Testing", Google expires your login after 7 days. Google may say the app is unverified; that is fine for personal use (you are the only user).
6. **Credentials → Create credentials → OAuth client ID → Web application**. Under *Authorised redirect URIs* add the Google redirect URI from the table.
7. Copy the **Client ID** and **Client secret** into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then redeploy.

When you later click Connect, Google shows "Google hasn't verified this app". Press **Advanced → Go to … (unsafe)**; it is your own app.

**Know this:** Google can lock uploads from new, unaudited API projects to **private**. If your first test shows as private, fill in the *YouTube API Services Audit and Quota Extension* form (search for it; for a personal tool it is a short form). Until it is approved you can still make videos public by hand in YouTube Studio.

## 4. Instagram (about 15 minutes)

Your Instagram account must be a **professional** account (Business or Creator): Instagram app → Settings → Account type and tools → switch to professional. A Facebook Page is not needed.

1. Go to **developers.facebook.com** and log in with a Facebook account (create one if needed; it is only for the developer console). Accept the developer terms and verify your phone/email if asked.
2. **My Apps → Create app**. Pick the use case **Manage messaging & content on Instagram** (or *Other → Business*) and give it any name.
3. **App settings → Basic**: fill in the Privacy Policy URL and Terms of Service URL from the table, pick any category, **Save**.
4. In the left menu open **Instagram → API setup with Instagram login**.
5. Under **Set up Instagram business login**, click **Set up** → paste the Instagram redirect URL → **Save**. Under *Business login settings* you can also put `APP_URL/privacy` as the deauthorise and data-deletion URL if it asks for them.
6. On that same page copy the **Instagram app ID** and **Instagram app secret** (these are different from the Meta app ID at the top of the page). Put them in Vercel as `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`, then redeploy.
7. **Make yourself a tester:** left menu **App roles → Roles → Add People → Instagram Tester**, type your Instagram username, **Add**. Then in Instagram open **instagram.com/accounts/manage_access** (Settings → Apps and Websites → *Tester invites*) and **Accept**.

Posting to your own account works in this development mode, and you do not need App Review for that. If the app complains about being in development mode, switch the app to **Live** at the top of the dashboard after step 3 is complete; either way works for your own account.

## 5. TikTok (about 20 minutes, then waiting)

1. Go to **developers.tiktok.com**, log in with the TikTok account you want to post to, and register as a developer.
2. **Manage apps → Connect an app** → give it a name, icon, and the URLs from the table (website, privacy policy, terms of service).
3. Add the products **Login Kit** and **Content Posting API**. Under Content Posting API switch **Direct Post** on.
4. Under Login Kit paste the TikTok redirect URI. Make sure the scopes **user.info.basic** and **video.publish** are listed.
5. If TikTok asks you to **verify URL properties** (it does for the Content Posting API): choose *URL prefix*, enter `APP_URL/`, download the `tiktok….txt` file it gives you, put it in this project's `public/` folder, commit, let Vercel redeploy, then press Verify. (The password protection already skips these files.)
6. Copy the **Client key** and **Client secret** into Vercel as `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`, then redeploy.
7. **Sandbox first:** switch the app to Sandbox, add your own TikTok account under *Target users*, and use that for testing. You can connect and post without waiting for review.

**Know this (the hard one):** until TikTok audits your app, **every post is private** (visible only to you), and the scheduler tells you so on the post card. To post publicly you must submit the app for review with a short screen recording of the flow (connect an account, pick settings, post), and then request the Content Posting API audit. Reviews take days to weeks and can be refused; a personal tool is not a typical case for them. Start it early, and note that TikTok is the only platform where this is a gamble.

---

## 6. Turn on the 15-minute timer

Vercel's free plan can only run a job once a day, so the 15-minute checks come from Supabase (also free).

1. Open `supabase/cron.sql`, replace `YOUR-APP.vercel.app` and `YOUR_CRON_SECRET` (same value as in Vercel).
2. Paste it into Supabase → **SQL Editor** → Run.
3. Check it works later with: `select * from cron.job_run_details order by start_time desc limit 5;`

## 7. Connect your accounts

Open the dashboard (any username, password = `APP_PASSWORD`) and click **Connect** under each platform. You land on the platform's own page, press **Accept**, and come back with the account shown. After that tokens renew themselves.

## 8. First test

1. Schedule a short vertical video 5 to 10 minutes ahead, with a thumbnail, on **one platform** first.
2. Wait for the next quarter-hour. The status goes Scheduled → Publishing → Published.
3. If something fails the card shows the reason. To run the check by hand:
   `curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-APP.vercel.app/api/cron/publish`

If a login ever expires (the card says to reconnect), click **Reconnect** on the dashboard, then **Retry** on the failed post.

## If something goes wrong

| Message | Fix |
| --- | --- |
| Instagram "Invalid redirect_uri" | The URL in Meta's *Business login settings* must be identical to `APP_URL/api/oauth/instagram/callback`. |
| Instagram "insufficient permission" / can't log in | You are not yet an Instagram Tester, or haven't accepted the invite (step 4.7). |
| Google "redirect_uri_mismatch" | The Google redirect URI must match exactly (https, no trailing slash). |
| Google "no refresh token" | Remove the app at myaccount.google.com/permissions and press Connect again. |
| TikTok "Account not authorized" | Add your account under Sandbox → Target users. |
| TikTok post is private | Expected until TikTok audits the app (see step 5). |
| YouTube video is private | Expected until Google audits the API project (see step 3). |
