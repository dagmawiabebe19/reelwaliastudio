import { redirect } from "next/navigation";

/** Global series index duplicated Projects — keep /series/[id] for series pages. */
export default function SeriesIndexRedirectPage() {
  redirect("/projects");
}
