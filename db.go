package main

import (
	"database/sql"
	"fmt"

	_ "github.com/mattn/go-sqlite3"
)

func initDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("error creating db: %w", err)
	}

	_, err = db.Exec(`
    CREATE TABLE IF NOT EXISTS downloads(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER NOT NULL,
      chunks INTEGER NOT NULL,
      workers INTEGER NOT NULL,
      state INTEGER NOT NULL
			);
		`)
	if err != nil {
		return nil, fmt.Errorf("error creatign downloads table: %w", err)
	}

	_, err = db.Exec(`
      CREATE TABLE IF NOT EXISTS chunks(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        download_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_byte INTEGER NOT NULL,
		    end_byte INTEGER NOT NULL,
		    written INTEGER NOT NULL,
		    state INTEGER NOT NULL,
        FOREIGN KEY (download_id) REFERENCES downloads (id)
			);
      `)
	if err != nil {
		return nil, fmt.Errorf("error creatign chunks table: %w", err)
	}

	return db, nil
}
