import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const authHeaders = () => {
  return { 'Content-Type': 'application/json' };
};
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Pencil, Trash2, ArrowLeft, Youtube, AlertCircle, ExternalLink, CheckCircle2, Loader2, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Link, Navigate } from 'react-router-dom';

interface Channel {
  id: string;
  display_name: string;
  youtube_url: string;
  youtube_channel_id: string | null;
  network_group: string;
  brand_cluster: string;
  is_active: boolean;
  created_at: string;
}

interface VerifiedChannel {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  customUrl?: string;
}

// Validate YouTube URL or Channel ID
const youtubeChannelSchema = z.object({
  display_name: z.string().trim().min(1, 'Display name is required').max(100, 'Display name too long'),
  youtube_url: z.string().trim().min(1, 'YouTube URL or Channel ID is required').refine((val) => {
    // Accept channel ID directly (starts with UC)
    if (/^UC[\w-]{22}$/.test(val)) return true;
    // Accept various YouTube URL formats
    const urlPatterns = [
      /youtube\.com\/@[\w-]+/,
      /youtube\.com\/channel\/UC[\w-]{22}/,
      /youtube\.com\/c\/[\w-]+/,
      /youtube\.com\/user\/[\w-]+/,
    ];
    return urlPatterns.some(p => p.test(val));
  }, 'Invalid YouTube URL or Channel ID'),
  network_group: z.string().optional(),
  brand_cluster: z.string().optional(),
  youtube_channel_id: z.string().optional(),
});

type ChannelFormData = z.infer<typeof youtubeChannelSchema>;

