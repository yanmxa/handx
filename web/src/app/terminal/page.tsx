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
  const textareaRef = useRef<HTMLTextAreaElement>(null); // Ref for auto-resizing textarea

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
  const [isMobile, setIsMobile] = useState(false); // Mobile detection
  const mounted = typeof window !== 'undefined'; // Track if component is mounted (for hydration)
  const [terminalOutput, setTerminalOutput] = useState(''); // For mobile simple view
  const [headerVisible, setHeaderVisible] = useState(true); // Header visibility for mobile - default visible
  const [showHeaderTabs, setShowHeaderTabs] = useState(false); // Toggle window tabs in header on tap
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
  const [mobileInputType, setMobileInputType] = useState<'floating' | 'touchscreen'>('floating'); // Mobile input mode type
  const lastTapTimeRef = useRef<number>(0); // For double-tap detection
  const [isNearBottom, setIsNearBottom] = useState(false); // Track if user is near page bottom

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

  // Theme definitions - Clean Dark Mode (OLED) + Modern Design
  // Accent: Teal #14B8A6 for consistent branding with home page
  // UX: 44x44px touch targets, gap-2+ spacing, touch-action: manipulation
  const themes = {
    dark: {
      terminal: {
        background: '#05070d',
        foreground: '#e2e8f0',
        cursor: '#22d3ee',
        cursorAccent: '#05070d',
        selectionBackground: '#22d3ee30',
        black: '#0f172a',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#94a3b8',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#e9d5ff',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
      bg: 'bg-[#05070d]',
      text: 'text-[#e2e8f0]',
      header: 'bg-[#0b1220]/90 backdrop-blur-xl',
      sidebar: 'bg-[#0b1220]/95 backdrop-blur-xl',
      border: 'border-[#111826]',
      input: 'bg-[#0f172a] border border-[#18233a]',
      button: 'bg-[#22d3ee] hover:bg-[#38e1fb] text-[#03131c] font-semibold',
      buttonSecondary: 'bg-[#0f172a] hover:bg-[#111a2f] text-[#e2e8f0] border border-[#18233a]',
      accent: 'text-[#22d3ee]',
      accentMuted: 'text-[#22d3ee]/70',
      accentBg: 'bg-[#22d3ee]/12',
      glow: 'shadow-[0_0_35px_rgba(34,211,238,0.16)]',
      cardBg: 'bg-[#0b1220]',
      cardHover: 'hover:bg-[#111a2f]',
      textMuted: 'text-[#8ba3b8]',
    },
    light: {
      terminal: {
        background: '#f6f8fb',
        foreground: '#0f172a',
        cursor: '#0ea5e9',
        cursorAccent: '#f6f8fb',
        selectionBackground: '#bae6fd',
        black: '#0f172a',
        red: '#dc2626',
        green: '#0f766e',
        yellow: '#d97706',
        blue: '#2563eb',
        magenta: '#7c3aed',
        cyan: '#0ea5e9',
        white: '#1f2937',
        brightBlack: '#475569',
        brightRed: '#b91c1c',
        brightGreen: '#047857',
        brightYellow: '#b45309',
        brightBlue: '#1d4ed8',
        brightMagenta: '#6d28d9',
        brightCyan: '#0e7490',
        brightWhite: '#0f172a',
      },
      bg: 'bg-[#f6f8fb]',
      text: 'text-[#0f172a]',
      header: 'bg-white/85 backdrop-blur-xl',
      sidebar: 'bg-white/95 backdrop-blur-xl',
      border: 'border-[#e2e8f0]',
      input: 'bg-white border border-[#e2e8f0]',
      button: 'bg-[#0ea5e9] hover:bg-[#38bdf8] text-white font-semibold',
      buttonSecondary: 'bg-white hover:bg-[#eef2f7] text-[#0f172a] border border-[#e2e8f0]',
      accent: 'text-[#0ea5e9]',
      accentMuted: 'text-[#0ea5e9]/70',
      accentBg: 'bg-[#0ea5e9]/10',
      glow: 'shadow-lg shadow-sky-200/40',
      cardBg: 'bg-white',
      cardHover: 'hover:bg-[#f7fbff]',
      textMuted: 'text-[#4b5563]',
    },
  };

  // Detect mobile device and load settings
  useEffect(() => {
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

    // Load saved mobile input type (default to 'floating')
    const savedMobileInputType = localStorage.getItem('handx_mobile_input_type');
    if (savedMobileInputType === 'floating' || savedMobileInputType === 'touchscreen') {
      setMobileInputType(savedMobileInputType);
    } else {
      setMobileInputType('floating');
      localStorage.setItem('handx_mobile_input_type', 'floating');
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

      // Check if near bottom of page (within 200px for better UX)
      const nearBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 200);
      setIsNearBottom(nearBottom);

      // Always show header when at top of page
      if (currentScrollY < 10) {
        setHeaderVisible(true);
        lastScrollYRef.current = currentScrollY;
        return;
      }

      // Always hide header when near bottom (including bounce back)
      if (nearBottom) {
        setHeaderVisible(false);
        lastScrollYRef.current = currentScrollY;
        return;
      }

      // Smaller threshold for faster response
      const SCROLL_THRESHOLD = 3;

      if (Math.abs(scrollDelta) > SCROLL_THRESHOLD) {
        // Dismiss header tabs on any scroll
        setShowHeaderTabs(false);
        if (scrollDelta > 0) {
          // Scrolling down - hide header
          setHeaderVisible(false);
          scrollDirectionRef.current = 'down';
        } else {
          // Scrolling up - show header only if NOT near bottom
          // This prevents header from showing during bounce-back at bottom
          if (!nearBottom) {
            setHeaderVisible(true);
            scrollDirectionRef.current = 'up';
          }
        }
        lastScrollYRef.current = currentScrollY;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isMobile, mounted, selectedSession]);

  // Lock body scroll when input is active (mobile only)
  useEffect(() => {
    if (!isMobile) return;

    if (inputMode === 'active') {
      // Disable body scroll - only use overflow hidden to keep input box at bottom
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      // Re-enable body scroll
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [inputMode, isMobile]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // If command is empty, set to minimum height (one line)
    if (!command.trim()) {
      textarea.style.height = '24px';
      return;
    }

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height based on scrollHeight (content height)
    const newHeight = Math.min(textarea.scrollHeight, 256); // Max 256px
    textarea.style.height = `${newHeight}px`;
  }, [command]); // Re-run when command changes

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

  const toggleWrapMode = () => {
    const newMode = wrapMode === 'wrap' ? 'nowrap' : 'wrap';
    setWrapMode(newMode);
    localStorage.setItem('handx_wrap_mode', newMode);
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
      const payload = message.payload as DeleteSessionPayload & { success: boolean };
      if (payload.success) {
        if (xtermRef.current) {
          xtermRef.current.writeln(`\x1b[1;33m✓ Session deleted: ${payload.session_name}\x1b[0m`);
          xtermRef.current.writeln('');
        }
        // Clear selected session if it was deleted
        if (selectedSession && selectedSession.name === payload.session_name) {
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
      const errorMsg = (message.payload as { message?: string })?.message || 'An error occurred';
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
    <div className={`${isMobile ? 'min-h-screen' : 'min-h-screen flex flex-col'} ${themes[theme].bg} ${themes[theme].text} touch-pan-y overscroll-none relative`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-70" aria-hidden>
        <div className="absolute -left-12 -top-20 h-64 w-64 rounded-full bg-[#22d3ee]/10 blur-3xl" />
        <div className="absolute right-[-60px] top-6 h-60 w-60 rounded-full bg-[#0ea5e9]/12 blur-3xl" />
        <div className="absolute left-1/3 bottom-[-120px] h-72 w-72 rounded-full bg-[#38e1fb]/10 blur-3xl" />
      </div>
      {/* Header - Sticky on mobile, auto-hide on scroll */}
      <div className={`sticky top-0 z-30 ${themes[theme].header} border-b ${themes[theme].border} transition-all duration-300 ease-in-out ${
        isMobile && !headerVisible ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'
      }`}>
        <div className="px-3 py-2 md:px-4 md:py-3 max-w-7xl mx-auto flex items-center justify-between"
          onClick={(e) => {
            // Mobile: tap blank area of header to toggle window tabs
            if (isMobile && selectedSession && e.target === e.currentTarget) {
              setShowHeaderTabs(prev => !prev);
            }
          }}
        >
          <div className="flex items-center gap-2 md:gap-3">
            {/* Hamburger menu - mobile only - 44x44px touch target */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all duration-200 touch-manipulation select-none active:scale-95 ${themes[theme].buttonSecondary}`}
              aria-label="Toggle menu"
            >
              <svg className={`w-5 h-5 ${themes[theme].accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            {/* Logo / Back button */}
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => router.push('/')}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${themes[theme].accentBg}`}>
                <svg className={`w-4.5 h-4.5 ${themes[theme].accent}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="hidden md:block">
                <h1 className={`text-base font-bold ${themes[theme].text}`}>HandX</h1>
                <p className={`text-xs ${themes[theme].textMuted}`}>Terminal</p>
              </div>
            </div>
            {/* Mobile: session name in header */}
            {isMobile && selectedSession && (
              <span className={`text-sm font-medium truncate max-w-[120px] ${themes[theme].text}`}>{selectedSession.name}</span>
            )}
            {/* Connection status badge */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${themes[theme].accentBg}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-teal-500' : 'bg-red-500'} ${connected ? 'animate-pulse' : ''}`} />
              <span className={`text-xs font-medium ${themes[theme].accent}`}>
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>
            {/* Session name on larger screens */}
            {!isMobile && selectedSession && (
              <div className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${themes[theme].buttonSecondary}`}>
                <span className={`text-xs ${themes[theme].text}`}>{selectedSession.name}</span>
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
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all touch-manipulation select-none active:scale-95 ${themes[theme].buttonSecondary}`}
                aria-label="Settings"
                title="Settings"
              >
                <svg className={`w-5 h-5 ${themes[theme].textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
                        onClick={toggleWrapMode}
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

                      {/* Mobile Input Type (mobile only) */}
                      {isMobile && (
                        <button
                          onClick={() => {
                            const newType = mobileInputType === 'floating' ? 'touchscreen' : 'floating';
                            setMobileInputType(newType);
                            localStorage.setItem('handx_mobile_input_type', newType);
                            // Reset input mode when switching
                            setInputMode('disabled');
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors
                            ${theme === 'dark' ? 'hover:bg-neutral-800' : 'hover:bg-slate-100'}`}
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <span className={`text-sm ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'}`}>
                              Input Mode
                            </span>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${theme === 'dark' ? 'bg-neutral-700 text-neutral-300' : 'bg-slate-200 text-neutral-700'}`}>
                            {mobileInputType === 'floating' ? 'Floating' : 'Touchscreen'}
                          </span>
                        </button>
                      )}
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
        {/* Mobile: Window tabs inside sticky header - shown on tap or when scrolled */}
        {isMobile && selectedSession && windows.length > 0 && showHeaderTabs && (
          <div className={`flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-hide border-t ${theme === 'dark' ? 'bg-[#080e1a]/95 border-neutral-800/40' : 'bg-slate-50/95 border-slate-200/60'}`}>
            {windows.map((win) => (
              <button
                key={win.id}
                onClick={() => { handleSwitchWindow(win.index); setShowHeaderTabs(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex-shrink-0 touch-manipulation select-none active:scale-95
                  ${activeWindowIndex === win.index
                    ? theme === 'dark'
                      ? 'bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30'
                      : 'bg-teal-50 text-teal-700 ring-1 ring-teal-500/30'
                    : theme === 'dark'
                    ? 'text-neutral-500 active:bg-neutral-800'
                    : 'text-neutral-400 active:bg-slate-200'
                  }`}
              >
                <span className={`mr-1 font-mono text-[10px] ${activeWindowIndex === win.index ? '' : theme === 'dark' ? 'text-neutral-600' : 'text-neutral-300'}`}>{win.index}</span>
                {win.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900 border-b border-red-700 text-red-100 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Mobile: Window tabs pinned under header */}
      {isMobile && selectedSession && windows.length > 0 && (
        <div className={`flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-hide border-b ${theme === 'dark' ? 'bg-[#080e1a] border-neutral-800/60' : 'bg-slate-50 border-slate-200'}`}>
          {windows.map((win) => (
            <button
              key={win.id}
              onClick={() => handleSwitchWindow(win.index)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex-shrink-0 touch-manipulation select-none active:scale-95
                ${activeWindowIndex === win.index
                  ? theme === 'dark'
                    ? 'bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30'
                    : 'bg-teal-50 text-teal-700 ring-1 ring-teal-500/30'
                  : theme === 'dark'
                  ? 'text-neutral-500 active:bg-neutral-800'
                  : 'text-neutral-400 active:bg-slate-200'
                }`}
            >
              <span className={`mr-1 font-mono text-[10px] ${activeWindowIndex === win.index ? '' : theme === 'dark' ? 'text-neutral-600' : 'text-neutral-300'}`}>{win.index}</span>
              {win.name}
            </button>
          ))}
        </div>
      )}

      <div className={`${isMobile ? 'flex' : 'flex-1 flex overflow-hidden'} relative`}>
        {/* Mobile Overlay - transparent */}
        {sidebarOpen && (
          <div
            className={`fixed inset-0 top-16 md:hidden ${theme === 'dark' ? 'bg-black/40' : 'bg-black/10'} backdrop-blur-[2px]`}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar - Sessions List - Clean design */}
        <div className={`
          fixed md:relative top-0 md:top-auto bottom-0 left-0 z-20
          w-72 ${themes[theme].sidebar} flex flex-col
          pt-14 md:pt-0
          shadow-xl md:shadow-none
          border-r ${themes[theme].border}
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}>
          {/* Top Section - Header & New Button */}
          <div className={`p-4 border-b ${themes[theme].border}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`text-sm font-semibold ${themes[theme].text}`}>Sessions</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${themes[theme].accentBg} ${themes[theme].accent}`}>
                {sessions.length}
              </span>
            </div>
            <button
              onClick={handleCreateSession}
              disabled={!connected}
              className={`w-full min-h-[44px] px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all touch-manipulation select-none active:scale-[0.98]
                ${themes[theme].button} disabled:opacity-40`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </button>
          </div>

          {/* Middle Section - Session List */}
          <div className="flex-1 overflow-y-auto p-3">
            {sessions.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed ${themes[theme].border}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${themes[theme].accentBg}`}>
                  <svg className={`w-6 h-6 ${themes[theme].accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className={`text-sm ${themes[theme].textMuted}`}>No sessions</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group relative rounded-xl p-3 cursor-pointer transition-all duration-200 touch-manipulation select-none
                      ${selectedSession?.id === session.id
                        ? `${themes[theme].accentBg} border ${theme === 'dark' ? 'border-teal-500/40' : 'border-teal-500/30'}`
                        : `${themes[theme].cardHover} border border-transparent`
                      } ${longPressSessionId === session.id ? 'ring-2 ring-teal-500/50' : ''}`}
                    onClick={() => {
                      if (longPressSessionId === session.id) setLongPressSessionId(null);
                      else handleSelectSession(session);
                    }}
                    onTouchStart={() => handleSessionTouchStart(session)}
                    onTouchEnd={handleSessionTouchEnd}
                    onTouchMove={handleSessionTouchMove}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-medium text-sm truncate ${selectedSession?.id === session.id ? themes[theme].accent : themes[theme].text}`}>
                            {session.name}
                          </h3>
                          {session.attached && (
                            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${themes[theme].accentBg} ${themes[theme].accent}`}>
                              <span className="w-1 h-1 rounded-full bg-teal-500 animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 ${themes[theme].textMuted}`}>
                          {session.windows.length} window{session.windows.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {/* Desktop hover actions */}
                      <div className={`hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                        <button
                          onClick={(e) => handleRenameSession(session, e)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors
                            ${theme === 'dark' ? 'hover:bg-white/10 text-gray-500 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(session); }}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors
                            ${theme === 'dark' ? 'hover:bg-red-500/20 text-gray-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
                      onClick={() => {
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
          {/* Window Tabs - desktop only (mobile tabs are pinned under header) */}
          {!isMobile && selectedSession && windows.length > 1 && (
            <div className={`flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide ${theme === 'dark' ? 'bg-neutral-900/80' : 'bg-slate-100/80'} border-b ${theme === 'dark' ? 'border-neutral-800' : 'border-slate-200'}`}>
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
                className={`w-full font-mono leading-tight rounded-3xl border ${themes[theme].border} shadow-inner ${wrapMode === 'nowrap' ? 'overflow-x-auto' : ''}`}
                style={{
                  backgroundColor: themes[theme].terminal.background,
                  color: themes[theme].terminal.foreground,
                  fontSize: `${fontSize}px`,
                  minHeight: '72vh',
                  paddingBottom: '88px',
                  boxShadow: '0 25px 60px -40px rgba(0,0,0,0.55)',
                }}
              >
                {/* Terminal content */}
                <div
                  style={{
                    whiteSpace: wrapMode === 'wrap' ? 'pre-wrap' : 'pre',
                    wordBreak: wrapMode === 'wrap' ? 'break-word' : 'keep-all',
                    overflowWrap: wrapMode === 'wrap' ? 'anywhere' : 'normal',
                    padding: '12px',
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

          {/* Mobile: Unified floating control bar — scroll + keyboard */}
          {isMobile && selectedSession && !sidebarOpen && inputMode === 'disabled' && (
            <div
              className="fixed z-20 touch-none select-none"
              style={{
                right: `${keyboardPosition.x}px`,
                bottom: `${keyboardPosition.y}px`,
              }}
              onTouchStart={(e) => {
                if (mobileInputType === 'floating') handleDragStart(e);
              }}
              onTouchMove={(e) => {
                if (mobileInputType === 'floating') {
                  handleDragMove(e);
                  if (keyboardLongPressRef.current) {
                    clearTimeout(keyboardLongPressRef.current);
                    keyboardLongPressRef.current = null;
                  }
                }
              }}
              onTouchEnd={() => {
                if (mobileInputType === 'floating') {
                  handleDragEnd();
                  if (keyboardLongPressRef.current) {
                    clearTimeout(keyboardLongPressRef.current);
                    keyboardLongPressRef.current = null;
                  }
                }
              }}
            >
              <div className={`flex flex-col items-center rounded-2xl overflow-hidden shadow-xl transition-all duration-200
                ${isDragging ? 'scale-105' : 'scale-100'}
                ${theme === 'dark'
                  ? 'bg-[#0f172a]/90 shadow-black/40 ring-1 ring-white/[0.08]'
                  : 'bg-white/90 shadow-black/15 ring-1 ring-black/[0.06]'}
                backdrop-blur-xl`}
              >
                {/* Scroll to top */}
                <button
                  onClick={(e) => { e.stopPropagation(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className={`w-11 h-10 flex items-center justify-center transition-colors touch-manipulation select-none active:scale-90
                    ${theme === 'dark' ? 'text-neutral-500 active:text-neutral-300 active:bg-white/5' : 'text-neutral-400 active:text-neutral-600 active:bg-black/5'}`}
                  aria-label="Scroll to top"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l7.5-7.5 7.5 7.5" />
                  </svg>
                </button>

                {/* Divider */}
                <div className={`w-6 h-px ${theme === 'dark' ? 'bg-white/[0.06]' : 'bg-black/[0.06]'}`} />

                {/* Keyboard / Input button */}
                {mobileInputType === 'floating' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isDragging && inputMode === 'disabled') setInputMode('active');
                    }}
                    onTouchStart={() => {
                      keyboardLongPressRef.current = setTimeout(() => {
                        if (!isDragging) setInputMode('quickkeys');
                      }, 400);
                    }}
                    disabled={!connected}
                    className={`w-11 h-11 flex items-center justify-center transition-colors touch-manipulation select-none
                      ${theme === 'dark' ? 'text-teal-400 active:bg-teal-500/15' : 'text-teal-600 active:bg-teal-50'}
                      disabled:opacity-30`}
                    aria-label="Open keyboard"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <rect x="3" y="7" width="18" height="11" rx="2" />
                      <path strokeLinecap="round" d="M7 11h.01M12 11h.01M17 11h.01M8 14h8" />
                    </svg>
                  </button>
                )}

                {/* Divider */}
                {mobileInputType === 'floating' && (
                  <div className={`w-6 h-px ${theme === 'dark' ? 'bg-white/[0.06]' : 'bg-black/[0.06]'}`} />
                )}

                {/* Scroll to bottom */}
                <button
                  onClick={(e) => { e.stopPropagation(); window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); }}
                  className={`w-11 h-10 flex items-center justify-center transition-colors touch-manipulation select-none active:scale-90
                    ${theme === 'dark' ? 'text-neutral-500 active:text-neutral-300 active:bg-white/5' : 'text-neutral-400 active:text-neutral-600 active:bg-black/5'}`}
                  aria-label="Scroll to bottom"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12.75l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Mobile: Quick keys mode - Clean floating panel */}
          {isMobile && selectedSession && !sidebarOpen && inputMode === 'quickkeys' && (
            <div
              className="fixed z-20"
              style={{
                right: `${keyboardPosition.x}px`,
                bottom: `${keyboardPosition.y}px`,
              }}
            >
              <div className={`flex items-center gap-2 p-2 rounded-2xl shadow-xl backdrop-blur-xl
                ${theme === 'dark' ? 'bg-[#0f172a]/95 border border-[#18233a]' : 'bg-white/95 border border-gray-200'}`}
              >
                {/* Esc */}
                <button
                  onClick={() => {
                    if (ws && selectedSession) {
                      ws.send(MessageType.EXECUTE_COMMAND, { session_name: selectedSession.name, command: 'Escape', window_index: activeWindowIndex });
                      setTerminalOutput((prev) => prev + `$ [ESC]\n`);
                      setTimeout(() => ws?.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex }), 100);
                      setTimeout(() => setInputMode('disabled'), 100);
                    }
                  }}
                  className={`min-w-[44px] min-h-[44px] px-3 rounded-xl font-medium text-sm
                    transition-all touch-manipulation select-none active:scale-90
                    ${theme === 'dark' ? 'bg-[#1A1A1A] text-teal-400 active:bg-teal-500/20' : 'bg-gray-100 text-teal-600 active:bg-teal-50'}`}
                >
                  Esc
                </button>
                {/* Tab */}
                <button
                  onClick={() => {
                    if (ws && selectedSession) {
                      ws.send(MessageType.EXECUTE_COMMAND, { session_name: selectedSession.name, command: 'Tab', window_index: activeWindowIndex });
                      setTerminalOutput((prev) => prev + `$ [TAB]\n`);
                      setTimeout(() => ws?.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex }), 100);
                      setTimeout(() => setInputMode('disabled'), 100);
                    }
                  }}
                  className={`min-w-[44px] min-h-[44px] px-3 rounded-xl font-medium text-sm
                    transition-all touch-manipulation select-none active:scale-90
                    ${theme === 'dark' ? 'bg-[#1A1A1A] text-teal-400 active:bg-teal-500/20' : 'bg-gray-100 text-teal-600 active:bg-teal-50'}`}
                >
                  Tab
                </button>
                {/* 1, 2, 3 */}
                {['1', '2', '3'].map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (ws && selectedSession) {
                        ws.send(MessageType.EXECUTE_COMMAND, { session_name: selectedSession.name, command: key, window_index: activeWindowIndex });
                        setTerminalOutput((prev) => prev + `$ ${key}\n`);
                        setTimeout(() => ws?.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex }), 100);
                        setTimeout(() => setInputMode('disabled'), 100);
                      }
                    }}
                    className={`min-w-[44px] min-h-[44px] rounded-xl font-medium text-base
                      transition-all touch-manipulation select-none active:scale-90
                      ${theme === 'dark' ? 'bg-[#1A1A1A] text-white active:bg-white/10' : 'bg-gray-100 text-gray-700 active:bg-gray-200'}`}
                  >
                    {key}
                  </button>
                ))}
                {/* Enter */}
                <button
                  onClick={() => {
                    if (ws && selectedSession) {
                      ws.send(MessageType.EXECUTE_COMMAND, { session_name: selectedSession.name, command: 'Enter', window_index: activeWindowIndex });
                      setTerminalOutput((prev) => prev + `$ [Enter]\n`);
                      setTimeout(() => ws?.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex }), 100);
                      setTimeout(() => setInputMode('disabled'), 100);
                    }
                  }}
                  className={`min-w-[44px] min-h-[44px] rounded-xl font-medium text-lg
                    transition-all touch-manipulation select-none active:scale-90
                    ${theme === 'dark' ? 'bg-teal-500 text-black active:bg-teal-400' : 'bg-teal-600 text-white active:bg-teal-500'}`}
                >
                  ↵
                </button>
                {/* Close */}
                <button
                  onClick={() => setInputMode('disabled')}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center
                    transition-all touch-manipulation select-none active:scale-90
                    ${theme === 'dark' ? 'text-gray-500 active:bg-white/5' : 'text-gray-400 active:bg-gray-100'}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Mobile: Fixed input box when active - Clean design */}
          {isMobile && selectedSession && !sidebarOpen && inputMode === 'active' && (
            <div className="fixed left-0 right-0 bottom-2 z-30 px-3">
              <div className={`rounded-2xl px-4 py-3 backdrop-blur-xl shadow-xl border ${
                theme === 'dark' ? 'bg-[#0f172a]/95 border-[#18233a]' : 'bg-white/95 border-gray-200'
              }`}>
                <form onSubmit={handleSendCommand} className="flex items-end gap-3">
                  <textarea
                    ref={textareaRef}
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendCommand(e);
                      }
                    }}
                    onBlur={() => setTimeout(() => setInputMode('disabled'), 150)}
                    placeholder="Enter command..."
                    style={{ fontSize: '16px', resize: 'none', minHeight: '24px', maxHeight: '200px', overflowY: 'auto', lineHeight: '1.5' }}
                    className={`flex-1 px-0 py-0 bg-transparent outline-none touch-manipulation font-mono text-base
                      ${themes[theme].text} ${theme === 'dark' ? 'placeholder-gray-500' : 'placeholder-gray-400'}`}
                    autoComplete="off"
                    autoFocus
                  />
                  <button
                    type={command.trim() ? 'submit' : 'button'}
                    onClick={() => { if (!command.trim()) setInputMode('disabled'); }}
                    className={`min-w-[44px] min-h-[44px] rounded-xl flex-shrink-0 flex items-center justify-center transition-all touch-manipulation active:scale-90
                      ${command.trim()
                        ? theme === 'dark' ? 'bg-teal-500 text-black' : 'bg-teal-600 text-white'
                        : theme === 'dark' ? 'bg-[#1A1A1A] text-gray-500' : 'bg-gray-100 text-gray-400'
                      }`}
                    aria-label={command.trim() ? 'Send' : 'Close'}
                  >
                    {command.trim() ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Mobile Touchscreen Mode: Bottom trigger area - Clean design */}
          {isMobile && selectedSession && !sidebarOpen && mobileInputType === 'touchscreen' && inputMode === 'disabled' && (
            <div
              className={`fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center transition-all duration-300 ${isNearBottom ? 'h-28' : 'h-14'}`}
              style={{
                background: theme === 'dark'
                  ? 'linear-gradient(to top, rgba(5,7,13,0.95), rgba(5,7,13,0))'
                  : 'linear-gradient(to top, rgba(250,250,250,0.95), rgba(250,250,250,0))'
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const now = Date.now();
                if (now - lastTapTimeRef.current < 300) {
                  setInputMode('quickkeys');
                  lastTapTimeRef.current = 0;
                } else {
                  setInputMode('active');
                  lastTapTimeRef.current = now;
                }
              }}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setInputMode('active'); }}
            >
              <div className={`px-5 py-2.5 rounded-xl border shadow-lg transition-all duration-200 pointer-events-none ${
                isNearBottom
                  ? theme === 'dark' ? 'bg-[#0f172a] border-teal-500/40 scale-105' : 'bg-white border-teal-500/40 scale-105'
                  : theme === 'dark' ? 'bg-[#0f172a]/90 border-[#18233a]' : 'bg-white/90 border-gray-200'
              }`}>
                <div className="flex items-center gap-2">
                  <svg className={`w-4 h-4 ${themes[theme].accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <rect x="3" y="7" width="18" height="11" rx="2" />
                    <path strokeLinecap="round" d="M7 11h.01M12 11h.01M17 11h.01M8 14h8" />
                  </svg>
                  <span className={`text-xs ${themes[theme].text}`}>
                    {isNearBottom ? 'Tap to type' : 'Tap to type'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Touchscreen Mode: Quick keys panel (center bottom) - Clean design */}
          {isMobile && selectedSession && !sidebarOpen && mobileInputType === 'touchscreen' && inputMode === 'quickkeys' && (
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-20">
              <div className={`flex flex-col gap-2 p-2.5 rounded-2xl shadow-xl backdrop-blur-xl
                ${theme === 'dark' ? 'bg-[#0f172a]/95 border border-[#18233a]' : 'bg-white/95 border border-gray-200'}`}
              >
                {/* Window switcher (if multiple windows) */}
                {windows.length > 1 && (
                  <div className={`flex items-center gap-1.5 pb-2 border-b ${themes[theme].border}`}>
                    {windows.map((win) => (
                      <button
                        key={win.id}
                        onClick={() => { handleSwitchWindow(win.index); setInputMode('disabled'); }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all touch-manipulation select-none active:scale-90
                          ${activeWindowIndex === win.index
                            ? theme === 'dark' ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-50 text-teal-600'
                            : theme === 'dark' ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
                          }`}
                      >
                        {win.index}
                      </button>
                    ))}
                  </div>
                )}
                {/* Quick keys row */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (ws && selectedSession) {
                        ws.send(MessageType.EXECUTE_COMMAND, { session_name: selectedSession.name, command: 'Escape', window_index: activeWindowIndex });
                        setTerminalOutput((prev) => prev + `$ [ESC]\n`);
                        setTimeout(() => ws?.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex }), 100);
                        setTimeout(() => setInputMode('disabled'), 100);
                      }
                    }}
                    className={`min-w-[44px] min-h-[44px] px-3 rounded-xl font-medium text-sm transition-all touch-manipulation select-none active:scale-90
                      ${theme === 'dark' ? 'bg-[#1A1A1A] text-teal-400 active:bg-teal-500/20' : 'bg-gray-100 text-teal-600 active:bg-teal-50'}`}
                  >
                    Esc
                  </button>
                  <button
                    onClick={() => {
                      if (ws && selectedSession) {
                        ws.send(MessageType.EXECUTE_COMMAND, { session_name: selectedSession.name, command: 'Tab', window_index: activeWindowIndex });
                        setTerminalOutput((prev) => prev + `$ [TAB]\n`);
                        setTimeout(() => ws?.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex }), 100);
                        setTimeout(() => setInputMode('disabled'), 100);
                      }
                    }}
                    className={`min-w-[44px] min-h-[44px] px-3 rounded-xl font-medium text-sm transition-all touch-manipulation select-none active:scale-90
                      ${theme === 'dark' ? 'bg-[#1A1A1A] text-teal-400 active:bg-teal-500/20' : 'bg-gray-100 text-teal-600 active:bg-teal-50'}`}
                  >
                    Tab
                  </button>
                  {['1', '2', '3'].map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        if (ws && selectedSession) {
                          ws.send(MessageType.EXECUTE_COMMAND, { session_name: selectedSession.name, command: key, window_index: activeWindowIndex });
                          setTerminalOutput((prev) => prev + `$ ${key}\n`);
                          setTimeout(() => ws?.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex }), 100);
                          setTimeout(() => setInputMode('disabled'), 100);
                        }
                      }}
                      className={`min-w-[44px] min-h-[44px] rounded-xl font-medium text-base transition-all touch-manipulation select-none active:scale-90
                        ${theme === 'dark' ? 'bg-[#1A1A1A] text-white active:bg-white/10' : 'bg-gray-100 text-gray-700 active:bg-gray-200'}`}
                    >
                      {key}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      if (ws && selectedSession) {
                        ws.send(MessageType.EXECUTE_COMMAND, { session_name: selectedSession.name, command: 'Enter', window_index: activeWindowIndex });
                        setTerminalOutput((prev) => prev + `$ [Enter]\n`);
                        setTimeout(() => ws?.send(MessageType.CAPTURE_OUTPUT, { session_name: selectedSession.name, window_index: activeWindowIndex }), 100);
                        setTimeout(() => setInputMode('disabled'), 100);
                      }
                    }}
                    className={`min-w-[44px] min-h-[44px] rounded-xl font-medium text-lg transition-all touch-manipulation select-none active:scale-90
                      ${theme === 'dark' ? 'bg-teal-500 text-black active:bg-teal-400' : 'bg-teal-600 text-white active:bg-teal-500'}`}
                  >
                    ↵
                  </button>
                  <button
                    onClick={() => setInputMode('disabled')}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all touch-manipulation select-none active:scale-90
                      ${theme === 'dark' ? 'text-gray-500 active:bg-white/5' : 'text-gray-400 active:bg-gray-100'}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
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
