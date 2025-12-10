package server

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// TokenManager manages authentication tokens
type TokenManager struct {
	tokens map[string]*TokenInfo
	mu     sync.RWMutex
}

// TokenInfo contains information about a token
type TokenInfo struct {
	Token     string
	CreatedAt time.Time
	ExpiresAt time.Time
	Used      bool
}

// NewTokenManager creates a new token manager
func NewTokenManager() *TokenManager {
	return &TokenManager{
		tokens: make(map[string]*TokenInfo),
	}
}

// GenerateToken generates a new authentication token
func (tm *TokenManager) GenerateToken(lifetime time.Duration) (string, error) {
	// Generate random bytes
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	token := hex.EncodeToString(bytes)

	// Store token info
	tm.mu.Lock()
	tm.tokens[token] = &TokenInfo{
		Token:     token,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(lifetime),
		Used:      false,
	}
	tm.mu.Unlock()

	return token, nil
}

// ValidateToken validates a token
func (tm *TokenManager) ValidateToken(token string) bool {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	info, exists := tm.tokens[token]
	if !exists {
		return false
	}

	// Check if token is expired
	if time.Now().After(info.ExpiresAt) {
		return false
	}

	return true
}

// MarkTokenUsed marks a token as used
func (tm *TokenManager) MarkTokenUsed(token string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if info, exists := tm.tokens[token]; exists {
		info.Used = true
	}
}

// CleanupExpiredTokens removes expired tokens
func (tm *TokenManager) CleanupExpiredTokens() {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	now := time.Now()
	for token, info := range tm.tokens {
		if now.After(info.ExpiresAt) {
			delete(tm.tokens, token)
		}
	}
}

// StartCleanupRoutine starts a goroutine that periodically cleans up expired tokens
func (tm *TokenManager) StartCleanupRoutine(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			tm.CleanupExpiredTokens()
		}
	}()
}
