const db = require('./db');

// --- 1. 定義數學函數：計算熵 (Entropy) ---
function calculateEntropy(data) {
  if (data.length === 0) return 0;
  
  // 計算每個分類的數量
  const labelCounts = {};
  data.forEach(item => {
    labelCounts[item.label] = (labelCounts[item.label] || 0) + 1;
  });

  // 計算 Entropy
  let entropy = 0;
  for (const label in labelCounts) {
    const probability = labelCounts[label] / data.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

// --- 2. 定義數學函數：計算資訊增益 (Information Gain) ---
function calculateIG(data, feature, threshold) {
  const baseEntropy = calculateEntropy(data);

  // 根據門檻值將資料分成左右兩群 (大於等於 vs 小於)
  const leftGroup = data.filter(item => item[feature] >= threshold);
  const rightGroup = data.filter(item => item[feature] < threshold);

  // 如果全部分到同一邊，代表這個門檻毫無鑑別度
  if (leftGroup.length === 0 || rightGroup.length === 0) return 0;

  // 計算加權平均 Entropy
  const leftWeight = leftGroup.length / data.length;
  const rightWeight = rightGroup.length / data.length;
  const splitEntropy = (leftWeight * calculateEntropy(leftGroup)) + (rightWeight * calculateEntropy(rightGroup));

  // 資訊增益 = 切分前的混亂度 - 切分後的混亂度
  return baseEntropy - splitEntropy;
}

// --- 3. 從資料庫提取特徵與真實標籤 ---
function fetchTrainingData() {
  const sql = `
    WITH UserBorrows AS (
      SELECT br.borrower_name, b.genre, COUNT(br.id) as genre_count
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      GROUP BY br.borrower_name, b.genre
    ),
    UserTotals AS (
      SELECT 
        borrower_name,
        SUM(genre_count) as total_borrows,
        MAX(genre_count) as max_genre_count
      FROM UserBorrows
      GROUP BY borrower_name
    )
    SELECT 
      borrower_name,
      total_borrows,
      CAST(max_genre_count AS FLOAT) / total_borrows as top_genre_ratio
    FROM UserTotals;
  `;

  const rawData = db.prepare(sql).all();

  // 根據我們在 seed.js 命名的規則，萃取「真實標籤 (True Label)」
  return rawData.map(row => {
    let label = '';
    if (row.borrower_name.includes('專注重度')) label = '專注型重度讀者';
    else if (row.borrower_name.includes('博覽重度')) label = '博覽型重度讀者';
    else if (row.borrower_name.includes('專注輕度')) label = '專注型輕度讀者';
    else if (row.borrower_name.includes('探索輕度')) label = '探索型輕度讀者';

    return {
      name: row.borrower_name,
      total_borrows: row.total_borrows,
      top_genre_ratio: row.top_genre_ratio,
      label: label
    };
  });
}

// --- 4. 主程式：找出最佳門檻 ---
function findBestSplit() {
  const data = fetchTrainingData();
  console.log(`成功載入 ${data.length} 筆讀者訓練資料。\n`);

  // 尋找「總借閱次數」的最佳門檻
  let bestTotalBorrowsIG = -1;
  let bestTotalBorrowsThreshold = 0;
  
  // 測試 5 次到 20 次的每一個門檻
  for (let t = 5; t <= 20; t++) {
    const ig = calculateIG(data, 'total_borrows', t);
    if (ig > bestTotalBorrowsIG) {
      bestTotalBorrowsIG = ig;
      bestTotalBorrowsThreshold = t;
    }
  }

  // 尋找「單一類型佔比」的最佳門檻
  let bestRatioIG = -1;
  let bestRatioThreshold = 0;
  
  // 測試 0.1 到 0.9 的每一個門檻 (每次增加 0.05)
  for (let r = 0.1; r <= 0.9; r += 0.05) {
    const ig = calculateIG(data, 'top_genre_ratio', r);
    if (ig > bestRatioIG) {
      bestRatioIG = ig;
      bestRatioThreshold = r;
    }
  }

  console.log('=== 資訊增益 (Information Gain) 運算結果 ===');
  console.log(`🎯 [總借閱次數] 最佳切分門檻：>= ${bestTotalBorrowsThreshold} 次 (IG: ${bestTotalBorrowsIG.toFixed(4)})`);
  console.log(`🎯 [單一類型佔比] 最佳切分門檻：>= ${(bestRatioThreshold * 100).toFixed(1)}% (IG: ${bestRatioIG.toFixed(4)})`);
  console.log('============================================\n');
  console.log('💡 你可以將這些最佳門檻值，更新到 decisionTree.js 中！');
}

findBestSplit();