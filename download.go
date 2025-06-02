package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/net/http2"
)

type DownloadState int

const (
	StateActive DownloadState = iota
	StatePaused
	StateCancelled
	StateCompleted
)

type Download struct {
	ID              int64           `json:"id"`
	URL             string          `json:"url"`
	TargetPath      string          `json:"path"`
	TotalSize       int64           `json:"size"`
	ChunkCount      int             `json:"chunks"`
	Chunks          []*ChunkInfo    `json:"chunk_info"`
	State           DownloadState   `json:"state"`
	Mutex           sync.Mutex      `json:"-" `
	WaitGroup       sync.WaitGroup  `json:"-"`
	Client          *http.Client    `json:"-"`
	CompletedChunks int             `json:"completed_chunks"`
	WorkersCount    int             `json:"workers"`
	ChunkWriter     ChunkWriter     `json:"-"`
	WorkerChannel   chan *ChunkInfo `json:"-"`
	lastUpdate      time.Time       `json:"-"`
	updateMutex     sync.Mutex      `json:"-"`
}

type ChunkInfo struct {
	ID        int64         `json:"id"`
	StartByte int64         `json:"start_byte"`
	EndByte   int64         `json:"end_byte"`
	Written   int64         `json:"written"`
	Index     int           `json:"index"`
	State     DownloadState `json:"state"`
}

type DownloadUpdateEvent struct {
	DownloadID int64         `json:"downloadId"`
	State      DownloadState `json:"state"`
}

type ChunkUpdateEvent struct {
	DownloadID int64         `json:"downloadId"`
	ChunkIndex int           `json:"chunkIndex"`
	ChunkID    int64         `json:"chunkId"`
	Written    int64         `json:"written"`
	TotalSize  int64         `json:"size"`
	State      DownloadState `json:"state"`
}

var UpdateFrequency = 200 * time.Millisecond

func (d *Download) Initialize() error {
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		DisableKeepAlives:   false,
		IdleConnTimeout:     90 * time.Second,
	}

	if err := http2.ConfigureTransport(transport); err != nil {
		return fmt.Errorf("failed to configure HTTP/2: %w", err)
	}

	d.Client = &http.Client{
		Transport: transport,
	}

	d.WorkersCount = min(d.WorkersCount, d.ChunkCount)
	d.lastUpdate = time.Now()
	return nil
}

func NewDownload(url, targetPath string, chunks, workers int) (*Download, error) {
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		DisableKeepAlives:   false,
		IdleConnTimeout:     90 * time.Second,
	}

	if err := http2.ConfigureTransport(transport); err != nil {
		panic("failed to configure HTTP/2" + err.Error())
	}

	client := &http.Client{
		Transport: transport,
	}

	res, err := client.Head(url)
	if err != nil {
		return nil, fmt.Errorf("error getting file info: %v\n", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download is not available: %v\n", res.StatusCode)
	}

	size := res.ContentLength
	targetDir := filepath.Dir(targetPath)
	if err := os.MkdirAll(targetDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create target directory: %v\n", err)
	}

	download := &Download{
		URL:           url,
		TargetPath:    targetPath,
		TotalSize:     size,
		ChunkCount:    chunks,
		State:         StateActive,
		Client:        client,
		WorkersCount:  min(workers, chunks),
		WorkerChannel: make(chan *ChunkInfo, min(workers, chunks)),
	}

	chunkSize := size / int64(chunks)

	for i := range chunks {
		start := chunkSize * int64(i)
		end := start + chunkSize - 1

		if i == chunks-1 {
			end = size - 1
		}

		download.Chunks = append(download.Chunks, &ChunkInfo{
			StartByte: start,
			EndByte:   end,
			Written:   0,
			Index:     i,
			State:     StateActive,
		})
	}

	return download, nil
}

