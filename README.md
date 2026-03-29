**Build the Extension**
Ensure you have your environment variables set up in .env.local (see below), then run:

npm install
npm run build

This generates a production-ready folder at build/chrome-mv3-prod.

**Load into Chrome**
Open Chrome and navigate to chrome://extensions/.

Toggle Developer mode (top right) to ON.

Click Load unpacked.

Select the build/chrome-mv3-prod folder from this directory.

**Usage**
Google Meet: Join a call. A draggable widget will appear. Use the checkboxes to toggle live facial analysis for yourself and other participants.

**Features**
Two-Way Facial Analysis: Simultaneously tracks your emotions and the person you're speaking with using dual Hume AI WebSockets.

Security Bypass: Implements a stealth frame-capture system using OffscreenCanvas to bypass Google Meet's Trusted Types security policy.

Privacy-First: All processing happens in-memory via temporary canvases. No video or text is ever stored or recorded.

**Tech Stack**
Framework: Plasmo (The "Next.js" of Browser Extensions)

UI: React + Tailwind CSS

AI: Hume AI (Facial Expressions) & Claude 3 (Tone Analysis)

Language: TypeScript

**Environment Variables**
To run this, you need a .env.local file in the root directory with the following:
PLASMO_PUBLIC_HUME_API_KEY=your_hume_key_here
