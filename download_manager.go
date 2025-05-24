package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

type DownloadManager struct {
	DB             *sql.DB
	Downloads      map[int64]*Download
	Mutex          sync.Mutex
	ActiveContexts map[int64]context.CancelFunc
}

type ChunkWriter interface {
	UpdateChunkState(chunk *ChunkInfo) error
}

func NewDownloadManager(dbPath string) (*DownloadManager, error) {
	db, err := initDB(dbPath)
	if err != nil {
		return nil, err
	}

	dm := &DownloadManager{
		DB:             db,
		Downloads:      make(map[int64]*Download),
		ActiveContexts: make(map[int64]context.CancelFunc),
	}

	if err := dm.LoadFromDB(); err != nil {
		return nil, err
	}

	return dm, nil
}

func (dm *DownloadManager) LoadFromDB() error {
	rows, err := dm.DB.Query("SELECT id,url,path,size,chunks,workers,state FROM downloads")
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var d Download
		if err := rows.Scan(&d.ID, &d.URL, &d.TargetPath, &d.TotalSize, &d.ChunkCount, &d.WorkersCount, &d.State); err != nil {
			return err
		}

		chunkRows, err := dm.DB.Query("SELECT id,chunk_index,start_byte,end_byte,written,state FROM chunks WHERE download_id = ?", d.ID)
		if err != nil {
			return err
		}

		var chunks []*ChunkInfo
		for chunkRows.Next() {
			var chunk ChunkInfo
			if err := chunkRows.Scan(&chunk.ID, &chunk.Index, &chunk.StartByte, &chunk.EndByte, &chunk.Written, &chunk.State); err != nil {
				return err
			}

			chunks = append(chunks, &chunk)
		}

		chunkRows.Close()
		d.Chunks = chunks
		d.Initialize()
		dm.Downloads[d.ID] = &d
		if err := dm.StartDownload(d.ID); err != nil {
			return err
		}
	}

	return nil
}

func (dm *DownloadManager) AllDownloads() []*Download {
	dm.Mutex.Lock()
	defer dm.Mutex.Unlock()

	downloads := make([]*Download, 0, len(dm.Downloads))
	for _, d := range dm.Downloads {
		downloads = append(downloads, d)
	}
	return downloads
}

func (dm *DownloadManager) AddDownload(url, path string, chunks, workers int) (err error) {
	dm.Mutex.Lock()
	defer dm.Mutex.Unlock()

	existing, err := dm.getDownload(url, path)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if existing != nil {
		dm.Downloads[existing.ID] = existing
		existing.ChunkWriter = dm

		if existing.State != StateCompleted && existing.State != StateCancelled {
			return dm.StartDownload(existing.ID)
		}
		return nil
	}

	d, err := NewDownload(url, path, chunks, workers)
	d.ChunkWriter = dm
	if err != nil {
		return err
	}

	tx, err := dm.DB.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	res, err := tx.Exec("INSERT INTO downloads (url,path,size,chunks,workers,state) VALUES (?,?,?,?,?,?)", d.URL, d.TargetPath, d.TotalSize, d.ChunkCount, d.WorkersCount, d.State)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	d.ID = id

	for _, chunk := range d.Chunks {
		res, err := tx.Exec("INSERT INTO chunks (download_id,chunk_index,start_byte,end_byte,written,state) VALUES (?,?,?,?,?,?)", d.ID, chunk.Index, chunk.StartByte, chunk.EndByte, chunk.Written, chunk.State)
		if err != nil {
			return err
		}
		id, err := res.LastInsertId()
		if err != nil {
			return err
		}
		chunk.ID = id
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	dm.Downloads[d.ID] = d
	return dm.StartDownload(d.ID)
}

func (dm *DownloadManager) StartDownload(id int64) error {
	d, ok := dm.Downloads[id]
	if !ok {
		return fmt.Errorf("download with ID %d not found", id)
	}

	if d.State == StateCompleted {
		return fmt.Errorf("download already completed")
	}

	ctx, cancel := context.WithCancel(context.Background())
	dm.ActiveContexts[id] = cancel

	go func() {
		err := d.Start(ctx)
		if err != nil {
			fmt.Errorf("error starting download: %w", err)
		}
	}()
	return nil
}

func (dm *DownloadManager) UpdateDownloadStateByID(id int64, state DownloadState) (err error) {
	d := dm.Downloads[id]
	tx, err := dm.DB.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	if _, err = tx.Exec("UPDATE downloads SET state=? WHERE id=?", state, d.ID); err != nil {
		return err
	}

	for _, chunk := range d.Chunks {
		if chunk.State != StateCompleted {
			if _, err = tx.Exec("UPDATE chunks SET state=?,written=? WHERE id=?", state, chunk.Written, chunk.ID); err != nil {
				return err
			}
		}
	}

	err = tx.Commit()
	return err
}

func (dm *DownloadManager) UpdateChunkState(chunk *ChunkInfo) error {
	_, err := dm.DB.Exec(
		"UPDATE chunks SET state = ?, written = ? WHERE id = ?",
		chunk.State, chunk.Written, chunk.ID,
	)
	return err
}

func (dm *DownloadManager) PauseDownload(id int64) error {
	d, ok := dm.Downloads[id]
	if !ok {
		return fmt.Errorf("download with ID %d not found", id)
	}

	dm.Mutex.Lock()
	defer dm.Mutex.Unlock()

	cancel, exists := dm.ActiveContexts[id]
	if exists {
		cancel()
		delete(dm.ActiveContexts, id)
	}
	d.Pause()
	return dm.UpdateDownloadStateByID(id, StatePaused)
}

func (dm *DownloadManager) ResumeDownload(id int64) error {
	d, ok := dm.Downloads[id]
	if !ok {
		return fmt.Errorf("download with ID %d not found", id)
	}
	ctx, cancel := context.WithCancel(context.Background())
	dm.ActiveContexts[id] = cancel
	d.Resume(ctx)

	return dm.UpdateDownloadStateByID(id, StateActive)
}

func (dm *DownloadManager) CancelDownload(id int64) error {
	if cancel, ok := dm.ActiveContexts[id]; ok {
		cancel()
		delete(dm.ActiveContexts, id)
	}
	return dm.UpdateDownloadStateByID(id, StateCancelled)
}

func (dm *DownloadManager) getDownload(url, path string) (*Download, error) {
	row := dm.DB.QueryRow("SELECT id,size,chunks,workers FROM downloads WHERE url=? AND path=?", url, path)

	var d Download
	d.URL = url
	d.TargetPath = path

	if err := row.Scan(&d.ID, &d.TotalSize, &d.ChunkCount, &d.WorkersCount); err != nil {
		return nil, err
	}

	rows, err := dm.DB.Query("SELECT id,chunk_index,start_byte,end_byte,written,state FROM chunks where download_id=? ", d.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chunks []*ChunkInfo

	for rows.Next() {
		var chunk ChunkInfo
		err := rows.Scan(&chunk.ID, &chunk.Index, &chunk.StartByte, &chunk.EndByte, &chunk.Written, &chunk.State)
		if err != nil {
			return nil, err
		}
		chunks = append(chunks, &chunk)
	}
	d.Chunks = chunks
	d.Initialize()

	return &d, nil
}
