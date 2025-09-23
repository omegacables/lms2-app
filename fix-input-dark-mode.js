const fs = require('fs');
const path = require('path');

function fixInputDarkMode(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (file !== 'node_modules' && file !== '.next' && !file.startsWith('.')) {
        fixInputDarkMode(filePath);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;
      
      // Fix input elements without dark mode background
      const inputPattern = /<input([^>]*?)className="([^"]*?)"([^>]*?)>/g;
      
      content = content.replace(inputPattern, (match, before, className, after) => {
        // Skip if already has dark:bg- class
        if (className.includes('dark:bg-')) {
          return match;
        }
        
        // Skip if it's a file input or hidden input
        if (match.includes('type="file"') || match.includes('type="hidden"') || match.includes('type="checkbox"') || match.includes('type="radio"')) {
          return match;
        }
        
        // Add dark mode background if it has border styling but no background
        if (className.includes('border') && !className.includes('bg-')) {
          modified = true;
          const newClassName = className + ' bg-white dark:bg-gray-800';
          return `<input${before}className="${newClassName}"${after}>`;
        } else if (className.includes('border') && className.includes('bg-white')) {
          // Replace bg-white with proper dark mode variant
          modified = true;
          const newClassName = className.replace('bg-white', 'bg-white dark:bg-gray-800');
          return `<input${before}className="${newClassName}"${after}>`;
        }
        
        return match;
      });
      
      // Also add text color if missing
      content = content.replace(inputPattern, (match, before, className, after) => {
        // Skip if already has dark:text- class
        if (className.includes('dark:text-')) {
          return match;
        }
        
        // Skip if it's a file input or hidden input
        if (match.includes('type="file"') || match.includes('type="hidden"') || match.includes('type="checkbox"') || match.includes('type="radio"')) {
          return match;
        }
        
        // Add dark mode text color
        if (className.includes('dark:bg-gray-800') && !className.includes('text-gray-900')) {
          modified = true;
          const newClassName = className.replace('dark:bg-gray-800', 'dark:bg-gray-800 text-gray-900 dark:text-gray-100');
          return `<input${before}className="${newClassName}"${after}>`;
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
  console.log('Fixing input dark mode in src directory...');
  fixInputDarkMode(srcDir);
  console.log('Done!');
} else {
  console.error('src directory not found!');
}