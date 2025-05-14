# Doctor Portal Deployment Checklist for Hostinger

## Pre-Deployment

- [ ] Run `npm run build` to create production build
- [ ] Verify all environment variables are properly set
- [ ] Test application locally using production build (`npm run start:windows` on Windows)
- [ ] Ensure Firebase configuration is correct for production
- [ ] Back up current code and database

## Files to Upload

- [ ] `.next/` directory (contains compiled application)
- [ ] `node_modules/` directory (contains dependencies)
- [ ] `public/` directory (contains static assets)
- [ ] `server.js` (custom server file)
- [ ] `package.json` (dependency and script definitions)
- [ ] `.htaccess` (server configuration)
- [ ] `.env.production` (renamed from the example, with your actual values)

## Hostinger Configuration

- [ ] Set up Node.js application in Hostinger panel
- [ ] Configure Node.js version (18.x or higher recommended)
- [ ] Set application startup file to `server.js`
- [ ] Configure environment variables in Hostinger panel
- [ ] Set up domain/subdomain for the application

## Post-Deployment Verification

- [ ] Test user authentication (signup/signin)
- [ ] Test role-based access (doctor/reception)
- [ ] Verify Firebase connectivity (data fetching/writing)
- [ ] Check appointment booking functionality
- [ ] Test patient management features
- [ ] Verify that all static assets are loading correctly
- [ ] Test responsiveness on different devices
- [ ] Check email functionality if applicable

## Security Checks

- [ ] Ensure all API keys and secrets are not exposed
- [ ] Verify Firebase security rules are properly configured
- [ ] Confirm HTTPS is enabled
- [ ] Test user role restrictions
- [ ] Check for any exposed development information

## Documentation

- [ ] Update deployment documentation with specific Hostinger settings
- [ ] Document any issues encountered and their solutions
- [ ] Keep record of configuration settings
- [ ] Document testing results

## Maintenance Plan

- [ ] Schedule regular backups
- [ ] Plan for future updates
- [ ] Set up monitoring for application health
- [ ] Create process for applying security updates 