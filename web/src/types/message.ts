// Message types matching the protocol
export enum MessageType {
  // Connection
  CONNECT = 'connect',
  CONNECT_ACK = 'connect_ack',
  DISCONNECT = 'disconnect',

  // Session Management
  LIST_SESSIONS = 'list_sessions',
  LIST_SESSIONS_RESPONSE = 'list_sessions_response',
  CREATE_SESSION = 'create_session',
  CREATE_SESSION_RESPONSE = 'create_session_response',
  SWITCH_SESSION = 'switch_session',
  SWITCH_SESSION_RESPONSE = 'switch_session_response',
  DELETE_SESSION = 'delete_session',
  DELETE_SESSION_RESPONSE = 'delete_session_response',

  // Command Execution
  EXECUTE_COMMAND = 'execute_command',
  EXECUTE_COMMAND_RESPONSE = 'execute_command_response',

  // Terminal Output
  TERMINAL_OUTPUT = 'terminal_output',
  CAPTURE_OUTPUT = 'capture_output',
  CAPTURE_OUTPUT_RESPONSE = 'capture_output_response',

  // Error
  ERROR = 'error',
}

// Base message structure
export interface Message<T = any> {
  id: string;
  type: MessageType;
  payload: T;
  timestamp: number;
  encrypted?: boolean;
}

// Payload types
export interface ConnectPayload {
  token: string;
  client_type: string;
  version: string;
}

export interface ConnectAckPayload {
  success: boolean;
  server_version: string;
  encryption_enabled: boolean;
}

export interface ListSessionsResponse {
  sessions: Session[];
}

export interface CreateSessionPayload {
  name: string;
}

export interface CreateSessionResponse {
  success: boolean;
  session?: Session;
}

export interface ExecuteCommandPayload {
  session_name: string;
  command: string;
}

export interface ExecuteCommandResponse {
  success: boolean;
  session_name: string;
}

export interface TerminalOutputPayload {
  session_name: string;
  output: string;
  sequence: number;
}

export interface CaptureOutputPayload {
  session_name: string;
}

export interface CaptureOutputResponse {
  session_name: string;
  output: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  original_message_id?: string;
}

// Data models
export interface Session {
  id: string;
  name: string;
  windows: Window[];
  created_at: number;
  attached: boolean;
}

export interface Window {
  id: string;
  name: string;
  index: number;
  active: boolean;
  pane_id: string;
}
