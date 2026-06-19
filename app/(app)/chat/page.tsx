'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { pinMessage, editMessage, deleteMessage } from '@/lib/actions';

export default function ChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
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
          let admin = profile && (profile.role === 'coach' || profile.role === 'admin' || profile.is_admin === true);
          // Force admin for the designated coach email as fallback
          if (user.email?.toLowerCase() === "coach@comavericksbaseball.com") {
            admin = true;
          }
          setIsAdmin(!!admin);
        } catch (e) {
          // Fallback for the coach email even on profile fetch error
          if (user.email?.toLowerCase() === "coach@comavericksbaseball.com") {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        }
      }

      loadMessages();
    };

    init();

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
      }] as any);

      if (error) throw error;

      setNewMessage('');
      loadMessages();
    } catch (err: any) {
      console.error('Send error:', err);
      alert('Send failed: ' + (err.message || 'Unknown error'));
    }
  };

  const handleEditMessage = async (msg: any) => {
    const newContent = prompt('Edit message:', msg.content);
    if (newContent === null || newContent.trim() === msg.content) return;

    try {
      await editMessage(msg.id, newContent.trim());
      loadMessages();
    } catch (e: any) {
      console.error('Edit error:', e);
      alert(e.message || 'Failed to edit message');
    }
  };

  const handleDeleteMessage = async (id: string) => {
    if (!confirm('Delete this message?')) return;

    try {
      await deleteMessage(id);
      loadMessages();
    } catch (err: any) {
      console.error('Delete error:', err);
      alert(err.message || 'Delete failed');
    }
  };

  const handleTogglePin = async (id: string, currentlyPinned: boolean) => {
    try {
      await pinMessage(id, !currentlyPinned);
      loadMessages();
    } catch (err: any) {
      console.error('Pin error:', err);
      alert(err.message || 'Pin/Unpin failed');
    }
  };

  const toggleReaction = async (id: string, emoji: string) => {
    if (!currentUser) {
      alert('Please log in to react');
      return;
    }

    try {
      // Fetch current reactions
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
        // Migrate legacy array format
        raw.forEach((e: string) => {
          if (!reactions[e]) reactions[e] = [];
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

      // Immediate optimistic update
      setMessages(prev =>
        prev.map(m => (m.id === id ? { ...m, reactions } : m))
      );

      // Persist to DB
      const { error } = await (supabase as any)
        .from('messages')
        .update({ reactions })
        .eq('id', id);

      if (error) throw error;

      // Refresh to ensure consistency (realtime will also help)
      loadMessages();
    } catch (err: any) {
      console.error('Reaction error:', err);
      alert('Failed to update reaction');
      loadMessages(); // Revert on error
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Team Chat</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="bg-zinc-900 rounded-2xl h-[650px] flex flex-col border border-zinc-700 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-gray-400 py-12">
              No messages yet. Start the conversation!
            </p>
          ) : (
            (() => {
              const pinned = messages.filter((m: any) => m.is_pinned);
              const regular = messages.filter((m: any) => !m.is_pinned);

              const renderMessage = (msg: any) => {
                const isOwn = msg.sender_id === currentUser?.id || msg.user_id === currentUser?.id;

                // Normalize reactions for display (supports object or legacy)
                const raw = msg.reactions || {};
                let reactionEntries: [string, number][] = [];

                if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                  reactionEntries = Object.entries(raw)
                    .map(([emoji, users]: [string, any]) => {
                      const count = Array.isArray(users) ? users.length : 0;
                      return [emoji, count] as [string, number];
                    })
                    .filter(([, count]) => count > 0);
                } else if (Array.isArray(raw)) {
                  const counts: Record<string, number> = {};
                  raw.forEach((e: string) => {
                    counts[e] = (counts[e] || 0) + 1;
                  });
                  reactionEntries = Object.entries(counts) as [string, number][];
                }

                return (
                  <div
                    key={msg.id}
                    className={`group flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="flex flex-col max-w-[75%] gap-1">
                      {/* Bubble */}
                      <div
                        className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                          isOwn
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-zinc-800 rounded-bl-none'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        <small
                          className={`mt-1.5 block text-[10px] opacity-70 ${
                            isOwn ? 'text-blue-200' : 'text-gray-400'
                          }`}
                        >
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                          {msg.is_pinned && ' 📌'}
                        </small>
                      </div>

                      {/* Reactions - always visible below message text */}
                      {reactionEntries.length > 0 && (
                        <div
                          className={`flex gap-1 flex-wrap text-xs ${
                            isOwn ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {reactionEntries.map(([emoji, count]) => (
                            <span
                              key={emoji}
                              onClick={() => toggleReaction(msg.id, emoji)}
                              className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-zinc-700/70 hover:bg-zinc-600 rounded-full cursor-pointer transition active:scale-95"
                              title="Toggle your reaction"
                            >
                              {emoji} {count}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Hover actions - clean and intuitive */}
                      <div
                        className={`hidden group-hover:flex items-center gap-1 text-sm ${
                          isOwn ? 'justify-end' : 'justify-start'
                        } pl-1`}
                      >
                        <button
                          onClick={() => toggleReaction(msg.id, '❤️')}
                          className="px-1.5 py-0.5 hover:bg-zinc-700 rounded transition hover:scale-110"
                          title="React"
                        >
                          ❤️
                        </button>
                        <button
                          onClick={() => toggleReaction(msg.id, '👍')}
                          className="px-1.5 py-0.5 hover:bg-zinc-700 rounded transition hover:scale-110"
                          title="React"
                        >
                          👍
                        </button>
                        <button
                          onClick={() => toggleReaction(msg.id, '👏')}
                          className="px-1.5 py-0.5 hover:bg-zinc-700 rounded transition hover:scale-110"
                          title="React"
                        >
                          👏
                        </button>

                        {(isAdmin || isOwn) && (
                          <button
                            onClick={() => handleEditMessage(msg)}
                            className="px-1.5 py-0.5 hover:bg-zinc-700 rounded transition hover:scale-110"
                            title="Edit"
                          >
                            ✏️
                          </button>
                        )}

                        {(isAdmin || isOwn) && (
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="px-1.5 py-0.5 text-red-400 hover:bg-zinc-700 rounded transition hover:scale-110"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            onClick={() => handleTogglePin(msg.id, !!msg.is_pinned)}
                            className="px-1.5 py-0.5 text-yellow-400 hover:bg-zinc-700 rounded transition hover:scale-110"
                            title={msg.is_pinned ? 'Unpin' : 'Pin'}
                          >
                            📌
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {pinned.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-yellow-400 mb-1 flex items-center gap-1.5">
                        📌 PINNED
                      </div>
                      {pinned.map(renderMessage)}
                    </div>
                  )}
                  {regular.map(renderMessage)}
                </>
              );
            })()
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-zinc-700 bg-zinc-900">
          <div className="flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-5 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="Type a message..."
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-8 py-3 rounded-xl font-medium transition"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
