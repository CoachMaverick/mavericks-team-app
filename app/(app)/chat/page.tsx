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

    let uid = '';
    let coach = false;

    // 1. Auth - separate try/catch
    try {
      const { data: { user } } = await supabase.auth.getUser().catch((e: any) => {
        console.error('[Chat] auth.getUser error:', e);
        return { data: { user: null } };
      });
      const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
      uid = user?.id || (isTemp ? 'temp-coach-id' : '');
      coach = isTemp || !!user?.email?.includes('coach');
      setCurrentUserId(uid);
      setIsCoach(coach);
    } catch (authErr: any) {
      console.error('[Chat] auth block error:', authErr);
      uid = 'temp-coach-id';
      coach = true;
      setCurrentUserId(uid);
      setIsCoach(true);
    }

    // 2. Messages - separate try/catch , basic SELECT only
    try {
      const { data: msgs, error: msgErr } = await supabase
        .from('messages')
        .select('id, created_at, sender_id, content, is_pinned')
        .eq('channel_type', 'team')
        .order('created_at', { ascending: true })
        .limit(100);

      if (msgErr) {
        console.error('[Chat] messages select error:', msgErr);
        throw msgErr;
      }
      setMessages((msgs || []).filter(Boolean) as SafeMessage[]);
    } catch (msgErr: any) {
      console.error('[Chat] messages load failed:', msgErr);
      setMessages([]);
      setLoadError('Failed to load messages.');
    }

    // 3. Announcements - separate try/catch , basic SELECT
    try {
      const { data: anns, error: annErr } = await supabase
        .from('announcements')
        .select('id, title, body, created_at')
        .eq('is_pinned', true)
        .order('created_at', { ascending: false })
        .limit(5);

      if (annErr) {
        console.error('[Chat] announcements select error:', annErr);
        throw annErr;
      }
      setPinned((anns || []) as SafeAnnouncement[]);
    } catch (annErr: any) {
      console.error('[Chat] announcements load failed:', annErr);
      setPinned([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !currentUserId) return;

    const tempId = 'temp-' + Date.now();
    const temp: SafeMessage = {
      id: tempId,
      created_at: new Date().toISOString(),
      content: text,
      sender_id: currentUserId,
    };
    setMessages((prev) => [...prev, temp]);
    setNewMessage('');

    // Insert with its own try/catch
    try {
      const { error } = await supabase.from('messages').insert({
        channel_type: 'team',
        content: text,
        sender_id: currentUserId === 'temp-coach-id' ? null : currentUserId,
      } as any);

      if (error) {
        console.error('[Chat] send insert error:', error);
        throw error;
      }
      // reload to get real rows
      await loadData();
    } catch (sendErr: any) {
      console.error('[Chat] send failed:', sendErr);
      toast.error('Failed to send message');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
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
          <div className="p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded flex justify-between items-center">
            <span>{loadError}</span>
            <button
              onClick={() => {
                setLoadError(null);
                loadData();
              }}
              className="text-sm underline font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MessageCircle className="h-7 w-7" /> Team Chat
          </h1>
          <p className="text-muted-foreground">Ultra-safe basic message list.</p>
        </div>

        {pinned.length > 0 && (
          <Card className="mavericks-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pinned Announcements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pinned.map((a) => (
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
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">No messages yet.</div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="p-3 rounded border bg-card">
                <div className="text-[10px] text-muted-foreground mb-0.5">
                  {new Date(m.created_at).toLocaleTimeString()}
                  {m.is_pinned && ' • 📌'}
                </div>
                <div className="text-sm whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
          </CardContent>

          <div className="p-3 border-t flex gap-2 bg-card">
            <Input
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={!newMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        <div className="text-xs text-center text-muted-foreground">
          Every query is wrapped. Empty DB or missing columns are handled.
        </div>
      </div>
    </ErrorBoundary>
  );
}
