"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { MessageCircle, Send } from 'lucide-react';

interface SafeMessage {
  id: string;
  created_at: string;
  sender_id?: string | null;
  content: string;
  is_pinned?: boolean;
}

interface SafeAnnouncement {
  id: number;
  title: string;
  body: string;
  created_at: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<SafeMessage[]>([]);
  const [pinned, setPinned] = useState<SafeAnnouncement[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [isCoach, setIsCoach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));
      const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
      const uid = user?.id || (isTemp ? 'temp-coach-id' : '');
      setCurrentUserId(uid);
      setIsCoach(isTemp || !!user?.email?.includes('coach'));

      // MINIMAL SAFE queries
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, created_at, sender_id, content, is_pinned')
        .eq('channel_type', 'team')
        .order('created_at', { ascending: true })
        .limit(100);

      setMessages((msgs || []).filter(Boolean) as SafeMessage[]);

      const { data: anns } = await supabase
        .from('announcements')
        .select('id, title, body, created_at')
        .eq('is_pinned', true)
        .limit(5);

      setPinned((anns || []) as SafeAnnouncement[]);
    } catch (e: any) {
      console.warn('[Chat] load failed safely:', e?.message);
      setLoadError('Something went wrong loading chat data.');
      setMessages([]);
      setPinned([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text) return;

    const temp: SafeMessage = { id: 'temp-' + Date.now(), created_at: new Date().toISOString(), content: text };
    setMessages(p => [...p, temp]);
    setNewMessage('');

    try {
      await supabase.from('messages').insert({
        channel_type: 'team',
        content: text,
        sender_id: currentUserId === 'temp-coach-id' ? null : currentUserId,
      } as any);
      await loadData();
    } catch (e) {
      toast.error('Failed to send message');
      setMessages(p => p.filter(m => m.id !== temp.id));
      setNewMessage(text);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading chat...</div>;
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {loadError && (
          <div className="p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded flex justify-between">
            <span>{loadError}</span>
            <button onClick={loadData} className="text-sm underline">Try Again</button>
          </div>
        )}

        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MessageCircle className="h-7 w-7" /> Team Chat
          </h1>
          <p className="text-muted-foreground">Simple team message list. Maximum resilience mode.</p>
        </div>

        {pinned.length > 0 && (
          <Card className="mavericks-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pinned Announcements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pinned.map(a => (
                <div key={a.id} className="border-l-4 border-red-600 pl-3">
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-muted-foreground text-xs">{a.body}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="mavericks-card flex flex-col" style={{ minHeight: 440 }}>
          <CardHeader>
            <CardTitle>Messages</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto space-y-3 bg-muted/30 p-4">
            {messages.length === 0 && <div className="text-center text-muted-foreground py-8">No messages yet.</div>}
            {messages.map(m => (
              <div key={m.id} className="p-3 rounded border bg-card">
                <div className="text-[10px] text-muted-foreground mb-0.5">
                  {new Date(m.created_at).toLocaleTimeString()}
                  {m.is_pinned && ' • 📌 pinned'}
                </div>
                <div className="text-sm">{m.content}</div>
              </div>
            ))}
          </CardContent>

          <div className="p-3 border-t flex gap-2 bg-card">
            <Input
              placeholder="Type message and press Enter"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={!newMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        <div className="text-xs text-center text-muted-foreground">
          Minimal safe mode • Loads even if other DB features are broken
        </div>
      </div>
    </ErrorBoundary>
  );
}
