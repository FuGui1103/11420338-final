const Database = require('better-sqlite3');
const db = new Database('library.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    genre TEXT NOT NULL,
    author TEXT
  );

  CREATE TABLE IF NOT EXISTS borrow_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id),
    borrower_name TEXT NOT NULL,
    borrow_date DATE NOT NULL
  );
`);

module.exports = db;