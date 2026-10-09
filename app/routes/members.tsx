import { Form, redirect } from "react-router";

import { nameOf } from "../assignees";
import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { fieldClass } from "../forms";
import { inviteToOrg, type InviteDeps } from "../invites.server";
import {
  answerRequest,
  answersRequests,
  waitingOn,
  type Waiting,
} from "../join-requests.server";
import { createMailer } from "../mail.server";
import {
  heldUnfinishedTasks,
  isRole,
  listMembers,
  memberOf,
  removeMember,
  setMemberRole,
  type Member,
  type MemberChange,
} from "../orgs.server";
import { requireScope, type Scope } from "../scope.server";
import type { Route } from "./+types/members";

/**
 * Why an org refuses to lose its last owner, by a removal or by a demotion.
 * See ADR-0023.
 */
function lastOwnerRefusal(org: { name: string }): string {
  return `${org.name} must keep one owner. Make somebody else an owner first.`;
}

/** The ask that stands between a Remove button and the write. */
type Removal = { id: string; name: string; you: boolean; tasks: number };

/** What a member write answers with, for the two that answer the same way. */
function answer(done: MemberChange, scope: Scope, said: string) {
  if (done === "last-owner") return { error: lastOwnerRefusal(scope.org) };
  if (done === "no-member") return { error: noSuchMember(scope) };
  return { ok: said };
}

/** What an org says about an id no membership of it answers for. */
function noSuchMember(scope: Scope): string {
  return `${scope.org.name} has no such member.`;
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Members of ${loaderData.org.name} — Tusker` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);
  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    members: await listMembers(env.DB, scope.org.id),
    // Which row is the reader's own, so the page says Leave rather than Remove.
    you: scope.personId,
    // Every member sees the waiting join requests, so one who knows the
    // person can tell an owner. Only an owner answers them. See ADR-0028.
    requests: await waitingOn(env.DB, scope),
    answers: await answersRequests(env.DB, scope),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "invite");

  if (intent === "remove") return remove(env, scope, form);
  if (intent === "role") return changeRole(env, scope, form);

  const deps = inviteDeps(env, request);
  if (intent === "approve" || intent === "decline") return answerJoin(deps, scope, form, intent);

  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Name the email of the person to invite." };

  const invited = await inviteToOrg(deps, { org: scope.org, byId: scope.personId, email });

  if (invited === "already") return { error: `${email} is already a member.` };
  if (invited === "invited") {
    return { ok: `${email} is a member now. Tusker mailed them a link to sign in.` };
  }
  return { ok: `${email} is a member now. Tusker mailed them.` };
}

/**
 * Takes one person out of the org, in two presses.
 *
 * The first press asks, and names how many unfinished tasks are about to lose
 * a holder: the removal drops the assignments, and no other screen counts them.
 * The second press carries `confirmed` and does the work.
 *
 * A person removing themselves lands on the unified board, because the page
 * they are standing on is one they no longer read.
 */
async function remove(env: Env, scope: Scope, form: FormData) {
  const member = await memberOf(env.DB, scope, String(form.get("member") ?? ""));
  if (!member) return { error: noSuchMember(scope) };

  const you = member.id === scope.personId;

  if (!form.get("confirmed")) {
    const confirm: Removal = {
      id: member.id,
      name: nameOf(member),
      you,
      tasks: await heldUnfinishedTasks(env.DB, scope, member.id),
    };
    return { confirm };
  }

  const done = await removeMember(env.DB, scope, member.id);
  if (done === "changed" && you) return redirect("/me");
  return answer(done, scope, `${nameOf(member)} is out of ${scope.org.name}.`);
}

/** Everything an invitation and an approval read and write, for this request. */
function inviteDeps(env: Env, request: Request): InviteDeps {
  const mailer = createMailer(env);
  return {
    db: env.DB,
    auth: createAuth(env, request, mailer),
    mailer,
    origin: new URL(request.url).origin,
  };
}

/**
 * An owner's answer to one join request. A plain member reads a refusal, and
 * the write refuses them as well, because only an owner answers. See ADR-0028.
 */
async function answerJoin(
  deps: InviteDeps,
  scope: Scope,
  form: FormData,
  intent: "approve" | "decline",
) {
  const personId = String(form.get("person") ?? "");
  const asker = (await waitingOn(deps.db, scope)).find((one) => one.id === personId);

  const done = await answerRequest(deps, scope, personId, intent);
  if (done === "not-owner") return { error: `Only an owner of ${scope.org.name} answers a join request.` };
  if (done === "no-request" || !asker) {
    return { error: `${scope.org.name} holds no waiting request from that person.` };
  }

  const name = nameOf(asker);
  if (done === "approved") {
    return { ok: `${name} is a member of ${scope.org.name} now. Tusker mailed them a link to sign in.` };
  }
  return { ok: `${name}'s request to join ${scope.org.name} is declined.` };
}

