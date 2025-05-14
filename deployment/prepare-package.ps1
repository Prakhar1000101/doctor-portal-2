# PowerShell script to prepare a deployment package for Hostinger

# Ensure we're in the project root directory
$projectRoot = $PSScriptRoot | Split-Path -Parent
Set-Location -Path $projectRoot

# Clean and build the application
Write-Host "Building the production version..." -ForegroundColor Yellow
npm run build

# Create deployment directory
$deploymentDir = "doctor-portal-hostinger"
Write-Host "Creating deployment directory: $deploymentDir..." -ForegroundColor Yellow

if (Test-Path $deploymentDir) {
    Remove-Item -Path $deploymentDir -Recurse -Force
}

New-Item -Path $deploymentDir -ItemType Directory | Out-Null

# Copy required files and directories
Write-Host "Copying files to deployment directory..." -ForegroundColor Yellow

# Copy .next directory (compiled application)
Copy-Item -Path ".next" -Destination "$deploymentDir/.next" -Recurse

# Copy public directory (static assets)
Copy-Item -Path "public" -Destination "$deploymentDir/public" -Recurse

# Copy server.js (custom server)
Copy-Item -Path "server.js" -Destination "$deploymentDir/server.js"

# Copy package.json and package-lock.json
Copy-Item -Path "package.json" -Destination "$deploymentDir/package.json"
Copy-Item -Path "package-lock.json" -Destination "$deploymentDir/package-lock.json"

# Copy .htaccess
Copy-Item -Path ".htaccess" -Destination "$deploymentDir/.htaccess"

# Copy environment example and rename
Copy-Item -Path "deployment/env.production.example" -Destination "$deploymentDir/.env.production"
Write-Host "Please edit $deploymentDir/.env.production with your actual configuration values" -ForegroundColor Green

# Install production dependencies
Write-Host "Installing production dependencies (this may take a while)..." -ForegroundColor Yellow
Set-Location -Path $deploymentDir
npm install --production

# Return to project root
Set-Location -Path $projectRoot

# Create ZIP archive
Write-Host "Creating ZIP archive..." -ForegroundColor Yellow
Compress-Archive -Path $deploymentDir -DestinationPath "$deploymentDir.zip" -Force

Write-Host "Deployment package created successfully!" -ForegroundColor Green
Write-Host "Package location: $projectRoot\$deploymentDir.zip" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Edit the .env.production file in the $deploymentDir directory with your actual values"
Write-Host "2. Upload the ZIP file to your Hostinger account"
Write-Host "3. Extract the ZIP file on Hostinger"
Write-Host "4. Configure the Node.js application in Hostinger control panel"
Write-Host "5. Set server.js as the entry point"
Write-Host "6. Configure environment variables in Hostinger"
Write-Host "7. Start the application"
Write-Host "" 