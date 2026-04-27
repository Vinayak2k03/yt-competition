import { cn } from "@/lib/utils";

export type VODTabId = "overview" | "videos" | "keywords" | "tags" | "clusters" | "publish-timing";

interface VODTabNavigationProps {
  activeTab: VODTabId;
  onTabChange: (tab: VODTabId) => void;
}

const tabs: { id: VODTabId; label: string }[] = [
  { id: "overview", label: "Channel Overview" },
  { id: "videos", label: "Video Library" },
  { id: "keywords", label: "Keyword Analysis" },
  { id: "tags", label: "Tag Analysis" },
  { id: "clusters", label: "Cluster Analytics" },
  { id: "publish-timing", label: "Publish Timing" },
];

export function VODTabNavigation({ activeTab, onTabChange }: VODTabNavigationProps) {
  return (
    <div className="border-b bg-card">
      <div className="container mx-auto px-6">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