func (d *Download) DownloadChunk(ctx context.Context, chunk *ChunkInfo) error {
	if chunk.State == StateCompleted {
		return nil
	}
	partPath := fmt.Sprintf("%s.part-%d", d.TargetPath, chunk.Index)

	if info, err := os.Stat(partPath); err == nil {
		chunk.Written = info.Size()
	}

	if chunk.Written >= (chunk.EndByte - chunk.StartByte + 1) {
		d.Mutex.Lock()
		if chunk.State != StateCompleted {
			chunk.State = StateCompleted
			d.CompletedChunks++
		}
		d.Mutex.Unlock()
		if d.ChunkWriter != nil {
			err := d.ChunkWriter.UpdateChunkState(chunk)
			if err != nil {
				fmt.Printf("Failed to update chunk state in DB: %v\n", err)
			}
			d.notify(chunk)
		}
		return nil
	}

	file, err := os.OpenFile(partPath, os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer file.Close()

	req, err := http.NewRequest("GET", d.URL, nil)
	if err != nil {
		return err
	}

	if _, err := file.Seek(chunk.Written, io.SeekStart); err != nil {
		return err
	}

	start := chunk.StartByte + chunk.Written
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, chunk.EndByte))
	req.Close = true

	startTime := time.Now()

	res, err := d.Client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusPartialContent && res.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %d\n", res.StatusCode)
	}

	buffer := make([]byte, 128*1024)
	for {
		select {
		case <-ctx.Done():
			d.Mutex.Lock()
			chunk.State = StatePaused
			d.Mutex.Unlock()
			if d.ChunkWriter != nil {
				_ = d.ChunkWriter.UpdateChunkState(chunk)
				d.notify(chunk)
			}
			return fmt.Errorf("download canceled for chunk %v\n", chunk.Index)
		default:
			n, readErr := res.Body.Read(buffer)
			if n > 0 {
				if _, writeErr := file.Write(buffer[:n]); writeErr != nil {
					return writeErr
				}
				d.Mutex.Lock()
				chunk.Written += int64(n)
				if d.ChunkWriter != nil {
					_ = d.ChunkWriter.UpdateChunkState(chunk)
					d.notify(chunk)
				}
				d.Mutex.Unlock()
			}
			if readErr != nil {
				if readErr == io.EOF {
					d.Mutex.Lock()
					if chunk.State != StateCompleted {
						chunk.State = StateCompleted
						d.CompletedChunks++
					}
					if d.ChunkWriter != nil {
						err := d.ChunkWriter.UpdateChunkState(chunk)
						if err != nil {
							fmt.Printf("Failed to update chunk state in DB: %v\n", err)
						}
						d.notify(chunk)
					}
					d.Mutex.Unlock()

					fmt.Printf("Chunk %v downloaded in %v \n", chunk.Index, time.Since(startTime))
					return nil
				}
				return readErr
			}
		}
	}
}

func (d *Download) Pause() {
	d.Mutex.Lock()
	defer d.Mutex.Unlock()

	if d.State == StateActive {
		d.State = StatePaused
		for _, chunk := range d.Chunks {
			if chunk.State == StateActive {
				chunk.State = StatePaused
				if d.ChunkWriter != nil {
					err := d.ChunkWriter.UpdateChunkState(chunk)
					if err != nil {
						fmt.Printf("Failed to update chunk state in DB: %v\n", err)
					}
					d.notify(chunk)
				}
			}
		}
		fmt.Println("Download paused")
	}

	d.ChunkWriter.NotifyDownloadUpdate(d.ID, StatePaused)
	d.State = StatePaused
}

func (d *Download) Resume(ctx context.Context) {
	d.Mutex.Lock()
	defer d.Mutex.Unlock()

	if d.State == StatePaused {
		d.State = StateActive
		for _, chunk := range d.Chunks {
			if chunk.State == StatePaused {
				chunk.State = StateActive
				if d.ChunkWriter != nil {
					err := d.ChunkWriter.UpdateChunkState(chunk)
					if err != nil {
						fmt.Printf("Failed to update chunk state in DB: %v\n", err)
					}
					d.notify(chunk)
				}
			}
		}

		d.WaitGroup = sync.WaitGroup{}
		d.WorkerChannel = make(chan *ChunkInfo, d.WorkersCount)
		d.State = StateActive
		d.ChunkWriter.NotifyDownloadUpdate(d.ID, StateActive)

		go func() {
			if err := d.Start(ctx); err != nil {
				fmt.Printf("Resume failed: %v\n", err)
			}
		}()
	}
}

