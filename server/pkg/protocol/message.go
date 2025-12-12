package protocol

import "time"

// MessageType defines the type of message being sent
type MessageType string

const (
	// Connection
	TypeConnect    MessageType = "connect"
	TypeConnectAck MessageType = "connect_ack"
	TypeDisconnect MessageType = "disconnect"

	// Session Management
	TypeListSessions          MessageType = "list_sessions"
	TypeListSessionsResponse  MessageType = "list_sessions_response"
	TypeCreateSession         MessageType = "create_session"
	TypeCreateSessionResponse MessageType = "create_session_response"
	TypeSwitchSession         MessageType = "switch_session"
	TypeSwitchSessionResponse MessageType = "switch_session_response"
	TypeDeleteSession         MessageType = "delete_session"
	TypeDeleteSessionResponse MessageType = "delete_session_response"
	TypeRenameSession         MessageType = "rename_session"
	TypeRenameSessionResponse MessageType = "rename_session_response"

	// Window Management
	TypeListWindows          MessageType = "list_windows"
	TypeListWindowsResponse  MessageType = "list_windows_response"
	TypeCreateWindow         MessageType = "create_window"
	TypeCreateWindowResponse MessageType = "create_window_response"
	TypeCloseWindow          MessageType = "close_window"
	TypeCloseWindowResponse  MessageType = "close_window_response"
	TypeSwitchWindow         MessageType = "switch_window"
	TypeSwitchWindowResponse MessageType = "switch_window_response"

	// Command Execution
	TypeExecuteCommand         MessageType = "execute_command"
	TypeExecuteCommandResponse MessageType = "execute_command_response"

	// Terminal Output
	TypeTerminalOutput         MessageType = "terminal_output"
	TypeCaptureOutput          MessageType = "capture_output"
	TypeCaptureOutputResponse  MessageType = "capture_output_response"

	// Error
	TypeError MessageType = "error"
)

// Message is the base message structure
type Message struct {
	ID        string      `json:"id"`
	Type      MessageType `json:"type"`
	Payload   interface{} `json:"payload"`
	Timestamp int64       `json:"timestamp"`
	Encrypted bool        `json:"encrypted,omitempty"`
}

// NewMessage creates a new message with the current timestamp
func NewMessage(id string, msgType MessageType, payload interface{}) *Message {
	return &Message{
		ID:        id,
		Type:      msgType,
		Payload:   payload,
		Timestamp: time.Now().UnixMilli(),
		Encrypted: false,
	}
}

// Session represents a tmux session
type Session struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Windows   []Window  `json:"windows"`
	CreatedAt int64     `json:"created_at"`
	Attached  bool      `json:"attached"`
}

// Window represents a tmux window
type Window struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Index  int    `json:"index"`
	Active bool   `json:"active"`
	PaneID string `json:"pane_id"`
}

// Payloads

// ConnectPayload is the payload for connect message
type ConnectPayload struct {
	Token      string `json:"token"`
	ClientType string `json:"client_type"`
	Version    string `json:"version"`
}

// ConnectAckPayload is the payload for connect_ack message
type ConnectAckPayload struct {
	Success           bool   `json:"success"`
	ServerVersion     string `json:"server_version"`
	EncryptionEnabled bool   `json:"encryption_enabled"`
}

// ListSessionsResponse is the payload for list_sessions_response
type ListSessionsResponse struct {
	Sessions []Session `json:"sessions"`
}

// CreateSessionPayload is the payload for create_session message
type CreateSessionPayload struct {
	Name string `json:"name"`
}

// CreateSessionResponse is the payload for create_session_response
type CreateSessionResponse struct {
	Success bool     `json:"success"`
	Session *Session `json:"session,omitempty"`
}

// SwitchSessionPayload is the payload for switch_session message
type SwitchSessionPayload struct {
	SessionName string `json:"session_name"`
}

