const fs = require('fs');
const path = require('path');

function fixSelectDarkMode(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (file !== 'node_modules' && file !== '.next' && !file.startsWith('.')) {
        fixSelectDarkMode(filePath);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;
      
      // Fix select elements without dark mode background
      const selectPattern = /<select([^>]*?)className="([^"]*?)"([^>]*?)>/g;
      
      content = content.replace(selectPattern, (match, before, className, after) => {
        // Skip if already has dark:bg- class
        if (className.includes('dark:bg-')) {
          return match;
        }
        
        // Add dark mode background if it has border styling but no background
        if (className.includes('border') && !className.includes('bg-')) {
          modified = true;
          const newClassName = className + ' bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
          return `<select${before}className="${newClassName}"${after}>`;
        } else if (className.includes('border') && className.includes('bg-white')) {
          // Replace bg-white with proper dark mode variant
          modified = true;
          const newClassName = className
            .replace('bg-white', 'bg-white dark:bg-gray-800')
            .includes('text-gray-900') ? className.replace('bg-white', 'bg-white dark:bg-gray-800') : 
            className.replace('bg-white', 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100');
          return `<select${before}className="${newClassName}"${after}>`;
        }
        
        return match;
      });
      
      if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed: ${filePath}`);
      }
    }
  });
}

// Start from src directory
const srcDir = path.join(__dirname, 'src');
if (fs.existsSync(srcDir)) {
  console.log('Fixing select dark mode in src directory...');
  fixSelectDarkMode(srcDir);
  console.log('Done!');
} else {
  console.error('src directory not found!');
}