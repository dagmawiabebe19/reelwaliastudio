import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { RefTag } from "@/components/ui/RefTag";
import { StatusDot } from "@/components/ui/StatusDot";

export default function HomePage() {
  return (
    <PlaceholderPage
      title="Home"
      description="Your serialized AI production workspace. Create series, episodes, and scenes — portrait and landscape."
    >
      <div className="space-y-8">
        <div className="flex flex-wrap gap-6">
          <StatusDot variant="open" label="Open" />
          <StatusDot variant="in_progress" label="In progress" />
          <StatusDot variant="validated" label="Validated" />
          <StatusDot variant="released" label="Released" />
        </div>
        <p className="text-sm text-muted">
          Reference ingredients with mono tags like{" "}
          <RefTag tag="image10" /> <RefTag tag="voice4" /> <RefTag tag="line92" />.
        </p>
      </div>
    </PlaceholderPage>
  );
}
