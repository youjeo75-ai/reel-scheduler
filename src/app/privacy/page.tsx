export const metadata = { title: "Privacy Policy" };

/**
 * Public page. Google, TikTok and Meta all want a privacy-policy URL when you
 * register a developer app. Edit the contact line before you submit anything.
 */
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-5 py-12 text-sm leading-relaxed text-stone-700">
      <h1 className="text-2xl font-semibold text-stone-900">Privacy Policy</h1>
      <p>
        Reel Scheduler is a private tool used by its owner to schedule the owner&apos;s own short videos to the owner&apos;s own
        Instagram, YouTube and TikTok accounts. It is not offered to the public.
      </p>
      <h2 className="pt-2 text-base font-semibold text-stone-900">What is stored</h2>
      <p>
        When the owner connects an account, the access and refresh tokens issued by the platform are stored, encrypted, in the
        owner&apos;s own database, together with the account&apos;s public name and id. Uploaded videos and thumbnails are kept
        in the owner&apos;s own storage bucket only until they have been published, then deleted.
      </p>
      <h2 className="pt-2 text-base font-semibold text-stone-900">How it is used</h2>
      <p>
        Data is used only to publish the owner&apos;s scheduled videos and to keep the connection to the owner&apos;s accounts
        alive. Nothing is sold, shared with third parties, or used for advertising or analytics.
      </p>
      <h2 className="pt-2 text-base font-semibold text-stone-900">Revoking access</h2>
      <p>
        Access can be removed at any time in the security settings of Instagram, Google (myaccount.google.com/permissions) or
        TikTok. Deleting the database rows removes all stored tokens.
      </p>
      <p>
        YouTube: this app uses YouTube API Services and is subject to the{" "}
        <a className="underline" href="https://www.youtube.com/t/terms">YouTube Terms of Service</a> and the{" "}
        <a className="underline" href="https://policies.google.com/privacy">Google Privacy Policy</a>.
      </p>
    </main>
  );
}
