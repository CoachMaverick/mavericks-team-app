import { redirect } from "next/navigation";

export default function Home() {
  // For now, public root redirects to login.
  // After auth is wired, we can show a nice marketing landing for non-logged-in visitors.
  redirect("/login");
}
