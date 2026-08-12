import { redirect } from "next/navigation";

// The only human-facing surface this app serves is the admin portal; the rest
// is the versioned JSON API under /api/v1. Landing visitors on the portal
// instead of an unstyled placeholder keeps the root URL usable.
export default function Home() {
  redirect("/admin");
}
