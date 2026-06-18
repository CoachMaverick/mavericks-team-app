'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

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
    if (!newMessage.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('messages')
        .insert({
          content: newMessage.trim(),
          user_id: user.id,
          channel: 'team',
        } as any);

      if (error) throw error;

      setNewMessage('');
      await loadMessages();
    } catch (err: any) {
      console.error('Send message error:', err);
      alert('Failed to send message: ' + (err.message || JSON.stringify(err)));
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Team Chat</h1>
      
      {error && <p className="text-red-400 mb-4">{error}</p>}

      <div className="bg-zinc-900 rounded-xl h-[600px] flex flex-col">
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-gray-400 mt-8">No messages yet. Start the conversation!</p>
          ) : (
            messages.map((msg: any) => (
              <div key={msg.id} className="flex justify-end">
                <div className="bg-zinc-800 p-3 rounded-lg max-w-[80%]">
                  <p>{msg.content}</p>
                  <small className="text-gray-500 text-xs block mt-1">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </small>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-zinc-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none"
              placeholder="Type a message..."
            />
            <button
              onClick={sendMessage}
              className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-lg font-medium"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
