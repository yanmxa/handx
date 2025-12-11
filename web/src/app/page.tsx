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

  // Long press state for mobile session deletion
  const [longPressSessionId, setLongPressSessionId] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Theme definitions
  const themes = {
    dark: {
      bg: 'bg-neutral-950',
      text: 'text-neutral-200',
      textMuted: 'text-neutral-500',
      textDim: 'text-neutral-600',
      card: 'bg-neutral-900/80',
      cardBorder: 'border-neutral-800',
      button: 'bg-neutral-800 hover:bg-neutral-700',
      buttonPrimary: 'bg-neutral-700 hover:bg-neutral-600',
      sessionCard: 'bg-neutral-800/60 hover:bg-neutral-800',
      sessionCardActive: 'bg-neutral-700',
    },
    light: {
      bg: 'bg-slate-50',
      text: 'text-slate-900',
      textMuted: 'text-slate-500',
      textDim: 'text-slate-400',
      card: 'bg-white/80',
      cardBorder: 'border-slate-200',
      button: 'bg-slate-100 hover:bg-slate-200',
      buttonPrimary: 'bg-slate-700 hover:bg-slate-600 text-white',
      sessionCard: 'bg-slate-100 hover:bg-slate-200',
      sessionCardActive: 'bg-slate-300',
    },
  };

  useEffect(() => {
    setMounted(true);

    // Load theme
    const savedTheme = localStorage.getItem('handx_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }

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

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('handx_theme', newTheme);
  };

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
    return <div className="min-h-screen bg-neutral-950" />;
  }

  return (
    <div className={`min-h-screen ${themes[theme].bg} ${themes[theme].text} flex flex-col`}>
      {/* Header */}
      <header className={`p-4 flex items-center justify-between border-b ${themes[theme].cardBorder}`}>
        <div className="flex items-center gap-3">
          {/* Logo */}
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2L4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5l-8-3z" fill="currentColor" fillOpacity="0.1" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 8l1 1 1.5-2 1.5 2 1.5-2 1.5 2 1-1v2H8V8z" fill="currentColor" fillOpacity="0.2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 12v4M12 11v5M14 12v4" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.5 16h5c.5 0 .5.5.5 1s0 1-.5 1h-5c-.5 0-.5-.5-.5-1s0-1 .5-1z" fill="currentColor" fillOpacity="0.15" />
          </svg>
          <h1 className="text-xl font-bold">HandX</h1>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-lg ${themes[theme].button} transition`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col p-4 md:p-6 overflow-auto">
        <div className="w-full max-w-lg mx-auto space-y-6">
          {/* Connection Status */}
          <div className={`${themes[theme].card} backdrop-blur-xl rounded-2xl p-5 border ${themes[theme].cardBorder} overflow-hidden relative`}>
            {connectionStatus === 'connecting' && (
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full border-2 border-yellow-500/30 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full border-2 border-yellow-500 border-t-transparent animate-spin" />
                  </div>
                </div>
                <div>
                  <p className={themes[theme].text}>Connecting...</p>
                  <p className={`text-xs ${themes[theme].textDim}`}>Establishing connection</p>
                </div>
              </div>
            )}

            {connectionStatus === 'connected' && (
              <div className="flex items-center gap-4">
                {/* Animated success indicator */}
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full ${theme === 'dark' ? 'bg-green-500/10' : 'bg-green-500/20'} flex items-center justify-center`}>
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  {/* Pulse ring */}
                  <div className={`absolute inset-0 rounded-full ${theme === 'dark' ? 'bg-green-500/20' : 'bg-green-500/30'} animate-ping`} style={{ animationDuration: '2s' }} />
                </div>
                <div className="flex-1">
                  <p className={themes[theme].text}>Connected</p>
                  <p className={`text-xs ${themes[theme].textDim}`}>v{serverVersion}</p>
                </div>
                {/* Live indicator */}
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className={`text-xs ${themes[theme].textDim}`}>Live</span>
                </div>
              </div>
            )}

            {connectionStatus === 'error' && (
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full ${theme === 'dark' ? 'bg-red-500/10' : 'bg-red-500/20'} flex items-center justify-center`}>
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-red-400">Disconnected</p>
                  <p className={`text-xs ${themes[theme].textDim}`}>{error || 'Connection failed'}</p>
                </div>
                <button
                  onClick={handleRetry}
                  className={`px-3 py-1.5 text-xs rounded-lg ${themes[theme].button} transition`}
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
                  <span className={`text-sm ${themes[theme].textMuted}`}>
                    Found {sessions.length} session(s)
                  </span>
                  {/* Refresh button */}
                  <button
                    onClick={handleRefreshSessions}
                    className={`p-1 rounded ${themes[theme].button} transition hover:opacity-80`}
                    title="Refresh sessions"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <button
                  onClick={handleCreateSession}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ${themes[theme].button} transition`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New
                </button>
              </div>

              {/* Session list */}
              {sessions.length > 0 ? (
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`group relative w-full p-4 rounded-xl ${themes[theme].sessionCard} border ${themes[theme].cardBorder}
                        transition-all duration-200 active:scale-[0.98] cursor-pointer
                        ${longPressSessionId === session.id ? 'ring-2 ring-blue-500/50' : ''}`}
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
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{session.name}</span>
                            {session.attached && (
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${themes[theme].textDim}`}>
                            {session.windows.length} window{session.windows.length !== 1 ? 's' : ''}
                          </span>
                          {/* Desktop: Small action buttons on hover */}
                          <div className={`hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100`}>
                            <button
                              onClick={(e) => handleRenameSession(session, e)}
                              className={`p-1.5 rounded-lg transition-all duration-200
                                hover:bg-blue-500/20 active:bg-blue-500/30
                                ${theme === 'dark' ? 'text-neutral-500 hover:text-blue-400' : 'text-neutral-400 hover:text-blue-500'}`}
                              title="Rename session"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => handleDeleteSession(session, e)}
                              className={`p-1.5 rounded-lg transition-all duration-200
                                hover:bg-red-500/20 active:bg-red-500/30
                                ${theme === 'dark' ? 'text-neutral-500 hover:text-red-400' : 'text-neutral-400 hover:text-red-500'}`}
                              title="Delete session"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          <svg className={`w-4 h-4 ${themes[theme].textDim} ${longPressSessionId === session.id ? 'hidden' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`text-center py-8 ${themes[theme].textDim} text-sm`}>
                  <p>No sessions yet</p>
                  <p className="mt-1">Create a new session to get started</p>
                </div>
              )}

            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className={`p-4 text-center text-xs ${themes[theme].textDim}`}>
        <p>Hand of the <span className={themes[theme].textMuted}>KING</span></p>
      </footer>

      {/* Mobile: Bottom action bar when session is long-pressed */}
      {longPressSessionId && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 p-4 pb-6
            ${theme === 'dark' ? 'bg-neutral-900/95' : 'bg-white/95'}
            backdrop-blur-lg border-t ${theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200'}
            shadow-lg shadow-black/20`}
        >
          <div className="max-w-md mx-auto">
            {/* Selected session name */}
            <p className={`text-center text-sm mb-3 ${themes[theme].textMuted}`}>
              {sessions.find(s => s.id === longPressSessionId)?.name}
            </p>
            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={(e) => {
                  const session = sessions.find(s => s.id === longPressSessionId);
                  if (session) handleRenameSession(session, e);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                  transition-all duration-200 touch-manipulation font-medium
                  ${theme === 'dark' ? 'bg-neutral-800 text-neutral-200 active:bg-neutral-700' : 'bg-neutral-100 text-neutral-700 active:bg-neutral-200'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Rename
              </button>
              <button
                onClick={(e) => {
                  const session = sessions.find(s => s.id === longPressSessionId);
                  if (session) handleDeleteSession(session, e);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                  transition-all duration-200 touch-manipulation font-medium
                  ${theme === 'dark' ? 'bg-red-500/20 text-red-400 active:bg-red-500/30' : 'bg-red-50 text-red-600 active:bg-red-100'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
            {/* Cancel button */}
            <button
              onClick={() => setLongPressSessionId(null)}
              className={`w-full mt-3 py-2.5 rounded-xl text-sm
                transition-all duration-200 touch-manipulation
                ${theme === 'dark' ? 'text-neutral-500 active:bg-neutral-800' : 'text-neutral-400 active:bg-neutral-100'}`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
