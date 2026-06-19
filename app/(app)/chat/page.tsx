'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isCoach, setIsCoach] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      if (user) {
        try {
          const { data: profile } = await (supabase as any)
            .from('profiles')
            .select('role, is_admin')
            .eq('id', user.id)
            .single();
          const coach = profile && (profile.role === 'coach' || profile.role === 'admin' || profile.is_admin === true);
          setIsCoach(!!coach);
        } catch (e) {
          setIsCoach(false);
        }
      }
      loadMessages();
    };
    init();

    // Realtime updates
    const channel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMessages = async () => {
    try {
      setError(null);
      const { data, error } = await (supabase as any)
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      const filtered = (data || []).filter((m: any) =>
        (m.channel_type === 'team' || m.channel === 'team') && m.is_deleted !== true
      );
      setMessages(filtered);
    } catch (err: any) {
      console.error('Load error:', err);
      setError('Failed to load messages');
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser) return;
    try {
      const { error } = await (supabase as any).from('messages').insert([{
        content: newMessage.trim(),
        sender_id: currentUser.id,
        channel_type: 'team',
      }]);
      if (error) throw error;
      setNewMessage('');
      loadMessages();
    } catch (err: any) {
      alert('Send failed: ' + err.message);
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      // Soft delete for stability
      const { error } = await (supabase as any)
        .from('messages')
        .update({ is_deleted: true })
        .eq('id', id);
      if (error) throw error;
      loadMessages();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const togglePin = async (id: string, pinned: boolean) => {
    try {
      const { error } = await (supabase as any)
        .from('messages')
        .update({ pinned: !pinned })
        .eq('id', id);
      if (error) throw error;
      loadMessages();
    } catch (err: any) {
      alert('Pin failed: ' + err.message);
    }
  };

  const toggleReaction = async (id: string, emoji: string) => {
    if (!currentUser) {
      alert('Please log in to react');
      return;
    }
    try {
      const { data: msgData } = await (supabase as any)
        .from('messages')
        .select('reactions')
        .eq('id', id)
        .single();

      let reactions: Record<string, string[]> = {};
      const raw = msgData?.reactions;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        reactions = { ...raw };
        Object.keys(reactions).forEach(k => {
          if (!Array.isArray(reactions[k])) reactions[k] = [];
        });
      } else if (Array.isArray(raw)) {
        // support legacy array format
        raw.forEach((e: string) => {
          if (!reactions[e]) reactions[e] = [];
          if (!reactions[e].includes('legacy')) reactions[e].push('legacy');
        });
      }

      const uid = currentUser.id;
      if (!reactions[emoji]) reactions[emoji] = [];
      const idx = reactions[emoji].indexOf(uid);
      if (idx !== -1) {
        reactions[emoji] = reactions[emoji].filter((u: string) => u !== uid);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji].push(uid);
      }

      // Optimistic update for immediate UI feedback
      setMessages(prev =>
        prev.map(m =>
          m.id === id ? { ...m, reactions } : m
        )
      );

      const { error } = await (supabase as any)
        .from('messages')
        .update({ reactions })
        .eq('id', id);
      if (error) throw error;
      // Realtime + load will keep in sync; no forced reload needed for speed
    } catch (err: any) {
      console.error('Reaction error:', err);
      alert(`Reacted with ${emoji}`);
      loadMessages(); // revert on failure
    }
  };

  const editMessage = async (msg: any) => {
    const newContent = prompt('Edit message:', msg.content);
    if (newContent === null || newContent.trim() === msg.content) return;
    try {
      // UI already guards to own messages; RLS may further protect
      const { error } = await (supabase as any)
        .from('messages')
        .update({ content: newContent.trim() })
        .eq('id', msg.id);
      if (error) throw error;
      loadMessages();
    } catch (e: any) {
      console.error('Edit error:', e);
      alert('Failed to edit message');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Team Chat</h1>
      {error && <p className="text-red-400 mb-4">{error}</p>}

      <div className="bg-zinc-900 rounded-2xl h-[650px] flex flex-col border border-zinc-700">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-gray-400 py-12">No messages yet. Start the conversation!</p>
          ) : (
            (() => {
              const pinned = messages.filter((m: any) => m.pinned);
              const regular = messages.filter((m: any) => !m.pinned);
              const renderMsg = (msg: any) => {
                const isOwn = msg.sender_id === currentUser?.id || msg.user_id === currentUser?.id;

                // Normalize reactions for display (supports object or legacy array)
                const rawReactions = msg.reactions;
                let reactionList: Array<[string, number]> = [];
                if (rawReactions && typeof rawReactions === 'object') {
                  if (Array.isArray(rawReactions)) {
                    const counts: Record<string, number> = {};
                    rawReactions.forEach((e: string) => { counts[e] = (counts[e] || 0) + 1; });
                    reactionList = Object.entries(counts);
                  } else {
                    reactionList = Object.entries(rawReactions).map(([emoji, users]: [string, any]) => [
                      emoji,
                      Array.isArray(users) ? users.length : (typeof users === 'number' ? users : 1)
                    ]);
                  }
                }

                return (
                  <div
                    key={msg.id}
                    className={`group flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="flex flex-col max-w-[75%] gap-1 relative">
                      {/* Message bubble */}
                      <div
                        className={`p-3 rounded-2xl text-sm leading-snug ${isOwn ? 'bg-blue-600 text-white rounded-br-none' : 'bg-zinc-800 rounded-bl-none'}`}
                      >
                        <p>{msg.content}</p>
                        <small className={`mt-1 block text-[10px] opacity-70 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          {msg.pinned && ' 📌'}
                        </small>
                      </div>

                      {/* Reactions - always visible when present */}
                      {reactionList.length > 0 && (
                        <div className={`flex gap-1 flex-wrap text-xs ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          {reactionList.map(([emoji, count]) => (
                            <span
                              key={emoji}
                              onClick={() => toggleReaction(msg.id, emoji)}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-zinc-700/70 rounded-full cursor-pointer hover:bg-zinc-600 active:scale-95 transition"
                              title="Toggle your reaction"
                            >
                              {emoji} {count}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Hover actions - clean management buttons beneath reactions */}
                      <div
                        className={`hidden group-hover:flex items-center gap-1 text-sm bg-zinc-900/60 rounded px-1 ${isOwn ? 'justify-end' : 'justify-start'} -mx-1`}
                      >
                        {/* Edit (own only) */}
                        {isOwn && (
                          <button onClick={() => editMessage(msg)} title="Edit" className="px-1.5 py-0.5 hover:bg-zinc-700 rounded transition">✏️</button>
                        )}

                        {/* Delete */}
                        <button onClick={() => deleteMessage(msg.id)} title="Delete" className="px-1.5 py-0.5 hover:bg-zinc-700 text-red-400 rounded transition">🗑️</button>

                        {/* Pin */}
                        <button onClick={() => togglePin(msg.id, !!msg.pinned)} title={msg.pinned ? 'Unpin' : 'Pin'} className="px-1.5 py-0.5 hover:bg-zinc-700 text-yellow-400 rounded transition">📌</button>
                      </div>
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
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-5 py-3 text-white focus:outline-none"
              placeholder="Type a message..."
            />
            <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-xl font-medium">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
