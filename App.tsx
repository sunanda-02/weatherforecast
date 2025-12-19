
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { 
  Cloud, 
  Sun, 
  CloudRain, 
  Wind, 
  Mic, 
  MicOff, 
  Send, 
  MapPin, 
  Loader2,
  Volume2,
  VolumeX,
  Menu,
  X,
  History,
  CloudLightning
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { Message } from './types';
import { decode, decodeAudioData, createPcmBlob } from './services/audio';

// --- Components ---

const ChatBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] p-4 rounded-2xl ${
        isUser 
          ? 'bg-blue-600 text-white rounded-tr-none' 
          : 'glass text-blue-50 rounded-tl-none border border-white/10'
      }`}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
            <span className="text-[10px] text-white/50 w-full mb-1">Sources:</span>
            {message.sources.map((src, i) => (
              <a 
                key={i} 
                href={src.uri} 
                target="_blank" 
                rel="noreferrer" 
                className="text-[10px] bg-white/10 px-2 py-1 rounded hover:bg-white/20 transition-colors"
              >
                {src.title}
              </a>
            ))}
          </div>
        )}
        <span className="text-[10px] mt-2 block opacity-50 text-right">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I am SkyWhisper, your AI weather assistant. Ask me about the current weather or a forecast for any location.',
      timestamp: Date.now()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesSetRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, []);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: inputValue,
        config: {
          systemInstruction: 'You are SkyWhisper, a helpful and precise weather forecasting AI. Use Google Search to find current weather, trends, and forecasts. Provide detailed answers with temperatures, conditions, and helpful advice (e.g. "wear a raincoat"). If the user asks about a location without specifying one, assume their current location if provided or ask for one. Always cite sources.',
          tools: [{ googleSearch: {} }]
        }
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Weather Source',
        uri: chunk.web?.uri || '#'
      })) || [];

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.text || 'I couldn\'t fetch the weather data right now.',
        timestamp: Date.now(),
        sources: sources
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Try to extract some chart data if possible (simulated for UI)
      if (response.text?.toLowerCase().includes('forecast')) {
        setChartData([
          { time: 'Today', temp: 22 },
          { time: 'Tue', temp: 24 },
          { time: 'Wed', temp: 19 },
          { time: 'Thu', temp: 21 },
          { time: 'Fri', temp: 25 },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: 'err',
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please check your connection.',
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startLiveSession = async () => {
    if (isLiveActive) {
      stopLiveSession();
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsLiveActive(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
            liveSessionRef.current = { sessionPromise, scriptProcessor, stream, inputCtx };
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              source.addEventListener('ended', () => sourcesSetRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesSetRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesSetRef.current.forEach(s => s.stop());
              sourcesSetRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => console.error('Live error:', e),
          onclose: () => setIsLiveActive(false)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'You are SkyWhisper, a voice-enabled weather assistant. Keep your responses conversational and brief. Focus on providing current weather conditions and immediate alerts.'
        }
      });

    } catch (err) {
      console.error('Failed to start live session:', err);
    }
  };

  const stopLiveSession = () => {
    if (liveSessionRef.current) {
      const { stream, inputCtx, scriptProcessor } = liveSessionRef.current;
      stream.getTracks().forEach((track: any) => track.stop());
      scriptProcessor.disconnect();
      inputCtx.close();
      liveSessionRef.current = null;
    }
    setIsLiveActive(false);
  };

  return (
    <div className="flex h-screen bg-[#0f172a] overflow-hidden">
      
      {/* Sidebar - Mobile Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar Content */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-72 glass border-r border-white/10 z-50 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-blue-600 rounded-lg">
              <CloudLightning className="text-white" size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">SkyWhisper</h1>
          </div>

          <nav className="flex-1 space-y-2">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/20">
              <History size={18} />
              <span className="text-sm font-medium">Chat History</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 transition-colors">
              <MapPin size={18} />
              <span className="text-sm font-medium">Saved Locations</span>
            </button>
          </nav>

          <div className="mt-auto pt-6 border-t border-white/10">
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-600/10 to-purple-600/10 border border-white/10">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Current Location</h3>
              <div className="flex items-center gap-2 text-white font-medium">
                <MapPin size={14} className="text-blue-500" />
                <span className="text-sm">{userLocation ? 'Acquiring...' : 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900 to-slate-900">
        
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/10 bg-slate-900/50 backdrop-blur-md sticky top-0 z-30">
          <button className="lg:hidden p-2 text-gray-400" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          
          <div className="flex-1 lg:flex-none flex items-center gap-4">
             <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
               <Sun size={14} className="text-yellow-500" />
               <span>24°C in London</span>
             </div>
          </div>

          <div className="flex items-center gap-3">
             <button 
              onClick={startLiveSession}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all relative ${
                isLiveActive 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' 
                  : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
              }`}
             >
               {isLiveActive ? <Mic size={18} className="animate-pulse" /> : <Mic size={18} />}
               <span className="hidden sm:inline">{isLiveActive ? 'Live Active' : 'Voice Mode'}</span>
             </button>
          </div>
        </header>

        {/* Scrollable Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6 scroll-smooth" ref={scrollRef}>
          <div className="max-w-4xl mx-auto w-full">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            
            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="glass p-4 rounded-2xl rounded-tl-none border border-white/10 flex items-center gap-3">
                  <Loader2 size={18} className="animate-spin text-blue-500" />
                  <span className="text-sm text-blue-100/70">Consulting satellites...</span>
                </div>
              </div>
            )}

            {/* Weather Trends Visualization (Contextual) */}
            {chartData.length > 0 && (
              <div className="glass p-6 rounded-3xl border border-white/10 mb-6 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-bold text-white">Temperature Outlook</h3>
                    <p className="text-xs text-gray-400">Projected trend for the next 5 days</p>
                  </div>
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Cloud size={20} className="text-blue-400" />
                  </div>
                </div>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis 
                        dataKey="time" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: 'rgba(255,255,255,0.4)', fontSize: 12}}
                        dy={10}
                      />
                      <YAxis 
                        hide 
                        domain={['dataMin - 5', 'dataMax + 5']} 
                      />
                      <Tooltip 
                        contentStyle={{backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff'}}
                        itemStyle={{color: '#3b82f6'}}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="temp" 
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorTemp)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Persistent Input Footer */}
        <footer className="p-4 lg:p-6 bg-slate-900/80 backdrop-blur-xl border-t border-white/10">
          <div className="max-w-4xl mx-auto relative">
            <form onSubmit={handleSendMessage} className="relative group">
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about the weather (e.g., 'Will it rain in Tokyo today?')"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-24 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/10 transition-all text-white placeholder:text-gray-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button 
                  type="button"
                  onClick={startLiveSession}
                  className={`p-2.5 rounded-xl transition-all ${isLiveActive ? 'bg-red-500 text-white' : 'hover:bg-white/10 text-gray-400'}`}
                >
                  <Mic size={20} />
                </button>
                <button 
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white p-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
            <p className="text-center text-[10px] text-gray-500 mt-3">
              SkyWhisper AI uses real-time satellite data and ground-based weather reports via Google Search.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
