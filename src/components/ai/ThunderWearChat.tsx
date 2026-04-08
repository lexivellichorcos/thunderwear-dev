import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Cloud, 
  Send, 
  Sparkles, 
  Shirt, 
  Clock,
  AlertTriangle,
  MessageCircle,
  RefreshCw,
  Zap,
  X
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ThunderWearChatProps {
  location?: string;
  onLocationChange?: (location: string) => void;
}

const ThunderWearChat: React.FC<ThunderWearChatProps> = ({ 
  location, 
  onLocationChange 
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const sendMessage = async (
    messageContent: string, 
    requestType: 'briefing' | 'question' | 'recommendation' | 'emergency' = 'question'
  ) => {
    if (!messageContent.trim() && requestType === 'question') return;
    
    setIsLoading(true);

    // Add user message to chat
    const userMessage: ChatMessage = {
      role: 'user',
      content: messageContent || getQuickActionMessage(requestType),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Convert messages to conversation history format
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const { data, error } = await supabase.functions.invoke('thunderwear-ai', {
        body: {
          location,
          requestType,
          userQuestion: messageContent,
          conversationHistory,
        },
      });

      if (error) throw error;

      const aiMessage: ChatMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      setInputMessage('');

    } catch (error) {
      console.error('Error calling ThunderWear AI:', error);
      
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: "Oops! Looks like I'm having a bit of a brain fog 🌫️ Try asking me again in a moment!",
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "Connection Issue",
        description: "ThunderWear AI is taking a quick break. Try again!",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getQuickActionMessage = (action: string): string => {
    switch (action) {
      case 'briefing':
        return 'Give me a quick weather briefing';
      case 'recommendation':
        return 'What should I wear today?';
      case 'emergency':
        return 'Check for any weather emergencies';
      default:
        return '';
    }
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'briefing':
        sendMessage('Give me a quick weather briefing', 'briefing');
        break;
      case 'outfit':
        sendMessage('What should I wear today?', 'recommendation');
        break;
      case 'commute':
        sendMessage('What should I know about commuting today?', 'question');
        break;
      case 'emergency':
        sendMessage('Check for any weather emergencies', 'emergency');
        break;
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const clearMessage = (index: number) => {
    setMessages(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Card className="flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <Zap className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              Ask ThunderWear AI
              <Sparkles className="w-4 h-4 text-yellow-500" />
            </h3>
            <p className="text-xs text-muted-foreground">Continuous weather conversation</p>
          </div>
        </div>
        <Badge variant="secondary" className="flex items-center gap-1">
          <Cloud className="w-3 h-3" />
          {location}
        </Badge>
      </div>

      {/* Conversation Area */}
      <ScrollArea className="h-[400px]">
        <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col gap-3">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-8">
              <div className="text-muted-foreground">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                  <Cloud className="w-8 h-8 text-white" />
                </div>
                <h4 className="font-medium text-lg mb-2">Ready to chat! ⚡</h4>
                <p className="text-sm">Type a question or use Quick Actions below</p>
                <p className="text-xs mt-2 text-muted-foreground/70">I'll remember our conversation!</p>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`${
                message.role === 'user'
                  ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              } rounded-lg p-4 border relative group`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className={`text-xs font-medium ${
                    message.role === 'user' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'
                  }`}>
                    {message.role === 'user' ? 'You' : 'ThunderWear AI'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatTime(message.timestamp)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => clearMessage(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" />
                ThunderWear AI is thinking...
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Quick Actions */}
      <div className="p-4 border-t bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Quick Actions</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleQuickAction('briefing')}
            disabled={isLoading}
            className="flex items-center gap-2 justify-start h-auto py-3 hover:bg-blue-50 dark:hover:bg-blue-950/20"
          >
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-left">Briefing</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleQuickAction('outfit')}
            disabled={isLoading}
            className="flex items-center gap-2 justify-start h-auto py-3 hover:bg-purple-50 dark:hover:bg-purple-950/20"
          >
            <Shirt className="w-4 h-4 text-purple-500" />
            <span className="text-left">Outfit</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleQuickAction('commute')}
            disabled={isLoading}
            className="flex items-center gap-2 justify-start h-auto py-3 hover:bg-green-50 dark:hover:bg-green-950/20"
          >
            <MessageCircle className="w-4 h-4 text-green-500" />
            <span className="text-left">Commute</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleQuickAction('emergency')}
            disabled={isLoading}
            className="flex items-center gap-2 justify-start h-auto py-3 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200"
          >
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-left">ML Analysis</span>
          </Button>
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-white dark:bg-gray-900">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Ask about weather, outfits, or commute advice..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(inputMessage);
              }
            }}
            rows={2}
            className="resize-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <Button
            type="button"
            size="lg"
            onClick={() => sendMessage(inputMessage)}
            disabled={isLoading || !inputMessage.trim()}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-6"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ThunderWearChat;
