import { createFileRoute } from "@tanstack/react-router";
import { PageTransition } from "@/components/app/cinematic";
import { ConnectHub } from "@/components/connect/ConnectHub";
import { getStoredUser } from "@/lib/auth";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/connect")({ component: ConnectPage });

function ConnectPage() {
  const { dashboard } = useStudentDashboard();
  const storedUser = getStoredUser();
  return (
    <PageTransition>
      <ConnectHub
        viewerRole="student"
        viewerName={dashboard?.user.name ?? storedUser?.full_name ?? "Student"}
      />
    </PageTransition>
  );
}
