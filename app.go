package main

import (
	"context"
	"fmt"
)

// App struct
type App struct {
	ctx     context.Context
	Manager *DownloadManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	manager, err := NewDownloadManager("downloads.db")
	if err != nil {
		panic(err)
	}
	return &App{
		Manager: manager,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
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

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
