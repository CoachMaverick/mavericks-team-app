"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { MessageCircle, Send, Paperclip, Smile, Edit2, Trash2, Pin, X } from 'lucide-react';
import { getMessages, sendMessage, editMessage, deleteMessage, pinMessage, toggleMessageReaction } from '@/lib/actions';

interface SafeMessage {
  id: string;
  created_at: string;
  sender_id?: string | null;
  content: string;
  is_pinned?: boolean;
  reactions?: Record<string, string[]>;
  media_url?: string | null;
  media_type?: string | null;
  sender?: any;
  updated_at?: string;
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

  // New state for polished features
  const [pinnedMessages, setPinnedMessages] = useState<SafeMessage[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  const supabase = React.useMemo(() => createClient(), []);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const QUICK_EMOJIS = ['👍', '❤️', '😂', '👏', '🔥', '😮', '🎉'];

  const scrollToBottom = (smooth = true) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);

    let uid = '';
    let coach = false;

    // 1. Auth - separate try/catch
    try {
      const { data: { user } } = await supabase.auth.getUser().catch((e: any) => {
        console.error("PAGE ERROR:", e);
        console.error('[Chat] auth.getUser error:', e);
        return { data: { user: null } };
      });
      const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
      uid = user?.id || (isTemp ? 'temp-coach-id' : '');
      coach = isTemp || !!user?.email?.includes('coach');
      setCurrentUserId(uid);
      setIsCoach(coach);
    } catch (authErr: any) {
      console.error("PAGE ERROR:", authErr);
      console.error('[Chat] auth block error:', authErr);
      uid = 'temp-coach-id';
      coach = true;
      setCurrentUserId(uid);
      setIsCoach(true);
    }

    // 2. Messages using action (supports reactions, pinned, media, full fields) with try/catch
    try {
      const msgs = await getMessages('team', null, 150).catch((e: any) => {
        console.error("PAGE ERROR:", e);
        console.error('[Chat] getMessages error:', e);
        return [];
      });
      const safeMsgs = (msgs || []).filter(Boolean) as SafeMessage[];

      const pinned = safeMsgs.filter((m: SafeMessage) => m.is_pinned);
      const regular = safeMsgs.filter((m: SafeMessage) => !m.is_pinned);

      setPinnedMessages(pinned);
      setMessages(regular);

      if (safeMsgs.length === 0) {
        console.error('[Chat] No messages returned from getMessages');
      }
    } catch (msgErr: any) {
      console.error("PAGE ERROR:", msgErr);
      console.error('[Chat] messages load failed:', msgErr);
      setMessages([]);
      setPinnedMessages([]);
      setLoadError('Failed to load messages.');
    }

    // 3. Announcements - separate try/catch (keep for announcements pinned)
    try {
      const { data: anns, error: annErr } = await supabase
        .from('announcements')
        .select('id, title, body, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (annErr) {
        console.error("PAGE ERROR:", annErr);
        console.error('[Chat] announcements select error:', annErr);
        throw annErr;
      }
      setPinned((anns || []) as SafeAnnouncement[]);
    } catch (annErr: any) {
      console.error("PAGE ERROR:", annErr);
      console.error('[Chat] announcements load failed:', annErr);
      setPinned([]);
    }

    setLoading(false);

