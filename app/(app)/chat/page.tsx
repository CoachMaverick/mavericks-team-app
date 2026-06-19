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

  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      if (user) {
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
      }
      loadMessages();
    };
    init();

    // Realtime
    const channel = supabase
      .channel('messages')
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
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel', 'team')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err: any) {
      console.error('Load messages error:', err);
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser) {
      alert('Please log in to send messages');
      return;
    }

    try {
      const { error } = await supabase
        .from('messages')
        .insert([{
          content: newMessage.trim(),
          user_id: currentUser.id,
          channel: 'team',
        }] as any);

      if (error) throw error;

      setNewMessage('');
      loadMessages();
    } catch (err: any) {
      console.error('Send error:', err);
      alert('Failed to send message: ' + (err.message || 'Unknown error'));
    }
  };

  const editMessage = async (msg: any) => {
    const newContent = prompt('Edit message:', msg.content);
    if (newContent === null || newContent.trim() === msg.content) return;
    try {
      const { error } = await (supabase as any)
        .from('messages')
        .update({ content: newContent.trim() })
        .eq('id', msg.id)
        .eq('user_id', currentUser.id);
      if (error) throw error;
      loadMessages();
    } catch (e: any) {
      console.error('Edit error:', e);
      alert('Failed to edit message');
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      let query = (supabase as any).from('messages').delete().eq('id', id);
      if (!isCoach) {
        query = query.eq('user_id', currentUser.id);
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
    try {
      const { error } = await (supabase as any)
        .from('messages')
        .update({ is_pinned: !isPinned })
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
    try {
      const { data: msg, error: fetchErr } = await (supabase as any)
        .from('messages')
        .select('reactions')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;
      let reactions = msg?.reactions || {};
      if (!reactions[emoji]) reactions[emoji] = [];
      const uid = currentUser.id;
      const idx = reactions[emoji].indexOf(uid);
      if (idx !== -1) {
        reactions[emoji] = reactions[emoji].filter((u: string) => u !== uid);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji].push(uid);
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

  const canEdit = (msg: any) => msg.user_id === currentUser?.id;
  const canDelete = (msg: any) => msg.user_id === currentUser?.id || isCoach;
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
              const pinned = messages.filter((m: any) => m.is_pinned);
              const regular = messages.filter((m: any) => !m.is_pinned);
              const renderMsg = (msg: any) => {
                const isOwn = msg.user_id === currentUser?.id;
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

                      {/* Reactions */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="mt-1 flex gap-1 text-xs flex-wrap">
                          {Object.entries(msg.reactions).map(([emoji, users]: [string, any]) => (
                            <span 
                              key={emoji} 
                              onClick={() => toggleReaction(msg.id, emoji)} 
                              className="bg-black/30 px-1.5 rounded cursor-pointer hover:bg-black/50"
                            >
                              {emoji} {Array.isArray(users) ? users.length : users}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Hover actions */}
                      {hoveredId === msg.id && (
                        <div className="absolute -top-2 right-0 flex gap-1 bg-zinc-900 border border-zinc-700 rounded px-1 text-sm z-10">
                          <button onClick={() => toggleReaction(msg.id, '👍')} title="React">👍</button>
                          <button onClick={() => toggleReaction(msg.id, '❤️')} title="React">❤️</button>
                          {isOwn && (
                            <>
                              <button onClick={() => editMessage(msg)} title="Edit">✏️</button>
                              <button onClick={() => deleteMessage(msg.id)} title="Delete">🗑️</button>
                            </>
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
