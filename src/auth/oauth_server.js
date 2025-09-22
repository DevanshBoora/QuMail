const express = require('express');
const { URL } = require('url');

class OAuthCallbackServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.server = null;
    this.authCodePromise = null;
    this.authCodeResolve = null;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.app.get('/oauth2callback', (req, res) => {
        const code = req.query.code;
        const error = req.query.error;

        if (error) {
          res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>QuMail - Authentication Failed</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
                        color: #f9fafb;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 2rem;
                    }
                    .container {
                        background: #374151;
                        border-radius: 1rem;
                        padding: 3rem;
                        text-align: center;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6);
                        max-width: 500px;
                        width: 100%;
                    }
                    .icon {
                        font-size: 4rem;
                        margin-bottom: 1.5rem;
                    }
                    h1 {
                        font-size: 1.75rem;
                        font-weight: 600;
                        margin-bottom: 1rem;
                        color: #ef4444;
                    }
                    p {
                        color: #d1d5db;
                        margin-bottom: 1.5rem;
                        line-height: 1.6;
                    }
                    .error-code {
                        background: #1f2937;
                        padding: 1rem;
                        border-radius: 0.5rem;
                        font-family: monospace;
                        font-size: 0.875rem;
                        margin-bottom: 1.5rem;
                        color: #fbbf24;
                    }
                    .close-btn {
                        background: #8b5cf6;
                        color: white;
                        border: none;
                        padding: 0.75rem 2rem;
                        border-radius: 0.5rem;
                        font-size: 0.875rem;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    }
                    .close-btn:hover {
                        background: #7c3aed;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">❌</div>
                    <h1>Authentication Failed</h1>
                    <p>We couldn't authenticate your Gmail account. Please try again or check your credentials.</p>
                    <div class="error-code">Error: ${error}</div>
                    <button class="close-btn" onclick="window.close()">Close Window</button>
                </div>
                <script>
                    setTimeout(() => {
                        document.querySelector('.close-btn').textContent = 'Closing...';
                        setTimeout(() => window.close(), 1000);
                    }, 5000);
                </script>
            </body>
            </html>
          `);
          if (this.authCodeResolve) {
            this.authCodeResolve(null);
          }
        } else if (code) {
          res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>QuMail - Authentication Successful</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
                        color: #f9fafb;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 2rem;
                    }
                    .container {
                        background: #374151;
                        border-radius: 1rem;
                        padding: 3rem;
                        text-align: center;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6);
                        max-width: 500px;
                        width: 100%;
                        animation: slideIn 0.5s ease-out;
                    }
                    @keyframes slideIn {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .icon {
                        font-size: 4rem;
                        margin-bottom: 1.5rem;
                        animation: bounce 2s infinite;
                    }
                    @keyframes bounce {
                        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                        40% { transform: translateY(-10px); }
                        60% { transform: translateY(-5px); }
                    }
                    h1 {
                        font-size: 1.75rem;
                        font-weight: 600;
                        margin-bottom: 1rem;
                        color: #10b981;
                    }
                    p {
                        color: #d1d5db;
                        margin-bottom: 2rem;
                        line-height: 1.6;
                    }
                    .progress-bar {
                        background: #1f2937;
                        border-radius: 1rem;
                        height: 8px;
                        margin-bottom: 1rem;
                        overflow: hidden;
                    }
                    .progress-fill {
                        background: linear-gradient(90deg, #8b5cf6, #10b981);
                        height: 100%;
                        width: 0%;
                        border-radius: 1rem;
                        animation: fillProgress 3s ease-out forwards;
                    }
                    @keyframes fillProgress {
                        to { width: 100%; }
                    }
                    .status {
                        font-size: 0.875rem;
                        color: #9ca3af;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">✅</div>
                    <h1>Authentication Successful!</h1>
                    <p>Your Gmail account has been connected to QuMail. You can now send and receive encrypted emails.</p>
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                    <div class="status">Redirecting back to QuMail...</div>
                </div>
                <script>
                    setTimeout(() => {
                        document.querySelector('.status').textContent = 'Closing window...';
                        setTimeout(() => window.close(), 500);
                    }, 3000);
                </script>
            </body>
            </html>
          `);
          if (this.authCodeResolve) {
            this.authCodeResolve(code);
          }
        }
      });

      this.server = this.app.listen(this.port, () => {
        console.log(`[OAuth Server] Listening on port ${this.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  async waitForAuthCode() {
    return new Promise((resolve) => {
      this.authCodeResolve = resolve;
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('[OAuth Server] Stopped');
    }
  }
}

module.exports = { OAuthCallbackServer };
