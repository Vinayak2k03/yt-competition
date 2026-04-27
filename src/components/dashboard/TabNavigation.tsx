import { cn } from "@/lib/utils";

export type TabId = 'overview' | 'top-streams' | 'word-cloud' | 'hashtags';

interface Tab {
  id: TabId;
  label: string;
}

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'top-streams', label: 'Top Livestreams' },
  { id: 'word-cloud', label: 'Livestream Title Word Cloud' },
  { id: 'hashtags', label: 'Hashtags/Tags Ranking' },
];

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="border-b border-border bg-card">
      <div className="container mx-auto px-6">
        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
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
