'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMessages, sendMessage, editMessage, deleteMessage, pinMessage, toggleMessageReaction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export default function ChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isCoach, setIsCoach] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const supabase = createClient();
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const QUICK_EMOJIS = ['👍', '❤️', '😂', '👏', '🔥', '😮', '🎉'];

  // Fetch current user properly from Supabase auth
  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
        // Check if coach/admin
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, is_admin')
            .eq('id', user.id)
            .single() as any;
          const coach = profile?.role === 'coach' || profile?.role === 'admin' || profile?.is_admin === true;
          setIsCoach(coach);
        } catch (e) {
          setIsCoach(false);
        }
      } else {
        setCurrentUser(null);
        setIsCoach(false);
        setError('Please log in to use chat');
      }
    } catch (err: any) {
      console.error('[Chat] auth.getUser error:', err);
      setCurrentUser(null);
      setIsCoach(false);
      setError('Authentication error. Please log in.');
    }
  };

  const loadMessages = async () => {
    try {
      setError(null);
      const data = await getMessages('team', null, 100).catch((e: any) => {
        console.error('[Chat] getMessages error:', e);
        return [];
      });
      setMessages(data || []);
    } catch (err: any) {
      console.error('Load messages error:', err);
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser().catch((e: any) => {
        console.error('[Chat] auth.getUser in send error:', e);
        return { data: { user: null } };
      });

      if (!user || !user.id) {
        setError('Please log in to send messages');
        return;
      }

      await sendMessage(newMessage.trim(), 'team', null, null, null);
      setNewMessage('');
      await loadMessages();
    } catch (err: any) {
      console.error('Send message error:', err);
      alert('Failed to send message: ' + (err.message || JSON.stringify(err)));
    }
  };

  const startEdit = (m: any) => {
    if (m.sender_id !== currentUser?.id) return;
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
      setEditingId(null);
      setEditText('');
      await loadMessages();
    } catch (e: any) {
      console.error('[Chat] edit failed:', e);
      alert('Failed to edit: ' + e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      await deleteMessage(id);
      await loadMessages();
    } catch (e: any) {
      console.error('[Chat] delete failed:', e);
      alert('Failed to delete: ' + e.message);
    }
  };

  const handlePin = async (id: string, pin: boolean) => {
    try {
      await pinMessage(id, pin);
      await loadMessages();
    } catch (e: any) {
      console.error('[Chat] pin failed:', e);
      alert('Failed to pin: ' + e.message);
    }
  };

  const handleReact = async (id: string, emoji: string) => {
    try {
      // optimistic
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const reacts = { ...(m.reactions || {}) };
          const users = reacts[emoji] || [];
          const has = users.includes(currentUser?.id);
          if (has) {
            reacts[emoji] = users.filter((u: string) => u !== currentUser?.id);
            if (reacts[emoji].length === 0) delete reacts[emoji];
          } else {
            reacts[emoji] = [...users, currentUser?.id];
          }
          return { ...m, reactions: reacts };
        })
      );
      await toggleMessageReaction(id, emoji);
    } catch (e: any) {
      console.error('[Chat] react failed:', e);
      await loadMessages();
    }
    setReactingId(null);
  };

  const canEdit = (m: any) => m.sender_id === currentUser?.id;
  const canDelete = (m: any) => m.sender_id === currentUser?.id || isCoach;
  const canPin = () => isCoach;

  useEffect(() => {
    fetchUser();
    loadMessages();

    // Realtime
    let channel: any = null;
    try {
      channel = supabase
        .channel('chat-messages')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          loadMessages();
        })
        .subscribe();
    } catch (e) {
      console.error('[Chat] realtime error:', e);
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Emoji picker close on outside click (simple)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Team Chat</h1>
      
      {error && <p className="text-red-400 mb-4">{error}</p>}

      {!currentUser && !loading && (
        <div className="mb-4 p-4 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-300">
          Please log in to use the chat.
        </div>
      )}

      <div className="bg-zinc-900 rounded-xl h-[600px] flex flex-col">
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-gray-400 mt-8">No messages yet. Start the conversation!</p>
          ) : (
            messages.map((msg: any) => {
              const isOwn = msg.sender_id === currentUser?.id;
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}>
                  <div className={`relative max-w-[80%] rounded-lg p-3 text-sm ${isOwn ? 'bg-blue-600 text-white' : 'bg-zinc-800'}`}>
                    {/* Sender for non-own */}
                    {!isOwn && msg.sender && (
                      <div className="text-xs opacity-70 mb-0.5">{msg.sender.first_name || 'User'}</div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    
                    {/* Reactions */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {Object.entries(msg.reactions).map(([emoji, users]: [string, any]) => (
                          <span
                            key={emoji}
                            onClick={() => handleReact(msg.id, emoji)}
                            className="bg-black/30 px-1.5 py-0.5 rounded text-xs cursor-pointer hover:bg-black/50"
                          >
                            {emoji} {users.length}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Timestamp and actions */}
                    <div className="flex items-center justify-between mt-1">
                      <small className="text-xs opacity-60">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.is_pinned && ' 📌'}
                      </small>

                      {/* Hover actions */}
                      <div className="hidden group-hover:flex gap-1 text-xs">
                        <button onClick={() => setReactingId(msg.id)} className="hover:opacity-80" title="React">😊</button>
                        {canEdit(msg) && (
                          <button onClick={() => startEdit(msg)} className="hover:opacity-80" title="Edit">✏️</button>
                        )}
                        {canDelete(msg) && (
                          <button onClick={() => handleDelete(msg.id)} className="hover:opacity-80" title="Delete">🗑️</button>
                        )}
                        {canPin() && (
                          <button onClick={() => handlePin(msg.id, !msg.is_pinned)} className="hover:opacity-80" title={msg.is_pinned ? 'Unpin' : 'Pin'}>
                            📌
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quick emoji picker for this message */}
                    {reactingId === msg.id && (
                      <div className="absolute bottom-full right-0 mb-1 bg-zinc-900 border border-zinc-700 rounded p-1 flex gap-1 z-10 text-base">
                        {QUICK_EMOJIS.map((em) => (
                          <button key={em} onClick={() => handleReact(msg.id, em)} className="hover:scale-110 px-0.5">
                            {em}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-zinc-700 relative">
          <div className="flex gap-2">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="px-3 text-xl"
              title="Emoji"
              disabled={!currentUser}
            >
              😊
            </button>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none disabled:opacity-50"
              placeholder="Type a message..."
              disabled={!currentUser}
            />
            <button
              onClick={handleSend}
              disabled={!currentUser || !newMessage.trim()}
              className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>

          {/* Emoji picker for composer */}
          {showEmojiPicker && currentUser && (
            <div ref={emojiPickerRef} className="absolute bottom-full left-3 mb-1 bg-zinc-900 border border-zinc-700 rounded p-2 flex gap-1 z-10 text-xl">
              {QUICK_EMOJIS.map((em) => (
                <button
                  key={em}
                  onClick={() => {
                    setNewMessage((prev) => prev + em);
                    setShowEmojiPicker(false);
                  }}
                  className="hover:bg-zinc-800 px-1 rounded"
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={(o) => { if (!o) setEditingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Message</DialogTitle>
          </DialogHeader>
          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[80px]" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={!editText.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
