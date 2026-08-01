import { createFileRoute } from "@tanstack/react-router";
import { MarketplaceExperience } from "@/components/marketplace/MarketplaceExperience";

export const Route = createFileRoute("/app/marketplace")({
  component: MarketplacePage,
});

function MarketplacePage() {
  return <MarketplaceExperience mode="student" />;
}