func (d *Download) Cancel() {
	d.Mutex.Lock()
	defer d.Mutex.Unlock()

	d.State = StateCancelled
	for _, chunk := range d.Chunks {
		chunk.State = StateCancelled
		if d.ChunkWriter != nil {
			err := d.ChunkWriter.UpdateChunkState(chunk)
			if err != nil {
				fmt.Printf("Failed to update chunk state in DB: %v\n", err)
			}
			d.notify(chunk)
		}
	}
	d.ChunkWriter.NotifyDownloadUpdate(d.ID, StateCancelled)
	fmt.Println("Download cancelled")
}

func (d *Download) Start(ctx context.Context) error {
	d.ChunkWriter.NotifyDownloadUpdate(d.ID, StateActive)
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	startTime := time.Now()

	if d.WorkerChannel == nil {
		d.WorkerChannel = make(chan *ChunkInfo, d.WorkersCount)
	}
	for i := 0; i < d.WorkersCount; i++ {
		go d.worker(ctx)
	}

	for _, chunk := range d.Chunks {
		if chunk.State == StateCompleted {
			continue
		}
		d.WaitGroup.Add(1)
		d.WorkerChannel <- chunk
	}

	d.Mutex.Lock()
	close(d.WorkerChannel)
	d.Mutex.Unlock()

	done := make(chan struct{})
	go func() {
		d.WaitGroup.Wait()
		close(done)
	}()

	select {
	case <-done:
		if !d.isAllChunksCompleted() {
			return fmt.Errorf("not all chunks completed successfully")
		}
	case <-ctx.Done():
		return fmt.Errorf("Download Canceled")
	}

	if d.State == StateCancelled {
		return fmt.Errorf("download cancelled")
	}

	if err := d.combineChunks(); err != nil {
		fmt.Printf("Total download time: %v\n", time.Since(startTime))
		return fmt.Errorf("error combining chunks: %w\n", err)
	}
	d.State = StateCompleted
	d.ChunkWriter.NotifyDownloadUpdate(d.ID, StateCompleted)
	d.cleanup()

	fmt.Println("Download Complete !!")
	fmt.Printf("Total download time: %v\n", time.Since(startTime))
	return nil
}

func (d *Download) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case chunk, ok := <-d.WorkerChannel:
			if !ok {
				return
			}
			func() {
				defer d.WaitGroup.Done()
				err := d.DownloadChunk(ctx, chunk)
				if err != nil {
					if ctx.Err() != nil {
						fmt.Printf("Download cancelled while processing: %v\n", err)
					} else {
						fmt.Printf("Error downloading chunk %d: %v\n", chunk.Index, err)
					}
				}
			}()
		}
	}
}

func (d *Download) isAllChunksCompleted() bool {
	d.Mutex.Lock()
	defer d.Mutex.Unlock()

	for _, chunk := range d.Chunks {
		if chunk.State != StateCompleted {
			return false
		}
	}
	return true
}

func (d *Download) notify(chunk *ChunkInfo) {
	d.updateMutex.Lock()
	defer d.updateMutex.Unlock()

	now := time.Now()
	if now.Sub(d.lastUpdate) >= UpdateFrequency {
		d.ChunkWriter.NotifyChunkUpdate(d.ID, chunk)
		d.lastUpdate = now
	}
}

func (d *Download) combineChunks() error {
	fmt.Println("Combining Chunks !!")
	targetFile, err := os.Create(d.TargetPath)
	if err != nil {
		return err
	}
	defer targetFile.Close()

	for i := range d.Chunks {
		partPath := fmt.Sprintf("%v.part-%v", d.TargetPath, i)
		partFile, err := os.Open(partPath)
		if err != nil {
			return fmt.Errorf("opening part %d: %w", i, err)
		}

		if _, err := io.Copy(targetFile, partFile); err != nil {
			partFile.Close()
			return fmt.Errorf("copying part %d: %w", i, err)
		}
		partFile.Close()

	}
	return nil
}

func (d *Download) cleanup() {
	for i := range d.Chunks {
		partPath := fmt.Sprintf("%s.part-%d", d.TargetPath, i)
		if err := os.Remove(partPath); err != nil {
			fmt.Printf("warning: failed to remove %s: %v\n", partPath, err)
		}
	}
}
