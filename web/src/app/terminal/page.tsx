'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';
import {
  MessageType,
  Session,
  ListSessionsResponse,
  ConnectAckPayload,
  ExecuteCommandResponse,
  CaptureOutputResponse,
  CreateSessionResponse,
  DeleteSessionPayload
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
  const mobileTerminalRef = useRef<HTMLDivElement>(null); // Ref for mobile terminal container

  const [ws, setWs] = useState<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
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
  const [charWidth, setCharWidth] = useState<number>(7); // Dynamically measured character width

  // Keyboard button states: 'disabled' (gray, read-only), 'active' (blue, with input box)
  const [inputMode, setInputMode] = useState<'disabled' | 'active'>('disabled');
  const [keyboardPosition, setKeyboardPosition] = useState({ x: 20, y: 100 }); // Position from bottom-right
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [keyboardHeight, setKeyboardHeight] = useState(0); // Track virtual keyboard height

  // Dynamically measure character width for accurate calculation
  const measureCharWidth = (): number => {
    if (!mobileTerminalRef.current) return 7;

    // Create temporary span to measure character width
    const span = document.createElement('span');
    span.style.fontFamily = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    span.style.fontSize = '0.75rem'; // text-xs
    span.style.visibility = 'hidden';
    span.style.position = 'absolute';
    span.textContent = '─'.repeat(10); // Measure 10 separator characters

    document.body.appendChild(span);
    const width = span.offsetWidth / 10; // Average width per character
    document.body.removeChild(span);

    return width;
  };

  // Calculate max characters per line based on actual measured width
  const getMaxLineLength = (): number => {
    if (!mobileTerminalRef.current) return 55; // Fallback

    // Get computed styles to extract actual padding
    const styles = window.getComputedStyle(mobileTerminalRef.current);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;

    const containerWidth = mobileTerminalRef.current.clientWidth;
    // Subtract actual padding from container width
    const availableWidth = containerWidth - paddingLeft - paddingRight;
    const charsPerLine = Math.floor(availableWidth / charWidth);
    return Math.max(30, charsPerLine);
  };

  // Remove separator lines completely to prevent wrapping on mobile
  const removeSeparatorLines = (text: string): string => {
    return text.split('\n').filter(line => {
      // Strip ANSI codes for pattern matching
      const stripAnsi = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

      // Check if line is mostly repeating characters (separator line)
      const repeatingChars = /^([-─=_~#*■□▪▫●○◆◇☐☑☒✓✗×+]+)\1*$/;
      const isSeparator = repeatingChars.test(stripAnsi.trim()) ||
                         stripAnsi.trim().length > 20 && /^([-─=_~#*■□▪▫●○◆◇☐☑☒✓✗×+\s])+$/.test(stripAnsi);

      // Keep line if it's NOT a separator
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

      // Measure character width on mobile
      if (mobile) {
        setTimeout(() => {
          const width = measureCharWidth();
          setCharWidth(width);
        }, 100); // Small delay to ensure DOM is ready
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const savedTheme = localStorage.getItem('handx_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }

    // Load saved servers
    const savedServersStr = localStorage.getItem('handx_saved_servers');
    if (savedServersStr) {
      try {
        setSavedServers(JSON.parse(savedServersStr));
      } catch (e) {
        console.error('Failed to parse saved servers:', e);
      }
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Track keyboard height using visualViewport API
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const updateKeyboardHeight = () => {
      const viewport = window.visualViewport;
      if (viewport) {
        const heightDiff = window.innerHeight - viewport.height;
        setKeyboardHeight(Math.max(0, heightDiff));
      }
    };

    window.visualViewport.addEventListener('resize', updateKeyboardHeight);
    window.visualViewport.addEventListener('scroll', updateKeyboardHeight);

    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboardHeight);
      window.visualViewport?.removeEventListener('scroll', updateKeyboardHeight);
    };
  }, []);

  // Scroll to bottom when input mode is activated or keyboard appears
  useEffect(() => {
    if (inputMode === 'active' && mobileTerminalRef.current) {
      setTimeout(() => {
        mobileTerminalRef.current?.scrollTo({
          top: mobileTerminalRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [inputMode, keyboardHeight]);

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('handx_theme', newTheme);

    // Update terminal theme if exists
    if (xtermRef.current) {
      xtermRef.current.options.theme = themes[newTheme].terminal;
    }

    // Re-measure character width on mobile when theme changes
    if (isMobile) {
      setTimeout(() => {
        const width = measureCharWidth();
        setCharWidth(width);
      }, 100);
    }
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
        fontSize: 13,
        lineHeight: 1.4,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontWeight: '400',
        fontWeightBold: '700',
        letterSpacing: 0,
        scrollback: 1000,
        theme: themes[theme].terminal,
        cursorStyle: 'block',
        cursorWidth: 1,
        bellStyle: 'none',
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

        terminal.writeln('\x1b[1;32mhandx Terminal\x1b[0m');
        terminal.writeln('\x1b[90mWaiting for connection...\x1b[0m');
        terminal.writeln('');

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
    // Auto-detect WebSocket URL based on current hostname
    let wsUrl = localStorage.getItem('handx_ws_url');
    if (!wsUrl) {
      // Use the same hostname as the web page, but connect to port 8080
      const hostname = window.location.hostname;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${hostname}:8080/ws`;
    }

    const token = localStorage.getItem('handx_token') || 'default-token';

    const client = new WebSocketClient(wsUrl, token);

    // Handle connect acknowledgment
    client.on(MessageType.CONNECT_ACK, (message) => {
      const payload = message.payload as ConnectAckPayload;
      if (payload.success) {
        console.log('Connected to server:', payload.server_version);
        setConnected(true);
        setError('');

        const connectionMessage = `✓ Connected to server\nServer version: ${payload.server_version}\n\n`;

        if (isMobileRef.current) {
          setTerminalOutput(connectionMessage);
        } else if (xtermRef.current) {
          xtermRef.current.writeln('\x1b[1;32m✓ Connected to server\x1b[0m');
          xtermRef.current.writeln(`Server version: ${payload.server_version}`);
          xtermRef.current.writeln('');
        }

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

      if (payload.sessions.length > 0) {
        const sessionsMessage = `Found ${payload.sessions.length} session(s)\n\n`;
        if (isMobileRef.current) {
          setTerminalOutput((prev) => prev + sessionsMessage);
        } else if (xtermRef.current) {
          xtermRef.current.writeln(`\x1b[36mFound ${payload.sessions.length} session(s)\x1b[0m`);
          xtermRef.current.writeln('');
        }
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
          if (isMobileRef.current) {
            // For mobile: update state
            setTerminalOutput(payload.output);
          } else if (xtermRef.current) {
            // For desktop: update xterm.js
            xtermRef.current.clear();
            xtermRef.current.write(payload.output);
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

    // Handle errors
    client.on(MessageType.ERROR, (message) => {
      console.error('Server error:', message.payload);
      setError(message.payload.message || 'An error occurred');
      if (xtermRef.current) {
        xtermRef.current.writeln(`\x1b[1;31m✗ Error: ${message.payload.message}\x1b[0m`);
        xtermRef.current.writeln('');
      }
    });

    // Connect
    client.connect().catch((err) => {
      console.error('Connection failed:', err);
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
      ws.send(MessageType.CAPTURE_OUTPUT, { session_name: sessionName });
    }, 1000);

    // Capture immediately
    ws.send(MessageType.CAPTURE_OUTPUT, { session_name: sessionName });
  };

  const stopOutputCapture = () => {
    if (outputIntervalRef.current) {
      clearInterval(outputIntervalRef.current);
      outputIntervalRef.current = null;
    }
  };

  // Handle session selection
  const handleSelectSession = (session: Session) => {
    setSelectedSession(session);
    const sessionHeader = `=== Session: ${session.name} ===\n\n`;

    if (isMobileRef.current) {
      setTerminalOutput(sessionHeader);
    } else if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.writeln(`\x1b[1;36m=== Session: ${session.name} ===\x1b[0m`);
      xtermRef.current.writeln('');
    }
    startOutputCapture(session.name);
    // Close sidebar on mobile after selection
    setSidebarOpen(false);
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
      const confirmed = confirm(`Delete session "${session.name}"?`);
      if (confirmed) {
        ws.send(MessageType.DELETE_SESSION, { session_name: session.name } as DeleteSessionPayload);
      }
    }
  };

  const handleSendCommand = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ws || !selectedSession || !command.trim()) return;

    const cmd = command.trim();

    ws.send(MessageType.EXECUTE_COMMAND, {
      session_name: selectedSession.name,
      command: cmd,
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
        ws.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name });
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
    // Keep button within bounds
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
    localStorage.removeItem('handx_token');
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
    <div className={`min-h-screen ${themes[theme].bg} ${themes[theme].text} flex flex-col touch-pan-y overscroll-none`}>
      {/* Header - Sticky on mobile, collapsible */}
      <div className={`sticky top-0 z-30 ${themes[theme].header} transition-all duration-500 ease-in-out relative ${
        isMobile && !headerVisible ? 'h-0 overflow-hidden p-0 opacity-0' : 'p-2 md:p-4 opacity-100'
      }`}>
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
            <div className="flex items-center gap-2">
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
            {/* Theme toggle button */}
            <button
              onClick={toggleTheme}
              className={`p-2 hover:bg-opacity-80 ${themes[theme].input} rounded transition touch-manipulation select-none`}
              aria-label="Toggle theme"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            {/* Hide header button - mobile only */}
            {isMobile && (
              <button
                onClick={() => setHeaderVisible(false)}
                className={`p-2 hover:bg-opacity-80 ${themes[theme].input} rounded transition touch-manipulation select-none`}
                aria-label="Hide header"
                title="Hide header"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            )}
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

      {/* Mobile: Header toggle bar - only show when header is hidden */}
      {isMobile && !headerVisible && (
        <div
          onClick={() => setHeaderVisible(true)}
          className={`py-1 px-4 flex items-center justify-center cursor-pointer active:bg-opacity-30 transition-all duration-300 touch-manipulation select-none bg-opacity-0 hover:bg-opacity-10 ${themes[theme].header}`}
        >
          <svg
            className="w-4 h-4 transition-all duration-300 opacity-40 hover:opacity-60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-900 border-b border-red-700 text-red-100 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
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
          <div className="p-4 space-y-3">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between mb-2">
              <h2 className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>
                Sessions
              </h2>
              <span className={`text-xs ${theme === 'dark' ? 'text-neutral-600' : 'text-neutral-400'}`}>
                {sessions.length}
              </span>
            </div>

            {/* New Session Button */}
            <button
              onClick={handleCreateSession}
              disabled={!connected}
              className={`w-full px-4 py-2.5 relative overflow-hidden
                ${theme === 'dark' ? 'bg-neutral-700' : 'bg-neutral-400'}
                ${theme === 'dark'
                  ? 'hover:bg-neutral-600 hover:shadow-lg hover:shadow-neutral-900/50'
                  : 'hover:bg-neutral-500 hover:shadow-lg hover:shadow-neutral-900/20'}
                ${theme === 'dark' ? 'active:bg-neutral-500' : 'active:bg-neutral-600'}
                ${theme === 'dark' ? 'disabled:bg-neutral-800' : 'disabled:bg-neutral-200'}
                disabled:opacity-40 disabled:cursor-not-allowed
                rounded-xl text-sm font-medium
                transition-all duration-300 ease-out
                touch-manipulation select-none
                ${theme === 'dark' ? 'text-neutral-100' : 'text-neutral-100'}
                shadow-md
                hover:scale-[1.02] active:scale-[0.98]
                flex items-center justify-center gap-2
                before:absolute before:inset-0 before:rounded-xl before:p-[1px]
                ${theme === 'dark'
                  ? 'before:bg-gradient-to-r before:from-neutral-600 before:via-neutral-500 before:to-neutral-600'
                  : 'before:bg-gradient-to-r before:from-neutral-500 before:via-neutral-400 before:to-neutral-500'}
                before:-z-10 before:opacity-100 hover:before:opacity-100`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {sessions.length === 0 ? (
              <div className={`text-center py-8 ${theme === 'dark' ? 'text-neutral-600' : 'text-neutral-400'} text-sm`}>
                <p>No sessions</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group relative rounded-3xl p-2.5 cursor-pointer transition-all duration-300 ease-out touch-manipulation select-none overflow-hidden ${
                      selectedSession?.id === session.id
                        ? theme === 'dark'
                          ? 'bg-neutral-700 shadow-xl shadow-neutral-900/40 scale-[1.02]'
                          : 'bg-slate-300 shadow-xl shadow-slate-900/20 scale-[1.02]'
                        : theme === 'dark'
                        ? 'bg-neutral-800/60 hover:bg-neutral-800 hover:shadow-lg hover:shadow-neutral-900/20 hover:scale-[1.01]'
                        : 'bg-slate-200 hover:bg-slate-250 hover:shadow-lg hover:shadow-slate-900/10 hover:scale-[1.01]'
                    }`}
                    onClick={() => handleSelectSession(session)}
                  >
                    {/* Gradient border effect */}
                    <div className={`absolute inset-0 rounded-3xl transition-opacity duration-300 ${
                      selectedSession?.id === session.id
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}>
                      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-neutral-500/30 via-neutral-400/20 to-neutral-500/30 blur-[0.5px]" />
                    </div>
                    {/* Subtle inner glow for selected session */}
                    {selectedSession?.id === session.id && (
                      <div className="absolute inset-[1px] rounded-3xl bg-gradient-to-br from-neutral-600/5 to-neutral-500/5 pointer-events-none" />
                    )}
                    <div className="relative flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-semibold text-sm truncate transition-colors duration-200 ${
                            selectedSession?.id === session.id
                              ? theme === 'dark' ? 'text-neutral-100' : 'text-neutral-900'
                              : theme === 'dark' ? 'text-neutral-200' : 'text-neutral-800'
                          }`}>
                            {session.name}
                          </h3>
                          {session.attached && (
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm shadow-green-500/50 animate-pulse flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] flex items-center gap-1 ${
                            selectedSession?.id === session.id
                              ? theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'
                              : theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'
                          }`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                            </svg>
                            {session.windows.length}
                          </span>
                          <span className={`text-[11px] ${
                            selectedSession?.id === session.id
                              ? theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'
                              : theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'
                          }`}>
                            •
                          </span>
                          <span className={`text-[11px] ${
                            selectedSession?.id === session.id
                              ? theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'
                              : theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'
                          }`}>
                            {session.attached ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session);
                        }}
                        className={`md:opacity-0 md:group-hover:opacity-100 ml-2 p-1.5 rounded-md
                          transition-all duration-300 ease-out touch-manipulation select-none
                          hover:bg-red-900/40 hover:shadow-md hover:shadow-red-900/30 active:bg-red-900/60
                          ${
                            selectedSession?.id === session.id
                              ? theme === 'dark' ? 'text-neutral-400' : 'text-neutral-700'
                              : theme === 'dark' ? 'text-neutral-500' : 'text-neutral-700'
                          }
                          hover:text-red-400 hover:scale-110 active:scale-95`}
                        title="Delete session"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Terminal Area */}
        <div className={`flex-1 flex flex-col ${themes[theme].bg} min-w-0 overflow-hidden`}>
          {/* Terminal Display */}
          <div className="flex-1 p-2 md:p-4 overflow-hidden min-w-0">
            {isMobile ? (
              /* Mobile: Simple HTML view with inline input */
              <div
                ref={mobileTerminalRef}
                className="h-full w-full overflow-y-auto font-mono text-xs leading-tight"
                style={{
                  backgroundColor: themes[theme].terminal.background,
                  color: themes[theme].terminal.foreground,
                }}
              >
                {/* Terminal content */}
                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
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
                      const cleanedOutput = removeSeparatorLines(terminalOutput || '');
                      return convert.toHtml(cleanedOutput);
                    })(),
                  }}
                />
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

          {/* Mobile: Input box fixed above keyboard - only in active mode */}
          {isMobile && inputMode === 'active' && selectedSession && !sidebarOpen && (
            <div
              className="fixed left-0 right-0 z-20 px-2"
              style={{ bottom: keyboardHeight }}
            >
              <div className={`rounded-xl p-0.5 ${theme === 'dark' ? 'bg-neutral-900/95' : 'bg-white/95'} backdrop-blur-xl shadow-xl border ${theme === 'dark' ? 'border-neutral-600' : 'border-neutral-300'}`}>
                <form onSubmit={handleSendCommand} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
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
                    className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center
                      transition-all duration-200 touch-manipulation
                      ${command.trim()
                        ? theme === 'dark' ? 'bg-neutral-500 text-neutral-200' : 'bg-neutral-500 text-white'
                        : theme === 'dark' ? 'bg-neutral-700/70 text-neutral-400' : 'bg-neutral-200 text-neutral-500'
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

          {/* Mobile: Draggable keyboard button - only in disabled mode */}
          {isMobile && selectedSession && !sidebarOpen && inputMode === 'disabled' && (
            <div
              className="fixed z-20 touch-none select-none"
              style={{
                right: `${keyboardPosition.x}px`,
                bottom: `${keyboardPosition.y}px`,
              }}
              onTouchStart={handleDragStart}
              onTouchMove={handleDragMove}
              onTouchEnd={handleDragEnd}
            >
              <button
                onClick={() => {
                  if (!isDragging) {
                    if (inputMode === 'disabled') {
                      setInputMode('active');
                    } else {
                      // Scroll to input box
                      inputBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    }
                  }
                }}
                disabled={!connected}
                className={`w-12 h-12 rounded-full flex items-center justify-center
                  transition-all duration-300 ease-out
                  shadow-lg touch-manipulation
                  ${isDragging ? 'scale-110' : 'scale-100'}
                  bg-neutral-700/70 text-neutral-400
                  hover:bg-neutral-600/70 hover:text-neutral-300
                  disabled:opacity-40 disabled:cursor-not-allowed
                  active:scale-95
                  backdrop-blur-sm`}
                aria-label={inputMode === 'disabled' ? 'Open keyboard' : 'Jump to input'}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <rect x="2" y="7" width="20" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 11h.01M10 11h.01M14 11h.01M18 11h.01M8 15h8" />
                </svg>
              </button>
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
