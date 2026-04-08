import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Clock, MessageSquare, CloudRain, Trash2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Conversation {
  id: string;
  conversation_type: string;
  ai_response: string;
  weather_data?: any;
  created_at: string;
  user_feedback?: number;
}

interface ConversationHistoryProps {
  onConversationSelect?: (conversation: Conversation) => void;
}

export default function ConversationHistory({ onConversationSelect }: ConversationHistoryProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast({
        title: "Error",
        description: "Failed to load conversation history",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('ai_conversations')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setConversations(prev => prev.filter(conv => conv.id !== id));
      toast({
        title: "Success",
        description: "Conversation deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: "Error",
        description: "Failed to delete conversation",
        variant: "destructive"
      });
    }
  };

  const getConversationIcon = (type: string) => {
    switch (type) {
      case 'weather_briefing':
      case 'forecast':
        return <CloudRain className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getConversationTypeDisplay = (type: string) => {
    return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading conversation history...</div>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          AI Conversation History
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {conversations.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No conversations yet</p>
              <p className="text-sm">Start chatting with the AI to see your history here</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <Card 
                key={conversation.id} 
                className={`p-3 cursor-pointer transition-all ${
                  selectedConversation === conversation.id 
                    ? 'ring-2 ring-primary bg-primary/5' 
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => {
                  setSelectedConversation(conversation.id);
                  onConversationSelect?.(conversation);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {getConversationIcon(conversation.conversation_type)}
                      <Badge variant="outline" className="text-xs">
                        {getConversationTypeDisplay(conversation.conversation_type)}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {conversation.ai_response.substring(0, 150)}
                      {conversation.ai_response.length > 150 ? '...' : ''}
                    </p>

                    {conversation.weather_data && (
                      <div className="text-xs text-muted-foreground">
                        📍 {conversation.weather_data.location || 'Unknown location'}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onConversationSelect?.(conversation);
                      }}
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conversation.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}