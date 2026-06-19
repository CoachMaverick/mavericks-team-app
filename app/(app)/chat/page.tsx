'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Team Chat</h1>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <div className="bg-zinc-900 rounded-2xl h-[650px] flex flex-col border border-zinc-700">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-gray-400 py-12">No messages yet. Start the conversation!</p>
          ) : (
            messages.map((msg: any) => (
              <div key={msg.id} className="flex justify-end">
                <div className="bg-blue-600 text-white p-4 rounded-2xl max-w-[75%] rounded-br-none">
                  <p>{msg.content}</p>
                  <small className="text-blue-200 text-xs mt-1 block">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </small>
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
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-5 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="Type a message..."
            />
            <button
              onClick={sendMessage}
              className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-xl font-medium transition"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
