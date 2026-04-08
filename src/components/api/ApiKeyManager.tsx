import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Key, Copy, Trash2, Plus, Eye, EyeOff, RefreshCw } from 'lucide-react';

interface ApiKey {
  id: string;
  api_key: string;
  name: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
}

const ApiKeyManager: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_api_keys')
      .select('id, name, is_active, created_at, last_used_at, request_count, api_key')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Mask keys on the client side - only show last 4 chars
      const maskedData = (data as unknown as ApiKey[]).map(k => ({
        ...k,
        api_key: k.api_key.substring(0, 6) + '•'.repeat(20) + k.api_key.substring(k.api_key.length - 4),
      }));
      setKeys(maskedData);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const generateKey = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const { data: result, error: invokeError } = await supabase.functions.invoke('generate-api-key', {
        body: { name: newKeyName || 'Default' },
      });

      if (invokeError) {
        throw new Error(invokeError.message || 'Failed to generate key');
      }

      setNewlyCreatedKey(result.api_key);
      setNewKeyName('');
      toast({
        title: 'API Key Created',
        description: 'Copy your key now — it won\'t be shown in full again.',
      });
      await fetchKeys();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('user_api_keys')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete key', variant: 'destructive' });
    } else {
      toast({ title: 'Key Deleted' });
      setKeys(keys.filter(k => k.id !== id));
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase
      .from('user_api_keys')
      .update({ is_active: !currentActive })
      .eq('id', id);

    if (!error) {
      setKeys(keys.map(k => k.id === id ? { ...k, is_active: !currentActive } : k));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      toast({ title: 'Copy failed', description: 'Unable to copy to clipboard', variant: 'destructive' });
      return;
    });
    toast({ title: 'Copied to clipboard' });
  };

  const maskKey = (key: string) => {
    return key.substring(0, 6) + '•'.repeat(20) + key.substring(key.length - 4);
  };

  const toggleVisibility = (id: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const baseUrl = 'https://ofwgmzfdgvazflqhkhfy.supabase.co/functions/v1/forecast-api';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          API Keys
        </CardTitle>
        <CardDescription>
          Generate API keys to access the Thunderwear Ensemble Forecast API programmatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Generate new key */}
        <div className="flex gap-2">
          <Input
            placeholder="Key name (e.g. My Bot)"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            className="flex-1"
          />
          <Button onClick={generateKey} disabled={generating || keys.length >= 5} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {generating ? 'Creating...' : 'Generate Key'}
          </Button>
        </div>

        {keys.length >= 5 && (
          <p className="text-xs text-muted-foreground">Maximum of 5 API keys reached.</p>
        )}

        {/* Newly created key banner */}
        {newlyCreatedKey && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium text-primary">Your new API key (copy it now!):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded break-all font-mono">
                {newlyCreatedKey}
              </code>
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(newlyCreatedKey)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setNewlyCreatedKey(null)} className="text-xs">
              Dismiss
            </Button>
          </div>
        )}

        {/* Key list */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading keys...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet. Generate one to get started.</p>
        ) : (
          <div className="space-y-3">
            {keys.map(key => (
              <div key={key.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{key.name}</span>
                    <Badge variant={key.is_active ? 'default' : 'secondary'}>
                      {key.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleVisibility(key.id)}>
                      {visibleKeys.has(key.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => copyToClipboard(key.api_key)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(key.id, key.is_active)}>
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteKey(key.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <code className="text-xs bg-muted p-1.5 rounded block break-all font-mono">
                  {visibleKeys.has(key.id) ? key.api_key : maskKey(key.api_key)}
                </code>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Created: {new Date(key.created_at).toLocaleDateString()}</span>
                  <span>Requests: {key.request_count.toLocaleString()}</span>
                  {key.last_used_at && (
                    <span>Last used: {new Date(key.last_used_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick usage example */}
        <div className="rounded-md bg-muted p-3 space-y-2">
          <p className="text-xs font-medium">Quick Start</p>
          <code className="text-xs block break-all font-mono">
            curl -H "X-API-Key: YOUR_KEY" "{baseUrl}?location=New+York"
          </code>
          <code className="text-xs block break-all font-mono">
            curl -X POST -H "X-API-Key: YOUR_KEY" -H "Content-Type: application/json" -d '{`{"location":"San Francisco, CA"}`}' {baseUrl}
          </code>
        </div>
      </CardContent>
    </Card>
  );
};

export default ApiKeyManager;
