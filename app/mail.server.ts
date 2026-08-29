import { Resend } from "resend";

/**
 * What one sign-in mail carries. A magic link, a code, or both. Mail latency is
 * the reason a code exists at all, so both ride in one message.
 */
export type SignInMail = { url?: string; otp?: string };

export type Mailer = {
  signIn(to: string, mail: SignInMail): Promise<void>;
  passwordReset(to: string, url: string): Promise<void>;
};

/** A mail the log mailer kept. Local runs and tests read this. */
export type SentMail = { to: string; subject: string; text: string };

/** How many mails the log mailer holds. The log itself keeps the rest. */
const OUTBOX_DEPTH = 20;

/** The last mails the log mailer took, newest last. Empty when Resend is on. */
export const outbox: SentMail[] = [];

/**
 * The mailer the app runs with. Resend when the key is set, the log otherwise,
 * so a local run needs no key and a test can read what went out.
 */
export function createMailer(env: Env): Mailer {
  return env.RESEND_API_KEY ? resendMailer(env) : logMailer();
}

function resendMailer(env: Env): Mailer {
  const resend = new Resend(env.RESEND_API_KEY);
  const from = env.MAIL_FROM;

  return {
    async signIn(to, mail) {
      const { subject, text } = signInBody(mail);
      await resend.emails.send({ from, to, subject, text });
    },
    async passwordReset(to, url) {
      const { subject, text } = passwordResetBody(url);
      await resend.emails.send({ from, to, subject, text });
    },
  };
}

function logMailer(): Mailer {
  return {
    async signIn(to, mail) {
      keep({ to, ...signInBody(mail) });
    },
    async passwordReset(to, url) {
      keep({ to, ...passwordResetBody(url) });
    },
  };
}

function keep(mail: SentMail) {
  outbox.push(mail);
  if (outbox.length > OUTBOX_DEPTH) outbox.shift();
  console.info(`mail to ${mail.to}: ${mail.subject}\n${mail.text}`);
}

function signInBody(mail: SignInMail) {
  const lines = ["Sign in to Tusker."];
  if (mail.url) lines.push("", "Open this link:", mail.url);
  if (mail.otp) lines.push("", `Or type this code: ${mail.otp}`);
  lines.push("", "The link and the code both stop working in 15 minutes.");
  return { subject: "Sign in to Tusker", text: lines.join("\n") };
}

function passwordResetBody(url: string) {
  return {
    subject: "Reset your Tusker password",
    text: ["Open this link to set a new password:", url, "", "The link stops working in one hour."].join("\n"),
  };
}

/**
 * Merges the link and the code into one mail. better-auth sends the magic link
 * and the code through two callbacks, so the sign-in action collects both and
 * flushes one message.
 */
export function oneMail(mailer: Mailer): { mailer: Mailer; flush(): Promise<void> } {
  let to: string | null = null;
  const merged: SignInMail = {};

  return {
    mailer: {
      async signIn(recipient, mail) {
        to = recipient;
        Object.assign(merged, mail);
      },
      passwordReset: mailer.passwordReset,
    },
    async flush() {
      if (to) await mailer.signIn(to, merged);
    },
  };
}
