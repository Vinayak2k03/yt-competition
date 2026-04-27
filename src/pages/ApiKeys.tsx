import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const authHeaders = () => {
  return { 'Content-Type': 'application/json' };
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, Key, ArrowLeft, RefreshCw, AlertCircle, XCircle, Clock, Wifi, Ban, HelpCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { format } from "date-fns";

interface ApiKey {
  id: string;
  name: string;
  api_key: string;
  is_active: boolean;
  daily_quota: number;
  quota_exceeded_at: string | null;
  last_used_at: string | null;
  created_at: string;
  last_error: string | null;
  last_error_at: string | null;
  error_type: string | null;
  consecutive_errors: number;
}

type ErrorType = "quota" | "invalid" | "rate_limit" | "network" | "forbidden" | "other";

const getErrorBadge = (key: ApiKey) => {
  if (key.quota_exceeded_at) {
    return { label: "Quota Exceeded", variant: "destructive" as const, icon: XCircle, color: "text-destructive" };
  }
  
  if (key.error_type) {
    const errorMap: Record<ErrorType, { label: string; variant: "destructive" | "secondary" | "outline"; icon: any; color: string }> = {
      quota: { label: "Quota Exceeded", variant: "destructive", icon: XCircle, color: "text-destructive" },
      invalid: { label: "Invalid Key", variant: "destructive", icon: Ban, color: "text-destructive" },
      forbidden: { label: "Forbidden", variant: "destructive", icon: Ban, color: "text-orange-500" },
      rate_limit: { label: "Rate Limited", variant: "secondary", icon: Clock, color: "text-yellow-500" },
      network: { label: "Network Error", variant: "secondary", icon: Wifi, color: "text-gray-500" },
      other: { label: "Error", variant: "secondary", icon: AlertCircle, color: "text-gray-500" },
    };
    return errorMap[key.error_type as ErrorType] || errorMap.other;
  }
  
  if (!key.is_active) {
    return { label: "Inactive", variant: "secondary" as const, icon: HelpCircle, color: "text-muted-foreground" };
  }
  
  return null;
};

export default function ApiKeys() {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/yt-api-keys`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch API keys');
      return res.json() as Promise<ApiKey[]>;
    },
  });

  const addKeyMutation = useMutation({
    mutationFn: async ({ name, api_key }: { name: string; api_key: string }) => {
      const res = await fetch(`${API_URL}/api/yt-api-keys`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, api_key }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to add key');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewKeyName("");
      setNewKeyValue("");
      toast({ title: "API key added successfully" });
    },
    onError: (error) => {
      toast({ title: "Error adding API key", description: error.message, variant: "destructive" });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/yt-api-keys/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to delete key');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API key deleted" });
    },
    onError: (error) => {
      toast({ title: "Error deleting API key", description: error.message, variant: "destructive" });
    },
  });

  const resetErrorMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/yt-api-keys/${id}/reset-error`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to reset error');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "Error status reset" });
    },
  });

  const updateQuotaMutation = useMutation({
    mutationFn: async ({ id, daily_quota }: { id: string; daily_quota: number }) => {
      const res = await fetch(`${API_URL}/api/yt-api-keys/${id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ daily_quota }),
      });
      if (!res.ok) throw new Error('Failed to update quota');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "Quota updated" });
    },
  });

  const handleAddKey = () => {
    if (!newKeyName.trim() || !newKeyValue.trim()) {
      toast({ title: "Please fill in both fields", variant: "destructive" });
      return;
    }
    addKeyMutation.mutate({ name: newKeyName.trim(), api_key: newKeyValue.trim() });
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}${"•".repeat(20)}${key.slice(-4)}`;
  };

  // Calculate summary stats
  const activeKeys = apiKeys?.filter(k => k.is_active && !k.quota_exceeded_at && !k.error_type).length || 0;
  const keysWithErrors = apiKeys?.filter(k => k.quota_exceeded_at || k.error_type).length || 0;
  const totalKeys = apiKeys?.length || 0;
  const totalDailyQuota = apiKeys?.reduce((sum, k) => sum + (k.daily_quota || 10000), 0) || 0;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">YouTube API Keys</h1>
              <p className="text-muted-foreground">Manage API keys for quota rotation</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{activeKeys}</div>
                <div className="text-sm text-muted-foreground">Active Keys</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-destructive">{keysWithErrors}</div>
                <div className="text-sm text-muted-foreground">Keys with Errors</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{totalKeys}</div>
                <div className="text-sm text-muted-foreground">Total Keys</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{totalDailyQuota.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Daily Quota</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add New API Key
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="Key name (e.g., Key 1)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="max-w-[200px]"
                />
                <Input
                  placeholder="API key value"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  type="password"
                  className="flex-1"
                />
                <Button onClick={handleAddKey} disabled={addKeyMutation.isPending}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Key
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys ({apiKeys?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : !apiKeys?.length ? (
                <p className="text-muted-foreground">No API keys configured. Add your first key above.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>API Key</TableHead>
                      <TableHead>Daily Quota</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeys.map((key) => {
                      const errorBadge = getErrorBadge(key);
                      const hasError = key.quota_exceeded_at || key.error_type;
                      
                      return (
                        <TableRow key={key.id}>
                          <TableCell className="font-medium">{key.name}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {maskApiKey(key.api_key)}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="w-28 h-8 text-sm"
                              defaultValue={key.daily_quota || 10000}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value);
                                if (val > 0 && val !== key.daily_quota) {
                                  updateQuotaMutation.mutate({ id: key.id, daily_quota: val });
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {errorBadge ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5">
                                    <Badge variant={errorBadge.variant} className="gap-1">
                                      <errorBadge.icon className={`h-3 w-3 ${errorBadge.color}`} />
                                      {errorBadge.label}
                                    </Badge>
                                    {key.consecutive_errors > 1 && (
                                      <span className="text-xs text-muted-foreground">
                                        ({key.consecutive_errors}x)
                                      </span>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-sm">
                                  <div className="space-y-1">
                                    {key.last_error && (
                                      <p className="text-xs break-words">{key.last_error.slice(0, 200)}</p>
                                    )}
                                    {key.last_error_at && (
                                      <p className="text-xs text-muted-foreground">
                                        Error at: {format(new Date(key.last_error_at), "MMM d, HH:mm:ss")}
                                      </p>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : key.is_active ? (
                              <Badge variant="default" className="bg-green-600">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {key.last_used_at 
                              ? format(new Date(key.last_used_at), "MMM d, HH:mm")
                              : "Never"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(key.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {hasError && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resetErrorMutation.mutate(key.id)}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Reset
                              </Button>
                            )}
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteKeyMutation.mutate(key.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