function ChannelFormDialog({ 
  channel, 
  onClose, 
  mode 
}: { 
  channel?: Channel; 
  onClose: () => void;
  mode: 'add' | 'edit';
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ChannelFormData>({
    display_name: channel?.display_name || '',
    youtube_url: channel?.youtube_url || '',
    network_group: channel?.network_group || '',
    brand_cluster: channel?.brand_cluster || '',
    youtube_channel_id: channel?.youtube_channel_id || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedChannel, setVerifiedChannel] = useState<VerifiedChannel | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const formatNumber = (num: string) => {
    const n = parseInt(num, 10);
    if (isNaN(n)) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const verifyChannel = useCallback(async () => {
    if (!formData.youtube_url.trim()) {
      setVerificationError('Please enter a YouTube URL or Channel ID first');
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);
    setVerifiedChannel(null);

    try {
      const res = await fetch(`${API_URL}/cluster-api/verify-channel`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ youtube_url: formData.youtube_url.trim() }),
      });
      const data = await res.json();

      if (!res.ok || data?.error) {
        setVerificationError(data?.error ?? 'Failed to verify channel');
        return;
      }

      if (data?.channel) {
        setVerifiedChannel(data.channel);
        if (!formData.display_name.trim()) {
          setFormData(prev => ({ ...prev, display_name: data.channel.title }));
        }
        setFormData(prev => ({ ...prev, youtube_channel_id: data.channel.channelId }));
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      setVerificationError(error.message || 'Failed to verify channel');
    } finally {
      setIsVerifying(false);
    }
  }, [formData.youtube_url, formData.display_name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    const result = youtubeChannelSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    
    try {
      const payload = {
        display_name: formData.display_name.trim(),
        youtube_url: formData.youtube_url.trim(),
        youtube_channel_id: formData.youtube_channel_id || null,
        network_group: formData.network_group || 'TIMES',
        brand_cluster: formData.brand_cluster || 'Other',
      };

      if (mode === 'add') {
        const res = await fetch(`${API_URL}/api/yt-channels`, {
          method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to add channel');
        toast({ title: 'Channel added successfully' });
      } else if (channel) {
        const res = await fetch(`${API_URL}/api/yt-channels/${channel.id}`, {
          method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to update channel');
        toast({ title: 'Channel updated successfully' });
      }
      
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      onClose();
    } catch (error: any) {
      toast({ 
        title: 'Error saving channel', 
        description: error.message,
        variant: 'destructive' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="youtube_url">YouTube URL or Channel ID *</Label>
        <div className="flex gap-2">
          <Input
            id="youtube_url"
            placeholder="https://youtube.com/@ChannelName or UCxxxxxx..."
            value={formData.youtube_url}
            onChange={(e) => {
              setFormData({ ...formData, youtube_url: e.target.value });
              setVerifiedChannel(null);
              setVerificationError(null);
            }}
            disabled={isSubmitting || isVerifying}
            className="flex-1"
          />
          <Button 
            type="button" 
            variant="secondary"
            onClick={verifyChannel}
            disabled={isSubmitting || isVerifying || !formData.youtube_url.trim()}
          >
            {isVerifying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Verify</span>
          </Button>
        </div>
        {errors.youtube_url && (
          <p className="text-sm text-destructive">{errors.youtube_url}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Accepts: @handle URLs, /channel/ URLs, or Channel IDs (starting with UC)
        </p>
      </div>

      {/* Verification Result */}
      {verificationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{verificationError}</AlertDescription>
        </Alert>
      )}

      {verifiedChannel && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 rounded-lg">
              <AvatarImage src={verifiedChannel.thumbnailUrl} alt={verifiedChannel.title} />
              <AvatarFallback className="rounded-lg">
                <Youtube className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold truncate">{verifiedChannel.title}</h4>
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              </div>
              {verifiedChannel.customUrl && (
                <p className="text-sm text-muted-foreground">@{verifiedChannel.customUrl.replace('@', '')}</p>
              )}
              <div className="flex gap-4 mt-2 text-sm">
                <div>
                  <span className="font-medium">{formatNumber(verifiedChannel.subscriberCount)}</span>
                  <span className="text-muted-foreground ml-1">subscribers</span>
                </div>
                <div>
                  <span className="font-medium">{formatNumber(verifiedChannel.videoCount)}</span>
                  <span className="text-muted-foreground ml-1">videos</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {verifiedChannel.channelId}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="display_name">Display Name *</Label>
        <Input
          id="display_name"
          placeholder="e.g., Times Now"
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          disabled={isSubmitting}
        />
        {errors.display_name && (
          <p className="text-sm text-destructive">{errors.display_name}</p>
        )}
        {verifiedChannel && !formData.display_name && (
          <p className="text-xs text-muted-foreground">
            Leave empty to use "{verifiedChannel.title}"
          </p>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="network_group">Network Group</Label>
          <Select
            value={formData.network_group}
            onValueChange={(v) => setFormData({ ...formData, network_group: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TIMES">TIMES</SelectItem>
              <SelectItem value="COMPETITION">COMPETITION</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="brand_cluster">Brand Cluster</Label>
          <Input
            id="brand_cluster"
            placeholder="e.g., News, Sports"
            value={formData.brand_cluster}
            onChange={(e) => setFormData({ ...formData, brand_cluster: e.target.value })}
            disabled={isSubmitting}
          />
        </div>
      </div>
      
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={isSubmitting}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : mode === 'add' ? 'Add Channel' : 'Save Changes'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function Channels() {
  const isAdmin = true;
  const authLoading = false;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/yt-channels`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch channels');
      return res.json() as Promise<Channel[]>;
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await fetch(`${API_URL}/api/yt-channels/${id}/toggle`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ is_active }),
      });
      if (!res.ok) throw new Error('Failed to toggle channel');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/yt-channels/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to delete channel');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      toast({ title: 'Channel deleted' });
      setDeleteConfirm(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error deleting channel', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const activeChannels = channels?.filter(c => c.is_active).length || 0;
  const totalChannels = channels?.length || 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Manage Channels</h1>
            <p className="text-muted-foreground">Add, edit, or remove YouTube channels to track</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Channel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Channel</DialogTitle>
              </DialogHeader>
              <ChannelFormDialog 
                mode="add" 
                onClose={() => setDialogOpen(false)} 
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{totalChannels}</div>
              <div className="text-sm text-muted-foreground">Total Channels</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{activeChannels}</div>
              <div className="text-sm text-muted-foreground">Active</div>
            </CardContent>
          </Card>
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-muted-foreground">{totalChannels - activeChannels}</div>
              <div className="text-sm text-muted-foreground">Inactive</div>
            </CardContent>
          </Card>
        </div>

        {/* Channels Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Youtube className="h-5 w-5" />
              Channels ({channels?.length || 0})
            </CardTitle>
            <CardDescription>
              Manage the YouTube channels being tracked for live stream data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !channels?.length ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No channels configured. Add your first channel to start tracking.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">YouTube</TableHead>
                      <TableHead className="hidden sm:table-cell">Group</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channels.map((channel) => (
                      <TableRow key={channel.id}>
                        <TableCell>
                          <div className="font-medium">{channel.display_name}</div>
                          <div className="text-xs text-muted-foreground md:hidden truncate max-w-[150px]">
                            {channel.youtube_url}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <a 
                            href={channel.youtube_url.startsWith('http') ? channel.youtube_url : `https://youtube.com/${channel.youtube_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <span className="truncate max-w-[200px]">
                              {channel.youtube_channel_id || channel.youtube_url}
                            </span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={channel.network_group === 'TIMES' ? 'default' : 'secondary'}>
                            {channel.network_group || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={channel.is_active}
                            onCheckedChange={(checked) => 
                              toggleActiveMutation.mutate({ id: channel.id, is_active: checked })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Dialog 
                              open={editingChannel?.id === channel.id} 
                              onOpenChange={(open) => !open && setEditingChannel(null)}
                            >
                              <DialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => setEditingChannel(channel)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit Channel</DialogTitle>
                                </DialogHeader>
                                <ChannelFormDialog 
                                  channel={channel} 
                                  mode="edit" 
                                  onClose={() => setEditingChannel(null)} 
                                />
                              </DialogContent>
                            </Dialog>
                            
                            <Dialog 
                              open={deleteConfirm === channel.id} 
                              onOpenChange={(open) => !open && setDeleteConfirm(null)}
                            >
                              <DialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => setDeleteConfirm(channel.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Delete Channel?</DialogTitle>
                                </DialogHeader>
                                <p className="text-muted-foreground">
                                  Are you sure you want to delete "{channel.display_name}"? This action cannot be undone.
                                </p>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                                    Cancel
                                  </Button>
                                  <Button 
                                    variant="destructive" 
                                    onClick={() => deleteMutation.mutate(channel.id)}
                                    disabled={deleteMutation.isPending}
                                  >
                                    {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
