const express = require('express');
const path = require('path');
const db = require('./db');
const runSeed = require('./seed');
const classifyBorrower = require('./decisionTree');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 啟動時注入種子資料
runSeed();

// 輔助函數：取得借閱者聚合特徵
function getBorrowerStats(name) {
  const sql = `
    WITH UserBorrows AS (
      SELECT b.genre, COUNT(br.id) as genre_count
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      WHERE br.borrower_name = ?
      GROUP BY b.genre
    ),
    UserTotals AS (
      SELECT SUM(genre_count) as total_borrows, MAX(genre_count) as max_genre_count
      FROM UserBorrows
    )
    SELECT 
      IFNULL(total_borrows, 0) as total_borrows,
      IFNULL(CAST(max_genre_count AS FLOAT) / total_borrows, 0) as top_genre_ratio,
      (SELECT genre FROM UserBorrows ub WHERE ub.genre_count = ut.max_genre_count LIMIT 1) as top_genre
    FROM UserTotals ut;
  `;
  return db.prepare(sql).get(name) || { total_borrows: 0, top_genre_ratio: 0, top_genre: null };
}

// --- 書籍 API ---
app.get('/api/books', (req, res) => {
  try {
    const { genre } = req.query;
    if (genre) {
      const books = db.prepare('SELECT * FROM books WHERE genre = ?').all(genre);
      return res.json(books);
    }
    const books = db.prepare('SELECT * FROM books').all();
    res.json(books);
  } catch (error) {
    res.status(500).json({ error: '獲取書籍失敗' });
  }
});

app.post('/api/books', (req, res) => {
  try {
    const { title, genre, author } = req.body;
    if (!title || !genre) return res.status(400).json({ error: '書名與類型為必填' });
    const stmt = db.prepare('INSERT INTO books (title, genre, author) VALUES (?, ?, ?)');
    const info = stmt.run(title, genre, author || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: '新增書籍失敗' });
  }
});

app.put('/api/books/:id', (req, res) => {
  try {
    const { title, genre, author } = req.body;
    const stmt = db.prepare('UPDATE books SET title = ?, genre = ?, author = ? WHERE id = ?');
    const info = stmt.run(title, genre, author, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: '找不到該書籍' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '更新書籍失敗' });
  }
});

app.delete('/api/books/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM books WHERE id = ?');
    const info = stmt.run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: '找不到該書籍' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '刪除書籍失敗，可能有借閱紀錄關聯' });
  }
});

// --- 借閱紀錄 API ---
app.post('/api/borrow', (req, res) => {
  try {
    const { book_id, borrower_name, borrow_date } = req.body;
    if (!book_id || !borrower_name || !borrow_date) {
      return res.status(400).json({ error: 'book_id, borrower_name, borrow_date 皆為必填' });
    }
    const stmt = db.prepare('INSERT INTO borrow_records (book_id, borrower_name, borrow_date) VALUES (?, ?, ?)');
    stmt.run(book_id, borrower_name, borrow_date);
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '新增借閱失敗' });
  }
});

app.get('/api/borrowers', (req, res) => {
  try {
    const borrowers = db.prepare('SELECT DISTINCT borrower_name FROM borrow_records ORDER BY borrower_name').all();
    res.json(borrowers.map(b => b.borrower_name));
  } catch (error) {
    res.status(500).json({ error: '獲取名單失敗' });
  }
});

// --- 分類與推薦 API ---
app.get('/api/borrowers/:name/type', (req, res) => {
  try {
    const name = req.params.name;
    const stats = getBorrowerStats(name);
    
    if (stats.total_borrows === 0) {
      return res.status(404).json({ error: '找不到該讀者的借閱紀錄' });
    }

    const type = classifyBorrower(stats.total_borrows, stats.top_genre_ratio);
    
    res.json({
      borrower_name: name,
      classification: type,
      total_borrows: stats.total_borrows,
      top_genre_ratio: stats.top_genre_ratio,
      top_genre: stats.top_genre
    });
  } catch (error) {
    res.status(500).json({ error: '分類計算失敗' });
  }
});

app.get('/api/borrowers/:name/recommendations', (req, res) => {
  try {
    const name = req.params.name;
    const stats = getBorrowerStats(name);
    
    if (stats.total_borrows === 0) {
      return res.status(404).json({ error: '找不到該讀者的借閱紀錄' });
    }

    const type = classifyBorrower(stats.total_borrows, stats.top_genre_ratio);
    let books = [];

    // 排除已借過的書
    const excludeRead = `AND id NOT IN (SELECT book_id FROM borrow_records WHERE borrower_name = ?)`;

    if (type === '專注型重度讀者') {
      // 同類型熱門書
      books = db.prepare(`SELECT * FROM books WHERE genre = ? ${excludeRead} ORDER BY RANDOM() LIMIT 5`).all(stats.top_genre, name);
    } else if (type === '博覽型重度讀者') {
      // 各類型精選一本 (使用 GROUP BY hack 來快速取得各類型一本)
      books = db.prepare(`SELECT * FROM books WHERE 1=1 ${excludeRead} GROUP BY genre ORDER BY RANDOM() LIMIT 5`).all(name);
    } else if (type === '專注型輕度讀者') {
      // 同類型入門書
      books = db.prepare(`SELECT * FROM books WHERE genre = ? ${excludeRead} ORDER BY RANDOM() LIMIT 3`).all(stats.top_genre, name);
    } else {
      // 探索型輕度讀者 -> 最受歡迎的書 (全站隨機/受歡迎)
      books = db.prepare(`SELECT * FROM books WHERE 1=1 ${excludeRead} ORDER BY RANDOM() LIMIT 5`).all(name);
    }

    res.json({ type, recommended_books: books });
  } catch (error) {
    res.status(500).json({ error: '推薦書單獲取失敗' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});