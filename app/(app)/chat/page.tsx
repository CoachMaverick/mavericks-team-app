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
        .update({ is_pinned: !pinned })
        .eq('id', id);
      if (error) throw error;
      loadMessages();
    } catch (err: any) {
      alert('Pin failed: ' + err.message);
    }
  };

  const toggleReaction = async (id: string, emoji: string) => {
    if (!currentUser) return;
    try {
      const { data: msgData } = await (supabase as any)
        .from('messages')
        .select('reactions')
        .eq('id', id)
        .single();
      let reactions: Record<string, string[]> = (msgData?.reactions as any) || {};
      const uid = currentUser.id;
      if (!reactions[emoji]) reactions[emoji] = [];
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
    } catch (err: any) {
      console.error('Reaction error:', err);
      alert('Failed to react');
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
            messages.map((msg: any) => {
              const isOwn = msg.sender_id === currentUser?.id || msg.user_id === currentUser?.id;
              return (
                <div
                  key={msg.id}
                  className={`group flex ${isOwn ? 'justify-end' : 'justify-start'} relative`}
                >
                  <div
                    className={`relative ${isOwn ? 'bg-blue-600 text-white' : 'bg-zinc-800'} p-4 rounded-2xl max-w-[75%] ${isOwn ? 'rounded-br-none' : 'rounded-bl-none'}`}
                  >
                    <p>{msg.content}</p>
                    <small className={`text-xs mt-1 block ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      {msg.is_pinned && ' 📌'}
                    </small>

                    {/* Reaction counts */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="mt-1 flex gap-1 text-xs flex-wrap">
                        {Object.entries(msg.reactions).map(([emoji, users]: [string, any]) => (
                          <span
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            className="bg-black/30 px-1.5 rounded cursor-pointer hover:bg-black/50"
                            title="Toggle reaction"
                          >
                            {emoji} {Array.isArray(users) ? users.length : 0}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Hover actions: edit (pencil for own), reactions, delete, pin */}
                    <div className={`absolute -top-2 ${isOwn ? 'right-0' : 'left-0'} opacity-0 group-hover:opacity-100 flex gap-1 bg-zinc-900 border border-zinc-700 rounded px-1 text-sm z-10`}>
                      <button onClick={() => toggleReaction(msg.id, '❤️')} title="React">❤️</button>
                      <button onClick={() => toggleReaction(msg.id, '👍')} title="React">👍</button>
                      <button onClick={() => toggleReaction(msg.id, '👏')} title="React">👏</button>
                      {isOwn && (
                        <button onClick={() => editMessage(msg)} title="Edit">✏️</button>
                      )}
                      <button onClick={() => deleteMessage(msg.id)} title="Delete" className="text-red-400">🗑️</button>
                      {isCoach && (
                        <button onClick={() => togglePin(msg.id, !!msg.is_pinned)} title="Pin/Unpin" className="text-yellow-400">📌</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
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
