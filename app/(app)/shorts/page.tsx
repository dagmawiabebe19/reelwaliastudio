import { redirect } from "next/navigation";

/** Legacy Shorts index — series live under Projects. */
export default function ShortsRedirectPage() {
  redirect("/projects");
}
