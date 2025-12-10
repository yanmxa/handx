package tmux

import (
	"fmt"
	"os/exec"
	"regexp"
	"time"

	"github.com/GianlucaP106/gotmux/gotmux"
	"github.com/myan/handx-server/pkg/protocol"
)

// ANSI escape code regex
var ansiEscapeRegex = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

// Manager manages tmux sessions
type Manager struct {
	tmux *gotmux.Tmux
}

// NewManager creates a new tmux manager
func NewManager() (*Manager, error) {
	tmux, err := gotmux.DefaultTmux()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize tmux: %w", err)
	}

	return &Manager{
		tmux: tmux,
	}, nil
}

// ListSessions returns all tmux sessions
func (m *Manager) ListSessions() ([]protocol.Session, error) {
	sessions, err := m.tmux.ListSessions()
	if err != nil {
		// If no sessions exist, return empty list instead of error
		return []protocol.Session{}, nil
	}

	result := make([]protocol.Session, 0, len(sessions))
	for _, s := range sessions {
		windows, err := m.getSessionWindows(s)
		if err != nil {
			continue
		}

		result = append(result, protocol.Session{
			ID:        fmt.Sprintf("session-%s", s.Name),
			Name:      s.Name,
			Windows:   windows,
			CreatedAt: time.Now().UnixMilli(), // gotmux doesn't provide creation time
			Attached:  s.Attached > 0,
		})
	}

	return result, nil
}

// getSessionWindows returns windows for a session
func (m *Manager) getSessionWindows(session *gotmux.Session) ([]protocol.Window, error) {
	windows, err := session.ListWindows()
	if err != nil {
		return []protocol.Window{}, nil
	}

	result := make([]protocol.Window, 0, len(windows))
	for _, w := range windows {
		result = append(result, protocol.Window{
			ID:     fmt.Sprintf("window-%s-%d", session.Name, w.Index),
			Name:   w.Name,
			Index:  w.Index,
			Active: w.Active,
			PaneID: fmt.Sprintf("%d", w.Index),
		})
	}

	return result, nil
}

// CreateSession creates a new tmux session
func (m *Manager) CreateSession(name string) (*protocol.Session, error) {
	// Check if session already exists
	existingSessions, _ := m.tmux.ListSessions()
	for _, s := range existingSessions {
		if s.Name == name {
			return nil, fmt.Errorf("session '%s' already exists", name)
		}
	}

	// Create new session (detached by default)
	session, err := m.tmux.NewSession(&gotmux.SessionOptions{
		Name: name,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	windows, _ := m.getSessionWindows(session)

	return &protocol.Session{
		ID:        fmt.Sprintf("session-%s", name),
		Name:      name,
		Windows:   windows,
		CreatedAt: time.Now().UnixMilli(),
		Attached:  false,
	}, nil
}

// AttachSession attaches to a session
func (m *Manager) AttachSession(name string) error {
	session, err := m.getSessionByName(name)
	if err != nil {
		return err
	}

	return session.Attach()
}

// KillSession kills a tmux session
func (m *Manager) KillSession(name string) error {
	session, err := m.getSessionByName(name)
	if err != nil {
		return err
	}

	return session.Kill()
}

// getSessionByName finds a session by name
func (m *Manager) getSessionByName(name string) (*gotmux.Session, error) {
	sessions, err := m.tmux.ListSessions()
	if err != nil {
		return nil, fmt.Errorf("failed to list sessions: %w", err)
	}

	for _, s := range sessions {
		if s.Name == name {
			return s, nil
		}
	}

	return nil, fmt.Errorf("session '%s' not found", name)
}

// ExecuteCommand executes a command in a session
func (m *Manager) ExecuteCommand(sessionName, command string) error {
	session, err := m.getSessionByName(sessionName)
	if err != nil {
		return err
	}

	// Get the active pane
	panes, err := session.ListPanes()
	if err != nil {
		return fmt.Errorf("failed to list panes: %w", err)
	}

	if len(panes) == 0 {
		return fmt.Errorf("no panes found in session")
	}

	// Find active pane
	var activePane *gotmux.Pane
	for _, p := range panes {
		if p.Active {
			activePane = p
			break
		}
	}

	if activePane == nil {
		// If no active pane, use the first one
		activePane = panes[0]
	}

	// Use tmux send-keys directly with C-m (Ctrl+M = Enter) to ensure command execution
	// First send the command text in literal mode, then send C-m (Enter)
	cmd1 := exec.Command("tmux", "send-keys", "-t", activePane.Id, "-l", command)
	if err := cmd1.Run(); err != nil {
		return err
	}
	// Send C-m (Ctrl+M = Enter key)
	cmd2 := exec.Command("tmux", "send-keys", "-t", activePane.Id, "C-m")
	return cmd2.Run()
}

// SendText sends text to a session without executing (no Enter key)
func (m *Manager) SendText(sessionName, text string) error {
	session, err := m.getSessionByName(sessionName)
	if err != nil {
		return err
	}

	// Get the active pane
	panes, err := session.ListPanes()
	if err != nil {
		return fmt.Errorf("failed to list panes: %w", err)
	}

	if len(panes) == 0 {
		return fmt.Errorf("no panes found in session")
	}

	// Find active pane
	var activePane *gotmux.Pane
	for _, p := range panes {
		if p.Active {
			activePane = p
			break
		}
	}

	if activePane == nil {
		activePane = panes[0]
	}

	// Send text without Enter using tmux send-keys -l (literal mode)
	// This will type the text but not execute it
	cmd := exec.Command("tmux", "send-keys", "-t", activePane.Id, "-l", text)
	return cmd.Run()
}

// stripANSI removes ANSI escape codes from string
func stripANSI(str string) string {
	return ansiEscapeRegex.ReplaceAllString(str, "")
}

// CaptureOutput captures the output of a session's active pane
func (m *Manager) CaptureOutput(sessionName string) (string, error) {
	session, err := m.getSessionByName(sessionName)
	if err != nil {
		return "", err
	}

	// Get active window
	windows, err := session.ListWindows()
	if err != nil {
		return "", err
	}

	var activeWindow *gotmux.Window
	for _, w := range windows {
		if w.Active {
			activeWindow = w
			break
		}
	}

	if activeWindow == nil {
		return "", fmt.Errorf("no active window found")
	}

	// Get active pane
	panes, err := activeWindow.ListPanes()
	if err != nil {
		return "", err
	}

	var activePane *gotmux.Pane
	for _, p := range panes {
		if p.Active {
			activePane = p
			break
		}
	}

	if activePane == nil {
		return "", fmt.Errorf("no active pane found")
	}

	// Capture pane content
	content, err := activePane.Capture()
	if err != nil {
		return "", err
	}

	// Keep ANSI codes for xterm.js to render colors properly
	// But we could add an option to strip them if needed
	return content, nil
}

// ListWindows lists windows in a session
func (m *Manager) ListWindows(sessionName string) ([]protocol.Window, error) {
	session, err := m.getSessionByName(sessionName)
	if err != nil {
		return nil, err
	}

	return m.getSessionWindows(session)
}
