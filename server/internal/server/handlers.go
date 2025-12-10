package server

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/myan/handx-server/pkg/protocol"
)

// handleConnect handles the connect message
func (c *Client) handleConnect(msg *protocol.Message) {
	var payload protocol.ConnectPayload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		c.sendError(protocol.ErrorInternalError, "Failed to parse connect payload", msg.ID)
		return
	}

	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		c.sendError(protocol.ErrorInternalError, "Failed to parse connect payload", msg.ID)
		return
	}

	log.Printf("Connect from client: type=%s, version=%s", payload.ClientType, payload.Version)

	// TODO: Validate token
	// For now, always accept

	ackPayload := protocol.ConnectAckPayload{
		Success:           true,
		ServerVersion:     "1.0.0",
		EncryptionEnabled: false,
	}

	c.sendMessage(protocol.TypeConnectAck, ackPayload)
}

// handleListSessions handles the list_sessions message
func (c *Client) handleListSessions(msg *protocol.Message) {
	log.Printf("List sessions requested")

	sessions, err := c.server.tmuxManager.ListSessions()
	if err != nil {
		log.Printf("Failed to list sessions: %v", err)
		c.sendError(protocol.ErrorTmuxError, fmt.Sprintf("Failed to list sessions: %v", err), msg.ID)
		return
	}

	response := protocol.ListSessionsResponse{
		Sessions: sessions,
	}

	log.Printf("Returning %d sessions", len(sessions))
	c.sendMessage(protocol.TypeListSessionsResponse, response)
}

// handleCreateSession handles the create_session message
func (c *Client) handleCreateSession(msg *protocol.Message) {
	var payload protocol.CreateSessionPayload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		c.sendError(protocol.ErrorInternalError, "Failed to parse create session payload", msg.ID)
		return
	}

	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		c.sendError(protocol.ErrorInternalError, "Failed to parse create session payload", msg.ID)
		return
	}

	log.Printf("Create session: name=%s", payload.Name)

	session, err := c.server.tmuxManager.CreateSession(payload.Name)
	if err != nil {
		log.Printf("Failed to create session: %v", err)

		// Check if session already exists
		if err.Error() == fmt.Sprintf("session '%s' already exists", payload.Name) {
			c.sendError(protocol.ErrorSessionAlreadyExists, err.Error(), msg.ID)
		} else {
			c.sendError(protocol.ErrorTmuxError, fmt.Sprintf("Failed to create session: %v", err), msg.ID)
		}
		return
	}

	response := protocol.CreateSessionResponse{
		Success: true,
		Session: session,
	}

	log.Printf("Session created: %s", payload.Name)
	c.sendMessage(protocol.TypeCreateSessionResponse, response)
}

// handleExecuteCommand handles the execute_command message
func (c *Client) handleExecuteCommand(msg *protocol.Message) {
	var payload protocol.ExecuteCommandPayload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		c.sendError(protocol.ErrorInternalError, "Failed to parse execute command payload", msg.ID)
		return
	}

	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		c.sendError(protocol.ErrorInternalError, "Failed to parse execute command payload", msg.ID)
		return
	}

	log.Printf("Execute command: session=%s, command=%s", payload.SessionName, payload.Command)

	// Execute command with Enter key - automatically execute after submission
	err = c.server.tmuxManager.ExecuteCommand(payload.SessionName, payload.Command)
	if err != nil {
		log.Printf("Failed to execute command: %v", err)
		c.sendError(protocol.ErrorCommandFailed, fmt.Sprintf("Failed to execute command: %v", err), msg.ID)
		return
	}

	response := protocol.ExecuteCommandResponse{
		Success:     true,
		SessionName: payload.SessionName,
	}

	log.Printf("Command executed in session: %s", payload.SessionName)
	c.sendMessage(protocol.TypeExecuteCommandResponse, response)
}

// handleCaptureOutput handles the capture_output message
func (c *Client) handleCaptureOutput(msg *protocol.Message) {
	var payload protocol.CaptureOutputPayload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		c.sendError(protocol.ErrorInternalError, "Failed to parse capture output payload", msg.ID)
		return
	}

	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		c.sendError(protocol.ErrorInternalError, "Failed to parse capture output payload", msg.ID)
		return
	}

	log.Printf("Capture output: session=%s", payload.SessionName)

	output, err := c.server.tmuxManager.CaptureOutput(payload.SessionName)
	if err != nil {
		log.Printf("Failed to capture output: %v", err)
		c.sendError(protocol.ErrorTmuxError, fmt.Sprintf("Failed to capture output: %v", err), msg.ID)
		return
	}

	response := protocol.CaptureOutputResponse{
		SessionName: payload.SessionName,
		Output:      output,
	}

	c.sendMessage(protocol.TypeCaptureOutputResponse, response)
}

// handleDeleteSession handles the delete_session message
func (c *Client) handleDeleteSession(msg *protocol.Message) {
	var payload protocol.DeleteSessionPayload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		c.sendError(protocol.ErrorInternalError, "Failed to parse delete session payload", msg.ID)
		return
	}

	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		c.sendError(protocol.ErrorInternalError, "Failed to parse delete session payload", msg.ID)
		return
	}

	log.Printf("Delete session: name=%s", payload.SessionName)

	err = c.server.tmuxManager.KillSession(payload.SessionName)
	if err != nil {
		log.Printf("Failed to delete session: %v", err)
		c.sendError(protocol.ErrorSessionNotFound, fmt.Sprintf("Failed to delete session: %v", err), msg.ID)
		return
	}

	response := map[string]interface{}{
		"success":      true,
		"session_name": payload.SessionName,
	}

	log.Printf("Session deleted: %s", payload.SessionName)
	c.sendMessage(protocol.TypeDeleteSessionResponse, response)
}