    // scroll after load
    setTimeout(() => scrollToBottom(false), 100);
  };

  useEffect(() => {
    loadData();

    // Realtime for new messages / updates / pins / reactions (stable with try)
    let channel: any = null;
    try {
      channel = supabase
        .channel('chat-messages')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages' },
          (payload: any) => {
            console.log('[Chat] realtime update');
            loadData(); // reload to get enriched data + pins
          }
        )
        .subscribe();
    } catch (rtErr: any) {
      console.error("PAGE ERROR:", rtErr);
      console.error('[Chat] realtime setup error (non fatal):', rtErr);
    }

    return () => {
      try {
        if (channel) supabase.removeChannel(channel);
      } catch {}
    };
  }, [supabase]);

  // Auto scroll to bottom when messages change (smooth)
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollToBottom(true), 50);
    }
  }, [messages]);

  const handleSend = async (mediaUrl?: string | null, mediaType?: string | null) => {
    const text = newMessage.trim();
    const hasMedia = !!mediaUrl;
    if ((!text && !hasMedia) || !currentUserId) return;

    const tempId = 'temp-' + Date.now();
    const temp: SafeMessage = {
      id: tempId,
      created_at: new Date().toISOString(),
      content: text || '',
      sender_id: currentUserId,
      media_url: mediaUrl || null,
      media_type: mediaType || null,
    };
    setMessages((prev) => [...prev, temp]);
    const sentText = text;
    setNewMessage('');

    try {
      await sendMessage(
        sentText || '',
        'team',
        null,
        mediaUrl || null,
        mediaType || null
      );
      await loadData();
      setTimeout(() => scrollToBottom(true), 100);
    } catch (sendErr: any) {
      console.error("PAGE ERROR:", sendErr);
      console.error('[Chat] send failed:', sendErr);
      toast.error('Failed to send message');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(sentText);
    }
  };

  // Upload helper (basic, stable with try/catch). Assumes 'chat-media' bucket (public read)
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop() || 'png';
      const filePath = `chat/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

      const { error: upErr } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file, { upsert: true });

      if (upErr) {
        console.error("PAGE ERROR:", upErr);
        console.error('[Chat] image upload error:', upErr);
        throw upErr;
      }

      const { data: pub } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      return pub.publicUrl;
    } catch (e: any) {
      console.error("PAGE ERROR:", e);
      console.error('[Chat] upload failed:', e);
      toast.error('Failed to upload image (check storage bucket)');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only images supported for now');
      return;
    }
    const url = await uploadImage(file);
    if (url) {
      await handleSend(newMessage.trim() || '', 'image');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Paste support for images
  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          const url = await uploadImage(file);
          if (url) {
            await handleSend(newMessage.trim() || ' ', 'image');
          }
        }
        return;
      }
    }
  };

  // Message actions (stable, with try/catch + reload)
  const startEdit = (m: SafeMessage) => {
    if (!canEditMessage(m)) return;
    setEditingId(m.id);
    setEditText(m.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await editMessage(editingId, trimmed);
      toast.success('Message edited');
      setEditingId(null);
      setEditText('');
      await loadData();
    } catch (e: any) {
      console.error("PAGE ERROR:", e);
      console.error('[Chat] edit failed:', e);
      toast.error(e.message || 'Edit failed');
    }
  };

  const handleDelete = async (id: string, isOwn: boolean) => {
    if (!confirm('Delete this message?')) return;
    try {
      await deleteMessage(id);
      toast.success('Message deleted');
      await loadData();
    } catch (e: any) {
      console.error("PAGE ERROR:", e);
      console.error('[Chat] delete failed:', e);
      toast.error(e.message || 'Delete failed');
    }
  };

  const handlePin = async (id: string, pin: boolean) => {
    try {
      await pinMessage(id, pin);
      toast.success(pin ? 'Message pinned' : 'Message unpinned');
      await loadData();
    } catch (e: any) {
      console.error("PAGE ERROR:", e);
      console.error('[Chat] pin failed:', e);
      toast.error(e.message || 'Pin action failed');
    }
  };

  const handleReact = async (id: string, emoji: string) => {
    try {
      // Optimistic update for smooth UX
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const reacts = { ...(m.reactions || {}) };
          const users = reacts[emoji] ? [...reacts[emoji]] : [];
          const has = users.includes(currentUserId);
          if (has) {
            const next = users.filter((u) => u !== currentUserId);
            if (next.length === 0) delete reacts[emoji];
            else reacts[emoji] = next;
          } else {
            reacts[emoji] = [...users, currentUserId];
          }
          return { ...m, reactions: reacts };
        })
      );
      await toggleMessageReaction(id, emoji);
      // reload for cross-user sync
      setTimeout(() => loadData(), 300);
    } catch (e: any) {
      console.error("PAGE ERROR:", e);
      console.error('[Chat] react failed:', e);
      toast.error('Reaction failed');
      await loadData();
    }
    setReactingId(null);
  };

  const canEditMessage = (m: SafeMessage) => m.sender_id === currentUserId;
  const canDeleteMessage = (m: SafeMessage) => m.sender_id === currentUserId || isCoach;
  const canPinMessage = () => isCoach;

  // Render content with auto links
  const renderContent = (text: string) => {
    if (!text) return null;
    const urlRegex = /((https?:\/\/|www\.)[^\s]+)/g;
    return text.split(urlRegex).map((part, idx) => {
      if (urlRegex.test(part)) {
        const href = part.startsWith('http') ? part : `https://${part}`;
        return (
          <a key={idx} href={href} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 break-all hover:text-blue-800">
            {part}
          </a>
        );
      }
      return part;
    });
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading chat...</div>;
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6 pb-4">
        {loadError && (
          <div className="p-4 bg-red-50 border border-red-500 text-red-800 rounded flex justify-between items-center">
            <span>PAGE ERROR: {loadError} (see console)</span>
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

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <MessageCircle className="h-7 w-7" /> Team Chat
            </h1>
            <p className="text-muted-foreground text-sm">Real-time chat with full actions, reactions &amp; media.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { loadData(); scrollToBottom(true); }}>
            Refresh
          </Button>
        </div>

        {/* Pinned Announcements (existing) */}
        {pinned.length > 0 && (
          <Card className="mavericks-card border-l-4 border-red-600">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">📌 Pinned Announcements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pinned.map((a) => (
                <div key={a.id} className="border-l-2 border-red-600 pl-3">
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-muted-foreground text-xs">{a.body}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Pinned Messages (new, stay at top) */}
        {pinnedMessages.length > 0 && (
          <Card className="mavericks-card border-l-4 border-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">📌 Pinned Messages</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pinnedMessages.map((m) => (
                <div key={m.id} className="p-2.5 rounded bg-muted/50 border text-sm group">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="text-[10px] text-muted-foreground">
                        {m.sender?.first_name || (m.sender_id === currentUserId ? 'You' : 'User')} • {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="whitespace-pre-wrap mt-0.5">{m.content}</div>
                      {m.media_url && (
                        <img src={m.media_url} alt="media" className="mt-1.5 max-w-[160px] rounded border" />
                      )}
                      {m.reactions && Object.keys(m.reactions).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(m.reactions).map(([em, us]) => (
                            <span key={em} className="text-xs bg-background px-1.5 py-0.5 rounded border cursor-pointer" onClick={() => handleReact(m.id, em)}>
                              {em} { (us as any[]).length }
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {canPinMessage() && (
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => handlePin(m.id, false)}>
                        <X className="h-3 w-3" /> Unpin
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Main Messages */}
        <Card className="mavericks-card flex flex-col" style={{ minHeight: '460px' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Messages</CardTitle>
          </CardHeader>

          <CardContent
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto space-y-2 bg-muted/20 p-3 rounded-md"
            style={{ scrollBehavior: 'smooth' }}
          >
            {messages.length === 0 && pinnedMessages.length === 0 && (
              <div className="text-center text-muted-foreground py-10 text-sm">No messages yet. Start the conversation!</div>
            )}

            {messages.map((m) => {
              const isOwn = m.sender_id === currentUserId;
              const canEdit = canEditMessage(m);
              const canDelete = canDeleteMessage(m);
              const canPin = canPinMessage();
              return (
                <div
                  key={m.id}
                  className={`group flex ${isOwn ? 'justify-end' : 'justify-start'} relative`}
                  onMouseEnter={() => setReactingId(null)} // clear picker on move
                >
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${isOwn ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border rounded-bl-md'}`}>
                    {/* Header */}
                    <div className="flex items-center gap-2 text-[10px] opacity-80 mb-0.5">
                      {!isOwn && <span className="font-medium">{m.sender?.first_name || 'Teammate'}</span>}
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {m.updated_at && m.updated_at !== m.created_at && <span className="italic">(edited)</span>}
                      {m.is_pinned && ' 📌'}
                    </div>

                    {/* Content + Media + Links */}
                    <div className="whitespace-pre-wrap break-words">
                      {renderContent(m.content)}
                    </div>
                    {m.media_url && (
                      <img src={m.media_url} alt="uploaded" className="mt-2 max-w-full rounded-md border max-h-48 object-cover" />
                    )}

                    {/* Reactions */}
                    {m.reactions && Object.keys(m.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {Object.entries(m.reactions).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(m.id, emoji)}
                            className="text-xs bg-background/80 hover:bg-background px-1.5 py-px rounded-full border flex items-center gap-0.5 transition"
                          >
                            {emoji} <span className="font-mono tabular-nums">{(users as any).length}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Hover / Actions (on hover for desktop, always visible small on mobile-ish) */}
                    <div className="mt-1.5 flex gap-1 opacity-70 group-hover:opacity-100 text-[10px] transition">
                      {/* React quick */}
                      <button
                        onClick={() => setReactingId(m.id === reactingId ? null : m.id)}
                        className="hover:bg-muted px-1 rounded"
                        title="React"
                      >
                        <Smile className="h-3 w-3" />
                      </button>

                      {canEdit && (
                        <button onClick={() => startEdit(m)} className="hover:bg-muted px-1 rounded" title="Edit">
                          <Edit2 className="h-3 w-3" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleDelete(m.id, isOwn)} className="hover:bg-muted px-1 rounded text-red-600" title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                      {canPin && (
                        <button onClick={() => handlePin(m.id, !m.is_pinned)} className="hover:bg-muted px-1 rounded" title={m.is_pinned ? 'Unpin' : 'Pin'}>
                          <Pin className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Inline quick emoji picker when reacting */}
                    {reactingId === m.id && (
                      <div className="mt-1 flex gap-1 flex-wrap bg-background border rounded p-1 text-base">
                        {QUICK_EMOJIS.map((em) => (
                          <button key={em} onClick={() => handleReact(m.id, em)} className="hover:scale-125 transition px-0.5">
                            {em}
                          </button>
                        ))}
                        <button onClick={() => setReactingId(null)} className="text-[10px] px-1 text-muted-foreground">✕</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div ref={messagesContainerRef} />
          </CardContent>

          {/* Input bar with emoji, attach, send */}
          <div className="p-3 border-t flex gap-2 bg-card relative">
            {/* Emoji picker for input */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="px-2"
              title="Emoji"
            >
              <Smile className="h-4 w-4" />
            </Button>

            {showEmojiPicker && (
              <div ref={emojiPickerRef} className="absolute bottom-full left-3 mb-1 bg-card border rounded shadow p-2 flex gap-1 z-50 text-xl">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={() => {
                      setNewMessage((prev) => prev + em);
                      setShowEmojiPicker(false);
                    }}
                    className="hover:bg-muted px-1 rounded"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {/* Attach image */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Upload image"
              className="px-2"
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <Input
              placeholder="Type a message... (paste images too)"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onPaste={handlePaste}
              className="flex-1"
              disabled={uploading}
            />
            <Button onClick={() => handleSend()} disabled={!newMessage.trim() && !uploading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={!!editingId} onOpenChange={(open) => { if (!open) { setEditingId(null); setEditText(''); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Message</DialogTitle>
            </DialogHeader>
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="min-h-[80px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  saveEdit();
                }
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditingId(null); setEditText(''); }}>Cancel</Button>
              <Button onClick={saveEdit} disabled={!editText.trim()}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="text-xs text-center text-muted-foreground">
          Hover messages for actions • Paste images • All queries wrapped in try/catch • Realtime updates
        </div>
      </div>
    </ErrorBoundary>
  );
}
