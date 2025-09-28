#!/bin/bash

# Fix all API routes to use await with cookies()
# This is required for Next.js 15 compatibility

echo "Fixing cookies() calls to use await in API routes..."

# List of files to fix
FILES=(
  "src/app/api/admin/settings/route.ts"
  "src/app/api/admin/users/route.ts"
  "src/app/api/admin/users/[id]/route.ts"
  "src/app/api/courses/[id]/thumbnail/route.ts"
  "src/app/api/messages/route.ts"
  "src/app/api/messages/[id]/route.ts"
  "src/app/api/user/profile/route.ts"
  "src/app/api/videos/[videoId]/route.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Fixing: $file"
    # Replace 'const cookieStore = cookies()' with 'const cookieStore = await cookies()'
    sed -i 's/const cookieStore = cookies()/const cookieStore = await cookies()/g' "$file"
  else
    echo "File not found: $file"
  fi
done

echo "Done! All files have been updated."
echo ""
echo "Summary of changes:"
echo "- Added 'await' before cookies() calls in all API routes"
echo "- This ensures compatibility with Next.js 15's async cookie handling"