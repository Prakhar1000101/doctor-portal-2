# Preparing Deployment Package for Hostinger

Follow these steps to prepare your Doctor Portal application for deployment on Hostinger:

## 1. Build the Production Version

```bash
# Make sure you're in the project root directory
npm run build
```

## 2. Create Deployment Directory

Create a new directory for your deployment package:

```bash
mkdir -p doctor-portal-hostinger
```

## 3. Copy Required Files

Copy all required files and directories to the deployment package:

```bash
# Copy .next directory (compiled application)
cp -r .next doctor-portal-hostinger/

# Copy public directory (static assets)
cp -r public doctor-portal-hostinger/

# Copy server.js (custom server)
cp server.js doctor-portal-hostinger/

# Copy package.json and package-lock.json
cp package.json package-lock.json doctor-portal-hostinger/

# Copy .htaccess
cp .htaccess doctor-portal-hostinger/
```

## 4. Create Production Environment File

Create a `.env.production` file in the deployment package with your actual configuration values.

```bash
# Copy the example file and rename it
cp deployment/env.production.example doctor-portal-hostinger/.env.production

# Edit the file with your actual values
# Replace placeholders with your actual Firebase credentials and other settings
```

## 5. Install Production Dependencies

To reduce the deployment package size, install only production dependencies:

```bash
cd doctor-portal-hostinger
npm install --production
```

## 6. Create a ZIP Archive for Upload

Create a ZIP archive of your deployment package for easier upload to Hostinger:

```bash
# Windows (using PowerShell)
Compress-Archive -Path doctor-portal-hostinger -DestinationPath doctor-portal-hostinger.zip

# macOS/Linux
zip -r doctor-portal-hostinger.zip doctor-portal-hostinger
```

## 7. Upload to Hostinger

- Log in to your Hostinger account
- Navigate to File Manager or use FTP client
- Upload the ZIP file to your hosting account
- Extract the ZIP file on the server
- Configure the Node.js application as described in the deployment instructions

## 8. Configure Environment Variables

In your Hostinger control panel:
- Set up all required environment variables
- Ensure NODE_ENV is set to "production"
- Configure any other settings specific to your Hostinger account

## 9. Start the Application

- Through Hostinger's control panel, start your Node.js application
- Specify server.js as the entry point
- Set up any required startup parameters

## 10. Verify Deployment

- Visit your domain to verify the application is working correctly
- Test all major functionalities to ensure they work as expected 