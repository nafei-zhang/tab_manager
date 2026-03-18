# Installation Guide

## Chrome / Edge (Developer Mode)

1. Open the extensions page: `chrome://extensions` or `edge://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select the project root directory `tab_manager`
5. Pin the extension icon and start using it

## Firefox (Temporary Load)

1. Open `about:debugging#/runtime/this-firefox`
2. Click Load Temporary Add-on
3. Select `manifest.json` from this project
4. Click the extension icon in the toolbar to use it

## Packaging Recommendations

- Chrome/Edge: zip the project directory and upload it to the extension store
- Firefox: follow the AMO packaging process and validate `browser_specific_settings`
