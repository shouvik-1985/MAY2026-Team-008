import { createFileRoute } from "@tanstack/react-router";
import { CampusVerse } from "@/components/CampusVerse";
import { SmoothScroll } from "@/components/SmoothScroll";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CampusVerse — One Platform. Every Student." },
      {
        name: "description",
        content:
          "CampusVerse is an AI-powered university operating system that unifies academics, administration, communication and campus life into one immersive digital ecosystem.",
      },
      { property: "og:title", content: "CampusVerse — The Digital University" },
      {
        property: "og:description",
        content:
          "Enter the digital twin of an entire university. One platform. Every student. Every possibility.",
      },
    ],
  }),
  component: Index,
});

import { useEffect } from "react";
import { useTheme } from "@/lib/theme";

function Index() {
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme("dark");
  }, [setTheme]);

  return (
    <>
      <SmoothScroll />
      <CampusVerse />
    </>
  );
}
