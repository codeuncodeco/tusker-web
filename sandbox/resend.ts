/**
 * Stands in for the `resend` package in the sandbox build. The sandbox sets no
 * Resend key, so the app writes mail to the console and never builds this. If
 * something does, it sends nothing.
 */
export class Resend {
  emails = {
    async send(mail: { to: string; subject: string }) {
      console.info(`sandbox: mail to ${mail.to} not sent: ${mail.subject}`);
      return { data: null, error: null };
    },
  };
}
