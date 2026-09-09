import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | FIT23Hub",
  description: "How FIT23Hub collects, uses, retains and deletes student data.",
};

const LAST_UPDATED = "9 September 2026";
const CONTACT_EMAIL = "rathnayakarmdno.23@uom.lk";

type Row = { data: string; why: string; retention: string };

const dataRows: Row[] = [
  {
    data: "Name, index number, university email",
    why: "Identifying you to your batch and controlling access to the platform.",
    retention: "Until you delete your account.",
  },
  {
    data: "Password (bcrypt hash)",
    why: "Signing you in. The plain password is never stored or logged.",
    retention: "Until you delete your account.",
  },
  {
    data: "Profile photo (optional)",
    why: "Shown on your profile.",
    retention: "Until you remove it or delete your account.",
  },
  {
    data: "Materials, notes and links you upload",
    why: "Sharing academic resources with the batch.",
    retention: "Kept after account deletion, but transferred to an anonymous account.",
  },
  {
    data: "AI assistant chats, sources and query logs",
    why: "Producing answers and letting you revisit past conversations.",
    retention: "Deleted permanently when you delete your account.",
  },
  {
    data: "Password reset and email verification tokens",
    why: "Securing account recovery and confirming your email address.",
    retention: "Single use; reset links expire after 60 minutes, verification links after 24 hours.",
  },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-[var(--muted)]">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen px-4 py-10 md:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="glass-card p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">FIT23Hub</p>
          <h1 className="mt-2 text-3xl font-semibold">Privacy Policy</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Last updated: {LAST_UPDATED}</p>

          <Section id="who-we-are" title="1. Who we are">
            <p>
              FIT23Hub is a student-run platform for the Faculty of Information Technology,
              University of Moratuwa, Batch 23. It is not an official university service. The
              platform is maintained by students of the batch, who act as the data controllers for
              the information described here.
            </p>
          </Section>

          <Section id="what-we-collect" title="2. What we collect, why, and how long we keep it">
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--accent)]">
                    <th className="px-2 py-2 font-medium">Data</th>
                    <th className="px-2 py-2 font-medium">Purpose</th>
                    <th className="px-2 py-2 font-medium">Retention</th>
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row) => (
                    <tr key={row.data} className="border-b border-[var(--border)]/60 align-top">
                      <td className="px-2 py-3 text-white">{row.data}</td>
                      <td className="px-2 py-3 text-[var(--muted)]">{row.why}</td>
                      <td className="px-2 py-3 text-[var(--muted)]">{row.retention}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              We do not sell your data, we do not run advertising, and we do not share your
              information with third parties except the infrastructure providers listed below.
            </p>
          </Section>

          <Section id="retention" title="3. Retention period">
            <p>
              Account data is kept for as long as your account exists. Inactive accounts are
              reviewed at the end of each academic year, and accounts that have not been used for
              24 months may be removed after an email warning.
            </p>
            <p>
              Expired password-reset and email-verification tokens are purged automatically. Server
              logs containing IP addresses are retained for no longer than 30 days.
            </p>
          </Section>

          <Section id="your-rights" title="4. Your rights">
            <p>
              Consistent with Sri Lanka&apos;s Personal Data Protection Act No. 9 of 2022, you can:
            </p>
            <ul className="ml-5 list-disc space-y-1">
              <li>
                <span className="text-white">Access and port your data</span> &mdash; download
                everything we hold about you as a JSON file from your profile page.
              </li>
              <li>
                <span className="text-white">Correct your data</span> &mdash; update your profile,
                or contact us for changes you cannot make yourself.
              </li>
              <li>
                <span className="text-white">Delete your account</span> &mdash; erase your personal
                data from your profile page. See section 5 for exactly what this removes.
              </li>
              <li>
                <span className="text-white">Withdraw consent</span> &mdash; stop using the platform
                and delete your account at any time.
              </li>
              <li>
                <span className="text-white">Complain</span> &mdash; contact us first; you may also
                raise concerns with the relevant supervisory authority.
              </li>
            </ul>
          </Section>

          <Section id="deletion" title="5. What account deletion does">
            <p>Deleting your account permanently removes:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>Your name, index number, email address and password hash</li>
              <li>Your profile photo</li>
              <li>All AI assistant projects, sources, chats and query logs</li>
              <li>Any outstanding password-reset or verification tokens</li>
            </ul>
            <p>
              Study materials you uploaded are <span className="text-white">kept</span> so that
              other students do not lose shared resources, but they are transferred to an anonymous
              &ldquo;Deleted Account&rdquo; and can no longer be traced back to you. If you want a
              specific upload removed as well, delete it before deleting your account, or email us.
            </p>
            <p>Deletion is immediate and cannot be undone.</p>
          </Section>

          <Section id="security" title="6. How we protect your data">
            <p>
              Passwords are hashed with bcrypt and never stored in plain text. Access to the
              platform requires a signed token, and administrative actions are limited to accounts
              with the admin role. Password-reset and verification links are stored only as hashes,
              expire, and can be used once. All traffic is served over HTTPS in production.
            </p>
          </Section>

          <Section id="processors" title="7. Infrastructure providers">
            <p>
              We rely on third-party services to run the platform: a cloud database and file
              storage provider, an application hosting provider, and an email provider used solely
              to deliver verification and password-reset messages. These providers process data on
              our behalf and are not permitted to use it for their own purposes.
            </p>
          </Section>

          <Section id="changes" title="8. Changes to this policy">
            <p>
              If this policy changes materially we will announce it on the platform before the
              change takes effect. The date at the top of this page always reflects the current
              version.
            </p>
          </Section>

          <Section id="contact" title="9. Contact">
            <p>
              For any privacy question or request, email{" "}
              <a className="text-[var(--accent)] hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . We aim to respond within 30 days.
            </p>
          </Section>

          <div className="mt-8 border-t border-[var(--border)] pt-5">
            <Link className="text-sm text-[var(--accent)] hover:underline" href="/">
              &larr; Back to FIT23Hub
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
