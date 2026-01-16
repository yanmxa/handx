'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';
import { MessageType, Session, ListSessionsResponse, ConnectAckPayload, CreateSessionResponse, DeleteSessionPayload, RenameSessionPayload, RenameSessionResponse } from '@/types/message';

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [serverVersion, setServerVersion] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState('');
  const [ws, setWs] = useState<WebSocketClient | null>(null);
  const [hostLabel, setHostLabel] = useState('');
  const [longPressSessionId, setLongPressSessionId] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Client-side initialization
  useEffect(() => {
    const savedTheme = localStorage.getItem('handx_theme') as 'dark' | 'light';
    if (savedTheme) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(savedTheme);
    }
    setHostLabel(`${window.location.hostname || 'localhost'}:8080`);
    setMounted(true);
  }, []);

  // Theme definitions
  const themes = {
    dark: {
      bg: 'bg-[#05070d]',
      text: 'text-[#e2e8f0]',
      textDim: 'text-[#6b7a90]',
      card: 'bg-[#0b1220]/80',
      cardBorder: 'border-[#111826]',
      button: 'bg-[#0f172a] hover:bg-[#111a2f] border border-[#18233a]',
      buttonPrimary: 'bg-[#22d3ee] hover:bg-[#38e1fb] text-[#03131c] font-semibold shadow-[0_10px_40px_-16px_rgba(34,211,238,0.6)]',
      sessionCard: 'bg-[#0c1424]/80 hover:bg-[#111a2f] border border-[#18233a]',
      accent: 'text-[#22d3ee]',
      accentBg: 'bg-[#22d3ee]/12',
      chip: 'bg-gradient-to-r from-[#22d3ee]/15 via-[#14b8a6]/12 to-transparent'
    },
    light: {
      bg: 'bg-[#f6f8fb]',
      text: 'text-[#0f172a]',
      textDim: 'text-[#4b5563]',
      card: 'bg-white',
      cardBorder: 'border-[#e2e8f0]',
      button: 'bg-[#eef2f7] hover:bg-white border border-[#e2e8f0]',
      buttonPrimary: 'bg-[#0ea5e9] hover:bg-[#38bdf8] text-white font-semibold shadow-[0_10px_40px_-18px_rgba(14,165,233,0.55)]',
      sessionCard: 'bg-white hover:bg-[#f7fbff] border border-[#e2e8f0]',
      accent: 'text-[#0ea5e9]',
      accentBg: 'bg-[#0ea5e9]/10',
      chip: 'bg-gradient-to-r from-[#0ea5e9]/10 via-[#22d3ee]/10 to-transparent'
    },
  };

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Connect to server
    const savedWsUrl = localStorage.getItem('handx_ws_url');
    const hostname = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = savedWsUrl || `${protocol}//${hostname}:8080/ws`;

    const client = new WebSocketClient(wsUrl);

    // Handle connect acknowledgment
    client.on(MessageType.CONNECT_ACK, (message) => {
      const payload = message.payload as ConnectAckPayload;
      if (payload.success) {
        setConnectionStatus('connected');
        setServerVersion(payload.server_version);
        setError('');
        // Request session list
        client.send(MessageType.LIST_SESSIONS, {});
      } else {
        setConnectionStatus('error');
        setError('Connection rejected by server');
      }
    });

    // Handle session list response
    client.on(MessageType.LIST_SESSIONS_RESPONSE, (message) => {
      const payload = message.payload as ListSessionsResponse;
      setSessions(payload.sessions);
    });

    // Handle create session response
    client.on(MessageType.CREATE_SESSION_RESPONSE, (message) => {
      const payload = message.payload as CreateSessionResponse;
      if (payload.success) {
        // Refresh session list
        client.send(MessageType.LIST_SESSIONS, {});
      } else {
        setError('Failed to create session');
      }
    });

    // Handle delete session response
    client.on(MessageType.DELETE_SESSION_RESPONSE, (message) => {
      if (message.payload.success) {
        // Refresh session list
        client.send(MessageType.LIST_SESSIONS, {});
      } else {
        setError('Failed to delete session');
      }
    });

    // Handle rename session response
    client.on(MessageType.RENAME_SESSION_RESPONSE, (message) => {
      const payload = message.payload as RenameSessionResponse;
      if (payload.success) {
        // Refresh session list
        client.send(MessageType.LIST_SESSIONS, {});
      } else {
        setError('Failed to rename session');
      }
    });

    // Handle errors
    client.on(MessageType.ERROR, (message) => {
      setError(message.payload.message || 'An error occurred');
    });

    // Connect
    client.connect().catch(() => {
      setConnectionStatus('error');
      setError('Failed to connect to server');
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWs(client);

    // Auto-refresh session list every 5 seconds when connected
    const refreshInterval = setInterval(() => {
      if (client.isConnected) {
        client.send(MessageType.LIST_SESSIONS, {});
      }
    }, 5000);

    return () => {
      clearInterval(refreshInterval);
      client.disconnect();
    };
  }, []);

  const handleEnterTerminal = (sessionName?: string) => {
    if (sessionName) {
      localStorage.setItem('handx_selected_session', sessionName);
    }
    router.push('/terminal');
  };

  const handleCreateSession = () => {
    if (ws && connectionStatus === 'connected') {
      const sessionName = prompt('Enter session name:');
      if (sessionName) {
        ws.send(MessageType.CREATE_SESSION, { name: sessionName });
        // Response handler will refresh the session list
      }
    }
  };

  const handleDeleteSession = (session: Session, e?: React.MouseEvent) => {
    if (e) e.stopPropagation(); // Prevent triggering the session click
    if (ws && connectionStatus === 'connected') {
      const confirmed = confirm(`Delete session "${session.name}"?`);
      if (confirmed) {
        ws.send(MessageType.DELETE_SESSION, { session_name: session.name } as DeleteSessionPayload);
      }
    }
    // Reset long press state
    setLongPressSessionId(null);
  };

  // Long press handlers for mobile
  const handleSessionTouchStart = (session: Session) => {
    longPressTimerRef.current = setTimeout(() => {
      setLongPressSessionId(session.id);
    }, 500); // 500ms long press
  };

  const handleSessionTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSessionTouchMove = () => {
    // Cancel long press if user moves finger
    handleSessionTouchEnd();
  };

  const handleRenameSession = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    if (ws && connectionStatus === 'connected') {
      const newName = prompt(`Rename session "${session.name}" to:`, session.name);
      if (newName && newName !== session.name) {
        ws.send(MessageType.RENAME_SESSION, { old_name: session.name, new_name: newName } as RenameSessionPayload);
      }
    }
    // Reset long press state
    setLongPressSessionId(null);
  };

  const handleRefreshSessions = () => {
    if (ws && connectionStatus === 'connected') {
      ws.send(MessageType.LIST_SESSIONS, {});
    }
  };

  const handleRetry = () => {
    window.location.reload();
  };

  if (!mounted) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <div className={`min-h-screen ${themes[theme].bg} ${themes[theme].text} flex flex-col overscroll-none relative`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-70" aria-hidden>
        <div className="absolute -left-10 -top-24 h-64 w-64 rounded-full bg-[#22d3ee]/10 blur-3xl" />
        <div className="absolute right-[-40px] top-10 h-60 w-60 rounded-full bg-[#0ea5e9]/10 blur-3xl" />
        <div className="absolute left-1/3 bottom-[-120px] h-72 w-72 rounded-full bg-[#38e1fb]/10 blur-3xl" />
      </div>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col px-4 py-5 md:p-6 overflow-auto">
        <div className="w-full max-w-lg mx-auto space-y-5">
          {/* Hero */}
          <section className={`relative overflow-hidden rounded-3xl border ${themes[theme].cardBorder} ${theme === 'dark' ? 'bg-[#0b1220]/80' : 'bg-white/90'} shadow-xl shadow-black/10`}>
            <div className="absolute inset-0 opacity-50">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(14,165,233,0.12),transparent_28%),linear-gradient(135deg,rgba(34,211,238,0.08),rgba(14,165,233,0.04))]" />
            </div>
            <div className="relative p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className={`text-xs uppercase tracking-[0.15em] ${themes[theme].textDim}`}>Mobile shell</p>
                  <h2 className={`text-xl font-semibold leading-tight ${themes[theme].text}`}>Control tmux sessions anywhere.</h2>
                  <p className={`text-sm ${themes[theme].textDim}`}>Jump into the terminal or spin up a session with one-hand friendly taps.</p>
                </div>
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${themes[theme].chip} ${themes[theme].accent}`}>
                  <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-teal-400 animate-pulse' : connectionStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'}`} />
                  {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Linking' : 'Offline'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleEnterTerminal()}
                  className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm transition-all active:scale-[0.98] ${themes[theme].buttonPrimary}`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Open terminal
                </button>
                <button
                  onClick={handleCreateSession}
                  disabled={connectionStatus !== 'connected'}
                  className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm transition-all active:scale-[0.98] ${themes[theme].button} disabled:opacity-50`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  New session
                </button>
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <div className={`flex items-center gap-2 rounded-full px-3 py-1 border ${themes[theme].cardBorder} ${themes[theme].accentBg}`}>
                  <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-teal-400' : 'bg-amber-400'}`} />
                  {serverVersion ? `Server v${serverVersion}` : 'Server not ready'}
                </div>
                <div className={`flex items-center gap-2 rounded-full px-3 py-1 border ${themes[theme].cardBorder}`}>
                  <svg className={`w-3.5 h-3.5 ${themes[theme].textDim}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l-7-7 7-7m0 14l7-7-7-7" />
                  </svg>
                  {hostLabel || 'Hostname loading'}
                </div>
                <div className={`flex items-center gap-2 rounded-full px-3 py-1 border ${themes[theme].cardBorder}`}>
                  <svg className={`w-3.5 h-3.5 ${themes[theme].textDim}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12l4-4m-4 4l4 4" />
                  </svg>
                  Tap to enter, long press to manage
                </div>
              </div>
            </div>
          </section>

          {/* Connection Status - Clean card */}
          <div className={`${themes[theme].card} rounded-2xl p-4 border ${themes[theme].cardBorder}`}>
            {connectionStatus === 'connecting' && (
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${theme === 'dark' ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                  <div className={`w-5 h-5 rounded-full border-2 ${theme === 'dark' ? 'border-amber-400' : 'border-amber-500'} border-t-transparent animate-spin`} />
                </div>
                <div className="flex-1">
                  <p className={`font-medium ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>Connecting...</p>
                  <p className={`text-sm ${themes[theme].textDim}`}>Establishing connection</p>
                </div>
              </div>
            )}

            {connectionStatus === 'connected' && (
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${themes[theme].accentBg}`}>
                  <svg className={`w-5 h-5 ${themes[theme].accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className={`font-medium ${themes[theme].accent}`}>Connected</p>
                  <p className={`text-sm ${themes[theme].textDim}`}>Server v{serverVersion}</p>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${themes[theme].accentBg}`}>
                  <div className={`w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse`} />
                  <span className={`text-xs font-medium ${themes[theme].accent}`}>Live</span>
                </div>
              </div>
            )}

            {connectionStatus === 'error' && (
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${theme === 'dark' ? 'bg-red-500/10' : 'bg-red-50'}`}>
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-red-500">Disconnected</p>
                  <p className={`text-sm truncate ${themes[theme].textDim}`}>{error || 'Connection failed'}</p>
                </div>
                <button
                  onClick={handleRetry}
                  className={`min-w-[44px] min-h-[44px] px-4 rounded-xl text-sm font-medium transition-all active:scale-95 ${theme === 'dark' ? 'bg-red-500/20 text-red-400' : 'bg-red-50 text-red-600'}`}
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Sessions */}
          {connectionStatus === 'connected' && (
            <div className="space-y-4">
              {/* Sessions header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className={`text-base font-semibold ${themes[theme].text}`}>Sessions</h2>
                  <span className={`text-sm px-2 py-0.5 rounded-full ${themes[theme].accentBg} ${themes[theme].accent}`}>
                    {sessions.length}
                  </span>
                  <button
                    onClick={handleRefreshSessions}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${themes[theme].button} transition-all active:scale-95`}
                    title="Refresh"
                  >
                    <svg className={`w-4 h-4 ${themes[theme].textDim}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <button
                  onClick={handleCreateSession}
                  className={`min-h-[44px] flex items-center gap-2 px-4 rounded-xl text-sm ${themes[theme].buttonPrimary} transition-all active:scale-95`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>New</span>
                </button>
              </div>
              <p className={`text-xs ${themes[theme].textDim}`}>Tap to enter, long press to edit or delete. 44px targets stay thumb-friendly.</p>

              {/* Session list */}
              {sessions.length > 0 ? (
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`group relative w-full p-4 rounded-2xl cursor-pointer transition-all duration-200 active:scale-[0.98] touch-manipulation overflow-hidden
                        ${themes[theme].sessionCard}
                        ${longPressSessionId === session.id ? `ring-2 ring-teal-500/50` : ''}`}
                      onClick={() => {
                        if (longPressSessionId === session.id) {
                          setLongPressSessionId(null);
                        } else {
                          handleEnterTerminal(session.name);
                        }
                      }}
                      onTouchStart={() => handleSessionTouchStart(session)}
                      onTouchEnd={handleSessionTouchEnd}
                      onTouchMove={handleSessionTouchMove}
                    >
                      <div className="absolute inset-y-3 left-2 w-[3px] rounded-full bg-gradient-to-b from-[#22d3ee] via-[#14b8a6] to-transparent opacity-70" />
                      <div className="flex items-center gap-3">
                        {/* Session icon */}
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${themes[theme].accentBg}`}>
                          <svg className={`w-5 h-5 ${themes[theme].accent}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium truncate ${themes[theme].text}`}>{session.name}</span>
                            {session.attached && (
                              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${themes[theme].accentBg} ${themes[theme].accent}`}>
                                <span className="w-1 h-1 rounded-full bg-teal-500 animate-pulse" />
                                Active
                              </span>
                            )}
                          </div>
                          <p className={`text-sm ${themes[theme].textDim} flex items-center gap-2`}>
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee]/60" />
                              {session.windows.length} window{session.windows.length !== 1 ? 's' : ''}
                            </span>
                            <span className="text-[11px] uppercase tracking-[0.12em]">
                              {session.attached ? 'ON DEVICE' : 'Detached'}
                            </span>
                          </p>
                        </div>
                        {/* Desktop hover actions */}
                        <div className={`hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                          <button
                            onClick={(e) => handleRenameSession(session, e)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${theme === 'dark' ? 'hover:bg-white/10 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleDeleteSession(session, e)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${theme === 'dark' ? 'hover:bg-red-500/20 text-gray-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                        {/* Arrow indicator */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${themes[theme].accentBg} ${longPressSessionId === session.id ? 'hidden' : ''} md:group-hover:hidden`}>
                          <svg className={`w-4 h-4 ${themes[theme].accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`text-center py-10 px-6 rounded-2xl border-2 border-dashed ${themes[theme].cardBorder}`}>
                  <div className={`w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center ${themes[theme].accentBg}`}>
                    <svg className={`w-7 h-7 ${themes[theme].accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className={`font-medium ${themes[theme].text}`}>No sessions yet</p>
                  <p className={`text-sm mt-1 ${themes[theme].textDim}`}>Create one to get started</p>
                </div>
              )}

            </div>
          )}
        </div>

      </main>

      {/* Mobile: Bottom action bar when session is long-pressed */}
      {isMobile && longPressSessionId && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 p-4 pb-8
            ${theme === 'dark' ? 'bg-black/95' : 'bg-white/95'}
            backdrop-blur-xl border-t ${themes[theme].cardBorder}`}
        >
          <div className="max-w-md mx-auto">
            {/* Selected session name */}
            <p className={`text-center text-sm mb-4 ${themes[theme].textDim}`}>
              {sessions.find(s => s.id === longPressSessionId)?.name}
            </p>
            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={(e) => {
                  const session = sessions.find(s => s.id === longPressSessionId);
                  if (session) handleRenameSession(session, e);
                }}
                className={`flex-1 min-h-[48px] flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-95 touch-manipulation
                  ${theme === 'dark' ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
                Rename
              </button>
              <button
                onClick={(e) => {
                  const session = sessions.find(s => s.id === longPressSessionId);
                  if (session) handleDeleteSession(session, e);
                }}
                className={`flex-1 min-h-[48px] flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-95 touch-manipulation
                  ${theme === 'dark' ? 'bg-red-500/20 text-red-400' : 'bg-red-50 text-red-600'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Delete
              </button>
            </div>
            {/* Cancel button */}
            <button
              onClick={() => setLongPressSessionId(null)}
              className={`w-full mt-3 min-h-[44px] rounded-xl text-sm font-medium transition-all active:scale-98 touch-manipulation ${themes[theme].textDim}`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
