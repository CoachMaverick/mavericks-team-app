'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      loadMessages();
    };
    init();
  }, []);

  const loadMessages = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('messages')
        .select('*')
        .eq('channel', 'team')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
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
        user_id: currentUser.id,
        channel: 'team',
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
      const { error } = await (supabase as any).from('messages').delete().eq('id', id);
      if (error) throw error;
      loadMessages();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const togglePin = async (id: string, pinned: boolean) => {
    try {
      const { error } = await (supabase as any).from('messages').update({ pinned: !pinned }).eq('id', id);
      if (error) throw error;
      loadMessages();
    } catch (err: any) {
      alert('Pin failed: ' + err.message);
    }
  };

  // Simple emoji reaction (you can expand later)
  const addReaction = async (messageId: string, emoji: string) => {
    alert(`Reaction ${emoji} added to message (feature coming soon)`);
    // Full implementation can be added later
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Team Chat</h1>

      <div className="bg-zinc-900 rounded-2xl h-[650px] flex flex-col border border-zinc-700">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-gray-400 py-12">No messages yet. Start the conversation!</p>
          ) : (
            messages.map((msg: any) => (
              <div key={msg.id} className="group flex justify-end relative">
                <div className="bg-blue-600 text-white p-4 rounded-2xl max-w-[75%] rounded-br-none">
                  <p>{msg.content}</p>
                  <small className="text-blue-200 text-xs mt-1">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </small>
                </div>

                <div className="absolute right-0 -top-2 opacity-0 group-hover:opacity-100 flex gap-1">
                  <button onClick={() => addReaction(msg.id, '❤️')} className="text-xl">❤️</button>
                  <button onClick={() => deleteMessage(msg.id)} className="text-red-400">🗑️</button>
                  <button onClick={() => togglePin(msg.id, msg.pinned)} className="text-yellow-400">📌</button>
                </div>
              </div>
            ))
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
