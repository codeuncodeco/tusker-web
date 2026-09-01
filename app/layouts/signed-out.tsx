/**
 * The pages a signed-out person can open: the home page, sign-in, bootstrap
 * and the reset-password page.
 *
 * It draws a wordmark and nothing else. A signed-out person has one
 * destination, so a header would be five dead links.
 */

import { Link, Outlet } from "react-router";

export default function SignedOut() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="px-8 py-3">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Tusker
        </Link>
      </div>
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
