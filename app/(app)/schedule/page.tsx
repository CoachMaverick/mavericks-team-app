'use client';

export default function SchedulePage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Mavericks 12U Schedule</h1>
      <p className="text-lg text-green-400 mb-8">✅ Page is now loading in production</p>
      
      <div className="bg-zinc-900 p-6 rounded-xl">
        <p>Full calendar and event features will be restored soon.</p>
        <button 
          onClick={() => alert('Add Event clicked - coming soon')}
          className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          Add New Event
        </button>
      </div>
    </div>
  );
}
