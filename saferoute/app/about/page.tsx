import { permanentRedirect } from "next/navigation";

/** The landing page moved to "/"; keep old /about links working. */
export default function AboutPage() {
  permanentRedirect("/");
}
