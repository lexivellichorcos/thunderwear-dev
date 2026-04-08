import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Link2, Unlink, Shield, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";

export function KalshiAccountLink() {
  const { user } = useAuth();
  const [isLinked, setIsLinked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [apiKeyId, setApiKeyId] = useState("");
  const [privateKey, setPrivateKey] = useState("");

  useEffect(() => {
    checkLinkStatus();
  }, [user]);

  const checkLinkStatus = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('kalshi_credentials')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setIsLinked(!!data);
    } catch (err) {
      console.error('Error checking Kalshi link status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLink = async () => {
    if (!user) {
      toast.error("Please log in first");
      return;
    }

    if (!apiKeyId.trim() || !privateKey.trim()) {
      toast.error("Please enter both API Key ID and Private Key");
      return;
    }

    setIsSaving(true);
    try {
      // Test the credentials first
      const { data: testResult, error: testError } = await supabase.functions.invoke('kalshi-weather', {
        body: { 
          action: 'test_credentials',
          params: { api_key_id: apiKeyId.trim(), private_key: privateKey.trim() }
        }
      });

      if (testError || testResult?.error) {
        throw new Error(testResult?.error || 'Failed to verify credentials');
      }

      // Store credentials via edge function (which encrypts them)
      const { data: storeResult, error: storeError } = await supabase.functions.invoke('kalshi-weather', {
        body: { 
          action: 'store_credentials',
          params: { api_key_id: apiKeyId.trim(), private_key: privateKey.trim() }
        }
      });

      if (storeError || storeResult?.error) {
        throw new Error(storeResult?.error || 'Failed to store credentials');
      }

      toast.success("Kalshi account linked successfully!");
      setIsLinked(true);
      setDialogOpen(false);
      setApiKeyId("");
      setPrivateKey("");
    } catch (err: any) {
      console.error('Error linking Kalshi account:', err);
      toast.error(err.message || "Failed to link Kalshi account");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('kalshi_credentials')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success("Kalshi account unlinked");
      setIsLinked(false);
    } catch (err) {
      console.error('Error unlinking Kalshi account:', err);
      toast.error("Failed to unlink account");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking account status...
      </div>
    );
  }

  if (isLinked) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          Kalshi Connected
        </div>
        <Button variant="ghost" size="sm" onClick={handleUnlink} className="text-muted-foreground">
          <Unlink className="h-4 w-4 mr-1" />
          Unlink
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="h-4 w-4 mr-2" />
          Link Kalshi Account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Link Your Kalshi Account
          </DialogTitle>
          <DialogDescription>
            Connect your Kalshi account to place bets directly from ThunderWear.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <Card className="border-green-500/50 bg-green-500/10">
            <CardContent className="pt-4">
              <p className="text-sm text-green-700 dark:text-green-300">
                <strong>🔒 Encrypted Storage:</strong> Your credentials are encrypted using AES-256 
                before being stored. Only you can access them.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="apiKeyId">API Key ID</Label>
            <Input
              id="apiKeyId"
              placeholder="Enter your Kalshi API Key ID"
              value={apiKeyId}
              onChange={(e) => setApiKeyId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="privateKey">Private Key (PEM format)</Label>
            <Textarea
              id="privateKey"
              placeholder="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              rows={6}
              className="font-mono text-xs"
            />
          </div>

          <div className="text-sm text-muted-foreground">
            <a 
              href="https://kalshi.com/settings/api" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              Get your API credentials from Kalshi
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <Button 
            onClick={handleLink} 
            disabled={isSaving || !apiKeyId.trim() || !privateKey.trim()}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying & Encrypting...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-2" />
                Link Account
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
