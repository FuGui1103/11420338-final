/**
 * 根據總借閱次數與最高類型佔比進行分類
 * @param {number} totalBorrows 總借閱次數
 * @param {number} topGenreRatio 最高單一類型佔比 (0.0 ~ 1.0)
 * @returns {string} 讀者分類標籤
 */
function classifyBorrower(totalBorrows, topGenreRatio) {
  // 根節點
  if (totalBorrows >= 6) {
    // YES（重度讀者分支）
    if (topGenreRatio >= 0.25) {
      return "專注型重度讀者";
    } else {
      return "博覽型重度讀者";
    }
  } else {
    // NO（輕度讀者分支）
    if (topGenreRatio >= 0.7) {
      return "專注型輕度讀者";
    } else {
      return "探索型輕度讀者";
    }
  }
}

module.exports = classifyBorrower;