'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';
import {
  MessageType,
  Session,
  Window,
  ListSessionsResponse,
  ConnectAckPayload,
  ExecuteCommandResponse,
  CaptureOutputResponse,
  CreateSessionResponse,
  DeleteSessionPayload,
  RenameSessionPayload,
  RenameSessionResponse,
  ListWindowsResponse,
  SwitchWindowResponse
} from '@/types/message';
import '@xterm/xterm/css/xterm.css';

// Dynamic import for browser-only libraries
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import Convert from 'ansi-to-html';

export default function TerminalPage() {
  const router = useRouter();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const outputIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastOutputRef = useRef<string>(''); // Track last output for diff
  const isMobileRef = useRef<boolean>(false); // Ref for mobile detection (for closures)
  const scrollbackLinesRef = useRef<number>(50); // Ref for scrollback lines (for closures)
  const activeWindowIndexRef = useRef<number>(0); // Ref for active window index (for closures)
  const mobileTerminalRef = useRef<HTMLDivElement>(null); // Ref for mobile terminal container

  const [ws, setWs] = useState<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [windows, setWindows] = useState<Window[]>([]);
  const [activeWindowIndex, setActiveWindowIndex] = useState<number>(0);
  const [error, setError] = useState('');
  const [command, setCommand] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark'); // Theme state
  const [settingsOpen, setSettingsOpen] = useState(false); // Settings modal state
  const [currentWsUrl, setCurrentWsUrl] = useState(''); // Current WebSocket URL
  const [savedServers, setSavedServers] = useState<Array<{name: string, url: string}>>([]);
  const [isMobile, setIsMobile] = useState(false); // Mobile detection
  const [mounted, setMounted] = useState(false); // Track if component is mounted (for hydration)
  const [terminalOutput, setTerminalOutput] = useState(''); // For mobile simple view
  const [headerVisible, setHeaderVisible] = useState(true); // Header visibility for mobile - default visible
  const [wrapMode, setWrapMode] = useState<'wrap' | 'nowrap'>('nowrap'); // Mobile line wrapping
  const lastScrollYRef = useRef<number>(0); // Track last scroll position
  const scrollDirectionRef = useRef<'up' | 'down'>('down'); // Track scroll direction
  const [fontSize, setFontSize] = useState(13); // Terminal font size (default 13px for desktop, will be adjusted for mobile)
  const [scrollbackLines, setScrollbackLines] = useState(100); // Terminal scrollback buffer size (Short mode default)

  // Mobile keyboard button states
  const [inputMode, setInputMode] = useState<'disabled' | 'active' | 'quickkeys'>('disabled');
  const [keyboardPosition, setKeyboardPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const keyboardLongPressRef = useRef<NodeJS.Timeout | null>(null);

  // Long press state for mobile session deletion
  const [longPressSessionId, setLongPressSessionId] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track renamed session to update selectedSession after LIST_SESSIONS_RESPONSE
  const renamedSessionRef = useRef<{ oldName: string; newName: string } | null>(null);

  // Remove separator lines (lines that are mostly dashes, equals, underscores, etc.)
  const removeSeparatorLines = (text: string): string => {
    return text.split('\n').filter(line => {
      // Strip ANSI codes for pattern matching
      const stripped = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
      // Check if line is a separator (mostly repeating characters like -, =, _, ~, etc.)
      const isSeparator = stripped.length >= 3 && /^[-─═=_~·•*#+]+$/.test(stripped);
      return !isSeparator;
    }).join('\n');
  };

  // Theme definitions - Minimal Gray Theme
  const themes = {
    dark: {
      terminal: {
        background: '#0f0f0f',
        foreground: '#d4d4d4',
        cursor: '#a8a8a8',
        cursorAccent: '#0f0f0f',
        selectionBackground: '#404040',
        black: '#404040',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#d4d4d4',
        brightBlack: '#737373',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#e9d5ff',
        brightCyan: '#67e8f9',
        brightWhite: '#f5f5f5',
      },
      bg: 'bg-neutral-950',
      text: 'text-neutral-200',
      header: 'bg-neutral-900/95 backdrop-blur-lg',
      sidebar: 'bg-neutral-900/90 backdrop-blur-xl',
      border: 'border-neutral-800',
      input: 'bg-neutral-800/90',
      button: 'bg-neutral-700 hover:bg-neutral-600',
    },
    light: {
      terminal: {
        background: '#ffffff',
        foreground: '#1e293b',
        cursor: '#2563eb',
        cursorAccent: '#ffffff',
        selectionBackground: '#dbeafe',
        black: '#1e293b',
        red: '#dc2626',
        green: '#059669',
        yellow: '#d97706',
        blue: '#2563eb',
        magenta: '#7c3aed',
        cyan: '#0891b2',
        white: '#64748b',
        brightBlack: '#475569',
        brightRed: '#b91c1c',
        brightGreen: '#047857',
        brightYellow: '#b45309',
        brightBlue: '#1d4ed8',
        brightMagenta: '#6d28d9',
        brightCyan: '#0e7490',
        brightWhite: '#94a3b8',
      },
      bg: 'bg-slate-50',
      text: 'text-slate-900',
      header: 'bg-white/95 backdrop-blur-lg',
      sidebar: 'bg-white/80 backdrop-blur-xl',
      border: 'border-slate-200',
      input: 'bg-slate-100',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
  };

  // Detect mobile device and load settings
  useEffect(() => {
    // Mark component as mounted (for hydration)
    setMounted(true);

    // Detect mobile
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      isMobileRef.current = mobile; // Also update ref for closures

    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const savedTheme = localStorage.getItem('handx_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }

    // Load saved font size
    const savedFontSize = localStorage.getItem('handx_font_size');
    if (savedFontSize) {
      const size = parseInt(savedFontSize, 10);
      if (size >= 8 && size <= 24) {
        setFontSize(size);
      }
    }

    // Load saved scrollback lines
    const savedScrollback = localStorage.getItem('handx_scrollback_lines');
    if (savedScrollback) {
      const lines = parseInt(savedScrollback, 10);
      // Valid values: 100 (Short), 500 (Medium), 5000 (Full)
      if (lines === 100 || lines === 500 || lines === 5000) {
        setScrollbackLines(lines);
        scrollbackLinesRef.current = lines;
      }
    }

    // Load saved wrap mode (default to 'nowrap')
    const savedWrapMode = localStorage.getItem('handx_wrap_mode');
    if (savedWrapMode === 'wrap' || savedWrapMode === 'nowrap') {
      setWrapMode(savedWrapMode);
    } else {
      // Ensure default is 'nowrap' and save it
      setWrapMode('nowrap');
      localStorage.setItem('handx_wrap_mode', 'nowrap');
    }

    // Load saved servers
    const savedServersStr = localStorage.getItem('handx_saved_servers');
    if (savedServersStr) {
      try {
        setSavedServers(JSON.parse(savedServersStr));
      } catch {
        // Silently ignore parse errors
      }
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Auto hide/show header on scroll (mobile only)
  useEffect(() => {
    if (!isMobile || !mounted) return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollYRef.current;

      // Always show header when at top of page
      if (currentScrollY < 10) {
        setHeaderVisible(true);
        lastScrollYRef.current = currentScrollY;
        return;
      }

      // Smaller threshold for faster response
      const SCROLL_THRESHOLD = 3;

      if (Math.abs(scrollDelta) > SCROLL_THRESHOLD) {
        if (scrollDelta > 0) {
          // Scrolling down - hide header
          setHeaderVisible(false);
          scrollDirectionRef.current = 'down';
        } else {
          // Scrolling up - show header
          setHeaderVisible(true);
          scrollDirectionRef.current = 'up';
        }
        lastScrollYRef.current = currentScrollY;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isMobile, mounted, selectedSession]);

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('handx_theme', newTheme);

    // Update terminal theme if exists
    if (xtermRef.current) {
      xtermRef.current.options.theme = themes[newTheme].terminal;
    }
  };

  // Adjust font size
  const adjustFontSize = (delta: number) => {
    const newSize = Math.min(24, Math.max(8, fontSize + delta));
    setFontSize(newSize);
    localStorage.setItem('handx_font_size', newSize.toString());

    // Update xterm.js font size if exists
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = newSize;
      // Re-fit terminal after font size change
      if (fitAddonRef.current) {
        setTimeout(() => {
          fitAddonRef.current?.fit();
        }, 50);
      }
    }
  };

  // Scrollback modes: Short / Medium / Full
  const scrollbackModes = [
    { name: 'Short', lines: 100 },
    { name: 'Medium', lines: 500 },
    { name: 'Full', lines: 5000 },
  ];
  const cycleScrollback = () => {
    const currentIndex = scrollbackModes.findIndex(m => m.lines === scrollbackLines);
    const nextIndex = (currentIndex + 1) % scrollbackModes.length;
    const newValue = scrollbackModes[nextIndex].lines;
    setScrollbackLines(newValue);
    scrollbackLinesRef.current = newValue; // Update ref for closures
    localStorage.setItem('handx_scrollback_lines', newValue.toString());
    if (xtermRef.current) {
      xtermRef.current.options.scrollback = newValue;
    }

    // Immediately re-fetch output with new scrollback setting
    if (ws && selectedSession && ws.isConnected) {
      // Clear current output to avoid showing stale data
      if (isMobileRef.current) {
        setTerminalOutput('');
      } else if (xtermRef.current) {
        xtermRef.current.clear();
      }
      lastOutputRef.current = '';

      // Request fresh output with new line limit
      ws.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex });
    }
  };
  const getScrollbackModeName = () => {
    return scrollbackModes.find(m => m.lines === scrollbackLines)?.name || 'Short';
  };

  // Initialize xterm.js (desktop only)
  useEffect(() => {
    // Skip xterm.js initialization on mobile
    if (isMobile) return;
    if (!terminalRef.current) return;

    let terminal: Terminal;
    let fitAddon: FitAddon;

    // Dynamically import xterm.js to avoid SSR issues
    (async () => {
      const { Terminal: XTerm } = await import('@xterm/xterm');
      const { FitAddon: XTermFitAddon } = await import('@xterm/addon-fit');

      terminal = new XTerm({
        cursorBlink: true,
        fontSize: fontSize,
        lineHeight: 1.4,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontWeight: '400',
        fontWeightBold: '700',
        letterSpacing: 0,
        scrollback: scrollbackLines,
        theme: themes[theme].terminal,
        cursorStyle: 'block',
        cursorWidth: 1,
        allowProposedApi: true,
        convertEol: true,
        scrollOnUserInput: true,
        fastScrollModifier: 'alt',
      });

      fitAddon = new XTermFitAddon();
      terminal.loadAddon(fitAddon);

      if (terminalRef.current) {
        terminal.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = terminal;
        fitAddonRef.current = fitAddon;

        // Enable clipboard support - copy selected text on right-click
        terminal.attachCustomKeyEventHandler((event) => {
          // Ctrl+C: Copy selected text
          if (event.ctrlKey && event.key === 'c' && terminal.hasSelection()) {
            const selection = terminal.getSelection();
            navigator.clipboard.writeText(selection);
            return false;
          }
          return true;
        });

        // Add right-click context menu for copy
        terminalRef.current.addEventListener('contextmenu', (e) => {
          if (terminal.hasSelection()) {
            e.preventDefault();
            const selection = terminal.getSelection();
            navigator.clipboard.writeText(selection);
            // Show a brief visual feedback
            const originalBackground = terminalRef.current!.style.backgroundColor;
            terminalRef.current!.style.backgroundColor = '#2d4a5a';
            setTimeout(() => {
              if (terminalRef.current) {
                terminalRef.current.style.backgroundColor = originalBackground;
              }
            }, 100);
          }
        });

        // Handle window resize
        const handleResize = () => {
          setTimeout(() => {
            fitAddon.fit();
          }, 100);
        };
        window.addEventListener('resize', handleResize);

        // Initial fit after a short delay to ensure container is ready
        setTimeout(() => {
          fitAddon.fit();
        }, 100);

        // Re-fit on orientation change (mobile)
        window.addEventListener('orientationchange', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('orientationchange', handleResize);
          terminal.dispose();
        };
      }
    })();

    return () => {
      if (terminal) {
        terminal.dispose();
      }
    };
  }, [isMobile, theme]);

  // Initialize WebSocket
  useEffect(() => {
    // Always use the same hostname as the web page, connect to port 8080
    const hostname = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${hostname}:8080/ws`;

    const client = new WebSocketClient(wsUrl);

    // Handle connect acknowledgment
    client.on(MessageType.CONNECT_ACK, (message) => {
      const payload = message.payload as ConnectAckPayload;
      if (payload.success) {
        console.log('Connected to server:', payload.server_version);
        setConnected(true);
        setError('');
        // Request session list
        client.send(MessageType.LIST_SESSIONS, {});
      } else {
        setError('Connection failed');
      }
    });

    // Handle session list response
    client.on(MessageType.LIST_SESSIONS_RESPONSE, (message) => {
      const payload = message.payload as ListSessionsResponse;
      console.log('Received sessions:', payload.sessions);
      setSessions(payload.sessions);

      // Check for pre-selected session from home page
      const preSelectedSession = localStorage.getItem('handx_selected_session');
      if (preSelectedSession) {
        localStorage.removeItem('handx_selected_session'); // Clear it after use
        const session = payload.sessions.find(s => s.name === preSelectedSession);
        if (session) {
          // Auto-select the session and set windows
          setSelectedSession(session);
          setWindows(session.windows || []);
          const activeWin = session.windows?.find(w => w.active);
          const winIndex = activeWin?.index || 0;
          setActiveWindowIndex(winIndex);
          activeWindowIndexRef.current = winIndex;
          // Request fresh windows list
          client.send(MessageType.LIST_WINDOWS, { session_name: session.name });
        }
      }

      // Update selectedSession if it was renamed
      if (renamedSessionRef.current) {
        const { oldName, newName } = renamedSessionRef.current;
        setSelectedSession(prev => {
          if (prev && prev.name === oldName) {
            // Find session with new name
            const updated = payload.sessions.find(s => s.name === newName);
            return updated || null;
          }
          return prev;
        });
        renamedSessionRef.current = null;
      }
    });

    // Handle create session response
    client.on(MessageType.CREATE_SESSION_RESPONSE, (message) => {
      const payload = message.payload as CreateSessionResponse;
      if (payload.success && payload.session) {
        if (xtermRef.current) {
          xtermRef.current.writeln(`\x1b[1;32m✓ Session created: ${payload.session.name}\x1b[0m`);
          xtermRef.current.writeln('');
        }
        // Refresh sessions
        client.send(MessageType.LIST_SESSIONS, {});
      }
    });

    // Handle execute command response
    client.on(MessageType.EXECUTE_COMMAND_RESPONSE, (message) => {
      const payload = message.payload as ExecuteCommandResponse;
      if (payload.success) {
        if (xtermRef.current) {
          xtermRef.current.writeln(`\x1b[90m⌨ Command sent to ${payload.session_name}\x1b[0m`);
        }
      }
    });

    // Handle capture output response
    client.on(MessageType.CAPTURE_OUTPUT_RESPONSE, (message) => {
      const payload = message.payload as CaptureOutputResponse;

      if (payload.output) {
        // Only update if output has changed (diff optimization)
        if (payload.output !== lastOutputRef.current) {
          let output = payload.output;

          // Limit output based on scrollbackLines setting (always apply the limit)
          if (scrollbackLinesRef.current > 0) {
            const lines = output.split('\n');
            if (lines.length > scrollbackLinesRef.current) {
              output = lines.slice(-scrollbackLinesRef.current).join('\n');
            }
          }

          if (isMobileRef.current) {
            // For mobile: update state
            setTerminalOutput(output);
          } else if (xtermRef.current) {
            // For desktop: update xterm.js
            xtermRef.current.clear();
            xtermRef.current.write(output);
          }
          // Update last output
          lastOutputRef.current = payload.output;
        }
      }
    });

    // Handle delete session response
    client.on(MessageType.DELETE_SESSION_RESPONSE, (message) => {
      if (message.payload.success) {
        if (xtermRef.current) {
          xtermRef.current.writeln(`\x1b[1;33m✓ Session deleted: ${message.payload.session_name}\x1b[0m`);
          xtermRef.current.writeln('');
        }
        // Clear selected session if it was deleted
        if (selectedSession && selectedSession.name === message.payload.session_name) {
          setSelectedSession(null);
          stopOutputCapture();
        }
        // Refresh sessions
        client.send(MessageType.LIST_SESSIONS, {});
      }
    });

    // Handle rename session response
    client.on(MessageType.RENAME_SESSION_RESPONSE, (message) => {
      const payload = message.payload as RenameSessionResponse;
      if (payload.success) {
        if (xtermRef.current) {
          xtermRef.current.writeln(`\x1b[1;32m✓ Session renamed: ${payload.old_name} → ${payload.new_name}\x1b[0m`);
          xtermRef.current.writeln('');
        }
        // Immediately update selectedSession name to prevent "session not found" errors
        // during output capture (which uses selectedSession.name)
        setSelectedSession(prev => {
          if (prev && prev.name === payload.old_name) {
            return {
              ...prev,
              id: `session-${payload.new_name}`, // ID is based on name
              name: payload.new_name,
            };
          }
          return prev;
        });
        // Refresh sessions to get full updated list
        client.send(MessageType.LIST_SESSIONS, {});
      }
    });

    // Handle list windows response
    client.on(MessageType.LIST_WINDOWS_RESPONSE, (message) => {
      const payload = message.payload as ListWindowsResponse;
      console.log('Received windows:', payload.windows);
      setWindows(payload.windows);
      // Find active window index
      const activeWin = payload.windows.find(w => w.active);
      if (activeWin) {
        setActiveWindowIndex(activeWin.index);
        activeWindowIndexRef.current = activeWin.index;
      }
    });

    // Handle switch window response
    client.on(MessageType.SWITCH_WINDOW_RESPONSE, (message) => {
      const payload = message.payload as SwitchWindowResponse;
      if (payload.success) {
        setActiveWindowIndex(payload.window_index);
        activeWindowIndexRef.current = payload.window_index;
        // Clear terminal and reset output when switching windows
        if (isMobileRef.current) {
          setTerminalOutput('');
        } else if (xtermRef.current) {
          xtermRef.current.clear();
        }
        lastOutputRef.current = '';
        // Refresh window list
        client.send(MessageType.LIST_WINDOWS, { session_name: payload.session_name });
        // Immediately capture output from the new window
        client.send(MessageType.CAPTURE_OUTPUT, {
          session_name: payload.session_name,
          window_index: payload.window_index
        });
      }
    });

    // Handle errors
    client.on(MessageType.ERROR, (message) => {
      const errorMsg = message.payload?.message || 'An error occurred';
      console.warn('Server error:', message.payload);
      setError(errorMsg);
      if (xtermRef.current) {
        xtermRef.current.writeln(`\x1b[1;31m✗ Error: ${errorMsg}\x1b[0m`);
        xtermRef.current.writeln('');
      }
    });

    // Connect
    client.connect().catch(() => {
      // Silently handle connection errors - user will see error state in UI
      setError('Failed to connect to server');
    });

    setWs(client);

    // Cleanup
    return () => {
      stopOutputCapture();
      client.disconnect();
    };
  }, [router]);

  // Start/stop output capture
  const startOutputCapture = (sessionName: string) => {
    if (!ws) return;

    // Stop existing interval
    stopOutputCapture();

    // Reset last output when switching sessions (for diff optimization)
    lastOutputRef.current = '';

    // Start new interval to capture output every 1 second
    outputIntervalRef.current = setInterval(() => {
      ws.send(MessageType.CAPTURE_OUTPUT, { session_name: sessionName, window_index: activeWindowIndexRef.current });
    }, 1000);

    // Capture immediately
    ws.send(MessageType.CAPTURE_OUTPUT, { session_name: sessionName, window_index: activeWindowIndexRef.current });
  };

  const stopOutputCapture = () => {
    if (outputIntervalRef.current) {
      clearInterval(outputIntervalRef.current);
      outputIntervalRef.current = null;
    }
  };

  // Auto-start output capture when selectedSession changes (for pre-selected sessions from home page)
  useEffect(() => {
    if (ws && selectedSession && ws.isConnected) {
      startOutputCapture(selectedSession.name);
    }
    return () => {
      stopOutputCapture();
    };
  }, [selectedSession, ws]);

  // Handle session selection
  const handleSelectSession = (session: Session) => {
    setSelectedSession(session);
    // Clear terminal when switching sessions
    if (isMobileRef.current) {
      setTerminalOutput('');
    } else if (xtermRef.current) {
      xtermRef.current.clear();
    }
    // Reset last output for diff optimization
    lastOutputRef.current = '';
    // Reset windows
    setWindows(session.windows || []);
    const activeWin = session.windows?.find(w => w.active);
    const winIndex = activeWin?.index || 0;
    setActiveWindowIndex(winIndex);
    activeWindowIndexRef.current = winIndex;
    // Request fresh windows list
    if (ws) {
      ws.send(MessageType.LIST_WINDOWS, { session_name: session.name });
    }
    // Output capture is now handled by useEffect that watches selectedSession
    // Close sidebar on mobile after selection
    setSidebarOpen(false);
  };

  // Handle window switching
  const handleSwitchWindow = (windowIndex: number) => {
    if (!ws || !selectedSession) return;
    ws.send(MessageType.SWITCH_WINDOW, {
      session_name: selectedSession.name,
      window_index: windowIndex,
    });
  };

  const handleCreateSession = () => {
    if (ws && connected) {
      const sessionName = prompt('Enter session name:');
      if (sessionName) {
        ws.send(MessageType.CREATE_SESSION, { name: sessionName });
      }
    }
  };

  const handleDeleteSession = (session: Session) => {
    if (ws && connected) {
      // Check if trying to delete the currently selected session
      if (selectedSession?.id === session.id) {
        const confirmed = confirm(`"${session.name}" is currently active. Delete and exit this session?`);
        if (confirmed) {
          // Clear selected session first to stop output capture
          setSelectedSession(null);
          stopOutputCapture();
          // Clear terminal output
          if (isMobileRef.current) {
            setTerminalOutput('');
          } else if (xtermRef.current) {
            xtermRef.current.clear();
          }
          // Then delete the session
          ws.send(MessageType.DELETE_SESSION, { session_name: session.name } as DeleteSessionPayload);
        }
      } else {
        const confirmed = confirm(`Delete session "${session.name}"?`);
        if (confirmed) {
          ws.send(MessageType.DELETE_SESSION, { session_name: session.name } as DeleteSessionPayload);
        }
      }
    }
    // Reset long press state
    setLongPressSessionId(null);
  };

  const handleRenameSession = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    if (ws && connected) {
      const newName = prompt(`Rename session "${session.name}" to:`, session.name);
      if (newName && newName !== session.name) {
        ws.send(MessageType.RENAME_SESSION, { old_name: session.name, new_name: newName } as RenameSessionPayload);
        // If renaming current session, update selectedSession after rename completes
        if (selectedSession?.id === session.id) {
          // The session list will refresh and we need to update selectedSession
          // This will be handled when LIST_SESSIONS_RESPONSE comes back
        }
      }
    }
    // Reset long press state
    setLongPressSessionId(null);
  };

  // Long press handlers for mobile
  const handleSessionTouchStart = (session: Session) => {
    if (!isMobile) return;
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

  const handleSendCommand = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ws || !selectedSession || !command.trim()) return;

    const cmd = command.trim();

    ws.send(MessageType.EXECUTE_COMMAND, {
      session_name: selectedSession.name,
      command: cmd,
      window_index: activeWindowIndex,
    });

    // Show command in terminal (desktop)
    if (xtermRef.current) {
      xtermRef.current.writeln(`\x1b[1;33m⌨ ${cmd}\x1b[0m`);
    }

    // Show command in mobile terminal
    if (isMobileRef.current) {
      setTerminalOutput((prev) => prev + `\n$ ${cmd}\n`);
    }

    setCommand('');

    // Capture output after a short delay
    setTimeout(() => {
      if (ws && selectedSession) {
        ws.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex });
      }
    }, 300);
  };

  // Handle Enter key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  };

  // Dragging handlers for keyboard button
  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragOffset({
      x: window.innerWidth - keyboardPosition.x - clientX,
      y: window.innerHeight - keyboardPosition.y - clientY,
    });
  };

  const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const newX = window.innerWidth - clientX - dragOffset.x;
    const newY = window.innerHeight - clientY - dragOffset.y;
    setKeyboardPosition({
      x: Math.max(10, Math.min(window.innerWidth - 60, newX)),
      y: Math.max(60, Math.min(window.innerHeight - 60, newY)),
    });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDisconnect = () => {
    if (ws) {
      ws.disconnect();
    }
    stopOutputCapture();
    localStorage.removeItem('handx_ws_url');
    router.push('/');
  };

  // Prevent hydration mismatch by showing loading state until mounted
  if (!mounted) {
    return (
      <div className="min-h-screen bg-neutral-950 text-gray-100 flex items-center justify-center">
        <div className="text-neutral-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className={`${isMobile ? 'min-h-screen' : 'min-h-screen flex flex-col'} ${themes[theme].bg} ${themes[theme].text} touch-pan-y overscroll-none`}>
      {/* Header - Sticky on mobile, collapsible */}
      <div className={`sticky top-0 z-30 ${themes[theme].header} transition-all duration-300 ease-in-out relative ${
        isMobile && !headerVisible ? '-translate-y-full opacity-0' : 'translate-y-0 p-2 md:p-4 opacity-100'
      } ${!isMobile ? 'p-2 md:p-4' : ''}`}>
        {/* Subtle gradient border bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-neutral-700/50 to-transparent" />
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4">
            {/* Hamburger menu - mobile only */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`md:hidden p-2 hover:${themes[theme].bg} active:bg-opacity-50 rounded transition touch-manipulation select-none`}
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {/* Logo - Hand of the King: Artistic Badge Design */}
            <div
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push('/')}
            >
              <svg className="w-6 h-6 md:w-7 md:h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                {/* Shield/Badge background */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2L4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5l-8-3z" fill="url(#handGradient)" fillOpacity="0.1" />

                {/* Crown symbol at top */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 8l1 1 1.5-2 1.5 2 1.5-2 1.5 2 1-1v2H8V8z" fill="currentColor" fillOpacity="0.2" />

                {/* Abstract hand gesture - three fingers up */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 12v4M12 11v5M14 12v4" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.5 16h5c.5 0 .5.5.5 1s0 1-.5 1h-5c-.5 0-.5-.5-.5-1s0-1 .5-1z" fill="currentColor" fillOpacity="0.15" />

                {/* Gradient definition */}
                <defs>
                  <linearGradient id="handGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgb(115, 115, 115)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="rgb(163, 163, 163)" stopOpacity="0.2" />
                  </linearGradient>
                </defs>
              </svg>
              <h1 className={`text-lg md:text-xl font-bold ${theme === 'dark' ? 'text-neutral-100' : 'text-neutral-600'}`}>HandX</h1>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {selectedSession && (
              <div className={`hidden lg:block text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Session: <span className={`${themes[theme].text} font-medium`}>{selectedSession.name}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Settings dropdown button */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSettingsOpen(!settingsOpen);
                }}
                className="p-2 rounded transition touch-manipulation select-none opacity-70 hover:opacity-100"
                aria-label="Settings"
                title="Settings"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* Settings Dropdown Menu */}
              {settingsOpen && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    className="fixed inset-0 z-[100]"
                    onClick={() => setSettingsOpen(false)}
                  />
                  <div className={`absolute right-0 top-full mt-2 w-56 rounded-xl shadow-2xl z-[101] overflow-hidden
                    origin-top-right
                    transition-all duration-200 ease-out
                    opacity-100 scale-100 translate-y-0
                    ${theme === 'dark' ? 'bg-neutral-900 border border-neutral-800' : 'bg-white border border-slate-200'}
                  `}>
                    {/* Settings Header */}
                    <div className={`px-3 py-2.5 border-b ${theme === 'dark' ? 'border-neutral-800' : 'border-slate-200'}`}>
                      <span className={`text-sm font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                        Settings
                      </span>
                    </div>

                    <div className="p-2.5 space-y-1.5">
                      {/* Theme Control */}
                      <button
                        onClick={toggleTheme}
                        className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors
                          ${theme === 'dark' ? 'hover:bg-neutral-800' : 'hover:bg-slate-100'}`}
                      >
                        <div className="flex items-center gap-2">
                          {theme === 'dark' ? (
                            <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                          )}
                          <span className={`text-sm ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'}`}>
                            Theme
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${theme === 'dark' ? 'bg-neutral-700 text-neutral-300' : 'bg-slate-200 text-neutral-700'}`}>
                          {theme === 'dark' ? 'Dark' : 'Light'}
                        </span>
                      </button>

                      {/* Font Size Control */}
                      <div>
                        <div className={`w-full flex items-center justify-between p-2 rounded-lg
                          ${theme === 'dark' ? 'bg-neutral-800/30' : 'bg-slate-50'}`}>
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
                            </svg>
                            <span className={`text-sm ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'}`}>
                              Font Size
                            </span>
                          </div>
                          <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${theme === 'dark' ? 'bg-neutral-700 text-neutral-300' : 'bg-slate-200 text-neutral-700'}`}>
                            {fontSize}px
                          </span>
                        </div>
                        {/* Adjustment buttons - indented */}
                        <div className="flex items-center gap-1.5 pl-7 pr-2 pb-1.5 pt-1.5">
                          <button
                            onClick={() => adjustFontSize(-1)}
                            disabled={fontSize <= 8}
                            className={`flex-1 py-1 rounded-md transition-all duration-150 touch-manipulation select-none
                              ${theme === 'dark' ? 'bg-neutral-700 hover:bg-neutral-600 active:bg-neutral-500' : 'bg-slate-200 hover:bg-slate-300 active:bg-slate-400'}
                              ${fontSize <= 8 ? 'opacity-30 cursor-not-allowed' : 'active:scale-95'}`}
                          >
                            <svg className={`w-3 h-3 mx-auto ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                          </button>
                          <div className={`flex-1 py-1 text-center font-mono text-xs rounded-md ${theme === 'dark' ? 'bg-neutral-800/50 text-neutral-400' : 'bg-slate-100 text-neutral-600'}`}>
                            {fontSize}
                          </div>
                          <button
                            onClick={() => adjustFontSize(1)}
                            disabled={fontSize >= 24}
                            className={`flex-1 py-1 rounded-md transition-all duration-150 touch-manipulation select-none
                              ${theme === 'dark' ? 'bg-neutral-700 hover:bg-neutral-600 active:bg-neutral-500' : 'bg-slate-200 hover:bg-slate-300 active:bg-slate-400'}
                              ${fontSize >= 24 ? 'opacity-30 cursor-not-allowed' : 'active:scale-95'}`}
                          >
                            <svg className={`w-3 h-3 mx-auto ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* History Control */}
                      <button
                        onClick={cycleScrollback}
                        className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors
                          ${theme === 'dark' ? 'hover:bg-neutral-800' : 'hover:bg-slate-100'}`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                          <span className={`text-sm ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'}`}>
                            History
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${theme === 'dark' ? 'bg-neutral-700 text-neutral-300' : 'bg-slate-200 text-neutral-700'}`}>
                          {getScrollbackModeName()}
                        </span>
                      </button>

                      {/* Wrap Control */}
                      <button
                        onClick={() => {
                          const newMode = wrapMode === 'wrap' ? 'nowrap' : 'wrap';
                          setWrapMode(newMode);
                          localStorage.setItem('handx_wrap_mode', newMode);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors
                          ${theme === 'dark' ? 'hover:bg-neutral-800' : 'hover:bg-slate-100'}`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10m-6 6h12" />
                          </svg>
                          <span className={`text-sm ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'}`}>
                            Line Wrap
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${theme === 'dark' ? 'bg-neutral-700 text-neutral-300' : 'bg-slate-200 text-neutral-700'}`}>
                          {wrapMode === 'wrap' ? 'On' : 'Off'}
                        </span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Hide disconnect button on mobile */}
            <button
              onClick={handleDisconnect}
              className="hidden md:block px-4 py-2 text-sm bg-red-600 hover:bg-red-700 active:bg-red-800 rounded transition touch-manipulation select-none"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900 border-b border-red-700 text-red-100 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <div className={`${isMobile ? 'flex' : 'flex-1 flex overflow-hidden'} relative`}>
        {/* Mobile Overlay - transparent */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 top-16 bg-transparent md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar - Sessions List */}
        <div className={`
          fixed md:relative top-0 md:top-auto bottom-0 left-0 z-20
          w-64 ${themes[theme].sidebar} flex flex-col
          pt-16 md:pt-0
          shadow-2xl md:shadow-none
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}>
          {/* Subtle gradient border right (desktop only) */}
          <div className="hidden md:block absolute top-0 bottom-0 right-0 w-[1px] bg-gradient-to-b from-transparent via-neutral-700/30 to-transparent" />

          {/* Top Section - Header & New Button */}
          <div className={`p-3 border-b ${theme === 'dark' ? 'border-neutral-800/50' : 'border-slate-200/50'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h2 className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                  Sessions
                </h2>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${theme === 'dark' ? 'bg-neutral-800 text-neutral-400' : 'bg-slate-200 text-neutral-600'}`}>
                {sessions.length}
              </span>
            </div>
            <button
              onClick={handleCreateSession}
              disabled={!connected}
              className={`w-full px-3 py-2 rounded-lg text-xs font-medium
                flex items-center justify-center gap-1.5
                transition-all duration-200 touch-manipulation select-none
                ${theme === 'dark'
                  ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-neutral-100'
                  : 'bg-slate-200 hover:bg-slate-300 text-neutral-700 hover:text-neutral-900'}
                ${theme === 'dark' ? 'disabled:bg-neutral-900' : 'disabled:bg-slate-100'}
                disabled:opacity-40 disabled:cursor-not-allowed
                active:scale-[0.98]`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </button>
          </div>

          {/* Middle Section - Session List */}
          <div className="flex-1 overflow-y-auto p-2">
            {sessions.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-8 ${theme === 'dark' ? 'text-neutral-600' : 'text-neutral-400'}`}>
                <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs">No sessions</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group relative rounded-xl p-2.5 cursor-pointer transition-all duration-200 ease-out touch-manipulation select-none ${
                      selectedSession?.id === session.id
                        ? theme === 'dark'
                          ? 'bg-neutral-700/80 shadow-lg shadow-neutral-900/30'
                          : 'bg-slate-300 shadow-lg shadow-slate-900/10'
                        : theme === 'dark'
                        ? 'hover:bg-neutral-800/80'
                        : 'hover:bg-slate-200'
                    } ${longPressSessionId === session.id ? 'ring-2 ring-blue-500/50' : ''}`}
                    onClick={() => {
                      if (longPressSessionId === session.id) {
                        setLongPressSessionId(null);
                      } else {
                        handleSelectSession(session);
                      }
                    }}
                    onTouchStart={() => handleSessionTouchStart(session)}
                    onTouchEnd={handleSessionTouchEnd}
                    onTouchMove={handleSessionTouchMove}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <h3 className={`font-medium text-sm truncate ${
                            selectedSession?.id === session.id
                              ? theme === 'dark' ? 'text-neutral-100' : 'text-neutral-900'
                              : theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'
                          }`}>
                            {session.name}
                          </h3>
                          {session.attached && (
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm shadow-green-500/50 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] flex items-center gap-0.5 ${
                            theme === 'dark' ? 'text-neutral-500' : 'text-neutral-500'
                          }`}>
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                            </svg>
                            {session.windows.length}
                          </span>
                          <span className={`text-[10px] ${theme === 'dark' ? 'text-neutral-600' : 'text-neutral-400'}`}>•</span>
                          <span className={`text-[10px] ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-500'}`}>
                            {session.attached ? 'Active' : 'Idle'}
                          </span>
                        </div>
                      </div>
                      {/* Desktop: Small action buttons on hover */}
                      <div className={`hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100`}>
                        <button
                          onClick={(e) => handleRenameSession(session, e)}
                          className={`p-1 rounded-md transition-all duration-200
                            hover:bg-blue-500/20 active:bg-blue-500/30
                            ${theme === 'dark' ? 'text-neutral-500 hover:text-blue-400' : 'text-neutral-400 hover:text-blue-500'}`}
                          title="Rename session"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(session);
                          }}
                          className={`p-1 rounded-md transition-all duration-200
                            hover:bg-red-500/20 active:bg-red-500/30
                            ${theme === 'dark' ? 'text-neutral-500 hover:text-red-400' : 'text-neutral-400 hover:text-red-500'}`}
                          title="Delete session"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Section - Action bar for long-pressed session OR Disconnect */}
          {isMobile && (
            <div className={`p-3 border-t ${theme === 'dark' ? 'border-neutral-800/50' : 'border-slate-200/50'}`}>
              {longPressSessionId ? (
                /* Long press action bar */
                <div className="space-y-2">
                  <p className={`text-center text-xs ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    {sessions.find(s => s.id === longPressSessionId)?.name}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        const session = sessions.find(s => s.id === longPressSessionId);
                        if (session) handleRenameSession(session, e);
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium
                        flex items-center justify-center gap-1.5
                        transition-all duration-200 touch-manipulation select-none
                        ${theme === 'dark' ? 'bg-neutral-700 text-neutral-200 active:bg-neutral-600' : 'bg-neutral-200 text-neutral-700 active:bg-neutral-300'}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Rename
                    </button>
                    <button
                      onClick={(e) => {
                        const session = sessions.find(s => s.id === longPressSessionId);
                        if (session) handleDeleteSession(session);
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium
                        flex items-center justify-center gap-1.5
                        transition-all duration-200 touch-manipulation select-none
                        ${theme === 'dark' ? 'bg-red-500/20 text-red-400 active:bg-red-500/30' : 'bg-red-50 text-red-600 active:bg-red-100'}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                  <button
                    onClick={() => setLongPressSessionId(null)}
                    className={`w-full py-1.5 text-xs
                      transition-all duration-200 touch-manipulation select-none
                      ${theme === 'dark' ? 'text-neutral-600 active:text-neutral-500' : 'text-neutral-400 active:text-neutral-500'}`}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                /* Normal disconnect button */
                <button
                  onClick={handleDisconnect}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-medium
                    flex items-center justify-center gap-1.5
                    transition-all duration-200 touch-manipulation select-none
                    bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400
                    active:scale-[0.98]`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Disconnect
                </button>
              )}
            </div>
          )}
        </div>

        {/* Main Terminal Area */}
        <div className={`${isMobile ? 'flex flex-col w-full' : 'flex-1 flex flex-col overflow-hidden'} ${themes[theme].bg} min-w-0`}>
          {/* Window Tabs - show when session has multiple windows */}
          {selectedSession && windows.length > 1 && (
            <div className={`flex items-center gap-1.5 px-2 md:px-3 py-2 overflow-x-auto scrollbar-hide ${theme === 'dark' ? 'bg-neutral-900/80' : 'bg-slate-100/80'} border-b ${theme === 'dark' ? 'border-neutral-800' : 'border-slate-200'}`}>
              <svg className={`w-4 h-4 flex-shrink-0 ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              {windows.map((win) => (
                <button
                  key={win.id}
                  onClick={() => handleSwitchWindow(win.index)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex-shrink-0 touch-manipulation select-none active:scale-95
                    ${activeWindowIndex === win.index
                      ? theme === 'dark'
                        ? 'bg-neutral-700 text-neutral-100 shadow-md'
                        : 'bg-white text-neutral-900 shadow-md'
                      : theme === 'dark'
                      ? 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80 active:bg-neutral-700'
                      : 'text-neutral-500 hover:text-neutral-700 hover:bg-slate-200 active:bg-slate-300'
                    }`}
                >
                  <span className={`mr-1 font-mono ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`}>{win.index}</span>
                  {win.name}
                </button>
              ))}
            </div>
          )}

          {/* Terminal Display */}
          <div className={`p-2 md:p-4 min-w-0 ${isMobile ? '' : 'flex-1 overflow-hidden'}`}>
            {isMobile ? (
              /* Mobile: Simple HTML view with inline input */
              <div
                ref={mobileTerminalRef}
                className={`w-full font-mono leading-tight ${wrapMode === 'nowrap' ? 'overflow-x-auto' : ''}`}
                style={{
                  backgroundColor: themes[theme].terminal.background,
                  color: themes[theme].terminal.foreground,
                  fontSize: `${fontSize}px`,
                  minHeight: '100vh',
                  paddingBottom: '100px',
                }}
              >
                {/* Terminal content */}
                <div
                  style={{
                    whiteSpace: wrapMode === 'wrap' ? 'pre-wrap' : 'pre',
                    wordBreak: wrapMode === 'wrap' ? 'break-word' : 'keep-all',
                    overflowWrap: wrapMode === 'wrap' ? 'anywhere' : 'normal',
                    padding: '4px 8px',
                  }}
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      const convert = new Convert({
                        fg: themes[theme].terminal.foreground,
                        bg: themes[theme].terminal.background,
                        newline: true,
                        escapeXML: true,
                        stream: false,
                      });
                      // Remove separator lines when wrap mode is on
                      const output = wrapMode === 'wrap'
                        ? removeSeparatorLines(terminalOutput || '')
                        : (terminalOutput || '');
                      return convert.toHtml(output);
                    })(),
                  }}
                />

                {/* Mobile: Inline input box when active */}
                {inputMode === 'active' && selectedSession && !sidebarOpen && (
                  <div className="px-2 pb-2">
                    {/* Input field */}
                    <div className={`rounded-full px-1 py-1 ${theme === 'dark' ? 'bg-neutral-800/90' : 'bg-white/90'} backdrop-blur-xl shadow-lg border ${theme === 'dark' ? 'border-neutral-700/50' : 'border-neutral-200'}`}>
                      <form onSubmit={handleSendCommand} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={command}
                          onChange={(e) => setCommand(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={() => {
                            setTimeout(() => {
                              setInputMode('disabled');
                            }, 150);
                          }}
                          placeholder="Enter command..."
                          style={{ fontSize: '16px' }}
                          className={`flex-1 px-4 py-2
                            bg-transparent
                            ${themes[theme].text}
                            ${theme === 'dark' ? 'placeholder-neutral-500' : 'placeholder-neutral-400'}
                            outline-none
                            touch-manipulation
                            font-sans text-base`}
                          autoComplete="off"
                          autoFocus
                        />
                        <button
                          type={command.trim() ? 'submit' : 'button'}
                          onClick={() => {
                            if (!command.trim()) {
                              setInputMode('disabled');
                            }
                          }}
                          className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center
                            transition-all duration-200 touch-manipulation
                            ${command.trim()
                              ? theme === 'dark' ? 'bg-neutral-600 text-neutral-200' : 'bg-neutral-500 text-white'
                              : theme === 'dark' ? 'bg-neutral-700/50 text-neutral-400' : 'bg-neutral-200 text-neutral-500'
                            }
                            active:scale-90`}
                          aria-label={command.trim() ? 'Send' : 'Close'}
                        >
                          {command.trim() ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Desktop: xterm.js */
              <div
                ref={terminalRef}
                className="h-full w-full rounded-lg"
                style={{ backgroundColor: themes[theme].terminal.background }}
              />
            )}
          </div>

          {/* Desktop spacer */}
          {selectedSession && !sidebarOpen && !isMobile && <div className="h-24"></div>}

          {/* Mobile: Draggable keyboard button - only in disabled mode */}
          {isMobile && selectedSession && !sidebarOpen && inputMode === 'disabled' && (
            <div
              className="fixed z-20 touch-none select-none"
              style={{
                right: `${keyboardPosition.x}px`,
                bottom: `${keyboardPosition.y}px`,
              }}
              onTouchStart={(e) => {
                handleDragStart(e);
                // Start long press timer
                keyboardLongPressRef.current = setTimeout(() => {
                  if (!isDragging) {
                    setInputMode('quickkeys');
                  }
                }, 400);
              }}
              onTouchMove={(e) => {
                handleDragMove(e);
                // Cancel long press if dragging
                if (keyboardLongPressRef.current) {
                  clearTimeout(keyboardLongPressRef.current);
                  keyboardLongPressRef.current = null;
                }
              }}
              onTouchEnd={() => {
                handleDragEnd();
                // Cancel long press timer
                if (keyboardLongPressRef.current) {
                  clearTimeout(keyboardLongPressRef.current);
                  keyboardLongPressRef.current = null;
                }
              }}
            >
              <button
                onClick={() => {
                  if (!isDragging && inputMode === 'disabled') {
                    setInputMode('active');
                  }
                }}
                disabled={!connected}
                className={`group relative w-11 h-11 flex items-center justify-center
                  transition-all duration-300 ease-out
                  touch-manipulation rounded-2xl
                  backdrop-blur-xl
                  ${theme === 'dark'
                    ? 'bg-white/15 border border-white/25 shadow-[0_4px_16px_rgba(0,0,0,0.15)]'
                    : 'bg-black/10 border border-black/10 shadow-[0_4px_16px_rgba(0,0,0,0.1)]'}
                  ${isDragging ? 'scale-110' : 'scale-100'}
                  disabled:opacity-30 disabled:cursor-not-allowed
                  active:scale-95 active:bg-white/25`}
                aria-label="Open keyboard"
              >
                <svg className={`w-5 h-5 transition-all duration-300
                  ${theme === 'dark' ? 'text-white/80' : 'text-black/60'}
                  group-active:scale-95`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}
                >
                  <rect x="3" y="7" width="18" height="11" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path strokeLinecap="round" d="M7 11h.01M12 11h.01M17 11h.01M8 14h8" />
                </svg>
              </button>
            </div>
          )}

          {/* Mobile: Quick keys mode - floating buttons */}
          {isMobile && selectedSession && !sidebarOpen && inputMode === 'quickkeys' && (
            <div
              className="fixed z-20"
              style={{
                right: `${keyboardPosition.x}px`,
                bottom: `${keyboardPosition.y}px`,
              }}
            >
              <div className={`flex items-center gap-1.5 p-2 rounded-2xl shadow-xl backdrop-blur-md
                ${theme === 'dark' ? 'bg-neutral-800/95' : 'bg-white/95'}
                border ${theme === 'dark' ? 'border-neutral-700/50' : 'border-neutral-200'}`}
              >
                {/* Esc - leftmost */}
                <button
                  onClick={() => {
                    if (ws && selectedSession) {
                      // Send Escape key
                      ws.send(MessageType.EXECUTE_COMMAND, {
                        session_name: selectedSession.name,
                        command: 'Escape',
                        window_index: activeWindowIndex,
                      });

                      // Show command in mobile terminal
                      setTerminalOutput((prev) => prev + `$ [ESC]\n`);

                      // Capture output after delay
                      setTimeout(() => {
                        if (ws && selectedSession) {
                          ws.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex });
                        }
                      }, 100);

                      // Close quick keys panel after a brief delay to show feedback
                      setTimeout(() => {
                        setInputMode('disabled');
                      }, 100);
                    }
                  }}
                  className={`px-2.5 h-10 rounded-xl font-mono text-xs font-bold
                    transition-all duration-150 touch-manipulation select-none active:scale-90
                    ${theme === 'dark'
                      ? 'bg-neutral-600 text-neutral-300 active:bg-neutral-500'
                      : 'bg-neutral-300 text-neutral-600 active:bg-neutral-400'
                    }`}
                >
                  Esc
                </button>
                {/* 1, 2, 3 */}
                {['1', '2', '3'].map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (ws && selectedSession) {
                        // Send command
                        ws.send(MessageType.EXECUTE_COMMAND, {
                          session_name: selectedSession.name,
                          command: key,
                          window_index: activeWindowIndex,
                        });

                        // Show command in mobile terminal
                        setTerminalOutput((prev) => prev + `$ ${key}\n`);

                        // Capture output after delay
                        setTimeout(() => {
                          if (ws && selectedSession) {
                            ws.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex });
                          }
                        }, 100);

                        // Close quick keys panel after a brief delay to show feedback
                        setTimeout(() => {
                          setInputMode('disabled');
                        }, 100);
                      }
                    }}
                    className={`w-10 h-10 rounded-xl font-mono font-bold text-base
                      transition-all duration-150 touch-manipulation select-none active:scale-90
                      ${theme === 'dark'
                        ? 'bg-neutral-700 text-neutral-200 active:bg-neutral-600'
                        : 'bg-neutral-200 text-neutral-700 active:bg-neutral-300'
                      }`}
                  >
                    {key}
                  </button>
                ))}
                {/* Enter - rightmost */}
                <button
                  onClick={() => {
                    if (ws && selectedSession) {
                      // Send Enter key
                      ws.send(MessageType.EXECUTE_COMMAND, {
                        session_name: selectedSession.name,
                        command: 'Enter',
                        window_index: activeWindowIndex,
                      });

                      // Show command in mobile terminal
                      setTerminalOutput((prev) => prev + `$ [Enter]\n`);

                      // Capture output after delay
                      setTimeout(() => {
                        if (ws && selectedSession) {
                          ws.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex });
                        }
                      }, 100);

                      // Close quick keys panel after a brief delay to show feedback
                      setTimeout(() => {
                        setInputMode('disabled');
                      }, 100);
                    }
                  }}
                  className={`w-10 h-10 rounded-xl font-mono text-lg font-bold
                    transition-all duration-150 touch-manipulation select-none active:scale-90
                    ${theme === 'dark'
                      ? 'bg-neutral-700 text-neutral-200 active:bg-neutral-600'
                      : 'bg-neutral-200 text-neutral-700 active:bg-neutral-300'
                    }`}
                >
                  ↵
                </button>
                {/* Close button */}
                <button
                  onClick={() => setInputMode('disabled')}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center
                    transition-all duration-150 touch-manipulation select-none active:scale-90
                    ${theme === 'dark'
                      ? 'bg-neutral-900/50 text-neutral-500 active:bg-neutral-800'
                      : 'bg-neutral-100 text-neutral-400 active:bg-neutral-200'
                    }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Desktop: Always show input at bottom */}
          {!isMobile && selectedSession && !sidebarOpen && (
            <div className="fixed bottom-0 left-0 right-0 z-10 p-4 backdrop-blur-md bg-transparent">
              <form onSubmit={handleSendCommand} className="w-full min-w-0 max-w-3xl mx-auto">
                <div className="relative flex items-center group">
                  {/* Gradient border effect */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-neutral-600/20 via-neutral-500/30 to-neutral-600/20 blur-[1px] opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your command here..."
                    style={{ fontSize: '16px' }}
                    className={`relative w-full pl-4 pr-14 md:pr-16 py-3 md:py-4
                      ${theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100'}
                      ${themes[theme].text} ${theme === 'dark' ? 'placeholder-neutral-500' : 'placeholder-neutral-400'}
                      rounded-full
                      border ${theme === 'dark' ? 'border-neutral-700/50' : 'border-neutral-200'}
                      outline-none
                      transition-all duration-300 ease-out
                      disabled:opacity-50 disabled:cursor-not-allowed
                      touch-manipulation
                      shadow-lg shadow-neutral-900/10
                      focus:${theme === 'dark' ? 'border-neutral-600/80 shadow-xl shadow-neutral-900/20' : 'border-neutral-300 shadow-xl'}`}
                    disabled={!connected}
                    autoComplete="off"
                  />
                  {/* Send button inside input */}
                  <button
                    type="submit"
                    disabled={!connected || !command.trim()}
                    className={`absolute right-2 md:right-3 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center
                      bg-neutral-700
                      hover:bg-neutral-600 hover:shadow-lg hover:shadow-neutral-900/30
                      active:bg-neutral-500
                      disabled:bg-neutral-800
                      disabled:opacity-40 disabled:cursor-not-allowed
                      rounded-full
                      transition-all duration-300 ease-out
                      touch-manipulation select-none text-neutral-100
                      shadow-md
                      transform ${command.trim() ? 'scale-100 opacity-100' : 'scale-90 opacity-50'}
                      hover:scale-110 active:scale-95`}
                    aria-label="Send command"
                    title="Send command"
                  >
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      {/* Keyboard icon */}
                      <rect x="2" y="7" width="20" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 11h.01M10 11h.01M14 11h.01M18 11h.01M8 15h8" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
