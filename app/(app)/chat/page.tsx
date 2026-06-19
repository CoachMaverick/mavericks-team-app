'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isCoach, setIsCoach] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isTemp, setIsTemp] = useState(false);

  const supabase = createClient();

  const QUICK_EMOJIS = ['👍', '❤️', '👏', '🔥', '😂'];

  useEffect(() => {
    const init = async () => {
      const temp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
      setIsTemp(!!temp);

      let user: any = null;
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        user = u;
      } catch (e) {
        console.error('[Chat] getUser error:', e);
        user = null;
      }

      if (user) {
        setCurrentUser(user);
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, is_admin')
            .eq('id', user.id)
            .single() as any;
          const coach = profile && (profile.role === 'coach' || profile.role === 'admin' || profile.is_admin === true);
          setIsCoach(!!coach);
        } catch (e) {
          setIsCoach(false);
        }
      } else if (temp) {
        // Demo / temp-coach support: synthetic user for UI logic (ownership, reactions)
        setCurrentUser({ id: 'temp-coach-id' });
        setIsCoach(true);
      } else {
        setCurrentUser(null);
        setIsCoach(false);
      }

      loadMessages();
    };
    init();

    // Realtime (skip reload for temp which uses optimistic local state only)
    const channel = supabase
      .channel('messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        const stillTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
        if (!stillTemp) {
          loadMessages();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMessages = async () => {
    try {
      setError(null);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_type', 'team')
        .order('created_at', { ascending: true });

      if (error) throw error;
      const filtered = (data || []).filter((m: any) => m.is_deleted !== true);
      setMessages(filtered);
    } catch (err: any) {
      console.error('Load messages error:', err);
      // Keep previous messages on transient error; don't wipe UI
      if (messages.length === 0) setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser) {
      alert('Please log in to send messages');
      return;
    }

    const content = newMessage.trim();

    // For temp/demo: optimistic local state only (avoids RLS on unauth client)
    if (isTemp) {
      const optimistic = {
        id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        content,
        sender_id: 'temp-coach-id',
        channel_type: 'team',
        created_at: new Date().toISOString(),
        reactions: {},
        is_pinned: false,
        is_deleted: false,
      };
      setMessages(prev => [...prev, optimistic]);
      setNewMessage('');
      return;
    }

    try {
      const { error } = await supabase
        .from('messages')
        .insert([{
          content,
          sender_id: currentUser.id,
          channel_type: 'team',
        }] as any);

      if (error) throw error;

      setNewMessage('');
      // realtime will also trigger load, but force refresh for immediate
      loadMessages();
    } catch (err: any) {
      console.error('Send error:', err);
      alert('Failed to send message: ' + (err.message || 'Unknown error'));
    }
  };

  const editMessage = async (msg: any) => {
    const newContent = prompt('Edit message:', msg.content);
    if (newContent === null || newContent.trim() === msg.content) return;

    const trimmed = newContent.trim();

    if (isTemp) {
      // optimistic for demo
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: trimmed } : m));
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from('messages')
        .update({ content: trimmed })
        .eq('id', msg.id)
        .eq('sender_id', currentUser?.id);
      if (error) throw error;
      loadMessages();
    } catch (e: any) {
      console.error('Edit error:', e);
      alert('Failed to edit message');
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm('Delete this message?')) return;

    if (isTemp) {
      // optimistic soft delete in local for demo
      setMessages(prev => prev.filter(m => m.id !== id));
      return;
    }

    try {
      // Soft delete for stability + matches schema RLS update policy
      let query = (supabase as any)
        .from('messages')
        .update({ is_deleted: true })
        .eq('id', id);
      if (!isCoach) {
        query = query.eq('sender_id', currentUser.id);
      }
      const { error } = await query;
      if (error) throw error;
      loadMessages();
    } catch (e: any) {
      console.error('Delete error:', e);
      alert('Failed to delete message');
    }
  };

  const togglePin = async (id: string, isPinned: boolean) => {
    const newPinned = !isPinned;

    if (isTemp) {
      // optimistic for demo
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_pinned: newPinned } : m));
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from('messages')
        .update({ is_pinned: newPinned })
        .eq('id', id);
      if (error) throw error;
      loadMessages();
    } catch (e: any) {
      console.error('Pin error:', e);
      alert('Failed to pin/unpin');
    }
  };

  const toggleReaction = async (id: string, emoji: string) => {
    if (!currentUser) return;

    const uid = currentUser.id;

    // Optimistic + local for temp/demo
    if (isTemp) {
      setMessages(prev => prev.map((m: any) => {
        if (m.id !== id) return m;
        const reactions: Record<string, string[]> = { ...(m.reactions || {}) };
        if (!reactions[emoji]) reactions[emoji] = [];
        const idx = reactions[emoji].indexOf(uid);
        if (idx !== -1) {
          reactions[emoji] = reactions[emoji].filter((u: string) => u !== uid);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...reactions[emoji], uid];
        }
        return { ...m, reactions };
      }));
      return;
    }

    try {
      const { data: msg, error: fetchErr } = await (supabase as any)
        .from('messages')
        .select('reactions')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;
      let reactions: Record<string, string[]> = (msg?.reactions as any) || {};
      if (!reactions[emoji]) reactions[emoji] = [];
      const idx = reactions[emoji].indexOf(uid);
      if (idx !== -1) {
        reactions[emoji] = reactions[emoji].filter((u: string) => u !== uid);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji] = [...reactions[emoji], uid];
      }
      const { error } = await (supabase as any)
        .from('messages')
        .update({ reactions })
        .eq('id', id);
      if (error) throw error;
      loadMessages();
    } catch (e: any) {
      console.error('Reaction error:', e);
      alert('Failed to react');
    }
  };

  const canEdit = (msg: any) => msg.sender_id === currentUser?.id;
  const canDelete = (msg: any) => msg.sender_id === currentUser?.id || isCoach;
  const canPin = () => isCoach;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Team Chat</h1>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {!currentUser && !loading && (
        <div className="mb-4 p-4 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-300">
          Please log in to use the chat.
        </div>
      )}

      <div className="bg-zinc-900 rounded-2xl h-[650px] flex flex-col border border-zinc-700">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-gray-400 py-12">No messages yet. Start the conversation!</p>
          ) : (
            (() => {
              const visible = messages.filter((m: any) => m.is_deleted !== true);
              const pinned = visible.filter((m: any) => m.is_pinned);
              const regular = visible.filter((m: any) => !m.is_pinned);
              const renderMsg = (msg: any) => {
                const isOwn = msg.sender_id === currentUser?.id;
                return (
                  <div 
                    key={msg.id} 
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group relative`}
                    onMouseEnter={() => setHoveredId(msg.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className={`relative ${isOwn ? 'bg-blue-600 text-white' : 'bg-zinc-800'} p-4 rounded-2xl max-w-[75%] ${isOwn ? 'rounded-br-none' : 'rounded-bl-none'}`}>
                      <p>{msg.content}</p>
                      <small className="text-xs mt-1 block opacity-70">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {msg.is_pinned && ' 📌'}
                      </small>

                      {/* Reactions counts (click to toggle) */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="mt-1 flex gap-1 text-xs flex-wrap">
                          {Object.entries(msg.reactions).map(([emoji, users]: [string, any]) => (
                            <span 
                              key={emoji} 
                              onClick={() => toggleReaction(msg.id, emoji)} 
                              className="bg-black/30 px-1.5 rounded cursor-pointer hover:bg-black/50"
                              title="Click to toggle your reaction"
                            >
                              {emoji} {Array.isArray(users) ? users.length : users}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Hover actions: emoji buttons next to each message + edit/delete/pin */}
                      {hoveredId === msg.id && (
                        <div className="absolute -top-2 right-0 flex gap-1 bg-zinc-900 border border-zinc-700 rounded px-1 text-sm z-10">
                          {/* Emoji reaction buttons */}
                          {QUICK_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(msg.id, emoji)}
                              title={`React with ${emoji}`}
                              className="hover:scale-110 transition px-0.5"
                            >
                              {emoji}
                            </button>
                          ))}
                          {isOwn && (
                            <button onClick={() => editMessage(msg)} title="Edit">✏️</button>
                          )}
                          {(isOwn || isCoach) && (
                            <button onClick={() => deleteMessage(msg.id)} title="Delete">🗑️</button>
                          )}
                          {isCoach && (
                            <button onClick={() => togglePin(msg.id, !!msg.is_pinned)} title={msg.is_pinned ? 'Unpin' : 'Pin'}>📌</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              };
              return (
                <>
                  {pinned.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-yellow-400 mb-1">📌 Pinned</div>
                      {pinned.map(renderMsg)}
                    </div>
                  )}
                  {regular.map(renderMsg)}
                </>
              );
            })()
          )}
        </div>

        <div className="p-4 border-t border-zinc-700">
          <div className="flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-5 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="Type a message..."
              disabled={!currentUser}
            />
            <button
              onClick={sendMessage}
              disabled={!currentUser || !newMessage.trim()}
              className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-xl font-medium transition disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
