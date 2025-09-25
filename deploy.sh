#!/bin/bash

# Deployment script for LMS2 App

echo "Starting deployment process..."

# 1. Clean build directory
echo "Cleaning build directory..."
rm -rf .next

# 2. Install dependencies
echo "Installing dependencies..."
npm install

# 3. Build the project
echo "Building project..."
export NEXT_TELEMETRY_DISABLED=1
npm run build

if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

# 4. Commit changes
echo "Committing changes to git..."
git add -A
git commit -m "Deploy: Fix video upload and deletion issues

- Remove Service Role Key from client-side code
- Fix video deletion to remove from storage and database
- Add video duration calculation
- Simplify video upload without chunking

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# 5. Push to GitHub (this will trigger Vercel deployment)
echo "Pushing to GitHub..."
git push origin main

echo "Deployment complete! Vercel will automatically deploy from GitHub."
echo "Check deployment status at: https://vercel.com/dashboard"