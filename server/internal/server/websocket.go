package server

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/myan/handx-server/pkg/protocol"
	"github.com/rs/cors"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for now (will be restricted by CORS middleware)
		return true
	},
}

// Client represents a connected WebSocket client
type Client struct {
	conn      *websocket.Conn
	send      chan []byte
	server    *Server
	id        string
	connected bool
	mu        sync.Mutex
}

// Server handles WebSocket connections
type Server struct {
	clients      map[*Client]bool
	broadcast    chan []byte
	register     chan *Client
	unregister   chan *Client
	mu           sync.Mutex
	tmuxManager  TmuxManager
}

// TmuxManager interface for tmux operations
type TmuxManager interface {
	ListSessions() ([]protocol.Session, error)
	CreateSession(name string) (*protocol.Session, error)
	KillSession(name string) error
	RenameSession(oldName, newName string) error
	ExecuteCommand(sessionName, command string, windowIndex *int) error
	SendText(sessionName, text string) error
	CaptureOutput(sessionName string, windowIndex *int) (string, error)
	ListWindows(sessionName string) ([]protocol.Window, error)
	CreateWindow(sessionName, windowName string) (*protocol.Window, error)
	CloseWindow(sessionName string, windowIndex int) error
	SwitchWindow(sessionName string, windowIndex int) (string, error)
}

// NewServer creates a new WebSocket server
func NewServer(tmuxManager TmuxManager) *Server {
	return &Server{
		clients:     make(map[*Client]bool),
		broadcast:   make(chan []byte),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		tmuxManager: tmuxManager,
	}
}

// Run starts the WebSocket server hub
func (s *Server) Run() {
	for {
		select {
		case client := <-s.register:
			s.mu.Lock()
			s.clients[client] = true
			s.mu.Unlock()
			log.Printf("Client registered: %s", client.id)

		case client := <-s.unregister:
			s.mu.Lock()
			if _, ok := s.clients[client]; ok {
				delete(s.clients, client)
				close(client.send)
				log.Printf("Client unregistered: %s", client.id)
			}
			s.mu.Unlock()

		case message := <-s.broadcast:
			s.mu.Lock()
			for client := range s.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(s.clients, client)
				}
			}
			s.mu.Unlock()
		}
	}
}

// HandleWebSocket handles WebSocket connections
func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		conn:      conn,
		send:      make(chan []byte, 256),
		server:    s,
		id:        generateClientID(),
		connected: true,
	}

	s.register <- client

	// Start goroutines for reading and writing
	go client.writePump()
	go client.readPump()
}

// SetupRoutes sets up HTTP routes with CORS
func (s *Server) SetupRoutes(port string, allowedOrigins []string) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.HandleWebSocket)

	// Setup CORS
	c := cors.New(cors.Options{
		AllowedOrigins: allowedOrigins,
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"*"},
	})

	handler := c.Handler(mux)

	return &http.Server{
		Addr:    ":" + port,
		Handler: handler,
	}
}

// readPump pumps messages from the WebSocket connection to the server
func (c *Client) readPump() {
	defer func() {
		c.server.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		// Handle the message
		c.handleMessage(message)
	}
}

// writePump pumps messages from the server to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				// The server closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current websocket message
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage processes incoming WebSocket messages
func (c *Client) handleMessage(data []byte) {
	var msg protocol.Message
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("Failed to unmarshal message: %v", err)
		c.sendError("INVALID_MESSAGE", "Failed to parse message", "")
		return
	}

	log.Printf("Received message: type=%s, id=%s", msg.Type, msg.ID)

	// Route message to appropriate handler
	switch msg.Type {
	case protocol.TypeConnect:
		c.handleConnect(&msg)
	case protocol.TypeListSessions:
		c.handleListSessions(&msg)
	case protocol.TypeCreateSession:
		c.handleCreateSession(&msg)
	case protocol.TypeDeleteSession:
		c.handleDeleteSession(&msg)
	case protocol.TypeRenameSession:
		c.handleRenameSession(&msg)
	case protocol.TypeListWindows:
		c.handleListWindows(&msg)
	case protocol.TypeCreateWindow:
		c.handleCreateWindow(&msg)
	case protocol.TypeCloseWindow:
		c.handleCloseWindow(&msg)
	case protocol.TypeSwitchWindow:
		c.handleSwitchWindow(&msg)
	case protocol.TypeExecuteCommand:
		c.handleExecuteCommand(&msg)
	case protocol.TypeCaptureOutput:
		c.handleCaptureOutput(&msg)
	default:
		c.sendError("UNKNOWN_MESSAGE_TYPE", "Unknown message type: "+string(msg.Type), msg.ID)
	}
}

// sendMessage sends a message to the client
func (c *Client) sendMessage(msgType protocol.MessageType, payload interface{}) error {
	msg := protocol.NewMessage(generateMessageID(), msgType, payload)
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.connected {
		select {
		case c.send <- data:
		default:
			log.Printf("Client send channel full, message dropped")
		}
	}

	return nil
}

// sendError sends an error message to the client
func (c *Client) sendError(code, message, originalMsgID string) {
	payload := protocol.ErrorPayload{
		Code:              code,
		Message:           message,
		OriginalMessageID: originalMsgID,
	}
	c.sendMessage(protocol.TypeError, payload)
}

// Helper function to generate client ID
func generateClientID() string {
	return "client-" + time.Now().Format("20060102150405")
}

// Helper function to generate message ID
func generateMessageID() string {
	return "msg-" + time.Now().Format("20060102150405.000000")
}
