const fs = require('fs');
const path = require('path');
const glob = require('glob');

// 置換ルール
const replacements = [
  // 背景色
  { from: /className="([^"]*\b)bg-white(\b[^"]*)"/, to: 'className="$1bg-white dark:bg-gray-800$2"' },
  { from: /className='([^']*\b)bg-white(\b[^']*)'/, to: "className='$1bg-white dark:bg-gray-800$2'" },
  
  // ホバー背景色
  { from: /hover:bg-gray-50(?!\s+dark:)/g, to: 'hover:bg-gray-50 dark:hover:bg-gray-700' },
  { from: /hover:bg-gray-100(?!\s+dark:)/g, to: 'hover:bg-gray-100 dark:hover:bg-gray-700' },
  { from: /hover:bg-blue-50(?!\s+dark:)/g, to: 'hover:bg-blue-50 dark:hover:bg-blue-900/20' },
  { from: /hover:bg-red-50(?!\s+dark:)/g, to: 'hover:bg-red-50 dark:hover:bg-red-900/20' },
  { from: /hover:bg-green-50(?!\s+dark:)/g, to: 'hover:bg-green-50 dark:hover:bg-green-900/20' },
  { from: /hover:bg-yellow-50(?!\s+dark:)/g, to: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20' },
  { from: /hover:bg-indigo-50(?!\s+dark:)/g, to: 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20' },
  
  // ボーダー色 (すでにdark:が付いていないものだけ)
  { from: /border-gray-200(?!\s+dark:)/g, to: 'border-gray-200 dark:border-gray-700' },
  { from: /border-gray-300(?!\s+dark:)/g, to: 'border-gray-300 dark:border-gray-600' },
  
  // テキスト色
  { from: /text-gray-900(?!\s+dark:)/g, to: 'text-gray-900 dark:text-white' },
  { from: /text-gray-800(?!\s+dark:)/g, to: 'text-gray-800 dark:text-gray-200' },
  { from: /text-gray-700(?!\s+dark:)/g, to: 'text-gray-700 dark:text-gray-300' },
  { from: /text-gray-600(?!\s+dark:)/g, to: 'text-gray-600 dark:text-gray-400' },
  { from: /text-gray-500(?!\s+dark:)/g, to: 'text-gray-500 dark:text-gray-400' },
  
  // 特殊背景色
  { from: /bg-gray-50(?!\s+dark:)/g, to: 'bg-gray-50 dark:bg-gray-900' },
  { from: /bg-gray-100(?!\s+dark:)/g, to: 'bg-gray-100 dark:bg-gray-800' },
  { from: /bg-blue-50(?!\s+dark:)/g, to: 'bg-blue-50 dark:bg-blue-900/20' },
  { from: /bg-red-50(?!\s+dark:)/g, to: 'bg-red-50 dark:bg-red-900/20' },
  { from: /bg-green-50(?!\s+dark:)/g, to: 'bg-green-50 dark:bg-green-900/20' },
  { from: /bg-yellow-50(?!\s+dark:)/g, to: 'bg-yellow-50 dark:bg-yellow-900/20' },
  { from: /bg-indigo-50(?!\s+dark:)/g, to: 'bg-indigo-50 dark:bg-indigo-900/20' },
  
  // シャドウ
  { from: /shadow-lg(?!\s+dark:)/g, to: 'shadow-lg dark:shadow-gray-900/50' },
  { from: /shadow-sm(?!\s+dark:)/g, to: 'shadow-sm dark:shadow-gray-900/20' },
];

// ファイルを処理する関数
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;
    let originalContent = content;

    // すでにdark:bg-gray-800が含まれているbg-whiteはスキップ
    if (!content.includes('dark:bg-gray-800') || !content.includes('bg-white')) {
      // bg-whiteの処理（classNameの中でのみ）
      const bgWhiteRegex = /(className\s*=\s*["'][^"']*\b)bg-white(?!\s+dark:)([^"']*["'])/g;
      if (bgWhiteRegex.test(content)) {
        content = content.replace(bgWhiteRegex, '$1bg-white dark:bg-gray-800$2');
        modified = true;
      }
    }

    // その他の置換ルールを適用
    replacements.forEach(rule => {
      if (rule.from.test(content)) {
        content = content.replace(rule.from, rule.to);
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ Fixed: ${path.relative(process.cwd(), filePath)}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// メイン処理
async function main() {
  console.log('🔍 Searching for TSX and JSX files...\n');
  
  const patterns = [
    'src/**/*.tsx',
    'src/**/*.jsx',
  ];
  
  let totalFiles = 0;
  let modifiedFiles = 0;

  for (const pattern of patterns) {
    const files = glob.sync(pattern, { 
      ignore: ['**/node_modules/**', '**/build/**', '**/dist/**'],
      cwd: process.cwd()
    });
    
    console.log(`Found ${files.length} files matching ${pattern}\n`);
    
    for (const file of files) {
      totalFiles++;
      if (processFile(file)) {
        modifiedFiles++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✨ Dark mode fixes complete!`);
  console.log(`📊 Modified ${modifiedFiles} out of ${totalFiles} files`);
  console.log('='.repeat(50));
}

// globパッケージの確認とインストール
const { execSync } = require('child_process');

try {
  require.resolve('glob');
} catch (e) {
  console.log('📦 Installing required package: glob...');
  execSync('npm install --save-dev glob', { stdio: 'inherit' });
}

// スクリプト実行
main().catch(console.error);