// DeleteSessionPayload is the payload for delete_session message
type DeleteSessionPayload struct {
	SessionName string `json:"session_name"`
}

// RenameSessionPayload is the payload for rename_session message
type RenameSessionPayload struct {
	OldName string `json:"old_name"`
	NewName string `json:"new_name"`
}

// RenameSessionResponse is the payload for rename_session_response
type RenameSessionResponse struct {
	Success bool   `json:"success"`
	OldName string `json:"old_name"`
	NewName string `json:"new_name"`
}

// ListWindowsPayload is the payload for list_windows message
type ListWindowsPayload struct {
	SessionName string `json:"session_name"`
}

// ListWindowsResponse is the payload for list_windows_response
type ListWindowsResponse struct {
	SessionName string   `json:"session_name"`
	Windows     []Window `json:"windows"`
}

// SwitchWindowPayload is the payload for switch_window message
type SwitchWindowPayload struct {
	SessionName string `json:"session_name"`
	WindowIndex int    `json:"window_index"`
}

// SwitchWindowResponse is the payload for switch_window_response
type SwitchWindowResponse struct {
	Success     bool   `json:"success"`
	SessionName string `json:"session_name"`
	WindowIndex int    `json:"window_index"`
	WindowName  string `json:"window_name"`
}

// CreateWindowPayload is the payload for create_window message
type CreateWindowPayload struct {
	SessionName string `json:"session_name"`
	WindowName  string `json:"window_name,omitempty"`
}

// CreateWindowResponse is the payload for create_window_response
type CreateWindowResponse struct {
	Success     bool   `json:"success"`
	SessionName string `json:"session_name"`
	Window      Window `json:"window"`
}

// CloseWindowPayload is the payload for close_window message
type CloseWindowPayload struct {
	SessionName string `json:"session_name"`
	WindowIndex int    `json:"window_index"`
}

// CloseWindowResponse is the payload for close_window_response
type CloseWindowResponse struct {
	Success     bool   `json:"success"`
	SessionName string `json:"session_name"`
	WindowIndex int    `json:"window_index"`
}

// ExecuteCommandPayload is the payload for execute_command message
type ExecuteCommandPayload struct {
	SessionName string `json:"session_name"`
	Command     string `json:"command"`
	WindowIndex *int   `json:"window_index,omitempty"` // Optional: specific window to execute in
}

// ExecuteCommandResponse is the payload for execute_command_response
type ExecuteCommandResponse struct {
	Success     bool   `json:"success"`
	SessionName string `json:"session_name"`
}

// TerminalOutputPayload is the payload for terminal_output message
type TerminalOutputPayload struct {
	SessionName string `json:"session_name"`
	Output      string `json:"output"`
	Sequence    int64  `json:"sequence"`
}

// CaptureOutputPayload is the payload for capture_output message
type CaptureOutputPayload struct {
	SessionName string `json:"session_name"`
	WindowIndex *int   `json:"window_index,omitempty"` // Optional: specific window to capture
}

// CaptureOutputResponse is the payload for capture_output_response
type CaptureOutputResponse struct {
	SessionName string `json:"session_name"`
	Output      string `json:"output"`
}

// ErrorPayload is the payload for error message
type ErrorPayload struct {
	Code              string `json:"code"`
	Message           string `json:"message"`
	OriginalMessageID string `json:"original_message_id,omitempty"`
}

// Error codes
const (
	ErrorInvalidToken         = "INVALID_TOKEN"
	ErrorSessionNotFound      = "SESSION_NOT_FOUND"
	ErrorSessionAlreadyExists = "SESSION_ALREADY_EXISTS"
	ErrorWindowNotFound       = "WINDOW_NOT_FOUND"
	ErrorCommandFailed        = "COMMAND_FAILED"
	ErrorTmuxError            = "TMUX_ERROR"
	ErrorInternalError        = "INTERNAL_ERROR"
)