/** Gives one member the other role, unless that would leave the org ownerless. */
async function changeRole(env: Env, scope: Scope, form: FormData) {
  const wanted = String(form.get("role") ?? "");
  if (!isRole(wanted)) return { error: "That is not a role Tusker holds." };

  const member = await memberOf(env.DB, scope, String(form.get("member") ?? ""));
  if (!member) return { error: noSuchMember(scope) };

  const done = await setMemberRole(env.DB, scope, member.id, wanted);
  const said = wanted === "owner" ? "an owner" : "a member";
  return answer(done, scope, `${nameOf(member)} is ${said} of ${scope.org.name} now.`);
}

export default function Members({ loaderData, actionData }: Route.ComponentProps) {
  const { org, members, you, requests, answers } = loaderData;
  const confirm = actionData && "confirm" in actionData ? actionData.confirm : null;
  // One count for the whole list, because the answer is the org's and not the
  // row's: it decides which single row draws no control.
  const owners = members.filter((one) => one.role === "owner").length;

  return (
    <main className="mx-auto flex flex-1 max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl tracking-tight">Members</h1>

      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span>{nameOf(member)}</span>
            <span className="text-muted">{member.email}</span>
            <span className="text-xs uppercase tracking-wide text-muted">{member.role}</span>
            <MemberControls
              member={member}
              last={member.role === "owner" && owners === 1}
              you={you}
              org={org}
            />
          </li>
        ))}
      </ul>

      <JoinRequests requests={requests} answers={answers} />

      {confirm ? <ConfirmRemoval confirm={confirm} org={org} /> : null}

      {actionData && "error" in actionData ? (
        <p role="alert" className="text-danger">
          {actionData.error}
        </p>
      ) : null}
      {actionData && "ok" in actionData ? <p className="text-muted">{actionData.ok}</p> : null}

      <InviteForm />
    </main>
  );
}

/**
 * The two controls one member's row carries: the other role, and the way out.
 *
 * The last owner gets neither, and reads the refusal in their row instead. An
 * org always keeps one owner, so a control whose one answer is that refusal
 * teaches less than the sentence itself. See ADR-0023.
 */
function MemberControls({
  member,
  last,
  you,
  org,
}: {
  member: Member;
  last: boolean;
  you: string;
  org: { name: string };
}) {
  if (last) return <span className="text-muted">{lastOwnerRefusal(org)}</span>;

  const other = member.role === "owner" ? "member" : "owner";

  return (
    <span className="flex items-baseline gap-3">
      <Form method="post">
        <input type="hidden" name="intent" value="role" />
        <input type="hidden" name="member" value={member.id} />
        <input type="hidden" name="role" value={other} />
        <button className="underline">Make {other === "owner" ? "an owner" : "a member"}</button>
      </Form>
      <Form method="post">
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="member" value={member.id} />
        <button className="text-danger underline">{member.id === you ? "Leave" : "Remove"}</button>
      </Form>
    </span>
  );
}

/**
 * The join requests waiting on the org. Every member reads them, so one who
 * knows the person can tell an owner or invite them. Only an owner gets
 * Approve and Decline. See ADR-0028.
 */
function JoinRequests({ requests, answers }: { requests: Waiting[]; answers: boolean }) {
  if (requests.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="uppercase tracking-wide text-muted">Asking to join</h2>
      <ul className="flex flex-col gap-2">
        {requests.map((asker) => (
          <li key={asker.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span>{nameOf(asker)}</span>
            <span className="text-muted">{asker.email}</span>
            {answers ? (
              <Form method="post" className="flex items-baseline gap-3">
                <input type="hidden" name="person" value={asker.id} />
                <button name="intent" value="approve" className="underline">
                  Approve
                </button>
                <button name="intent" value="decline" className="text-danger underline">
                  Decline
                </button>
              </Form>
            ) : null}
          </li>
        ))}
      </ul>
      {answers ? null : <p className="text-muted">An owner answers these.</p>}
    </section>
  );
}

/**
 * The box the first press draws.
 *
 * It says how many unfinished tasks lose a holder, because that is the part of
 * the removal nothing else on screen shows. The tasks themselves stay with the
 * org, per ADR-0001, and the box says so.
 */
function ConfirmRemoval({ confirm, org }: { confirm: Removal; org: { name: string } }) {
  const holder = confirm.you ? "You hold" : `${confirm.name} holds`;

  return (
    <div role="alert" className="flex flex-col gap-3 rounded border border-border p-3">
      <p>
        {confirm.tasks === 0
          ? `${holder} no unfinished task of ${org.name}.`
          : `${holder} ${confirm.tasks} unfinished task${confirm.tasks === 1 ? "" : "s"} of ${org.name}. Those tasks stay, and they lose their holder.`}
      </p>
      <Form method="post">
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="member" value={confirm.id} />
        <input type="hidden" name="confirmed" value="1" />
        <button className="rounded border border-border px-3 py-2 text-danger">
          {confirm.you ? `Leave ${org.name}` : `Remove ${confirm.name}`}
        </button>
      </Form>
    </div>
  );
}

/** The one way into an org: a member names the email, and Tusker mails them. */
function InviteForm() {
  return (
    <Form method="post" className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        Invite by email
        <input name="email" type="email" required className={fieldClass} />
      </label>
      <p className="text-muted">
        An email no account holds gets one, and a mail with a link to sign in.
      </p>

      <button className="self-start rounded border border-border px-3 py-2">Invite</button>
    </Form>
  );
}
