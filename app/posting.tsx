/**
 * A button that holds while its own post is in flight.
 *
 * A plain `<Form>` button stays live while it posts, so a second click posts
 * again. This one is disabled, and says what it is doing, from the moment it
 * is clicked until the navigation is idle, whether the post landed or was
 * refused. It reads its own intent only, so a Save in flight does not hold
 * Finish. See #194.
 */

import { useNavigation, type Navigation } from "react-router";

import { celebrateAt } from "./celebrate";

/**
 * Whether the navigation is a post of this intent, or of a form with no
 * intent when `intent` is null. The edit form posts no intent, so that is how
 * Save reads its own post.
 */
export function isPosting(
  navigation: Pick<Navigation, "state" | "formMethod" | "formData">,
  intent: string | null,
): boolean {
  // An idle navigation, or a plain page load, holds no form data.
  if (!navigation.formData || navigation.formMethod?.toUpperCase() !== "POST") return false;
  return navigation.formData.get("intent") === intent;
}

/** A submit button of the task page, with the label it reads while it posts. */
export function PostButton({
  intent,
  label,
  busyLabel,
}: {
  /** The intent the button posts, or null for the edit form's Save. */
  intent: string | null;
  label: string;
  busyLabel: string;
}) {
  const posting = isPosting(useNavigation(), intent);

  return (
    <button
      {...(intent ? { name: "intent", value: intent } : {})}
      disabled={posting}
      // Finishing is the act a person comes to do, so it earns the burst.
      onClick={intent === "finish" ? (event) => celebrateAt(event.currentTarget) : undefined}
      className={`press self-start rounded border px-3 py-2 disabled:opacity-30 ${
        intent === "finish" ? "border-win font-medium text-win hover:bg-win/10" : "border-border hover:bg-surface-2"
      }`}
    >
      {posting ? busyLabel : label}
    </button>
  );
}
