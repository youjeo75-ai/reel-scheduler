export const metadata = { title: "Terms of Service" };

/** Public page, required by TikTok's and Google's app registration forms. */
export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-5 py-12 text-sm leading-relaxed text-stone-700">
      <h1 className="text-2xl font-semibold text-stone-900">Terms of Service</h1>
      <p>
        Reel Scheduler is a private tool operated by its owner for personal use. It is provided as-is, without warranty, and
        is not available to other users.
      </p>
      <p>
        The owner is responsible for the content published through it and for complying with the terms of Instagram, YouTube
        and TikTok. Access to the dashboard is restricted by password.
      </p>
    </main>
  );
}
