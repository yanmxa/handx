package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/myan/handx-server/internal/qrcode"
	"github.com/myan/handx-server/internal/server"
	"github.com/myan/handx-server/internal/tmux"
	"github.com/spf13/viper"
)

func main() {
	// Load configuration
	loadConfig()

	// Create token manager
	tokenManager := server.NewTokenManager()
	tokenLifetime := viper.GetDuration("security.token_lifetime")
	if tokenLifetime == 0 {
		tokenLifetime = 1 * time.Hour
	}

	// Start token cleanup routine
	tokenManager.StartCleanupRoutine(5 * time.Minute)

	// Generate connection token
	token, err := tokenManager.GenerateToken(tokenLifetime)
	if err != nil {
		log.Fatalf("Failed to generate token: %v", err)
	}

	log.Printf("Generated connection token: %s", token)

	// Get server configuration
	host := viper.GetString("server.host")
	port := viper.GetInt("server.port")
	if host == "0.0.0.0" {
		// Get local IP for display
		host = getLocalIP()
	}
	if port == 0 {
		port = 8080
	}

	// Display QR code
	fmt.Println("\n=== handx Server ===")
	fmt.Printf("Server starting on %s:%d\n", host, port)

	err = qrcode.GenerateQRCodeTerminal(host, port, token)
	if err != nil {
		log.Printf("Failed to generate QR code: %v", err)
	}

	// Create tmux manager
	tmuxManager, err := tmux.NewManager()
	if err != nil {
		log.Fatalf("Failed to create tmux manager: %v", err)
	}

	// Create WebSocket server
	wsServer := server.NewServer(tmuxManager)

	// Start server hub
	go wsServer.Run()

	// Get allowed origins from config
	allowedOrigins := viper.GetStringSlice("cors.allowed_origins")
	if len(allowedOrigins) == 0 {
		allowedOrigins = []string{"http://localhost:3000"}
	}

	// Setup HTTP server
	httpServer := wsServer.SetupRoutes(fmt.Sprintf("%d", port), allowedOrigins)

	// Start HTTP server
	go func() {
		log.Printf("WebSocket server listening on :%d", port)
		if err := httpServer.ListenAndServe(); err != nil {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
}

func loadConfig() {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath("./configs")
	viper.AddConfigPath(".")

	// Set defaults
	viper.SetDefault("server.host", "0.0.0.0")
	viper.SetDefault("server.port", 8080)
	viper.SetDefault("security.token_lifetime", "1h")
	viper.SetDefault("cors.allowed_origins", []string{"http://localhost:3000"})

	if err := viper.ReadInConfig(); err != nil {
		log.Printf("Config file not found, using defaults: %v", err)
	} else {
		log.Printf("Using config file: %s", viper.ConfigFileUsed())
	}
}

func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "localhost"
	}

	for _, address := range addrs {
		// Check the address type and skip loopback
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}

	return "localhost"
}
