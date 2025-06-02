package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx     context.Context
	Manager *DownloadManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	var err error
	a.Manager, err = NewDownloadManager("downloads.db", ctx)
	if err != nil {
		runtime.LogFatal(ctx, "Failed to initialize DownloadManager: "+err.Error())
	}
}

func (a *App) AddDownload(url, path string, chunks, workers int) error {
	return a.Manager.AddDownload(url, path, chunks, workers)
}

func (a *App) AllDownloads() []*Download {
	return a.Manager.AllDownloads()
}

func (a *App) PauseDownload(id int64) error {
	return a.Manager.PauseDownload(id)
}

func (a *App) ResumeDownload(id int64) error {
	return a.Manager.ResumeDownload(id)
}

func (a *App) CancelDownload(id int64) error {
	return a.Manager.CancelDownload(id)
}

func (a *App) ShowDirectoryDialog(defaultDir string) (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Select Download Directory",
		DefaultDirectory: defaultDir,
	})
}

func (a *App) ShowFileDialog(defaultDir string, defaultFilename string) (string, error) {
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            "Save File As",
		DefaultDirectory: defaultDir,
		DefaultFilename:  defaultFilename,
		Filters: []runtime.FileFilter{
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
}

func (a *App) GetDefaultDownloadPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "./downloads/" // fallback
	}

	switch runtime.Environment(a.ctx).Platform {
	case "windows":
		return filepath.Join(home, "Downloads") + "\\"
	case "darwin", "linux":
		return filepath.Join(home, "Downloads") + "/"
	default:
		return "./downloads/"
	}
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
