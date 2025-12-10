package qrcode

import (
	"fmt"

	qrcode "github.com/skip2/go-qrcode"
)

// GenerateQRCode generates a QR code for the WebSocket URL
func GenerateQRCode(host string, port int, token string) ([]byte, error) {
	url := fmt.Sprintf("ws://%s:%d/ws?token=%s", host, port, token)
	return qrcode.Encode(url, qrcode.Medium, 256)
}

// GenerateQRCodeTerminal generates a QR code and prints it to the terminal
func GenerateQRCodeTerminal(host string, port int, token string) error {
	url := fmt.Sprintf("ws://%s:%d/ws?token=%s", host, port, token)

	// Generate QR code
	qr, err := qrcode.New(url, qrcode.Medium)
	if err != nil {
		return err
	}

	// Print to terminal
	fmt.Println("\n" + qr.ToSmallString(false))
	fmt.Printf("\nScan the QR code above or connect to: %s\n\n", url)

	return nil
}

// GetConnectionURL returns the WebSocket connection URL
func GetConnectionURL(host string, port int, token string) string {
	return fmt.Sprintf("ws://%s:%d/ws?token=%s", host, port, token)
}
