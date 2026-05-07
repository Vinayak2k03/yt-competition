import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FiltersProps {
  networkFilter: string;
  brandFilter: string;
  brandClusters: string[];
  onNetworkChange: (value: string) => void;
  onBrandChange: (value: string) => void;
}

export function Filters({
  networkFilter,
  brandFilter,
  brandClusters,
  onNetworkChange,
  onBrandChange,
}: FiltersProps) {
  return (
    <div className="flex items-center gap-3">
      <Select value={networkFilter} onValueChange={onNetworkChange}>
        <SelectTrigger className="w-[160px] h-9 text-sm">
          <SelectValue placeholder="Network Group" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Networks</SelectItem>
          <SelectItem value="TIMES">Times Network</SelectItem>
          <SelectItem value="COMPETITION">Competition</SelectItem>
        </SelectContent>
      </Select>
      
      <Select value={brandFilter} onValueChange={onBrandChange}>
        <SelectTrigger className="w-[180px] h-9 text-sm">
          <SelectValue placeholder="Brand Cluster" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Clusters</SelectItem>
          {brandClusters.map((cluster) => {
            const val = cluster || 'unassigned';
            return (
              <SelectItem key={val} value={val}>
                {cluster || 'Unassigned'}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
