Candour 
Live Multimodal Copilot & Communication Mirror

Candour is a real time AI assistant that bridges the gap between digital communication and human emotion. It provides live facial expression analysis during video calls and a "Tone Mirror" for text based messaging to ensure your professional presence is always on point.

**How to Run**
Since this is a developer build, follow these steps to load it into Chrome:

**1. Build the Extension**
Ensure you have your environment variables set up in .env.local (see below), then run:

npm install
npm run build
This generates a production ready folder at build/chrome-mv3-prod.

**2. Load into Chrome**
Open Chrome and navigate to chrome://extensions/.

Toggle Developer mode (top right) to ON.

Click Load unpacked.

Select the build/chrome-mv3-prod folder from this directory.

**Features**
Google Meet Copilot
Two Way Facial Analysis: Simultaneously tracks your emotions and the person you're speaking with using dual Hume AI WebSockets.

Draggable Glass UI: A sleek, non intrusive dashboard that stays exactly where you want it.

Real time Vibe Check: Identifies emotions like concentration, amusement, or confusion every 1000ms.

**Tone Mirror (LinkedIn & Gmail)**
Context Aware Analysis: Scrapes the post or email thread you are replying to so the AI understands the "Why" behind your message.

Feedback: Analyzes your draft and warns you if you sound aggressive, passive aggressive, or unprofessional.

Smart Rewrites: Provides a "one click" copyable version of your message optimized for the specific conversation context.

**Technical Challenges & Solutions**
1. Bypassing Google Meet's 'Trusted Types' Security
Google Meet implements a strict TrustedHTML assignment policy that blocks extensions from creating DOM elements like <canvas> to scrape video frames.
To get around that I implemented a capture system using the OffscreenCanvas API. By processing frames entirely in memory and converting them to Base64 blobs via an asynchronous pipeline, we bypassed the DOM based security interceptors without triggering CSP violations.

2. Identifying 'Self' vs 'Them' in a Dynamic DOM
Google Meet doesn't label participant video tags with IDs, and layouts change constantly.
Solution: A multi stage heuristic:

Mirror Detection: Identifying the local user by searching for the scaleX(-1) CSS transform.

Surface Area Calculation: Calculating the relative area of active <video> tags to differentiate the main speaker from the self view thumbnail.

3. Cross Platform Context Scraping
Scraping LinkedIn and Gmail requires intercepting contenteditable divs which don't behave like standard forms.
Solution: Built a global input listener that "steps out" of the Plasmo Shadow DOM to capture real time keystrokes. I used a background service worker to proxy API requests, avoiding CORS issues while maintaining a smooth, lag free UI.

**Tech Stack**
Framework: Plasmo

Frontend: React + TypeScript

AI Models: Hume AI (EVI & Face), Claude 3 (Linguistic Tone)

Deployment: Vercel (API Proxy)

**Environment Variables**
Create a .env.local in the root directory:

Code snippet
PLASMO_PUBLIC_HUME_API_KEY=your_hume_key_here
Note: The PLASMO_PUBLIC_ prefix is required for the key to be accessible within the Content Script.

Privacy Note: Candour is built with privacy at its core. All facial analysis and text scraping happen in memory via temporary buffers. No video, audio, or text data is ever stored, recorded, or used for training.
