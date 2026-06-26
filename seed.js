const db = require('./db');

function runSeed() {
  const checkBooks = db.prepare('SELECT COUNT(*) as count FROM books').get();
  if (checkBooks.count > 0) {
    console.log('資料庫已有資料，跳過種子資料生成。');
    return;
  }

  console.log('開始生成種子資料...');
  const genres = ['小說', '科普', '商業', '歷史', '漫畫'];
  
  // 新增書籍
  const insertBook = db.prepare('INSERT INTO books (title, genre, author) VALUES (?, ?, ?)');
  db.transaction(() => {
    genres.forEach(genre => {
      for (let i = 1; i <= 10; i++) {
        insertBook.run(`${genre}精選 ${i}`, genre, `作者 ${genre}${i}`);
      }
    });
  })();

  const allBooks = db.prepare('SELECT * FROM books').all();
  const getBooks = (genre) => allBooks.filter(b => b.genre === genre);
  const insertRecord = db.prepare('INSERT INTO borrow_records (book_id, borrower_name, borrow_date) VALUES (?, ?, ?)');
  
  db.transaction(() => {
    // 1. 專注型重度讀者 (15次，12次同類型 -> 12/15 = 0.8 >= 0.7)
    for (let i = 1; i <= 5; i++) {
      const name = `Alice_專注重度_${i}`;
      const targetGenre = genres[i % 5];
      const targetBooks = getBooks(targetGenre);
      const otherBooks = allBooks.filter(b => b.genre !== targetGenre);
      for(let k=0; k<12; k++) insertRecord.run(targetBooks[k%10].id, name, '2023-11-01');
      for(let k=0; k<3; k++) insertRecord.run(otherBooks[k].id, name, '2023-11-02');
    }

    // 2. 博覽型重度讀者 (15次，5類型各3次 -> 3/15 = 0.2 < 0.7)
    for (let i = 1; i <= 5; i++) {
      const name = `Bob_博覽重度_${i}`;
      genres.forEach(genre => {
        const books = getBooks(genre);
        for(let k=0; k<3; k++) insertRecord.run(books[k].id, name, '2023-11-03');
      });
    }

    // 3. 專注型輕度讀者 (5次，4次同類型 -> 4/5 = 0.8 >= 0.7)
    for (let i = 1; i <= 5; i++) {
      const name = `Carol_專注輕度_${i}`;
      const targetGenre = genres[i % 5];
      const targetBooks = getBooks(targetGenre);
      const otherBooks = allBooks.filter(b => b.genre !== targetGenre);
      for(let k=0; k<4; k++) insertRecord.run(targetBooks[k%10].id, name, '2023-11-04');
      insertRecord.run(otherBooks[0].id, name, '2023-11-05');
    }

    // 4. 探索型輕度讀者 (5次，5類型各1次 -> 1/5 = 0.2 < 0.7)
    for (let i = 1; i <= 5; i++) {
      const name = `Dave_探索輕度_${i}`;
      genres.forEach(genre => {
        const books = getBooks(genre);
        insertRecord.run(books[0].id, name, '2023-11-06');
      });
    }
  })();

  console.log('種子資料建立完成。');
}

module.exports = runSeed;